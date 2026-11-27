const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { WAREHOUSE_STORE_METHODS, WarehouseStoreToken } = require('../domain/warehouse.repository');

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function now() {
  return new Date();
}

function matches(record, filters) {
  return Object.entries(filters || {}).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'since') return record.created_at >= value;
    if (key === 'until') return record.created_at <= value;
    return record[key] === value;
  });
}

/**
 * In-process warehouse store. Records mirror the Prisma adapter's snake_case
 * shape. Mutations are synchronous so concurrent API requests are serialized
 * at the JavaScript event loop boundary; the database adapter uses row locks.
 */
class WarehouseInMemoryStore {
  constructor() {
    this.warehouses = new Map();
    this.inventories = new Map();
    this.movements = new Map();
    this.reservations = new Map();
    this.alerts = new Map();
    this.locations = new Map();
    this.conditions = new Map();
    this.reconciliations = new Map();
    this.staffAssignments = new Map();
    this.movementReferences = new Set();
    this.reservationReferences = new Set();
    this.reservationByReference = new Map();
    assertRepository(this, WAREHOUSE_STORE_METHODS, WarehouseStoreToken);
  }

  _insert(collection, input) {
    const timestamp = now();
    const record = {
      ...input,
      id: input.id || randomUUID(),
      created_at: input.created_at ? new Date(input.created_at) : timestamp,
      updated_at: input.updated_at ? new Date(input.updated_at) : timestamp,
    };
    collection.set(record.id, clone(record));
    return clone(record);
  }

  _update(collection, id, patch) {
    const record = collection.get(id);
    if (!record) throw new NotFoundError({ message: 'Record was not found.' });
    const updated = { ...record, ...patch, updated_at: now() };
    collection.set(id, clone(updated));
    return clone(updated);
  }

  listWarehouses(filters) {
    return Promise.resolve(
      [...this.warehouses.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  findWarehouse(id) {
    return Promise.resolve(clone(this.warehouses.get(id) || null));
  }

  createWarehouse(input) {
    return Promise.resolve(this._insert(this.warehouses, input));
  }

  updateWarehouse(id, patch) {
    return Promise.resolve(this._update(this.warehouses, id, patch));
  }

  findInventory({ warehouseId, productId, batchCode }) {
    const record = [...this.inventories.values()].find(
      (item) =>
        item.warehouse_id === warehouseId &&
        item.product_id === productId &&
        item.batch_code === batchCode,
    );
    return Promise.resolve(clone(record || null));
  }

  findInventoryById(id) {
    return Promise.resolve(clone(this.inventories.get(id) || null));
  }

  listInventories(filters) {
    return Promise.resolve(
      [...this.inventories.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  createInventory(input) {
    const key = {
      warehouseId: input.warehouse_id,
      productId: input.product_id,
      batchCode: input.batch_code,
    };
    if (this.findInventorySync(key)) {
      throw new ConflictError({ message: 'Stock is already registered for this batch.' });
    }
    const inventory = this._insert(this.inventories, {
      ...input,
      quantity_on_hand: 0,
      quantity_reserved: 0,
      available_quantity: 0,
    });
    // A zero opening balance only creates the inventory record; the caller will
    // post the actual stock movement (for example RECEIPT or TRANSFER_IN).
    if (Number(input.quantity_on_hand) > 0) {
      this._applyMovement({
        inventoryId: inventory.id,
        movementType: 'REGISTER',
        mode: 'ON_HAND_DELTA',
        delta: Number(input.quantity_on_hand),
        unitCode: input.unit_code,
        reason: input.reason || null,
        referenceKey: input.reference_key || `register:${inventory.id}:movement`,
        actorUserId: input.actor_user_id || null,
        organizationId: input.organization_id || null,
      });
    }
    return clone(this.inventories.get(inventory.id));
  }

  findInventorySync(key) {
    return [...this.inventories.values()].find(
      (item) =>
        item.warehouse_id === key.warehouseId &&
        item.product_id === key.productId &&
        item.batch_code === key.batchCode,
    );
  }

  updateInventory(id, patch) {
    const updated = this._update(this.inventories, id, patch);
    this._syncAlert(updated);
    return clone(this.inventories.get(id));
  }

  _assertReference(map, set, referenceKey, label) {
    if (!referenceKey) return;
    if (
      set.has(referenceKey) ||
      [...map.values()].some((row) => row.reference_key === referenceKey)
    ) {
      throw new ConflictError({ message: `${label} reference key is already in use.` });
    }
  }

  _applyMovement(input) {
    const inventory = this.inventories.get(input.inventoryId);
    if (!inventory) throw new NotFoundError({ message: 'Warehouse inventory was not found.' });
    if (!Number.isFinite(input.delta) || input.delta === 0) {
      throw new ConflictError({ message: 'Stock movement quantity must be non-zero.' });
    }
    this._assertReference(this.movements, this.movementReferences, input.referenceKey, 'Movement');

    const before = inventory.available_quantity;
    let onHand = inventory.quantity_on_hand;
    let reserved = inventory.quantity_reserved;

    if (input.mode === 'ON_HAND_DELTA') {
      if (input.delta < 0 && before < -input.delta) {
        throw new ConflictError({ message: 'Insufficient available stock.' });
      }
      onHand += input.delta;
    } else if (input.mode === 'SET_ON_HAND') {
      if (input.delta < 0 || input.delta < reserved) {
        throw new ConflictError({ message: 'On-hand quantity is below reserved stock.' });
      }
      onHand = input.delta;
    } else if (input.mode === 'RESERVE') {
      if (input.delta <= 0 || before < input.delta) {
        throw new ConflictError({ message: 'Insufficient available stock.' });
      }
      reserved += input.delta;
    } else if (input.mode === 'RELEASE') {
      if (input.delta <= 0 || reserved < input.delta) {
        throw new ConflictError({ message: 'Cannot release more than reserved stock.' });
      }
      reserved -= input.delta;
    } else if (input.mode === 'DEDUCT_RESERVED') {
      if (input.delta <= 0 || reserved < input.delta) {
        throw new ConflictError({ message: 'Cannot deduct more than reserved stock.' });
      }
      onHand -= input.delta;
      reserved -= input.delta;
    } else if (input.mode === 'DEDUCT_AVAILABLE') {
      if (input.delta <= 0 || before < input.delta) {
        throw new ConflictError({ message: 'Insufficient available stock.' });
      }
      onHand -= input.delta;
    } else {
      throw new ConflictError({ message: 'Unknown stock movement mode.' });
    }

    inventory.quantity_on_hand = onHand;
    inventory.quantity_reserved = reserved;
    inventory.available_quantity = onHand - reserved;
    inventory.updated_at = now();

    const movement = this._insert(this.movements, {
      // Mirror the SQL movement function, which derives tenant ownership from
      // the warehouse rather than trusting a caller-supplied identifier.
      organization_id:
        input.organizationId ||
        this.warehouses.get(inventory.warehouse_id)?.organization_id ||
        null,
      warehouse_id: inventory.warehouse_id,
      warehouse_inventory_id: inventory.id,
      product_id: inventory.product_id,
      movement_type: input.movementType,
      quantity: Math.abs(input.delta),
      quantity_before: before,
      quantity_after: inventory.available_quantity,
      unit_code: input.unitCode || inventory.unit_code,
      reason: input.reason || null,
      reference_key: input.referenceKey || null,
      reference_id: input.referenceId || null,
      actor_user_id: input.actorUserId || null,
    });
    if (movement.reference_key) this.movementReferences.add(movement.reference_key);
    this._syncAlert(inventory);
    return clone(movement);
  }

  applyStockMovement(input) {
    return Promise.resolve(this._applyMovement(input));
  }

  listMovements(filters) {
    return Promise.resolve(
      [...this.movements.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  _syncAlert(inventory) {
    const open = [...this.alerts.values()].find(
      (alert) => alert.warehouse_inventory_id === inventory.id && alert.status === 'OPEN',
    );
    if (inventory.available_quantity < inventory.low_stock_threshold) {
      if (open) {
        open.available_quantity = inventory.available_quantity;
        open.updated_at = now();
      } else {
        this._insert(this.alerts, {
          organization_id: this.warehouses.get(inventory.warehouse_id)?.organization_id || null,
          warehouse_id: inventory.warehouse_id,
          warehouse_inventory_id: inventory.id,
          product_id: inventory.product_id,
          threshold_quantity: inventory.low_stock_threshold,
          available_quantity: inventory.available_quantity,
          status: 'OPEN',
          acknowledged_by_user_id: null,
          acknowledged_at: null,
        });
      }
    } else if (open) {
      open.status = 'RESOLVED';
      open.updated_at = now();
    }
  }

  reserveStock(input) {
    this._assertReference(
      this.reservations,
      this.reservationReferences,
      input.reference_key,
      'Reservation',
    );
    const movement = this._applyMovement({
      inventoryId: input.warehouse_inventory_id,
      movementType: 'RESERVE',
      mode: 'RESERVE',
      delta: Number(input.quantity),
      unitCode: input.unit_code,
      reason: input.reason || null,
      referenceKey: input.movement_reference_key,
      actorUserId: input.actor_user_id || null,
      organizationId: input.organization_id || null,
    });
    const reservation = this._insert(this.reservations, {
      ...input,
      settled_quantity: 0,
      status: 'ACTIVE',
    });
    this.reservationReferences.add(input.reference_key);
    this.reservationByReference.set(input.reference_key, reservation.id);
    return Promise.resolve({ reservation: clone(reservation), movement: clone(movement) });
  }

  findReservation(id) {
    return Promise.resolve(clone(this.reservations.get(id) || null));
  }

  findReservationByReference(referenceKey) {
    const reservationId = this.reservationByReference.get(referenceKey);
    const record = reservationId ? this.reservations.get(reservationId) : null;
    return Promise.resolve(clone(record || null));
  }

  listReservations(filters) {
    return Promise.resolve(
      [...this.reservations.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  settleReservation({
    reservationId,
    action,
    quantity,
    reason,
    movementReferenceKey,
    actorUserId,
  }) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) throw new NotFoundError({ message: 'Inventory reservation was not found.' });
    if (reservation.status !== 'ACTIVE') {
      throw new ConflictError({ message: 'Inventory reservation is no longer active.' });
    }
    const remaining = reservation.quantity - reservation.settled_quantity;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > remaining) {
      throw new ConflictError({
        message: 'Settlement quantity exceeds the remaining reservation.',
      });
    }
    const movement = this._applyMovement({
      inventoryId: reservation.warehouse_inventory_id,
      movementType: action,
      mode: action === 'RELEASE' ? 'RELEASE' : 'DEDUCT_RESERVED',
      delta: quantity,
      unitCode: this.inventories.get(reservation.warehouse_inventory_id)?.unit_code,
      reason: reason || null,
      referenceKey: movementReferenceKey,
      actorUserId: actorUserId || null,
      organizationId: reservation.organization_id,
      referenceId: reservation.id,
    });
    reservation.settled_quantity += quantity;
    reservation.status =
      reservation.settled_quantity >= reservation.quantity
        ? action === 'RELEASE'
          ? 'RELEASED'
          : 'DEDUCTED'
        : 'ACTIVE';
    reservation.updated_at = now();
    return Promise.resolve({ reservation: clone(reservation), movement: clone(movement) });
  }

  findOpenAlert(inventoryId) {
    const alert = [...this.alerts.values()].find(
      (item) => item.warehouse_inventory_id === inventoryId && item.status === 'OPEN',
    );
    return Promise.resolve(clone(alert || null));
  }

  findAlertById(id) {
    return Promise.resolve(clone(this.alerts.get(id) || null));
  }

  listAlerts(filters) {
    return Promise.resolve(
      [...this.alerts.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  updateAlert(id, patch) {
    return Promise.resolve(this._update(this.alerts, id, patch));
  }

  // ---------------------------------------------------------------------------
  // Locations, conditions, reconciliations and staff assignments
  // ---------------------------------------------------------------------------

  listLocations(filters) {
    return Promise.resolve(
      [...this.locations.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  findLocation(id) {
    return Promise.resolve(clone(this.locations.get(id) || null));
  }

  createLocation(input) {
    const duplicate = [...this.locations.values()].find(
      (row) => row.warehouse_id === input.warehouse_id && row.code === input.code,
    );
    if (duplicate) {
      throw new ConflictError({ message: 'Location code is already in use in this warehouse.' });
    }
    return Promise.resolve(this._insert(this.locations, input));
  }

  updateLocation(id, patch) {
    const current = this.locations.get(id);
    if (current) {
      const warehouseId = patch.warehouse_id ?? current.warehouse_id;
      const code = patch.code ?? current.code;
      const duplicate = [...this.locations.values()].find(
        (row) => row.id !== id && row.warehouse_id === warehouseId && row.code === code,
      );
      if (duplicate) {
        throw new ConflictError({ message: 'Location code is already in use in this warehouse.' });
      }
    }
    return Promise.resolve(this._update(this.locations, id, patch));
  }

  listConditions(filters) {
    return Promise.resolve(
      [...this.conditions.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  createCondition(input) {
    return Promise.resolve(this._insert(this.conditions, input));
  }

  listReconciliations(filters) {
    return Promise.resolve(
      [...this.reconciliations.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  findReconciliation(id) {
    return Promise.resolve(clone(this.reconciliations.get(id) || null));
  }

  createReconciliation(input) {
    if (input.reference_key) {
      const duplicate = [...this.reconciliations.values()].find(
        (row) => row.reference_key === input.reference_key,
      );
      if (duplicate) {
        throw new ConflictError({ message: 'Reconciliation reference key is already in use.' });
      }
    }
    return Promise.resolve(this._insert(this.reconciliations, input));
  }

  updateReconciliation(id, patch) {
    return Promise.resolve(this._update(this.reconciliations, id, patch));
  }

  listStaff(filters) {
    return Promise.resolve(
      [...this.staffAssignments.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  findStaff(id) {
    return Promise.resolve(clone(this.staffAssignments.get(id) || null));
  }

  createStaff(input) {
    const duplicate = [...this.staffAssignments.values()].find(
      (row) =>
        row.warehouse_id === input.warehouse_id &&
        row.user_id === input.user_id &&
        row.role_code === input.role_code,
    );
    if (duplicate) {
      throw new ConflictError({ message: 'Staff assignment already exists for this warehouse.' });
    }
    return Promise.resolve(this._insert(this.staffAssignments, input));
  }

  updateStaff(id, patch) {
    const current = this.staffAssignments.get(id);
    if (current && patch.role_code !== undefined) {
      const duplicate = [...this.staffAssignments.values()].find(
        (row) =>
          row.id !== id &&
          row.warehouse_id === current.warehouse_id &&
          row.user_id === current.user_id &&
          row.role_code === patch.role_code,
      );
      if (duplicate) {
        throw new ConflictError({
          message: 'Staff assignment already exists for this warehouse.',
        });
      }
    }
    return Promise.resolve(this._update(this.staffAssignments, id, patch));
  }
}

module.exports = { WarehouseInMemoryStore };

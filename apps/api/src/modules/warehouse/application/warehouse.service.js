const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, WarehouseEntity } = require('../domain/warehouse.entity');
const {
  WAREHOUSE_STORE_METHODS,
  WarehouseRepositoryToken,
  WarehouseStoreToken,
} = require('../domain/warehouse.repository');
const dto = require('./warehouse.dto');

const WarehouseServiceToken = Symbol.for('cropsy.service.warehouse');

const EVENTS = Object.freeze({
  INITIALIZED: 'warehouse.initialized',
  WAREHOUSE_CREATED: 'warehouse.warehouse.created',
  WAREHOUSE_UPDATED: 'warehouse.warehouse.updated',
  STOCK_REGISTERED: 'warehouse.stock.registered',
  STOCK_UPDATED: 'warehouse.stock.updated',
  STOCK_ADJUSTED: 'warehouse.stock.adjusted',
  STOCK_DAMAGED: 'warehouse.stock.damaged',
  STOCK_EXPIRED: 'warehouse.stock.expired',
  STOCK_DEDUCTED: 'warehouse.stock.deducted',
  STOCK_RESERVED: 'warehouse.stock.reserved',
  RESERVATION_RELEASED: 'warehouse.reservation.released',
  RESERVATION_DEDUCTED: 'warehouse.reservation.deducted',
  ALERT_ACKNOWLEDGED: 'warehouse.alert.acknowledged',
  ALERT_RESOLVED: 'warehouse.alert.resolved',
  LOCATION_CREATED: 'warehouse.location.created',
  LOCATION_UPDATED: 'warehouse.location.updated',
  RECEIPT_RECORDED: 'warehouse.receipt.recorded',
  STOCK_ALLOCATED: 'warehouse.stock.allocated',
  STOCK_TRANSFERRED: 'warehouse.stock.transferred',
  STOCK_DISPATCHED: 'warehouse.stock.dispatched',
  CONDITION_RECORDED: 'warehouse.condition.recorded',
  RECONCILIATION_CREATED: 'warehouse.reconciliation.created',
  RECONCILIATION_APPROVED: 'warehouse.reconciliation.approved',
  STAFF_ASSIGNED: 'warehouse.staff.assigned',
  STAFF_UPDATED: 'warehouse.staff.updated',
});

const CATALOG_PORT_METHODS = Object.freeze(['findProduct', 'findUnitByCode']);
const IDENTITY_METHODS = Object.freeze(['appendAudit', 'findUserById']);

function requestMeta(request) {
  return {
    ipAddress: request?.ip || null,
    userAgent: request?.headers?.['user-agent'] || null,
    requestId: request?.requestId || null,
  };
}

function requireRecord(record, label) {
  if (!record) throw new NotFoundError({ message: `${label} was not found.` });
  return record;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError({ message: 'Invalid timestamp.' });
  return date;
}

function roundNumber(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function movementReference(type, supplied) {
  if (supplied) return `movement:${supplied}`;
  return `${type.toLowerCase()}:${randomUUID()}`;
}

class WarehouseService {
  constructor({
    repository,
    store,
    eventBus,
    logger,
    metadata,
    catalog,
    identityStore,
    authorization,
    config,
  }) {
    assertRepository(repository, ['get', 'save'], WarehouseRepositoryToken);
    assertRepository(store, WAREHOUSE_STORE_METHODS, WarehouseStoreToken);
    assertRepository(catalog, CATALOG_PORT_METHODS, 'CatalogAccessPort');
    assertRepository(identityStore, IDENTITY_METHODS, 'IdentityStore');
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('WarehouseService requires an event bus.');
    }
    if (!metadata) throw new TypeError('WarehouseService requires module metadata.');
    for (const [name, dependency] of Object.entries({ store, authorization, config })) {
      if (!dependency) throw new TypeError(`WarehouseService requires ${name}.`);
    }
    this.repository = repository;
    this.store = store;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.catalog = catalog;
    this.identityStore = identityStore;
    this.authorization = authorization;
    this.config = config;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new WarehouseEntity();
      await this.repository.save(entity);
      this.publish(EVENTS.INITIALIZED, { name: entity.name }, entity.id);
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    const data = dto.toModuleInfoDto(entity, this.metadata);
    return validate(dto.moduleInfoSchema, data, 'warehouse module info');
  }

  publish(type, payload, entityId) {
    this.eventBus.publish({
      type,
      moduleId: MODULE_ID,
      aggregateId: entityId || payload?.inventoryId || payload?.warehouseId || 'anonymous',
      payload,
    });
  }

  async audit(
    { action, entityType, entityId, organizationId = null, before, after = {}, severity = 'INFO' },
    request,
  ) {
    const meta = requestMeta(request);
    const entry = {
      action,
      entityType,
      entityId: entityId || null,
      actorUserId: request?.auth?.user?.id || null,
      organizationId,
      before: before === undefined ? undefined : before,
      after: { ...after, ...(meta.requestId ? { requestId: meta.requestId } : {}) },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      severity,
    };
    await this.identityStore.appendAudit(entry);
    this.publish(action, entry.after, entityId);
    return entry;
  }

  async resolveTenantId(context, explicit) {
    if (explicit) {
      if (!context.isSuperAdmin) await this.authorization.assertOrganization(context, explicit);
      return explicit;
    }
    if (context.isSuperAdmin) return null;
    if (!context.organizationId) {
      throw new ForbiddenError({
        message: 'An active organization context is required.',
        details: { code: 'organization_context_required' },
      });
    }
    await this.authorization.assertOrganization(context, context.organizationId);
    return context.organizationId;
  }

  assertSameTenant(record, organizationId, label) {
    if (record.organization_id === null || record.organization_id === undefined) return record;
    if (record.organization_id !== organizationId) {
      throw new ForbiddenError({
        message: `${label} belongs to another organization.`,
        details: { code: 'cross_organization_access_denied' },
      });
    }
    return record;
  }

  async requireWarehouse(context, warehouseId, organizationId = undefined) {
    const warehouse = requireRecord(await this.store.findWarehouse(warehouseId), 'Warehouse');
    const tenant = organizationId ?? (await this.resolveTenantId(context, null));
    if (tenant) this.assertSameTenant(warehouse, tenant, 'Warehouse');
    if (!context.isSuperAdmin && warehouse.organization_id) {
      await this.authorization.assertOrganization(context, warehouse.organization_id);
    }
    return warehouse;
  }

  async requireProduct(context, productId, organizationId) {
    const product = requireRecord(await this.catalog.findProduct(productId), 'Product');
    if (organizationId) this.assertSameTenant(product, organizationId, 'Product');
    if (!context.isSuperAdmin && product.organization_id) {
      await this.authorization.assertOrganization(context, product.organization_id);
    }
    return product;
  }

  async requireUnit(unitCode, organizationId) {
    const unit = requireRecord(await this.catalog.findUnitByCode(unitCode), 'Unit of measure');
    if (organizationId) this.assertSameTenant(unit, organizationId, 'Unit of measure');
    if (unit.is_active === false) {
      throw new ValidationError({ message: 'The selected unit of measure is inactive.' });
    }
    return unit;
  }

  async inventoryContext(context, inventoryId) {
    const inventory = requireRecord(
      await this.store.findInventoryById(inventoryId),
      'Warehouse inventory',
    );
    const warehouse = await this.requireWarehouse(context, inventory.warehouse_id);
    return { inventory, warehouse };
  }

  async relatedFor(inventory, warehouse = null) {
    const [resolvedWarehouse, product, alert] = await Promise.all([
      warehouse ? Promise.resolve(warehouse) : this.store.findWarehouse(inventory.warehouse_id),
      this.catalog.findProduct(inventory.product_id),
      this.store.findOpenAlert(inventory.id),
    ]);
    return dto.toInventoryDto(inventory, {
      warehouse: resolvedWarehouse,
      product,
      alert,
    });
  }

  async _scopeWarehouseIds(context, organizationId, explicitWarehouseId) {
    const warehouses = await this.store.listWarehouses(
      organizationId ? { organization_id: organizationId } : {},
    );
    if (explicitWarehouseId) {
      if (organizationId && !warehouses.some((item) => item.id === explicitWarehouseId)) {
        throw new ForbiddenError({
          message: 'Warehouse belongs to another organization.',
          details: { code: 'cross_organization_access_denied' },
        });
      }
      return [explicitWarehouseId];
    }
    return warehouses.map((item) => item.id);
  }

  async _findMovementByReference(referenceKey) {
    const rows = await this.store.listMovements({ reference_key: referenceKey });
    return rows[0] || null;
  }

  async _requireInventoryInWarehouse(inventoryId, warehouse, label = 'Warehouse inventory') {
    const inventory = requireRecord(await this.store.findInventoryById(inventoryId), label);
    if (inventory.warehouse_id !== warehouse.id) {
      throw new ValidationError({
        message: `${label} does not belong to the selected warehouse.`,
      });
    }
    return inventory;
  }

  // ---------------------------------------------------------------------------
  // Warehouses
  // ---------------------------------------------------------------------------

  async listWarehouses({ context, query = {} }) {
    const value = validate(dto.warehouseQuerySchema, query, 'warehouse query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    let warehouses = await this.store.listWarehouses({
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(value.status ? { status: value.status } : {}),
    });
    if (value.search) {
      const search = value.search.toLowerCase();
      warehouses = warehouses.filter(
        (item) =>
          item.name.toLowerCase().includes(search) || item.code.toLowerCase().includes(search),
      );
    }
    return warehouses.map(dto.toWarehouseDto);
  }

  async getWarehouse({ context, warehouseId }) {
    const warehouse = await this.requireWarehouse(context, warehouseId);
    return dto.toWarehouseDto(warehouse);
  }

  async createWarehouse({ context, input, request }) {
    const value = validate(dto.warehouseCreateSchema, input, 'warehouse input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    if (!organizationId) {
      throw new ValidationError({ message: 'organizationId is required for a warehouse.' });
    }
    if (value.managerUserId) {
      requireRecord(
        await this.identityStore.findUserById(value.managerUserId),
        'Warehouse manager',
      );
    }
    const record = await this.store.createWarehouse({
      id: randomUUID(),
      organization_id: organizationId,
      code: value.code,
      name: value.name,
      manager_user_id: value.managerUserId || null,
      address_id: value.addressId || null,
      division_id: value.divisionId || null,
      district_id: value.districtId || null,
      upazila_id: value.upazilaId || null,
      union_id: value.unionId || null,
      capacity_cubic_meters: value.capacityCubicMeters ?? null,
      status: value.status,
    });
    await this.audit(
      {
        action: EVENTS.WAREHOUSE_CREATED,
        entityType: 'Warehouse',
        entityId: record.id,
        organizationId,
        after: dto.toWarehouseDto(record),
      },
      request,
    );
    return dto.toWarehouseDto(record);
  }

  async updateWarehouse({ context, warehouseId, input, request }) {
    const value = validate(dto.warehouseUpdateSchema, input, 'warehouse update');
    const current = await this.requireWarehouse(context, warehouseId);
    if (value.managerUserId) {
      requireRecord(
        await this.identityStore.findUserById(value.managerUserId),
        'Warehouse manager',
      );
    }
    const patch = {
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.managerUserId !== undefined ? { manager_user_id: value.managerUserId } : {}),
      ...(value.addressId !== undefined ? { address_id: value.addressId } : {}),
      ...(value.divisionId !== undefined ? { division_id: value.divisionId } : {}),
      ...(value.districtId !== undefined ? { district_id: value.districtId } : {}),
      ...(value.upazilaId !== undefined ? { upazila_id: value.upazilaId } : {}),
      ...(value.unionId !== undefined ? { union_id: value.unionId } : {}),
      ...(value.capacityCubicMeters !== undefined
        ? { capacity_cubic_meters: value.capacityCubicMeters }
        : {}),
      ...(value.status !== undefined ? { status: value.status } : {}),
    };
    const updated = await this.store.updateWarehouse(warehouseId, patch);
    await this.audit(
      {
        action: EVENTS.WAREHOUSE_UPDATED,
        entityType: 'Warehouse',
        entityId: updated.id,
        organizationId: updated.organization_id,
        before: dto.toWarehouseDto(current),
        after: dto.toWarehouseDto(updated),
      },
      request,
    );
    return dto.toWarehouseDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Inventory and stock movements
  // ---------------------------------------------------------------------------

  async listInventories({ context, query = {} }) {
    const value = validate(dto.inventoryQuerySchema, query, 'inventory query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const warehouseIds = new Set();
    if (value.warehouseId) warehouseIds.add(value.warehouseId);
    if (organizationId) {
      for (const warehouse of await this.store.listWarehouses({
        organization_id: organizationId,
      })) {
        warehouseIds.add(warehouse.id);
      }
    }
    let inventories = await this.store.listInventories({
      ...(value.warehouseId ? { warehouse_id: value.warehouseId } : {}),
      ...(value.productId ? { product_id: value.productId } : {}),
      ...(value.batchCode ? { batch_code: value.batchCode } : {}),
    });
    if (organizationId) {
      inventories = inventories.filter((item) => warehouseIds.has(item.warehouse_id));
    } else if (value.warehouseId) {
      inventories = inventories.filter((item) => warehouseIds.has(item.warehouse_id));
    }
    if (value.status === 'BELOW_THRESHOLD') {
      inventories = inventories.filter(
        (item) => Number(item.available_quantity) < Number(item.low_stock_threshold || 0),
      );
    }
    const rows = [];
    for (const inventory of inventories) {
      rows.push(await this.relatedFor(inventory));
    }
    if (value.status === 'OPEN_ALERT') {
      return rows.filter((item) => item.openAlertId);
    }
    return rows;
  }

  async getInventory({ context, inventoryId }) {
    const { inventory, warehouse } = await this.inventoryContext(context, inventoryId);
    return this.relatedFor(inventory, warehouse);
  }

  async registerStock({ context, input, request }) {
    const value = validate(dto.inventoryCreateSchema, input, 'stock registration input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    if (!organizationId) {
      throw new ValidationError({ message: 'organizationId is required for stock registration.' });
    }
    const warehouse = await this.requireWarehouse(context, value.warehouseId, organizationId);
    await this.requireProduct(context, value.productId, organizationId);
    await this.requireUnit(value.unitCode, organizationId);
    const existing = await this.store.findInventory({
      warehouseId: value.warehouseId,
      productId: value.productId,
      batchCode: value.batchCode,
    });
    if (existing) {
      throw new ConflictError({ message: 'Stock is already registered for this batch.' });
    }
    const inventoryId = randomUUID();
    const record = await this.store.createInventory({
      id: inventoryId,
      warehouse_id: warehouse.id,
      product_id: value.productId,
      batch_code: value.batchCode,
      quantity_on_hand: value.quantity,
      low_stock_threshold: value.lowStockThreshold,
      unit_code: value.unitCode,
      reason: value.reason ?? null,
      reference_key: value.referenceKey ? `register:${value.referenceKey}` : null,
      actor_user_id: request?.auth?.user?.id || null,
    });
    await this.audit(
      {
        action: EVENTS.STOCK_REGISTERED,
        entityType: 'WarehouseInventory',
        entityId: record.id,
        organizationId,
        after: dto.toInventoryDto(record, { warehouse }),
      },
      request,
    );
    return this.getInventory({ context, inventoryId: record.id });
  }

  async updateStock({ context, inventoryId, input, request }) {
    const value = validate(dto.inventoryUpdateSchema, input, 'stock update');
    const { inventory, warehouse } = await this.inventoryContext(context, inventoryId);
    if (value.quantity !== undefined) {
      await this.store.applyStockMovement({
        inventoryId: inventory.id,
        movementType: 'UPDATE',
        mode: 'SET_ON_HAND',
        delta: value.quantity,
        unitCode: inventory.unit_code,
        reason: value.reason || null,
        referenceKey: movementReference('UPDATE', value.referenceKey),
      });
    }
    if (value.lowStockThreshold !== undefined) {
      await this.store.updateInventory(inventory.id, {
        low_stock_threshold: value.lowStockThreshold,
      });
    }
    const updated = requireRecord(
      await this.store.findInventoryById(inventory.id),
      'Warehouse inventory',
    );
    await this.audit(
      {
        action: EVENTS.STOCK_UPDATED,
        entityType: 'WarehouseInventory',
        entityId: inventory.id,
        organizationId: warehouse.organization_id,
        before: dto.toInventoryDto(inventory, { warehouse }),
        after: dto.toInventoryDto(updated, { warehouse }),
      },
      request,
    );
    return this.getInventory({ context, inventoryId: inventory.id });
  }

  async _mutation({ context, inventoryId, input, movementType, mode, delta, event, request }) {
    const value = validate(dto.quantityMutationSchema, input, 'stock mutation input');
    const { inventory, warehouse } = await this.inventoryContext(context, inventoryId);
    const effectiveDelta = delta === undefined ? value.quantity : delta(value.quantity);
    await this.store.applyStockMovement({
      inventoryId: inventory.id,
      movementType,
      mode,
      delta: effectiveDelta,
      unitCode: inventory.unit_code,
      reason: value.reason || null,
      referenceKey: movementReference(movementType, value.referenceKey),
      actorUserId: request?.auth?.user?.id || null,
    });
    const updated = requireRecord(
      await this.store.findInventoryById(inventory.id),
      'Warehouse inventory',
    );
    await this.audit(
      {
        action: event,
        entityType: 'WarehouseInventory',
        entityId: inventory.id,
        organizationId: warehouse.organization_id,
        before: dto.toInventoryDto(inventory, { warehouse }),
        after: dto.toInventoryDto(updated, { warehouse }),
      },
      request,
    );
    return this.getInventory({ context, inventoryId: inventory.id });
  }

  async adjustStock({ context, inventoryId, input, request }) {
    const value = validate(dto.movementCreateSchema, input, 'stock adjustment input');
    return this._mutation({
      context,
      inventoryId,
      input: {
        quantity: Math.abs(value.deltaQuantity),
        reason: value.reason,
        referenceKey: value.referenceKey,
      },
      movementType: 'ADJUSTMENT',
      mode: value.deltaQuantity > 0 ? 'ON_HAND_DELTA' : 'DEDUCT_AVAILABLE',
      delta: (quantity) => (value.deltaQuantity > 0 ? quantity : -quantity),
      event: EVENTS.STOCK_ADJUSTED,
      request,
    });
  }

  async recordDamaged({ context, inventoryId, input, request }) {
    return this._mutation({
      context,
      inventoryId,
      input,
      movementType: 'DAMAGED',
      mode: 'DEDUCT_AVAILABLE',
      event: EVENTS.STOCK_DAMAGED,
      request,
    });
  }

  async recordExpired({ context, inventoryId, input, request }) {
    return this._mutation({
      context,
      inventoryId,
      input,
      movementType: 'EXPIRED',
      mode: 'DEDUCT_AVAILABLE',
      event: EVENTS.STOCK_EXPIRED,
      request,
    });
  }

  async deductStock({ context, inventoryId, input, request }) {
    return this._mutation({
      context,
      inventoryId,
      input,
      movementType: 'DEDUCT',
      mode: 'DEDUCT_AVAILABLE',
      event: EVENTS.STOCK_DEDUCTED,
      request,
    });
  }

  async reserveStock({ context, inventoryId, input, request }) {
    const value = validate(dto.reservationCreateSchema, input, 'stock reservation input');
    const { inventory, warehouse } = await this.inventoryContext(context, inventoryId);
    const existing = await this.store.findReservationByReference(value.referenceKey);
    if (existing) {
      this.assertSameTenant(existing, warehouse.organization_id, 'Reservation');
      if (existing.warehouse_inventory_id !== inventory.id) {
        throw new ConflictError({ message: 'Reservation reference key is already in use.' });
      }
      return dto.toReservationDto(existing);
    }
    let result;
    try {
      result = await this.store.reserveStock({
        id: randomUUID(),
        organization_id: warehouse.organization_id || null,
        warehouse_id: warehouse.id,
        warehouse_inventory_id: inventory.id,
        product_id: inventory.product_id,
        quantity: value.quantity,
        unit_code: inventory.unit_code,
        status: 'ACTIVE',
        reference_key: value.referenceKey,
        movement_reference_key: `reservation:${value.referenceKey}:movement`,
        reason: value.reason || null,
        actor_user_id: request?.auth?.user?.id || null,
        expires_at: parseDate(value.expiresAt),
      });
    } catch (error) {
      if (error instanceof ConflictError) {
        const raced = await this.store.findReservationByReference(value.referenceKey);
        if (raced) return dto.toReservationDto(raced);
      }
      throw error;
    }
    await this.audit(
      {
        action: EVENTS.STOCK_RESERVED,
        entityType: 'InventoryReservation',
        entityId: result.reservation.id,
        organizationId: warehouse.organization_id,
        after: dto.toReservationDto(result.reservation),
      },
      request,
    );
    return dto.toReservationDto(result.reservation);
  }

  async listReservations({ context, query = {} }) {
    const value = validate(dto.reservationQuerySchema, query, 'reservation query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const reservations = await this.store.listReservations({
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(value.warehouseId ? { warehouse_id: value.warehouseId } : {}),
      ...(value.productId ? { product_id: value.productId } : {}),
      ...(value.inventoryId ? { warehouse_inventory_id: value.inventoryId } : {}),
      ...(value.status ? { status: value.status } : {}),
    });
    return reservations.map(dto.toReservationDto);
  }

  async getReservation({ context, reservationId }) {
    const reservation = requireRecord(
      await this.store.findReservation(reservationId),
      'Inventory reservation',
    );
    if (reservation.organization_id) {
      if (!context.isSuperAdmin) {
        await this.authorization.assertOrganization(context, reservation.organization_id);
      }
      this.assertSameTenant(
        reservation,
        context.organizationId || reservation.organization_id,
        'Reservation',
      );
    }
    return dto.toReservationDto(reservation);
  }

  async settleReservation({ context, reservationId, action, input, request }) {
    const value = validate(
      dto.reservationSettleSchema,
      input || {},
      'reservation settlement input',
    );
    const reservation = await this.getReservation({ context, reservationId });
    const quantity = value.quantity ?? reservation.remainingQuantity;
    const event = action === 'RELEASE' ? EVENTS.RESERVATION_RELEASED : EVENTS.RESERVATION_DEDUCTED;
    const result = await this.store.settleReservation({
      reservationId,
      action,
      quantity,
      reason: value.reason || null,
      movementReferenceKey:
        value.referenceKey || `${action.toLowerCase()}:${reservationId}:${randomUUID()}`,
      actorUserId: request?.auth?.user?.id || null,
    });
    await this.audit(
      {
        action: event,
        entityType: 'InventoryReservation',
        entityId: reservationId,
        organizationId: reservation.organizationId,
        after: { quantity, result: result.settlement || result.reservation },
      },
      request,
    );
    return dto.toReservationDto(result.reservation);
  }

  async releaseReservation({ context, reservationId, input, request }) {
    return this.settleReservation({ context, reservationId, action: 'RELEASE', input, request });
  }

  async deductReservation({ context, reservationId, input, request }) {
    return this.settleReservation({ context, reservationId, action: 'DEDUCT', input, request });
  }

  async listMovements({ context, query = {} }) {
    const value = validate(dto.movementQuerySchema, query, 'movement query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const movements = await this.store.listMovements({
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(value.warehouseId ? { warehouse_id: value.warehouseId } : {}),
      ...(value.productId ? { product_id: value.productId } : {}),
      ...(value.inventoryId ? { warehouse_inventory_id: value.inventoryId } : {}),
      ...(value.movementType ? { movement_type: value.movementType } : {}),
      ...(value.actorUserId ? { actor_user_id: value.actorUserId } : {}),
      ...(value.since ? { since: new Date(value.since) } : {}),
      ...(value.until ? { until: new Date(value.until) } : {}),
    });
    return movements.map(dto.toMovementDto);
  }

  async listAlerts({ context, query = {} }) {
    const value = validate(dto.alertQuerySchema, query, 'alert query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const alerts = await this.store.listAlerts({
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(value.warehouseId ? { warehouse_id: value.warehouseId } : {}),
      ...(value.productId ? { product_id: value.productId } : {}),
      ...(value.inventoryId ? { warehouse_inventory_id: value.inventoryId } : {}),
      ...(value.status ? { status: value.status } : {}),
    });
    return alerts.map(dto.toAlertDto);
  }

  async updateAlert({ context, alertId, patch, action, request }) {
    const alert = requireRecord(await this.store.findAlertById(alertId), 'Inventory alert');
    if (alert.organization_id) {
      if (!context.isSuperAdmin) {
        await this.authorization.assertOrganization(context, alert.organization_id);
      }
      this.assertSameTenant(alert, context.organizationId || alert.organization_id, 'Alert');
    }
    const updated = await this.store.updateAlert(alertId, patch);
    await this.audit(
      {
        action,
        entityType: 'InventoryAlert',
        entityId: alertId,
        organizationId: updated.organization_id,
        before: dto.toAlertDto(alert),
        after: dto.toAlertDto(updated),
      },
      request,
    );
    return dto.toAlertDto(updated);
  }

  async acknowledgeAlert({ context, alertId, input, request }) {
    validate(dto.alertActionSchema, input || {}, 'alert acknowledgment input');
    const actor = request?.auth?.user?.id || null;
    return this.updateAlert({
      context,
      alertId,
      patch: {
        status: 'ACKNOWLEDGED',
        acknowledged_by_user_id: actor,
        acknowledged_at: new Date(),
      },
      action: EVENTS.ALERT_ACKNOWLEDGED,
      request,
    });
  }

  async resolveAlert({ context, alertId, input, request }) {
    validate(dto.alertActionSchema, input || {}, 'alert resolution input');
    return this.updateAlert({
      context,
      alertId,
      patch: { status: 'RESOLVED' },
      action: EVENTS.ALERT_RESOLVED,
      request,
    });
  }

  // ---------------------------------------------------------------------------
  // Warehouse locations
  // ---------------------------------------------------------------------------

  async listLocations({ context, query = {} }) {
    const value = validate(dto.locationQuerySchema, query, 'location query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const warehouseIds = new Set(
      await this._scopeWarehouseIds(context, organizationId, value.warehouseId),
    );
    const rows = await this.store.listLocations({
      ...(value.warehouseId ? { warehouse_id: value.warehouseId } : {}),
      ...(value.status ? { status: value.status } : {}),
    });
    let locations = rows.filter((item) => warehouseIds.has(item.warehouse_id));
    if (value.search) {
      const search = value.search.toLowerCase();
      locations = locations.filter(
        (item) =>
          item.name.toLowerCase().includes(search) || item.code.toLowerCase().includes(search),
      );
    }
    return locations.map(dto.toLocationDto);
  }

  async createLocation({ context, input, request }) {
    const value = validate(dto.locationCreateSchema, input, 'warehouse location input');
    const organizationId = await this.resolveTenantId(context, null);
    const warehouse = await this.requireWarehouse(context, value.warehouseId, organizationId);
    const record = await this.store.createLocation({
      id: randomUUID(),
      warehouse_id: warehouse.id,
      code: value.code,
      name: value.name,
      zone: value.zone ?? null,
      aisle: value.aisle ?? null,
      rack: value.rack ?? null,
      shelf: value.shelf ?? null,
      capacity_units: value.capacityUnits ?? null,
      status: value.status,
    });
    await this.audit(
      {
        action: EVENTS.LOCATION_CREATED,
        entityType: 'WarehouseLocation',
        entityId: record.id,
        organizationId: warehouse.organization_id,
        after: dto.toLocationDto(record),
      },
      request,
    );
    return dto.toLocationDto(record);
  }

  async updateLocation({ context, locationId, input, request }) {
    const value = validate(dto.locationUpdateSchema, input, 'warehouse location update');
    const current = requireRecord(await this.store.findLocation(locationId), 'Warehouse location');
    const warehouse = await this.requireWarehouse(context, current.warehouse_id);
    const patch = {
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.zone !== undefined ? { zone: value.zone } : {}),
      ...(value.aisle !== undefined ? { aisle: value.aisle } : {}),
      ...(value.rack !== undefined ? { rack: value.rack } : {}),
      ...(value.shelf !== undefined ? { shelf: value.shelf } : {}),
      ...(value.capacityUnits !== undefined ? { capacity_units: value.capacityUnits } : {}),
      ...(value.status !== undefined ? { status: value.status } : {}),
    };
    const updated = await this.store.updateLocation(locationId, patch);
    await this.audit(
      {
        action: EVENTS.LOCATION_UPDATED,
        entityType: 'WarehouseLocation',
        entityId: locationId,
        organizationId: warehouse.organization_id,
        before: dto.toLocationDto(current),
        after: dto.toLocationDto(updated),
      },
      request,
    );
    return dto.toLocationDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Capacity
  // ---------------------------------------------------------------------------

  async getWarehouseCapacity({ context, warehouseId }) {
    const warehouse = await this.requireWarehouse(context, warehouseId);
    const [inventories, locations] = await Promise.all([
      this.store.listInventories({ warehouse_id: warehouse.id }),
      this.store.listLocations({ warehouse_id: warehouse.id }),
    ]);
    return dto.toCapacityDto({ warehouse, inventories, locations });
  }

  async getCapacity(args) {
    return this.getWarehouseCapacity(args);
  }

  // ---------------------------------------------------------------------------
  // Receiving, allocation, transfer and dispatch
  // ---------------------------------------------------------------------------

  async _stockOperation({
    context,
    input,
    movementType,
    mode,
    sign,
    event,
    kind,
    request,
    createIfMissing = false,
    extra = {},
  }) {
    const organizationId = await this.resolveTenantId(context, null);
    const warehouse = await this.requireWarehouse(context, input.warehouseId, organizationId);
    await this.requireProduct(context, input.productId, organizationId);
    await this.requireUnit(input.unitCode, organizationId);
    if (input.locationId) {
      const location = requireRecord(
        await this.store.findLocation(input.locationId),
        'Warehouse location',
      );
      if (location.warehouse_id !== warehouse.id) {
        throw new ValidationError({
          message: 'Location does not belong to the selected warehouse.',
        });
      }
    }

    const referenceKey = `${kind}:${input.referenceKey}`;
    const replay = await this._findMovementByReference(referenceKey);
    if (replay) {
      this.assertSameTenant(replay, warehouse.organization_id ?? organizationId, 'Stock movement');
      const replayedInventory = await this._requireInventoryInWarehouse(
        replay.warehouse_inventory_id,
        warehouse,
      );
      if (
        replayedInventory.product_id !== input.productId ||
        replayedInventory.batch_code !== input.batchCode
      ) {
        throw new ConflictError({
          message: 'Reference key is already in use for another product or batch.',
        });
      }
      return {
        inventoryDto: await this.relatedFor(replayedInventory, warehouse),
        movement: replay,
        replayed: true,
      };
    }

    let inventory = await this.store.findInventory({
      warehouseId: warehouse.id,
      productId: input.productId,
      batchCode: input.batchCode,
    });
    if (!inventory) {
      if (!createIfMissing) {
        throw new ConflictError({
          message: 'Stock has not been registered for this product and batch.',
        });
      }
      inventory = await this.store.createInventory({
        id: randomUUID(),
        organization_id: warehouse.organization_id || null,
        warehouse_id: warehouse.id,
        product_id: input.productId,
        batch_code: input.batchCode,
        quantity_on_hand: 0,
        low_stock_threshold: 0,
        unit_code: input.unitCode,
        reason: input.notes ?? null,
        reference_key: `register:${referenceKey}:inventory`,
        actor_user_id: request?.auth?.user?.id || null,
      });
    }

    const before = inventory;
    const movement = await this.store.applyStockMovement({
      inventoryId: inventory.id,
      movementType,
      mode,
      delta: sign * input.quantity,
      unitCode: input.unitCode,
      reason: input.notes ?? null,
      referenceKey,
      actorUserId: request?.auth?.user?.id || null,
    });
    const updated = await this._requireInventoryInWarehouse(inventory.id, warehouse);
    await this.audit(
      {
        action: event,
        entityType: 'WarehouseInventory',
        entityId: updated.id,
        organizationId: warehouse.organization_id,
        before: dto.toInventoryDto(before, { warehouse }),
        after: dto.toInventoryDto(updated, { warehouse }),
        ...extra,
      },
      request,
    );
    return {
      inventoryDto: await this.relatedFor(updated, warehouse),
      movement,
      replayed: false,
    };
  }

  async recordReceipt({ context, input, request }) {
    const value = validate(dto.receiptCreateSchema, input, 'product receipt input');
    const result = await this._stockOperation({
      context,
      input: value,
      movementType: 'RECEIPT',
      mode: 'ON_HAND_DELTA',
      sign: 1,
      event: EVENTS.RECEIPT_RECORDED,
      kind: 'receipt',
      request,
      createIfMissing: true,
      extra: value.locationId ? { locationId: value.locationId } : {},
    });
    return dto.toReceiptResultDto(result.inventoryDto, {
      movement: result.movement,
      replayed: result.replayed,
      ...(value.locationId ? { locationId: value.locationId } : {}),
    });
  }

  async createReceipt(args) {
    return this.recordReceipt(args);
  }

  async allocateStock({ context, input, request }) {
    const value = validate(dto.allocationCreateSchema, input, 'stock allocation input');
    const organizationId = await this.resolveTenantId(context, null);
    const warehouse = await this.requireWarehouse(context, value.warehouseId, organizationId);
    await this.requireProduct(context, value.productId, organizationId);
    await this.requireUnit(value.unitCode, organizationId);
    const inventory = await this.store.findInventory({
      warehouseId: warehouse.id,
      productId: value.productId,
      batchCode: value.batchCode,
    });
    if (!inventory) {
      throw new ConflictError({
        message: 'Stock has not been registered for this product and batch.',
      });
    }
    const existing = await this.store.findReservationByReference(value.referenceKey);
    if (existing) {
      this.assertSameTenant(existing, warehouse.organization_id ?? organizationId, 'Reservation');
      if (existing.warehouse_inventory_id !== inventory.id) {
        throw new ConflictError({ message: 'Reservation reference key is already in use.' });
      }
      return dto.toReservationDto(existing);
    }
    let result;
    try {
      result = await this.store.reserveStock({
        id: randomUUID(),
        organization_id: warehouse.organization_id || null,
        warehouse_id: warehouse.id,
        warehouse_inventory_id: inventory.id,
        product_id: inventory.product_id,
        quantity: value.quantity,
        unit_code: value.unitCode,
        status: 'ACTIVE',
        reference_key: value.referenceKey,
        movement_reference_key: `allocation:${value.referenceKey}:movement`,
        reason: value.notes || null,
        actor_user_id: request?.auth?.user?.id || null,
        expires_at: null,
      });
    } catch (error) {
      if (error instanceof ConflictError) {
        const raced = await this.store.findReservationByReference(value.referenceKey);
        if (raced) return dto.toReservationDto(raced);
      }
      throw error;
    }
    await this.audit(
      {
        action: EVENTS.STOCK_ALLOCATED,
        entityType: 'InventoryReservation',
        entityId: result.reservation.id,
        organizationId: warehouse.organization_id,
        after: {
          ...dto.toReservationDto(result.reservation),
          ...(value.orderId ? { orderId: value.orderId } : {}),
        },
      },
      request,
    );
    return dto.toReservationDto(result.reservation);
  }

  async createAllocation(args) {
    return this.allocateStock(args);
  }

  async transferStock({ context, input, request }) {
    const value = validate(dto.transferCreateSchema, input, 'stock transfer input');
    const organizationId = await this.resolveTenantId(context, null);
    const source = await this.requireWarehouse(context, value.fromWarehouseId, organizationId);
    const destination = await this.requireWarehouse(context, value.toWarehouseId, organizationId);
    if (
      source.organization_id &&
      destination.organization_id &&
      source.organization_id !== destination.organization_id &&
      !context.isSuperAdmin
    ) {
      throw new ForbiddenError({
        message: 'Transfers between different organizations are not permitted.',
        details: { code: 'cross_organization_access_denied' },
      });
    }
    if (source.status !== 'ACTIVE' || destination.status !== 'ACTIVE') {
      throw new ValidationError({ message: 'Both warehouses must be active for a transfer.' });
    }
    await this.requireProduct(context, value.productId, organizationId);
    await this.requireUnit(value.unitCode, organizationId);

    const actorUserId = request?.auth?.user?.id || null;
    const outReference = `transfer:${value.referenceKey}:out`;
    const inReference = `transfer:${value.referenceKey}:in`;

    let outMovement = await this._findMovementByReference(outReference);
    let inMovement = await this._findMovementByReference(inReference);
    const replayed = Boolean(outMovement || inMovement);
    let fromInventory;
    let toInventory;

    if (outMovement) {
      this.assertSameTenant(
        outMovement,
        source.organization_id ?? organizationId,
        'Stock movement',
      );
      fromInventory = await this._requireInventoryInWarehouse(
        outMovement.warehouse_inventory_id,
        source,
      );
      if (
        fromInventory.product_id !== value.productId ||
        fromInventory.batch_code !== value.batchCode
      ) {
        throw new ConflictError({
          message: 'Transfer reference key is already in use for another product or batch.',
        });
      }
    } else {
      fromInventory = await this.store.findInventory({
        warehouseId: source.id,
        productId: value.productId,
        batchCode: value.batchCode,
      });
      if (!fromInventory) {
        throw new ConflictError({
          message: 'Stock has not been registered at the source warehouse.',
        });
      }
      const before = dto.toInventoryDto(fromInventory, { warehouse: source });
      outMovement = await this.store.applyStockMovement({
        inventoryId: fromInventory.id,
        movementType: 'TRANSFER_OUT',
        mode: 'DEDUCT_AVAILABLE',
        delta: value.quantity,
        unitCode: value.unitCode,
        reason: value.notes ?? null,
        referenceKey: outReference,
        actorUserId,
      });
      fromInventory = await this._requireInventoryInWarehouse(fromInventory.id, source);
      await this.audit(
        {
          action: EVENTS.STOCK_TRANSFERRED,
          entityType: 'WarehouseInventory',
          entityId: fromInventory.id,
          organizationId: source.organization_id,
          before,
          after: dto.toInventoryDto(fromInventory, { warehouse: source }),
          direction: 'OUT',
          transferReferenceKey: value.referenceKey,
        },
        request,
      );
    }

    if (inMovement) {
      this.assertSameTenant(
        inMovement,
        destination.organization_id ?? organizationId,
        'Stock movement',
      );
      toInventory = await this._requireInventoryInWarehouse(
        inMovement.warehouse_inventory_id,
        destination,
      );
      if (
        toInventory.product_id !== value.productId ||
        toInventory.batch_code !== value.batchCode
      ) {
        throw new ConflictError({
          message: 'Transfer reference key is already in use for another product or batch.',
        });
      }
    } else {
      toInventory = await this.store.findInventory({
        warehouseId: destination.id,
        productId: value.productId,
        batchCode: value.batchCode,
      });
      if (!toInventory) {
        toInventory = await this.store.createInventory({
          id: randomUUID(),
          organization_id: destination.organization_id || null,
          warehouse_id: destination.id,
          product_id: value.productId,
          batch_code: value.batchCode,
          quantity_on_hand: 0,
          low_stock_threshold: 0,
          unit_code: value.unitCode,
          reason: value.notes ?? null,
          reference_key: `register:${inReference}:inventory`,
          actor_user_id: actorUserId,
        });
      }
      const before = dto.toInventoryDto(toInventory, { warehouse: destination });
      inMovement = await this.store.applyStockMovement({
        inventoryId: toInventory.id,
        movementType: 'TRANSFER_IN',
        mode: 'ON_HAND_DELTA',
        delta: value.quantity,
        unitCode: value.unitCode,
        reason: value.notes ?? null,
        referenceKey: inReference,
        actorUserId,
      });
      toInventory = await this._requireInventoryInWarehouse(toInventory.id, destination);
      await this.audit(
        {
          action: EVENTS.STOCK_TRANSFERRED,
          entityType: 'WarehouseInventory',
          entityId: toInventory.id,
          organizationId: destination.organization_id,
          before,
          after: dto.toInventoryDto(toInventory, { warehouse: destination }),
          direction: 'IN',
          transferReferenceKey: value.referenceKey,
        },
        request,
      );
    }

    return dto.toTransferResultDto({
      from: await this.relatedFor(fromInventory, source),
      to: await this.relatedFor(toInventory, destination),
      fromMovement: outMovement,
      toMovement: inMovement,
      referenceKey: value.referenceKey,
      replayed,
    });
  }

  async createTransfer(args) {
    return this.transferStock(args);
  }

  async dispatchStock({ context, input, request }) {
    const value = validate(dto.dispatchCreateSchema, input, 'stock dispatch input');
    const result = await this._stockOperation({
      context,
      input: value,
      movementType: 'DISPATCH',
      mode: 'DEDUCT_AVAILABLE',
      sign: 1,
      event: EVENTS.STOCK_DISPATCHED,
      kind: 'dispatch',
      request,
      extra: value.shipmentId ? { shipmentId: value.shipmentId } : {},
    });
    return dto.toDispatchResultDto(result.inventoryDto, {
      movement: result.movement,
      replayed: result.replayed,
      ...(value.shipmentId ? { shipmentId: value.shipmentId } : {}),
    });
  }

  async createDispatch(args) {
    return this.dispatchStock(args);
  }

  // ---------------------------------------------------------------------------
  // Storage conditions
  // ---------------------------------------------------------------------------

  async listConditions({ context, query = {} }) {
    const value = validate(dto.conditionQuerySchema, query, 'storage condition query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const warehouseIds = new Set(
      await this._scopeWarehouseIds(context, organizationId, value.warehouseId),
    );
    const conditions = await this.store.listConditions({
      ...(value.warehouseId ? { warehouse_id: value.warehouseId } : {}),
      ...(value.inventoryId ? { warehouse_inventory_id: value.inventoryId } : {}),
      ...(value.conditionStatus ? { condition_status: value.conditionStatus } : {}),
      ...(value.since ? { since: new Date(value.since) } : {}),
      ...(value.until ? { until: new Date(value.until) } : {}),
    });
    return conditions.filter((item) => warehouseIds.has(item.warehouse_id)).map(dto.toConditionDto);
  }

  async createCondition({ context, input, request }) {
    const value = validate(dto.conditionCreateSchema, input, 'storage condition input');
    const organizationId = await this.resolveTenantId(context, null);
    const warehouse = await this.requireWarehouse(context, value.warehouseId, organizationId);
    if (value.warehouseInventoryId) {
      await this._requireInventoryInWarehouse(value.warehouseInventoryId, warehouse);
    }
    const recordedAt = value.recordedAt ? new Date(value.recordedAt) : new Date();
    const record = await this.store.createCondition({
      id: randomUUID(),
      warehouse_id: warehouse.id,
      warehouse_inventory_id: value.warehouseInventoryId ?? null,
      recorded_at: recordedAt,
      temperature_c: value.temperatureC,
      humidity_percent: value.humidityPercent,
      condition_status: value.conditionStatus,
      notes: value.notes ?? null,
      recorded_by_user_id: request?.auth?.user?.id || null,
    });
    await this.audit(
      {
        action: EVENTS.CONDITION_RECORDED,
        entityType: 'StorageConditionRecord',
        entityId: record.id,
        organizationId: warehouse.organization_id,
        after: dto.toConditionDto(record),
      },
      request,
    );
    return dto.toConditionDto(record);
  }

  // ---------------------------------------------------------------------------
  // Inventory reconciliation
  // ---------------------------------------------------------------------------

  async listReconciliations({ context, query = {} }) {
    const value = validate(dto.reconciliationQuerySchema, query, 'reconciliation query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const warehouseIds = new Set(
      await this._scopeWarehouseIds(context, organizationId, value.warehouseId),
    );
    const records = await this.store.listReconciliations({
      ...(value.warehouseId ? { warehouse_id: value.warehouseId } : {}),
      ...(value.productId ? { product_id: value.productId } : {}),
      ...(value.inventoryId ? { warehouse_inventory_id: value.inventoryId } : {}),
      ...(value.status ? { status: value.status } : {}),
    });
    return records
      .filter((item) => warehouseIds.has(item.warehouse_id))
      .map(dto.toReconciliationDto);
  }

  async createReconciliation({ context, input, request }) {
    const value = validate(dto.reconciliationCreateSchema, input, 'reconciliation input');
    const organizationId = await this.resolveTenantId(context, null);
    const warehouse = await this.requireWarehouse(context, value.warehouseId, organizationId);
    const inventory = await this._requireInventoryInWarehouse(
      value.warehouseInventoryId,
      warehouse,
      'Warehouse inventory',
    );
    if (value.productId && value.productId !== inventory.product_id) {
      throw new ValidationError({
        message: 'productId does not match the selected inventory record.',
      });
    }
    const replayRows = await this.store.listReconciliations({
      reference_key: value.referenceKey,
    });
    if (replayRows.length) {
      this.assertSameTenant(
        replayRows[0],
        warehouse.organization_id ?? organizationId,
        'Reconciliation',
      );
      if (replayRows[0].warehouse_inventory_id !== inventory.id) {
        throw new ConflictError({ message: 'Reconciliation reference key is already in use.' });
      }
      return dto.toReconciliationDto(replayRows[0]);
    }

    const systemQuantity = Number(inventory.quantity_on_hand);
    const record = await this.store.createReconciliation({
      id: randomUUID(),
      warehouse_id: warehouse.id,
      warehouse_inventory_id: inventory.id,
      product_id: inventory.product_id,
      counted_quantity: value.countedQuantity,
      system_quantity: systemQuantity,
      difference_quantity: roundNumber(value.countedQuantity - systemQuantity),
      status: 'PENDING',
      reference_key: value.referenceKey,
      notes: value.notes ?? null,
      counted_by_user_id: request?.auth?.user?.id || null,
      approved_by_user_id: null,
    });
    await this.audit(
      {
        action: EVENTS.RECONCILIATION_CREATED,
        entityType: 'InventoryReconciliation',
        entityId: record.id,
        organizationId: warehouse.organization_id,
        after: dto.toReconciliationDto(record),
      },
      request,
    );
    return dto.toReconciliationDto(record);
  }

  async approveReconciliation({ context, reconciliationId, input, request }) {
    validate(dto.reconciliationApproveSchema, input || {}, 'reconciliation approval input');
    const record = requireRecord(
      await this.store.findReconciliation(reconciliationId),
      'Inventory reconciliation',
    );
    const warehouse = await this.requireWarehouse(context, record.warehouse_id);
    if (record.status === 'APPROVED') return dto.toReconciliationDto(record);
    if (record.status === 'REJECTED') {
      throw new ConflictError({ message: 'Rejected reconciliation cannot be approved.' });
    }

    const difference = Number(record.difference_quantity);
    let movement = null;
    if (difference !== 0) {
      const movementReference = `reconciliation:${record.reference_key}:adjustment`;
      movement = await this._findMovementByReference(movementReference);
      if (!movement) {
        movement = await this.store.applyStockMovement({
          inventoryId: record.warehouse_inventory_id,
          movementType: 'ADJUSTMENT',
          mode: difference > 0 ? 'ON_HAND_DELTA' : 'DEDUCT_AVAILABLE',
          delta: Math.abs(difference),
          unitCode:
            (await this.store.findInventoryById(record.warehouse_inventory_id))?.unit_code || null,
          reason: input?.notes || record.notes || 'Inventory reconciliation adjustment',
          referenceKey: movementReference,
          actorUserId: request?.auth?.user?.id || null,
        });
      } else {
        this.assertSameTenant(
          movement,
          warehouse.organization_id ?? null,
          'Reconciliation adjustment',
        );
      }
    }

    const updated = await this.store.updateReconciliation(reconciliationId, {
      status: 'APPROVED',
      approved_by_user_id: request?.auth?.user?.id || null,
    });
    await this.audit(
      {
        action: EVENTS.RECONCILIATION_APPROVED,
        entityType: 'InventoryReconciliation',
        entityId: reconciliationId,
        organizationId: warehouse.organization_id,
        before: dto.toReconciliationDto(record),
        after: {
          ...dto.toReconciliationDto(updated),
          ...(movement ? { movement: dto.toMovementDto(movement) } : {}),
        },
      },
      request,
    );
    return dto.toReconciliationDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Warehouse staff
  // ---------------------------------------------------------------------------

  async listStaff({ context, query = {} }) {
    const value = validate(dto.staffQuerySchema, query, 'warehouse staff query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const warehouseIds = new Set(
      await this._scopeWarehouseIds(context, organizationId, value.warehouseId),
    );
    const records = await this.store.listStaff({
      ...(value.warehouseId ? { warehouse_id: value.warehouseId } : {}),
      ...(value.userId ? { user_id: value.userId } : {}),
      ...(value.roleCode ? { role_code: value.roleCode } : {}),
      ...(value.isActive !== undefined ? { is_active: value.isActive } : {}),
    });
    return records.filter((item) => warehouseIds.has(item.warehouse_id)).map(dto.toStaffDto);
  }

  async createStaff({ context, input, request }) {
    const value = validate(dto.staffCreateSchema, input, 'warehouse staff input');
    const organizationId = await this.resolveTenantId(context, null);
    const warehouse = await this.requireWarehouse(context, value.warehouseId, organizationId);
    requireRecord(await this.identityStore.findUserById(value.userId), 'Warehouse staff user');
    const record = await this.store.createStaff({
      id: randomUUID(),
      warehouse_id: warehouse.id,
      user_id: value.userId,
      role_code: value.roleCode,
      assigned_by_user_id: request?.auth?.user?.id || null,
      is_active: value.isActive,
    });
    await this.audit(
      {
        action: EVENTS.STAFF_ASSIGNED,
        entityType: 'WarehouseStaffAssignment',
        entityId: record.id,
        organizationId: warehouse.organization_id,
        after: dto.toStaffDto(record),
      },
      request,
    );
    return dto.toStaffDto(record);
  }

  async updateStaff({ context, staffId, input, request }) {
    const value = validate(dto.staffUpdateSchema, input, 'warehouse staff update');
    const current = requireRecord(
      await this.store.findStaff(staffId),
      'Warehouse staff assignment',
    );
    await this.requireWarehouse(context, current.warehouse_id);
    const patch = {
      ...(value.roleCode !== undefined ? { role_code: value.roleCode } : {}),
      ...(value.isActive !== undefined ? { is_active: value.isActive } : {}),
    };
    const updated = await this.store.updateStaff(staffId, patch);
    const warehouse = await this.store.findWarehouse(updated.warehouse_id);
    await this.audit(
      {
        action: EVENTS.STAFF_UPDATED,
        entityType: 'WarehouseStaffAssignment',
        entityId: staffId,
        organizationId: warehouse?.organization_id ?? null,
        before: dto.toStaffDto(current),
        after: dto.toStaffDto(updated),
      },
      request,
    );
    return dto.toStaffDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Reporting
  // ---------------------------------------------------------------------------

  async getReport({ context, query = {} }) {
    const value = validate(dto.reportQuerySchema, query, 'warehouse report query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const warehouseIds = await this._scopeWarehouseIds(context, organizationId, value.warehouseId);
    const warehouses = [];
    const totals = {
      warehouses: 0,
      products: 0,
      onHand: 0,
      reserved: 0,
      available: 0,
      lowStockAlerts: 0,
      movements: {},
    };

    for (const warehouseId of warehouseIds) {
      const warehouse = await this.store.findWarehouse(warehouseId);
      if (!warehouse) continue;
      const [inventories, movements, alerts] = await Promise.all([
        this.store.listInventories({ warehouse_id: warehouse.id }),
        this.store.listMovements({ warehouse_id: warehouse.id }),
        this.store.listAlerts({ warehouse_id: warehouse.id }),
      ]);
      const warehouseMovements = {};
      const movementsByProduct = new Map();
      for (const movement of movements) {
        warehouseMovements[movement.movement_type] =
          (warehouseMovements[movement.movement_type] || 0) + 1;
        totals.movements[movement.movement_type] =
          (totals.movements[movement.movement_type] || 0) + 1;
        const key = movement.product_id;
        if (!movementsByProduct.has(key)) movementsByProduct.set(key, {});
        const perProduct = movementsByProduct.get(key);
        perProduct[movement.movement_type] = (perProduct[movement.movement_type] || 0) + 1;
      }
      const alertsByProduct = new Map();
      let warehouseAlerts = 0;
      for (const alert of alerts) {
        if (alert.status !== 'OPEN') continue;
        warehouseAlerts += 1;
        alertsByProduct.set(alert.product_id, (alertsByProduct.get(alert.product_id) || 0) + 1);
      }
      const productsByInventory = new Map();
      for (const inventory of inventories) {
        let row = productsByInventory.get(inventory.product_id);
        if (!row) {
          const product = await this.catalog.findProduct(inventory.product_id);
          row = {
            productId: inventory.product_id,
            sku: product?.sku ?? null,
            name: product?.name ?? null,
            onHand: 0,
            reserved: 0,
            available: 0,
            batchCount: 0,
          };
          productsByInventory.set(inventory.product_id, row);
        }
        row.onHand += Number(inventory.quantity_on_hand);
        row.reserved += Number(inventory.quantity_reserved);
        row.available += Number(inventory.available_quantity);
        row.batchCount += 1;
      }
      const products = [...productsByInventory.values()].map((row) => {
        const counts = movementsByProduct.get(row.productId) || {};
        return {
          ...row,
          onHand: roundNumber(row.onHand),
          reserved: roundNumber(row.reserved),
          available: roundNumber(row.available),
          lowStockAlerts: alertsByProduct.get(row.productId) || 0,
          movementCounts: counts,
          movements: counts,
        };
      });
      const onHand = products.reduce((total, row) => total + row.onHand, 0);
      const reserved = products.reduce((total, row) => total + row.reserved, 0);
      const available = products.reduce((total, row) => total + row.available, 0);
      totals.onHand += onHand;
      totals.reserved += reserved;
      totals.available += available;
      totals.lowStockAlerts += warehouseAlerts;
      totals.products += products.length;
      totals.warehouses += 1;
      warehouses.push({
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        warehouseName: warehouse.name,
        organizationId: warehouse.organization_id ?? null,
        status: warehouse.status,
        products,
        totals: {
          onHand: roundNumber(onHand),
          reserved: roundNumber(reserved),
          available: roundNumber(available),
          lowStockAlerts: warehouseAlerts,
        },
        movementCounts: warehouseMovements,
        movements: warehouseMovements,
      });
    }

    return dto.toReportDto({ warehouses, totals });
  }

  async buildReport(args) {
    return this.getReport(args);
  }
}

module.exports = { WarehouseService, WarehouseServiceToken, EVENTS };

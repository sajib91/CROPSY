const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { assertRepository } = require('../../../shared/domain/repository');
const { WAREHOUSE_STORE_METHODS, WarehouseStoreToken } = require('../domain/warehouse.repository');

function translateError(error) {
  if (error instanceof ConflictError || error instanceof NotFoundError) return error;
  if (error?.code === 'P2002') {
    return new ConflictError({ message: 'A warehouse reference is already in use.' });
  }
  if (error?.code === 'P2025') {
    return new NotFoundError({ message: 'Warehouse record was not found.' });
  }
  if (error?.code === 'P2010' || error?.code === 'P2014') {
    const databaseCode = String(error?.meta?.code || '');
    if (['23514', '23503', '22004', '22023'].includes(databaseCode)) {
      return new ConflictError({
        message: error?.meta?.message || error?.message || 'Stock operation was rejected.',
      });
    }
  }
  return error;
}

function normalize(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toNumber === 'function') return Number(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = normalize(item);
    return result;
  }
  return value;
}

function whereFrom(filters = {}) {
  const where = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (key === 'since') {
      where.created_at = { ...(where.created_at || {}), gte: value };
    } else if (key === 'until') {
      where.created_at = { ...(where.created_at || {}), lte: value };
    } else {
      where[key] = Array.isArray(value) ? { in: value } : value;
    }
  }
  return where;
}

/**
 * Prisma implementation of the warehouse store. Every stock mutation is routed
 * through a PostgreSQL function that locks the inventory row with FOR UPDATE
 * and writes its movement history in the same transaction.
 */
class WarehousePrismaStore {
  constructor({ prisma }) {
    if (!prisma) throw new TypeError('WarehousePrismaStore requires a Prisma client.');
    this.prisma = prisma;
    assertRepository(this, WAREHOUSE_STORE_METHODS, WarehouseStoreToken);
  }

  async _find(delegate, id) {
    const record = await delegate.findUnique({ where: { id } });
    return record ? normalize(record) : null;
  }

  async _list(delegate, filters) {
    const records = await delegate.findMany({
      where: whereFrom(filters),
      orderBy: { created_at: 'desc' },
    });
    return records.map(normalize);
  }

  async _update(delegate, id, patch) {
    try {
      return normalize(await delegate.update({ where: { id }, data: patch }));
    } catch (error) {
      throw translateError(error);
    }
  }

  async _applyMovementRow(client, input) {
    try {
      const rows = await client.$queryRaw`
        SELECT * FROM cropsy_apply_warehouse_stock_movement(
          ${input.inventoryId}::uuid,
          ${input.movementType}::text,
          ${input.mode}::text,
          ${input.delta}::numeric(14,3),
          ${input.unitCode || null}::varchar(32),
          ${input.reason || null}::text,
          ${input.referenceKey || null}::varchar(128),
          ${input.actorUserId || null}::uuid
        ) AS movement
      `;
      return normalize(rows[0] || null);
    } catch (error) {
      throw translateError(error);
    }
  }

  listWarehouses(filters) {
    return this._list(this.prisma.warehouse, filters);
  }

  findWarehouse(id) {
    return this._find(this.prisma.warehouse, id);
  }

  async createWarehouse(input) {
    try {
      return normalize(await this.prisma.warehouse.create({ data: input }));
    } catch (error) {
      throw translateError(error);
    }
  }

  updateWarehouse(id, patch) {
    return this._update(this.prisma.warehouse, id, patch);
  }

  async findInventory({ warehouseId, productId, batchCode }) {
    const record = await this.prisma.warehouseInventory.findFirst({
      where: { warehouse_id: warehouseId, product_id: productId, batch_code: batchCode },
    });
    return record ? normalize(record) : null;
  }

  findInventoryById(id) {
    return this._find(this.prisma.warehouseInventory, id);
  }

  listInventories(filters) {
    return this._list(this.prisma.warehouseInventory, filters);
  }

  async createInventory(input) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const inventory = normalize(
          await tx.warehouseInventory.create({
            data: {
              id: input.id,
              warehouse_id: input.warehouse_id,
              product_id: input.product_id,
              batch_code: input.batch_code,
              quantity_on_hand: 0,
              quantity_reserved: 0,
              available_quantity: 0,
              low_stock_threshold: input.low_stock_threshold || 0,
              unit_code: input.unit_code,
            },
          }),
        );
        await this._applyMovementRow(tx, {
          inventoryId: inventory.id,
          movementType: 'REGISTER',
          mode: 'ON_HAND_DELTA',
          delta: Number(input.quantity_on_hand),
          unitCode: input.unit_code,
          reason: input.reason || null,
          referenceKey: input.reference_key || `register:${inventory.id}:movement`,
          actorUserId: input.actor_user_id || null,
        });
        return normalize(await tx.warehouseInventory.findUnique({ where: { id: inventory.id } }));
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  updateInventory(id, patch) {
    return this._update(this.prisma.warehouseInventory, id, patch);
  }

  async applyStockMovement(input) {
    try {
      return await this.prisma.$transaction((tx) => this._applyMovementRow(tx, input));
    } catch (error) {
      throw translateError(error);
    }
  }

  listMovements(filters) {
    return this._list(this.prisma.inventoryMovement, filters);
  }

  async reserveStock(input) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const movement = await this._applyMovementRow(tx, {
          inventoryId: input.warehouse_inventory_id,
          movementType: 'RESERVE',
          mode: 'RESERVE',
          delta: Number(input.quantity),
          unitCode: input.unit_code,
          reason: input.reason || null,
          referenceKey: input.movement_reference_key,
          actorUserId: input.actor_user_id || null,
        });
        const reservation = normalize(
          await tx.inventoryReservation.create({
            data: {
              id: input.id,
              organization_id: input.organization_id || null,
              warehouse_id: input.warehouse_id,
              warehouse_inventory_id: input.warehouse_inventory_id,
              product_id: input.product_id,
              quantity: input.quantity,
              settled_quantity: 0,
              status: 'ACTIVE',
              reference_key: input.reference_key,
              actor_user_id: input.actor_user_id || null,
              expires_at: input.expires_at || null,
            },
          }),
        );
        return { reservation, movement };
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  findReservation(id) {
    return this._find(this.prisma.inventoryReservation, id);
  }

  async findReservationByReference(referenceKey) {
    const record = await this.prisma.inventoryReservation.findUnique({
      where: { reference_key: referenceKey },
    });
    return record ? normalize(record) : null;
  }

  listReservations(filters) {
    return this._list(this.prisma.inventoryReservation, filters);
  }

  async settleReservation({
    reservationId,
    action,
    quantity,
    reason,
    movementReferenceKey,
    actorUserId,
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`
          SELECT * FROM cropsy_settle_inventory_reservation(
            ${reservationId}::uuid,
            ${action}::text,
            ${quantity}::numeric(14,3),
            ${reason || null}::text,
            ${movementReferenceKey}::varchar(128),
            ${actorUserId || null}::uuid
          ) AS settlement
        `;
        const result = normalize(rows[0] || null);
        const reservation = await this._find(tx.inventoryReservation, reservationId);
        return { reservation, settlement: result };
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  findOpenAlert(inventoryId) {
    return this._findAlert(inventoryId);
  }

  async _findAlert(inventoryId) {
    const record = await this.prisma.inventoryAlert.findFirst({
      where: { warehouse_inventory_id: inventoryId, status: 'OPEN' },
      orderBy: { created_at: 'desc' },
    });
    return record ? normalize(record) : null;
  }

  findAlertById(id) {
    return this._find(this.prisma.inventoryAlert, id);
  }

  listAlerts(filters) {
    return this._list(this.prisma.inventoryAlert, filters);
  }

  updateAlert(id, patch) {
    return this._update(this.prisma.inventoryAlert, id, patch);
  }
}

module.exports = { WarehousePrismaStore };

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
}

module.exports = { WarehouseService, WarehouseServiceToken, EVENTS };

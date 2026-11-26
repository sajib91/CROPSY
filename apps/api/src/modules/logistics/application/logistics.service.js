const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, LogisticsEntity, SHIPMENT_STATUSES } = require('../domain/logistics.entity');
const {
  LogisticsRepositoryToken,
  LogisticsStoreToken,
  LOGISTICS_STORE_METHODS,
} = require('../domain/logistics.repository');
const dto = require('./logistics.dto');

const LogisticsServiceToken = Symbol.for('cropsy.service.logistics');

const EVENTS = Object.freeze({
  INITIALIZED: 'logistics.initialized',
  PROVIDER_REGISTERED: 'logistics.provider.registered',
  SERVICE_CREATED: 'logistics.delivery_service.created',
  SHIPMENT_CREATED: 'logistics.shipment.created',
  PICKUP_SCHEDULED: 'logistics.pickup.scheduled',
  PROVIDER_ASSIGNED: 'logistics.delivery.assigned',
  STATUS_UPDATED: 'logistics.shipment.status_updated',
  PROOF_RECORDED: 'logistics.delivery.proof_recorded',
  DELIVERY_FAILED: 'logistics.delivery.failed',
  DELIVERY_CONFIRMED: 'logistics.delivery.confirmed',
});

const ORDER_PORT_METHODS = Object.freeze(['findOrder']);
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

function parseDate(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError({ message: `${label} must be a valid timestamp.` });
  }
  return date;
}

function roles(context) {
  return (context?.roles || []).map((role) => (typeof role === 'string' ? role : role.code));
}

function isPrivileged(context) {
  return Boolean(
    context?.isSuperAdmin ||
    roles(context).includes('ORGANIZATION_ADMIN') ||
    roles(context).includes('CROPSY_SUPER_ADMIN'),
  );
}

class LogisticsService {
  constructor({
    repository,
    store,
    orderAccess,
    identityStore,
    authorization,
    eventBus,
    logger,
    metadata,
    config,
  }) {
    assertRepository(repository, ['get', 'save'], LogisticsRepositoryToken);
    assertRepository(store, LOGISTICS_STORE_METHODS, LogisticsStoreToken);
    assertRepository(orderAccess, ORDER_PORT_METHODS, 'OrderAccessPort');
    assertRepository(identityStore, IDENTITY_METHODS, 'IdentityStore');
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('LogisticsService requires an event bus.');
    }
    if (!metadata) throw new TypeError('LogisticsService requires module metadata.');
    for (const [name, dependency] of Object.entries({ authorization, config })) {
      if (!dependency) throw new TypeError(`LogisticsService requires ${name}.`);
    }
    this.repository = repository;
    this.store = store;
    this.orderAccess = orderAccess;
    this.identityStore = identityStore;
    this.authorization = authorization;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.config = config;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new LogisticsEntity();
      await this.repository.save(entity);
      this.publish(EVENTS.INITIALIZED, { name: entity.name }, entity.id);
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    return validate(
      dto.moduleInfoSchema,
      dto.toModuleInfoDto(entity, this.metadata),
      'logistics info',
    );
  }

  publish(type, payload, aggregateId) {
    this.eventBus.publish({
      type,
      moduleId: MODULE_ID,
      aggregateId: aggregateId || payload?.shipmentId || payload?.providerId || 'anonymous',
      payload,
    });
  }

  async audit(
    {
      action,
      entityType,
      entityId,
      organizationId = null,
      before,
      after = {},
      shipmentId,
      deliveryId,
    },
    request,
  ) {
    const meta = requestMeta(request);
    const entry = {
      id: randomUUID(),
      shipment_id: shipmentId || null,
      delivery_id: deliveryId || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      actor_user_id: request?.auth?.user?.id || null,
      organization_id: organizationId ?? null,
      before: before === undefined ? null : before,
      after: { ...after, ...(meta.requestId ? { requestId: meta.requestId } : {}) },
      ip_address: meta.ipAddress,
      user_agent: meta.userAgent,
      request_id: meta.requestId,
    };
    await this.store.createAudit(entry);
    await this.identityStore.appendAudit({
      action,
      entityType,
      entityId: entityId || null,
      actorUserId: entry.actor_user_id,
      organizationId,
      before,
      after: entry.after,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    this.publish(action, entry.after, shipmentId || entityId);
    return dto.toAuditDto(entry);
  }

  async resolveTenantId(context, explicit) {
    if (explicit) {
      if (!context.isSuperAdmin) await this.authorization.assertOrganization(context, explicit);
      return explicit;
    }
    if (context.isSuperAdmin) return null;
    if (!context.organizationId) return null;
    await this.authorization.assertOrganization(context, context.organizationId);
    return context.organizationId;
  }

  assertSameTenant(record, organizationId, label) {
    if (record.organization_id === null || record.organization_id === undefined) return record;
    if (organizationId && record.organization_id !== organizationId) {
      throw new ForbiddenError({
        message: `${label} belongs to another organization.`,
        details: { code: 'cross_organization_access_denied' },
      });
    }
    return record;
  }

  async requireProvider(context, providerId, organizationId = undefined) {
    const provider = requireRecord(await this.store.findProvider(providerId), 'Logistics provider');
    const tenant = organizationId ?? (await this.resolveTenantId(context, null));
    this.assertSameTenant(provider, tenant, 'Logistics provider');
    if (provider.organization_id && !isPrivileged(context)) {
      await this.authorization.assertOrganization(context, provider.organization_id);
    }
    return provider;
  }

  async requireService(context, serviceId, organizationId = undefined) {
    const service = requireRecord(await this.store.findService(serviceId), 'Delivery service');
    const provider = await this.requireProvider(context, service.provider_id, organizationId);
    return { service, provider };
  }

  async requireOrder(context, orderId) {
    const order = await this.orderAccess.findOrder(orderId);
    return requireRecord(order, 'Order');
  }

  async assertOrderAccess(context, order, organizationId = undefined) {
    if (context.isSuperAdmin) return;
    const userId = context.user?.id;
    if (
      (order.buyerUserId && order.buyerUserId === userId) ||
      (order.sellerUserId && order.sellerUserId === userId)
    ) {
      return;
    }
    if (organizationId || context.organizationId) {
      const tenant = organizationId || context.organizationId;
      if (order.organizationId === tenant) {
        await this.authorization.assertOrganization(context, tenant);
        return;
      }
    }
    throw new ForbiddenError({ message: 'Access to this order is denied.' });
  }

  async requireShipment(context, shipmentId, organizationId = undefined) {
    const shipment = requireRecord(await this.store.findShipment(shipmentId), 'Shipment');
    const tenant = organizationId ?? (await this.resolveTenantId(context, null));
    this.assertSameTenant(shipment, tenant, 'Shipment');
    await this.assertOrderAccess(
      context,
      await this.requireOrder(context, shipment.order_id),
      tenant,
    );
    if (shipment.provider_id && !context.isSuperAdmin) {
      const provider = await this.store.findProvider(shipment.provider_id);
      if (
        provider?.owner_user_id === context.user?.id ||
        provider?.organization_id === context.organizationId
      ) {
        return shipment;
      }
    }
    if (shipment.assigned_user_id === context.user?.id) return shipment;
    return shipment;
  }

  async requireDelivery(context, deliveryId) {
    const delivery = requireRecord(await this.store.findDelivery(deliveryId), 'Delivery');
    await this.requireShipment(context, delivery.shipment_id);
    return delivery;
  }

  async assertDeliveryManager(context, shipment) {
    if (context.isSuperAdmin || isPrivileged(context)) return;
    if (shipment.assigned_user_id === context.user?.id) return;
    if (shipment.provider_id) {
      const provider = await this.store.findProvider(shipment.provider_id);
      if (provider?.owner_user_id === context.user?.id) return;
      if (
        provider?.organization_id &&
        provider.organization_id === context.organizationId &&
        context.permissions?.includes('shipments.manage')
      ) {
        return;
      }
    }
    throw new ForbiddenError({ message: 'Only the assigned provider may update this shipment.' });
  }

  async assertProviderManager(context, provider) {
    if (context.isSuperAdmin || isPrivileged(context)) return;
    if (provider.owner_user_id === context.user?.id) return;
    if (provider.organization_id) {
      await this.authorization.assertOrganization(context, provider.organization_id);
      return;
    }
    throw new ForbiddenError({ message: 'Only the provider owner may manage these services.' });
  }

  // ---------------------------------------------------------------------------
  // Providers and services
  // ---------------------------------------------------------------------------

  async listProviders({ context, query = {} }) {
    const value = validate(dto.providerQuerySchema, query, 'provider query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const providers = await this.store.listProviders({
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(value.isActive === undefined ? {} : { is_active: value.isActive }),
    });
    const rows = providers.map((provider) => dto.toProviderDto(provider));
    if (!value.search) return rows;
    const search = value.search.toLowerCase();
    return rows.filter(
      (provider) =>
        provider.name.toLowerCase().includes(search) ||
        provider.code.toLowerCase().includes(search),
    );
  }

  async getProvider({ context, providerId }) {
    return dto.toProviderDto(await this.requireProvider(context, providerId));
  }

  async createProvider({ context, input, request }) {
    const value = validate(dto.providerCreateSchema, input, 'provider input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    if (value.ownerUserId) {
      requireRecord(await this.identityStore.findUserById(value.ownerUserId), 'Provider owner');
    }
    const record = await this.store.createProvider({
      id: randomUUID(),
      organization_id: organizationId,
      owner_user_id: value.ownerUserId || context.user.id,
      code: value.code,
      name: value.name,
      contact_email: value.contactEmail ?? null,
      phone: value.phone ?? null,
      longitude: value.longitude ?? null,
      latitude: value.latitude ?? null,
      service_radius_km: value.serviceRadiusKm ?? null,
      service_types: value.serviceTypes,
      is_active: value.isActive,
    });
    await this.audit(
      {
        action: EVENTS.PROVIDER_REGISTERED,
        entityType: 'LogisticsProvider',
        entityId: record.id,
        organizationId,
        after: dto.toProviderDto(record),
      },
      request,
    );
    return dto.toProviderDto(record);
  }

  async updateProvider({ context, providerId, input, request }) {
    const value = validate(dto.providerUpdateSchema, input, 'provider update');
    const current = await this.requireProvider(context, providerId);
    await this.assertProviderManager(context, current);
    const patch = {
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.contactEmail !== undefined ? { contact_email: value.contactEmail } : {}),
      ...(value.phone !== undefined ? { phone: value.phone } : {}),
      ...(value.longitude !== undefined ? { longitude: value.longitude } : {}),
      ...(value.latitude !== undefined ? { latitude: value.latitude } : {}),
      ...(value.serviceRadiusKm !== undefined ? { service_radius_km: value.serviceRadiusKm } : {}),
      ...(value.serviceTypes !== undefined ? { service_types: value.serviceTypes } : {}),
      ...(value.isActive !== undefined ? { is_active: value.isActive } : {}),
    };
    const updated = await this.store.updateProvider(providerId, patch);
    await this.audit(
      {
        action: EVENTS.PROVIDER_REGISTERED,
        entityType: 'LogisticsProvider',
        entityId: providerId,
        organizationId: current.organization_id,
        before: dto.toProviderDto(current),
        after: dto.toProviderDto(updated),
      },
      request,
    );
    return dto.toProviderDto(updated);
  }

  async findNearbyProviders({ context, query = {} }) {
    const value = validate(dto.nearbyProvidersQuerySchema, query, 'nearby provider query');
    await this.resolveTenantId(context, null);
    const matches = await this.store.nearbyProviders({
      longitude: value.longitude,
      latitude: value.latitude,
      radiusKm: value.radiusKm,
      serviceType: value.serviceType,
    });
    return matches
      .filter(
        ({ provider }) =>
          !provider.organization_id ||
          provider.organization_id === context.organizationId ||
          context.isSuperAdmin,
      )
      .map(({ provider, distanceKm }) => dto.toProviderDto(provider, { distanceKm }));
  }

  async listServices({ context, query = {} }) {
    const value = validate(dto.serviceQuerySchema, query, 'delivery service query');
    const organizationId = await this.resolveTenantId(context, null);
    const services = await this.store.listServices({
      ...(value.providerId ? { provider_id: value.providerId } : {}),
      ...(value.serviceType ? { service_type: value.serviceType } : {}),
      ...(value.isActive === undefined ? {} : { is_active: value.isActive }),
    });
    const rows = [];
    for (const service of services) {
      try {
        const provider = await this.requireProvider(context, service.provider_id, organizationId);
        await this.assertProviderManager(context, provider);
        rows.push(dto.toServiceDto(service));
      } catch (error) {
        if (error instanceof ForbiddenError) continue;
        throw error;
      }
    }
    return rows;
  }

  async createService({ context, input, request }) {
    const value = validate(dto.serviceCreateSchema, input, 'delivery service input');
    const organizationId = await this.resolveTenantId(context, null);
    const provider = await this.requireProvider(context, value.providerId, organizationId);
    await this.assertProviderManager(context, provider);
    const record = await this.store.createService({
      id: randomUUID(),
      provider_id: provider.id,
      code: value.code,
      name: value.name,
      service_type: value.serviceType,
      estimated_hours: value.estimatedHours ?? null,
      is_active: value.isActive,
    });
    await this.audit(
      {
        action: EVENTS.SERVICE_CREATED,
        entityType: 'DeliveryService',
        entityId: record.id,
        organizationId: provider.organization_id,
        after: dto.toServiceDto(record),
      },
      request,
    );
    return dto.toServiceDto(record);
  }

  async updateService({ context, serviceId, input, request }) {
    const value = validate(dto.serviceUpdateSchema, input, 'delivery service update');
    const service = requireRecord(await this.store.findService(serviceId), 'Delivery service');
    const provider = await this.requireProvider(context, service.provider_id);
    await this.assertProviderManager(context, provider);
    const patch = {
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.serviceType !== undefined ? { service_type: value.serviceType } : {}),
      ...(value.estimatedHours !== undefined ? { estimated_hours: value.estimatedHours } : {}),
      ...(value.isActive !== undefined ? { is_active: value.isActive } : {}),
    };
    const updated = await this.store.updateService(serviceId, patch);
    await this.audit(
      {
        action: EVENTS.SERVICE_CREATED,
        entityType: 'DeliveryService',
        entityId: serviceId,
        organizationId: provider.organization_id,
        before: dto.toServiceDto(service),
        after: dto.toServiceDto(updated),
      },
      request,
    );
    return dto.toServiceDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Shipments and route planning
  // ---------------------------------------------------------------------------

  async listShipments({ context, query = {} }) {
    const value = validate(dto.shipmentQuerySchema, query, 'shipment query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const shipments = await this.store.listShipments({
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(value.orderId ? { order_id: value.orderId } : {}),
      ...(value.providerId ? { provider_id: value.providerId } : {}),
      ...(value.status ? { status: value.status } : {}),
      ...(value.referenceKey ? { reference_key: value.referenceKey } : {}),
    });
    const rows = [];
    for (const shipment of shipments) {
      try {
        await this.requireShipment(context, shipment.id, organizationId);
        rows.push(dto.toShipmentDto(shipment));
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) continue;
        throw error;
      }
    }
    return rows;
  }

  async getShipment({ context, shipmentId }) {
    return dto.toShipmentDto(await this.requireShipment(context, shipmentId));
  }

  async createShipment({ context, input, request }) {
    const value = validate(dto.shipmentCreateSchema, input, 'shipment input');
    const organizationId = await this.resolveTenantId(context, null);
    const order = await this.requireOrder(context, value.orderId);
    await this.assertOrderAccess(context, order, organizationId);
    let provider = null;
    if (value.providerId)
      provider = await this.requireProvider(context, value.providerId, organizationId);
    let service = null;
    if (value.serviceId) {
      const resolved = await this.requireService(context, value.serviceId, organizationId);
      if (provider && resolved.provider.id !== provider.id) {
        throw new ValidationError({ message: 'Delivery service does not belong to the provider.' });
      }
      service = resolved.service;
      provider = resolved.provider;
    }
    const record = await this.store.createShipment({
      id: randomUUID(),
      organization_id: organizationId || order.organizationId || null,
      order_id: order.id,
      provider_id: provider?.id || null,
      delivery_service_id: service?.id || null,
      assigned_user_id: null,
      reference_key: value.referenceKey,
      tracking_number: `TRK-${randomUUID().slice(0, 12).toUpperCase()}`,
      status: 'PENDING',
      pickup_address_id: value.pickupAddressId || null,
      destination_address_id: value.destinationAddressId || null,
      pickup_longitude: value.pickupLongitude ?? null,
      pickup_latitude: value.pickupLatitude ?? null,
      destination_longitude: value.destinationLongitude ?? null,
      destination_latitude: value.destinationLatitude ?? null,
      planned_distance_km: null,
      notes: value.notes ?? null,
      shipped_at: null,
      delivered_at: null,
    });
    if (
      value.pickupLongitude !== undefined &&
      value.pickupLongitude !== null &&
      value.destinationLongitude !== undefined &&
      value.destinationLongitude !== null
    ) {
      await this.writeRoute(record, 'SUPPLIED_COORDINATES');
    }
    await this.appendEvent({
      shipmentId: record.id,
      status: 'PENDING',
      source: 'SYSTEM',
      occurredAt: new Date(),
      note: 'Shipment created from supplied order and route facts.',
      actorUserId: context.user.id,
    });
    await this.audit(
      {
        action: EVENTS.SHIPMENT_CREATED,
        entityType: 'Shipment',
        entityId: record.id,
        organizationId: record.organization_id,
        after: dto.toShipmentDto(record),
        shipmentId: record.id,
      },
      request,
    );
    return this.getShipment({ context, shipmentId: record.id });
  }

  async writeRoute(shipment, source) {
    const distanceKm = await this.store.distanceKm(
      Number(shipment.pickup_longitude),
      Number(shipment.pickup_latitude),
      Number(shipment.destination_longitude),
      Number(shipment.destination_latitude),
    );
    const route = await this.store.upsertRoute({
      id: randomUUID(),
      shipment_id: shipment.id,
      origin_longitude: Number(shipment.pickup_longitude),
      origin_latitude: Number(shipment.pickup_latitude),
      destination_longitude: Number(shipment.destination_longitude),
      destination_latitude: Number(shipment.destination_latitude),
      distance_km: distanceKm,
      path_geojson: null,
      source,
    });
    const updated = await this.store.updateShipment(shipment.id, {
      planned_distance_km: distanceKm,
    });
    return { route, shipment: updated };
  }

  async appendEvent({
    shipmentId,
    status,
    source,
    occurredAt,
    longitude,
    latitude,
    note,
    actorUserId,
  }) {
    return this.store.createEvent({
      id: randomUUID(),
      shipment_id: shipmentId,
      status,
      source,
      occurred_at: occurredAt || new Date(),
      longitude: longitude ?? null,
      latitude: latitude ?? null,
      note: note ?? null,
      actor_user_id: actorUserId ?? null,
    });
  }

  async schedulePickup({ context, shipmentId, input, request }) {
    const value = validate(dto.pickupScheduleSchema, input, 'pickup schedule input');
    const shipment = await this.requireShipment(context, shipmentId);
    await this.assertDeliveryManager(context, shipment);
    const existing = await this.store.findDeliveryByAttempt(shipment.id, 1);
    if (existing && existing.status !== 'SCHEDULED') {
      throw new ConflictError({ message: 'Pickup attempt can no longer be rescheduled.' });
    }
    const scheduledAt = parseDate(value.scheduledAt, 'scheduledAt');
    const delivery = existing
      ? await this.store.updateDelivery(existing.id, {
          scheduled_at: scheduledAt,
          longitude: value.longitude ?? null,
          latitude: value.latitude ?? null,
          note: value.notes ?? null,
        })
      : await this.store.createDelivery({
          id: randomUUID(),
          shipment_id: shipment.id,
          attempt_number: 1,
          phase: 'PICKUP',
          status: 'SCHEDULED',
          scheduled_at: scheduledAt,
          attempted_at: null,
          delivered_at: null,
          recipient_name: null,
          recipient_phone: null,
          proof_url: null,
          proof_hash: null,
          reason_code: null,
          next_attempt_at: null,
          note: value.notes ?? null,
          longitude: value.longitude ?? null,
          latitude: value.latitude ?? null,
          confirmed_at: null,
          confirmed_by_user_id: null,
        });
    await this.appendEvent({
      shipmentId: shipment.id,
      status: 'PICKUP_SCHEDULED',
      source: 'SYSTEM',
      occurredAt: scheduledAt,
      longitude: value.longitude,
      latitude: value.latitude,
      note: value.notes,
      actorUserId: context.user.id,
    });
    await this.audit(
      {
        action: EVENTS.PICKUP_SCHEDULED,
        entityType: 'Delivery',
        entityId: delivery.id,
        organizationId: shipment.organization_id,
        before: existing ? dto.toDeliveryDto(existing) : undefined,
        after: dto.toDeliveryDto(delivery),
        shipmentId: shipment.id,
        deliveryId: delivery.id,
      },
      request,
    );
    return dto.toDeliveryDto(delivery);
  }

  async assignDelivery({ context, shipmentId, input, request }) {
    const value = validate(dto.assignmentSchema, input, 'delivery assignment input');
    const current = await this.requireShipment(context, shipmentId);
    await this.assertDeliveryManager(context, current);
    const provider = await this.requireProvider(context, value.providerId);
    await this.assertProviderManager(context, provider);
    let service = null;
    if (value.serviceId) {
      const resolved = await this.requireService(context, value.serviceId);
      if (resolved.provider.id !== provider.id) {
        throw new ValidationError({ message: 'Delivery service does not belong to the provider.' });
      }
      service = resolved.service;
    }
    if (value.assigneeUserId) {
      requireRecord(
        await this.identityStore.findUserById(value.assigneeUserId),
        'Delivery assignee',
      );
    }
    const updated = await this.store.updateShipment(shipmentId, {
      provider_id: provider.id,
      delivery_service_id: service?.id || null,
      assigned_user_id: value.assigneeUserId || null,
    });
    await this.appendEvent({
      shipmentId,
      status: 'PROVIDER_ASSIGNED',
      source: 'SYSTEM',
      occurredAt: new Date(),
      note: value.note ?? null,
      actorUserId: context.user.id,
    });
    await this.audit(
      {
        action: EVENTS.PROVIDER_ASSIGNED,
        entityType: 'Shipment',
        entityId: shipmentId,
        organizationId: current.organization_id,
        before: dto.toShipmentDto(current),
        after: dto.toShipmentDto(updated),
        shipmentId,
      },
      request,
    );
    return dto.toShipmentDto(updated);
  }

  async updateStatus({ context, shipmentId, input, request }) {
    const value = validate(dto.statusUpdateSchema, input, 'shipment status input');
    const current = await this.requireShipment(context, shipmentId);
    await this.assertDeliveryManager(context, current);
    if (['DELIVERED', 'CANCELLED', 'RETURNED'].includes(current.status)) {
      throw new ConflictError({ message: 'A completed shipment cannot change status.' });
    }
    if (!SHIPMENT_STATUSES.includes(value.status)) {
      throw new ValidationError({ message: 'Unsupported shipment status.' });
    }
    const now = new Date();
    const patch = { status: value.status };
    if (
      ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(value.status) &&
      !current.shipped_at
    ) {
      patch.shipped_at = now;
    }
    if (value.status === 'DELIVERED') patch.delivered_at = now;
    const updated = await this.store.updateShipment(shipmentId, patch);
    // Coordinates from status updates are written to the event record exactly
    // as supplied by the caller. No live GPS feed is simulated.
    await this.appendEvent({
      shipmentId,
      status: value.status,
      source: 'PROVIDER',
      occurredAt: now,
      longitude: value.longitude,
      latitude: value.latitude,
      note: value.note,
      actorUserId: context.user.id,
    });
    await this.audit(
      {
        action: EVENTS.STATUS_UPDATED,
        entityType: 'Shipment',
        entityId: shipmentId,
        organizationId: current.organization_id,
        before: dto.toShipmentDto(current),
        after: dto.toShipmentDto(updated),
        shipmentId,
      },
      request,
    );
    if (value.status === 'DELIVERED') {
      this.publish(EVENTS.DELIVERY_CONFIRMED, {
        shipmentId,
        referenceKey: current.reference_key,
        orderId: current.order_id,
        occurredAt: now,
      });
    }
    return dto.toShipmentDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Delivery proof, failures, and confirmation
  // ---------------------------------------------------------------------------

  async recordProof({ context, deliveryId, input, request }) {
    const value = validate(dto.deliveryProofSchema, input, 'delivery proof input');
    const current = await this.requireDelivery(context, deliveryId);
    await this.assertDeliveryManager(
      context,
      await this.requireShipment(context, current.shipment_id),
    );
    if (current.status === 'DELIVERED' && current.proof_url) {
      throw new ConflictError({ message: 'Delivery proof has already been recorded.' });
    }
    const capturedAt = value.capturedAt ? parseDate(value.capturedAt, 'capturedAt') : new Date();
    const updated = await this.store.updateDelivery(deliveryId, {
      status: 'DELIVERED',
      delivered_at: capturedAt,
      proof_url: value.proofUrl,
      proof_hash: value.proofHash ?? null,
      recipient_name: value.recipientName ?? null,
      recipient_phone: value.recipientPhone ?? null,
    });
    await this.store.updateShipment(current.shipment_id, {
      status: 'DELIVERED',
      delivered_at: capturedAt,
    });
    await this.appendEvent({
      shipmentId: current.shipment_id,
      status: 'PROOF_RECORDED',
      source: 'PROVIDER',
      occurredAt: capturedAt,
      note: 'Delivery proof supplied by the provider.',
      actorUserId: context.user.id,
    });
    await this.audit(
      {
        action: EVENTS.PROOF_RECORDED,
        entityType: 'Delivery',
        entityId: deliveryId,
        organizationId: null,
        before: dto.toDeliveryDto(current),
        after: dto.toDeliveryDto(updated),
        shipmentId: current.shipment_id,
        deliveryId,
      },
      request,
    );
    const shipment = await this.store.findShipment(current.shipment_id);
    this.publish(EVENTS.DELIVERY_CONFIRMED, {
      shipmentId: shipment.id,
      referenceKey: shipment.reference_key,
      orderId: shipment.order_id,
      occurredAt: capturedAt,
    });
    return dto.toDeliveryDto(updated);
  }

  async recordFailure({ context, deliveryId, input, request }) {
    const value = validate(dto.deliveryFailureSchema, input, 'delivery failure input');
    const current = await this.requireDelivery(context, deliveryId);
    await this.assertDeliveryManager(
      context,
      await this.requireShipment(context, current.shipment_id),
    );
    if (current.status === 'DELIVERED') {
      throw new ConflictError({ message: 'A delivered attempt cannot be marked failed.' });
    }
    const updated = await this.store.updateDelivery(deliveryId, {
      status: 'FAILED',
      attempted_at: new Date(),
      reason_code: value.reasonCode,
      note: value.note ?? null,
      next_attempt_at: value.retryAt ? parseDate(value.retryAt, 'retryAt') : null,
    });
    await this.store.updateShipment(current.shipment_id, { status: 'FAILED' });
    if (value.retryAt) {
      const nextAttempt = current.attempt_number + 1;
      const existing = await this.store.findDeliveryByAttempt(current.shipment_id, nextAttempt);
      if (!existing) {
        await this.store.createDelivery({
          id: randomUUID(),
          shipment_id: current.shipment_id,
          attempt_number: nextAttempt,
          phase: 'DELIVERY',
          status: 'SCHEDULED',
          scheduled_at: parseDate(value.retryAt, 'retryAt'),
          attempted_at: null,
          delivered_at: null,
          recipient_name: null,
          recipient_phone: null,
          proof_url: null,
          proof_hash: null,
          reason_code: null,
          next_attempt_at: null,
          note: value.note ?? null,
          longitude: null,
          latitude: null,
          confirmed_at: null,
          confirmed_by_user_id: null,
        });
      }
    }
    await this.appendEvent({
      shipmentId: current.shipment_id,
      status: 'DELIVERY_FAILED',
      source: 'PROVIDER',
      occurredAt: new Date(),
      note: `${value.reasonCode}${value.note ? `: ${value.note}` : ''}`,
      actorUserId: context.user.id,
    });
    await this.audit(
      {
        action: EVENTS.DELIVERY_FAILED,
        entityType: 'Delivery',
        entityId: deliveryId,
        organizationId: null,
        before: dto.toDeliveryDto(current),
        after: dto.toDeliveryDto(updated),
        shipmentId: current.shipment_id,
        deliveryId,
      },
      request,
    );
    return dto.toDeliveryDto(updated);
  }

  async confirmDelivery({ context, deliveryId, input, request }) {
    validate(dto.confirmationSchema, input || {}, 'buyer confirmation input');
    const delivery = await this.requireDelivery(context, deliveryId);
    const shipment = await this.requireShipment(context, delivery.shipment_id);
    const order = await this.requireOrder(context, shipment.order_id);
    if (order.buyerUserId !== context.user.id && !context.isSuperAdmin) {
      throw new ForbiddenError({ message: 'Only the buyer may confirm delivery.' });
    }
    if (delivery.status !== 'DELIVERED' || !delivery.proof_url) {
      throw new ConflictError({ message: 'Delivery proof is required before confirmation.' });
    }
    if (delivery.confirmed_at) return dto.toDeliveryDto(delivery);
    const updated = await this.store.updateDelivery(deliveryId, {
      confirmed_at: new Date(),
      confirmed_by_user_id: context.user.id,
      note: input?.note ?? delivery.note ?? null,
    });
    await this.appendEvent({
      shipmentId: shipment.id,
      status: 'BUYER_CONFIRMED',
      source: 'BUYER',
      occurredAt: new Date(),
      note: input?.note ?? null,
      actorUserId: context.user.id,
    });
    await this.audit(
      {
        action: EVENTS.DELIVERY_CONFIRMED,
        entityType: 'Delivery',
        entityId: deliveryId,
        organizationId: shipment.organization_id,
        before: dto.toDeliveryDto(delivery),
        after: dto.toDeliveryDto(updated),
        shipmentId: shipment.id,
        deliveryId,
      },
      request,
    );
    this.publish(EVENTS.DELIVERY_CONFIRMED, {
      shipmentId: shipment.id,
      referenceKey: shipment.reference_key,
      orderId: shipment.order_id,
      occurredAt: new Date(),
      source: 'BUYER',
    });
    return dto.toDeliveryDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Tracking, history, and dashboards
  // ---------------------------------------------------------------------------

  async listDeliveries({ context, query = {} }) {
    const value = validate(dto.deliveryQuerySchema, query, 'delivery query');
    const deliveries = await this.store.listDeliveries({
      ...(value.shipmentId ? { shipment_id: value.shipmentId } : {}),
      ...(value.status ? { status: value.status } : {}),
      ...(value.phase ? { phase: value.phase } : {}),
    });
    const rows = [];
    for (const delivery of deliveries) {
      try {
        await this.requireDelivery(context, delivery.id);
        rows.push(dto.toDeliveryDto(delivery));
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) continue;
        throw error;
      }
    }
    return rows;
  }

  async getDelivery({ context, deliveryId }) {
    return dto.toDeliveryDto(await this.requireDelivery(context, deliveryId));
  }

  async getTracking({ context, shipmentId, query = {} }) {
    const value = validate(dto.timelineQuerySchema, query, 'tracking query');
    const shipment = await this.requireShipment(context, shipmentId);
    const [route, events, deliveries] = await Promise.all([
      this.store.findRouteByShipment(shipmentId),
      this.store.listEvents({
        shipment_id: shipmentId,
        ...(value.since ? { since: new Date(value.since) } : {}),
        ...(value.until ? { until: new Date(value.until) } : {}),
      }),
      this.store.listDeliveries({ shipment_id: shipmentId }),
    ]);
    return {
      shipment: dto.toShipmentDto(shipment),
      route: dto.toRouteDto(route),
      events: events.map(dto.toEventDto),
      deliveries: deliveries.map(dto.toDeliveryDto),
      liveLocation: null,
      locationPolicy:
        'Only coordinates explicitly supplied by authorized users are recorded; no live GPS feed is simulated.',
    };
  }

  async getHistory({ context, shipmentId, query = {} }) {
    const value = validate(dto.timelineQuerySchema, query, 'history query');
    await this.requireShipment(context, shipmentId);
    const [events, audits, deliveries] = await Promise.all([
      this.store.listEvents({
        shipment_id: shipmentId,
        ...(value.since ? { since: new Date(value.since) } : {}),
        ...(value.until ? { until: new Date(value.until) } : {}),
      }),
      this.store.listAudits({
        shipment_id: shipmentId,
        ...(value.since ? { since: new Date(value.since) } : {}),
        ...(value.until ? { until: new Date(value.until) } : {}),
      }),
      this.store.listDeliveries({ shipment_id: shipmentId }),
    ]);
    return {
      events: events.map(dto.toEventDto),
      audits: audits.map(dto.toAuditDto),
      deliveries: deliveries.map(dto.toDeliveryDto),
    };
  }

  async listAudits({ context, query = {} }) {
    const value = validate(dto.timelineQuerySchema, query, 'audit query');
    const audits = await this.store.listAudits({
      ...(value.since ? { since: new Date(value.since) } : {}),
      ...(value.until ? { until: new Date(value.until) } : {}),
    });
    const rows = [];
    for (const audit of audits) {
      if (!audit.shipment_id) {
        if (!context.isSuperAdmin) continue;
        rows.push(dto.toAuditDto(audit));
        continue;
      }
      try {
        await this.requireShipment(context, audit.shipment_id);
        rows.push(dto.toAuditDto(audit));
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) continue;
        throw error;
      }
    }
    return rows;
  }

  async dashboard({ context, kind, query = {} }) {
    const value = validate(dto.dashboardQuerySchema, query, 'dashboard query');
    await this.resolveTenantId(context, value.organizationId ?? null);
    const shipments = (await this.dashboardContext(context)).filter(
      (shipment) => !value.organizationId || shipment.organization_id === value.organizationId,
    );
    const visible = [];
    for (const shipment of shipments) {
      try {
        await this.requireShipment(context, shipment.id, value.organizationId ?? undefined);
        visible.push(shipment);
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) continue;
        throw error;
      }
    }
    const userId = context.user.id;
    const scoped = visible.filter((shipment) => {
      if (kind === 'buyer') {
        return shipment.buyer_user_id === userId;
      }
      if (kind === 'seller') {
        return shipment.seller_user_id === userId;
      }
      return shipment.provider_owner_user_id === userId || shipment.assigned_user_id === userId;
    });
    const counts = Object.fromEntries(SHIPMENT_STATUSES.map((status) => [status, 0]));
    for (const shipment of scoped) counts[shipment.status] = (counts[shipment.status] || 0) + 1;
    return {
      kind,
      total: scoped.length,
      counts,
      shipments: scoped.slice(0, value.limit).map((shipment) => dto.toShipmentDto(shipment)),
    };
  }

  async dashboardContext(_context) {
    const shipments = await this.store.listShipments({});
    const orderIds = [...new Set(shipments.map((shipment) => shipment.order_id))];
    const orders = new Map();
    for (const orderId of orderIds) {
      try {
        const order = await this.orderAccess.findOrder(orderId);
        if (order) orders.set(orderId, order);
      } catch {
        // Orders that are no longer readable are omitted from dashboards.
      }
    }
    const providers = new Map(
      (await this.store.listProviders({})).map((provider) => [provider.id, provider]),
    );
    return shipments.map((shipment) => ({
      ...shipment,
      buyer_user_id: orders.get(shipment.order_id)?.buyerUserId || null,
      seller_user_id: orders.get(shipment.order_id)?.sellerUserId || null,
      provider_owner_user_id: providers.get(shipment.provider_id)?.owner_user_id || null,
    }));
  }
}

module.exports = { LogisticsService, LogisticsServiceToken, EVENTS };

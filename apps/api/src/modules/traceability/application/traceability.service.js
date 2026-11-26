const { randomBytes, randomUUID } = require('node:crypto');

const qrcode = require('qrcode-terminal');

const { assertRepository } = require('../../../shared/domain/repository');
const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, TraceabilityEntity } = require('../domain/traceability.entity');
const {
  TRACEABILITY_STORE_METHODS,
  TraceabilityRepositoryToken,
  TraceabilityStoreToken,
} = require('../domain/traceability.repository');
const dto = require('./traceability.dto');
const { moduleInfoSchema, toModuleInfoDto } = dto;

const TraceabilityServiceToken = Symbol.for('cropsy.service.traceability');

const EVENTS = Object.freeze({
  INITIALIZED: 'traceability.initialized',
  BATCH_CREATED: 'traceability.batch.created',
  BATCH_UPDATED: 'traceability.batch.updated',
  EVENT_CREATED: 'traceability.event.created',
  BATCH_VERIFIED: 'traceability.batch.verified',
  BATCH_REJECTED: 'traceability.batch.rejected',
  QR_GENERATED: 'traceability.batch.qr_generated',
});

const QUALITY_PORT_METHODS = Object.freeze(['getInspectionFacts']);
const WAREHOUSE_PORT_METHODS = Object.freeze(['getInventoryFacts']);
const LOGISTICS_PORT_METHODS = Object.freeze(['getShipmentFacts']);
const BATCH_PORT_METHODS = Object.freeze(['getPublicFacts', 'getBatchFacts']);
const IDENTITY_METHODS = Object.freeze(['appendAudit']);

const WAREHOUSE_EVENT_TYPES = new Set(['WAREHOUSE_ENTRY', 'STORAGE_HISTORY', 'STORED']);
const LOGISTICS_EVENT_TYPES = new Set(['SHIPPED', 'DELIVERED', 'BUYER_CONFIRMED']);

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

async function callPort(port, method, ...args) {
  try {
    if (!port || typeof port[method] !== 'function') return null;
    const result = await port[method](...args);
    return result === undefined ? null : result;
  } catch {
    // Cross-module enrichment is best-effort and never fails a request.
    return null;
  }
}

function renderQr(url) {
  return new Promise((resolve) => {
    try {
      qrcode.generate(url, { small: true }, (code) =>
        resolve(typeof code === 'string' ? code : ''),
      );
    } catch {
      resolve('');
    }
  });
}

class TraceabilityService {
  constructor({
    repository,
    store,
    qualityAccess,
    warehouseAccess,
    logisticsAccess,
    traceabilityBatch,
    identityStore,
    authorization,
    eventBus,
    logger,
    metadata,
    config,
  }) {
    assertRepository(repository, ['get', 'save'], TraceabilityRepositoryToken);
    assertRepository(store, TRACEABILITY_STORE_METHODS, TraceabilityStoreToken);
    assertRepository(qualityAccess, QUALITY_PORT_METHODS, 'QualityAccessPort');
    assertRepository(warehouseAccess, WAREHOUSE_PORT_METHODS, 'WarehouseOperationPort');
    assertRepository(logisticsAccess, LOGISTICS_PORT_METHODS, 'LogisticsAccessPort');
    assertRepository(traceabilityBatch, BATCH_PORT_METHODS, 'TraceabilityBatchPort');
    assertRepository(identityStore, IDENTITY_METHODS, 'IdentityStore');
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('TraceabilityService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('TraceabilityService requires module metadata.');
    }
    for (const [name, dependency] of Object.entries({ authorization, config })) {
      if (!dependency) throw new TypeError(`TraceabilityService requires ${name}.`);
    }
    this.repository = repository;
    this.store = store;
    this.qualityAccess = qualityAccess;
    this.warehouseAccess = warehouseAccess;
    this.logisticsAccess = logisticsAccess;
    this.traceabilityBatch = traceabilityBatch;
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
      entity = new TraceabilityEntity();
      await this.repository.save(entity);
      this.eventBus.publish({
        type: `${MODULE_ID}.initialized`,
        moduleId: MODULE_ID,
        aggregateId: entity.id,
        payload: { name: entity.name },
      });
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    const dto = toModuleInfoDto(entity, this.metadata);
    return validate(moduleInfoSchema, dto, 'traceability module info');
  }

  publish(type, payload, aggregateId) {
    this.eventBus.publish({
      type,
      moduleId: MODULE_ID,
      aggregateId: aggregateId || payload?.batchId || 'anonymous',
      payload,
    });
  }

  async audit(
    { action, entityType, entityId, organizationId = null, before, after = {}, batchId },
    request,
  ) {
    const meta = requestMeta(request);
    const entry = {
      id: randomUUID(),
      batch_id: batchId || (entityType === 'TraceabilityBatch' ? entityId : null) || null,
      action,
      actor_user_id: request?.auth?.user?.id || null,
      organization_id: organizationId ?? null,
      before: before === undefined ? null : before,
      after: { ...after, ...(meta.requestId ? { requestId: meta.requestId } : {}) },
      created_at: new Date(),
    };
    await this.store.createAudit(entry);
    await this.identityStore.appendAudit({
      action,
      entityType,
      entityId: entityId || null,
      actorUserId: entry.actor_user_id,
      organizationId: entry.organization_id,
      before: entry.before,
      after: entry.after,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    this.publish(action, entry.after, entry.batch_id || entityId);
    return dto.toAuditDto(entry);
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

  async assertSameTenant(record, organizationId, context, label) {
    if (!record.organization_id) return record;
    const expected = context?.organizationId || organizationId;
    if (expected && record.organization_id !== expected) {
      throw new ForbiddenError({
        message: `${label} belongs to another organization.`,
        details: { code: 'cross_organization_access_denied' },
      });
    }
    if (!context?.isSuperAdmin) {
      await this.authorization.assertOrganization(context, record.organization_id);
    }
    return record;
  }

  async requireBatch(context, batchId, organizationId = null) {
    const batch = requireRecord(await this.store.findBatch(batchId), 'Traceability batch');
    const tenant = organizationId || (await this.resolveTenantId(context, null));
    await this.assertSameTenant(batch, tenant, context, 'Traceability batch');
    return batch;
  }

  // ---------------------------------------------------------------------------
  // Batches
  // ---------------------------------------------------------------------------

  async listBatches({ context, query = {} }) {
    const value = validate(dto.batchQuerySchema, query || {}, 'batch query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const batches = await this.store.listBatches({
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(value.productId ? { product_id: value.productId } : {}),
      ...(value.batchCode ? { batch_code: value.batchCode } : {}),
      ...(value.status ? { status: value.status } : {}),
      ...(value.verificationStatus ? { verification_status: value.verificationStatus } : {}),
    });
    const rows = [];
    for (const batch of batches) {
      try {
        await this.assertSameTenant(batch, organizationId, context, 'Traceability batch');
        rows.push(dto.toBatchDto(batch));
      } catch (error) {
        if (error instanceof ForbiddenError) continue;
        throw error;
      }
    }
    if (!value.search) return rows;
    const search = value.search.toLowerCase();
    return rows.filter((batch) => batch.batchCode.toLowerCase().includes(search));
  }

  async getBatch({ context, batchId }) {
    const batch = await this.requireBatch(context, batchId);
    return dto.toBatchDto(batch);
  }

  async createBatch({ context, input, request }) {
    const value = validate(dto.batchCreateSchema, input, 'batch input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const batch = await this.store.createBatch({
      id: randomUUID(),
      organization_id: organizationId,
      product_id: value.productId,
      batch_code: value.batchCode,
      harvest_id: value.harvestId ?? null,
      cultivation_id: value.cultivationId ?? null,
      farm_id: value.farmId ?? null,
      farmer_user_id: value.farmerUserId ?? null,
      seller_user_id: value.sellerUserId ?? null,
      buyer_user_id: value.buyerUserId ?? null,
      shipment_id: value.shipmentId ?? null,
      inspection_id: value.inspectionId ?? null,
      warehouse_entry_at: value.warehouseEntryAt ? new Date(value.warehouseEntryAt) : null,
      status: 'ACTIVE',
      verification_status: 'UNVERIFIED',
      public_disclosure: value.publicDisclosure,
      verification_token: randomBytes(16).toString('hex'),
      qr_payload: null,
      created_by_user_id: context.user?.id || null,
      verified_by_user_id: null,
      verified_at: null,
      notes: value.notes ?? null,
    });
    await this.audit(
      {
        action: EVENTS.BATCH_CREATED,
        entityType: 'TraceabilityBatch',
        entityId: batch.id,
        organizationId: batch.organization_id,
        after: dto.toBatchDto(batch),
        batchId: batch.id,
      },
      request,
    );
    return dto.toBatchDto(batch);
  }

  async updateBatch({ context, batchId, input, request }) {
    const value = validate(dto.batchUpdateSchema, input || {}, 'batch update');
    const current = await this.requireBatch(context, batchId);
    const patch = {
      ...(value.status !== undefined ? { status: value.status } : {}),
      ...(value.publicDisclosure !== undefined
        ? { public_disclosure: value.publicDisclosure }
        : {}),
      ...(value.sellerUserId !== undefined ? { seller_user_id: value.sellerUserId } : {}),
      ...(value.buyerUserId !== undefined ? { buyer_user_id: value.buyerUserId } : {}),
      ...(value.shipmentId !== undefined ? { shipment_id: value.shipmentId } : {}),
      ...(value.warehouseEntryAt !== undefined
        ? {
            warehouse_entry_at: value.warehouseEntryAt ? new Date(value.warehouseEntryAt) : null,
          }
        : {}),
      ...(value.notes !== undefined ? { notes: value.notes } : {}),
    };
    const updated = await this.store.updateBatch(batchId, patch);
    await this.audit(
      {
        action: EVENTS.BATCH_UPDATED,
        entityType: 'TraceabilityBatch',
        entityId: batchId,
        organizationId: current.organization_id,
        before: dto.toBatchDto(current),
        after: dto.toBatchDto(updated),
        batchId,
      },
      request,
    );
    return dto.toBatchDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Timeline and enrichment
  // ---------------------------------------------------------------------------

  async buildEnrichment(batch, event) {
    const enrichment = {};
    const inspectionId =
      event?.source_record_id || event?.metadata?.inspectionId || batch.inspection_id;
    if ((!event || event.event_type === 'INSPECTED') && inspectionId) {
      const facts = await callPort(this.qualityAccess, 'getInspectionFacts', inspectionId);
      if (facts) enrichment.qualityFacts = facts;
    }

    const warehouseId =
      event?.warehouse_id ||
      event?.metadata?.warehouseId ||
      (event?.source_module === 'warehouse' ? event?.source_record_id : null);
    if ((!event || WAREHOUSE_EVENT_TYPES.has(event.event_type)) && warehouseId) {
      const facts = await callPort(
        this.warehouseAccess,
        'getInventoryFacts',
        warehouseId,
        batch.product_id,
        batch.batch_code,
      );
      if (facts) enrichment.warehouseFacts = facts;
    }

    const shipmentId = event?.source_record_id || event?.metadata?.shipmentId || batch.shipment_id;
    if ((!event || LOGISTICS_EVENT_TYPES.has(event.event_type)) && shipmentId) {
      const facts = await callPort(this.logisticsAccess, 'getShipmentFacts', shipmentId);
      if (facts) enrichment.logisticsFacts = facts;
    }
    return enrichment;
  }

  async listTimeline({ context, batchId, query = {} }) {
    const value = validate(dto.timelineQuerySchema, query || {}, 'timeline query');
    const batch = await this.requireBatch(context, batchId);
    const events = await this.store.listEvents({
      batch_id: batchId,
      ...(value.since ? { since: new Date(value.since) } : {}),
      ...(value.until ? { until: new Date(value.until) } : {}),
    });
    const rows = [];
    for (const event of events) {
      const enrichment = await this.buildEnrichment(batch, event);
      rows.push({ ...dto.toEventDto(event), ...enrichment });
    }
    const linkedFacts = await callPort(this.traceabilityBatch, 'getBatchFacts', batch.id);
    return { batch: dto.toBatchDto(batch), events: rows, linkedFacts };
  }

  async createEvent({ context, batchId, input, request }) {
    const value = validate(dto.eventCreateSchema, input, 'event input');
    const batch = await this.requireBatch(context, batchId);
    const metadata = { ...(value.metadata || {}) };
    const enrichment = await this.buildEnrichment(batch, {
      event_type: value.eventType,
      source_record_id: value.sourceRecordId || null,
      source_module: value.sourceModule || null,
      metadata: {
        ...metadata,
        ...(value.inspectionId ? { inspectionId: value.inspectionId } : {}),
        ...(value.shipmentId ? { shipmentId: value.shipmentId } : {}),
        ...(value.warehouseId ? { warehouseId: value.warehouseId } : {}),
      },
    });
    Object.assign(metadata, enrichment);
    const event = await this.store.createEvent({
      id: randomUUID(),
      batch_id: batchId,
      event_type: value.eventType,
      occurred_at: value.occurredAt ? new Date(value.occurredAt) : new Date(),
      title: value.title,
      description: value.description ?? null,
      location_description: value.locationDescription ?? null,
      longitude: value.longitude ?? null,
      latitude: value.latitude ?? null,
      actor_user_id: value.actorUserId ?? context.user?.id ?? null,
      source_module: value.sourceModule ?? null,
      source_record_id: value.sourceRecordId ?? null,
      public_disclosure: value.publicDisclosure,
      verification_status: value.verificationStatus,
      metadata,
    });
    await this.audit(
      {
        action: EVENTS.EVENT_CREATED,
        entityType: 'TraceabilityEvent',
        entityId: event.id,
        organizationId: batch.organization_id,
        after: dto.toEventDto(event),
        batchId,
      },
      request,
    );
    return dto.toEventDto(event);
  }

  // ---------------------------------------------------------------------------
  // Verification and QR codes
  // ---------------------------------------------------------------------------

  async verifyBatch({ context, batchId, input, request }) {
    validate(dto.verificationSchema, input || {}, 'verification input');
    const current = await this.requireBatch(context, batchId);
    const events = await this.store.listEvents({ batch_id: batchId });
    const hasPublicVerifiedEvent = events.some(
      (event) => event.public_disclosure === true && event.verification_status === 'VERIFIED',
    );
    if (!hasPublicVerifiedEvent) {
      throw new ConflictError({
        message:
          'A batch requires a VERIFIED event with public disclosure before it can be verified.',
      });
    }
    const updated = await this.store.updateBatch(batchId, {
      verification_status: 'VERIFIED',
      verified_by_user_id: context.user?.id || null,
      verified_at: new Date(),
    });
    await this.audit(
      {
        action: EVENTS.BATCH_VERIFIED,
        entityType: 'TraceabilityBatch',
        entityId: batchId,
        organizationId: current.organization_id,
        before: dto.toBatchDto(current),
        after: dto.toBatchDto(updated),
        batchId,
      },
      request,
    );
    return dto.toBatchDto(updated);
  }

  async rejectBatch({ context, batchId, input, request }) {
    const value = validate(dto.verificationSchema, input || {}, 'rejection input');
    if (!value.note) {
      throw new ValidationError({ message: 'Invalid rejection input: a note is required.' });
    }
    const current = await this.requireBatch(context, batchId);
    const updated = await this.store.updateBatch(batchId, {
      verification_status: 'REJECTED',
      verified_by_user_id: context.user?.id || null,
      verified_at: new Date(),
      notes: value.note,
    });
    await this.audit(
      {
        action: EVENTS.BATCH_REJECTED,
        entityType: 'TraceabilityBatch',
        entityId: batchId,
        organizationId: current.organization_id,
        before: dto.toBatchDto(current),
        after: dto.toBatchDto(updated),
        batchId,
      },
      request,
    );
    return dto.toBatchDto(updated);
  }

  async generateQr({ context, batchId, request }) {
    const batch = await this.requireBatch(context, batchId);
    const baseUrl =
      process.env.WEB_PUBLIC_URL || this.config?.WEB_PUBLIC_URL || 'http://localhost:3000';
    const url = `${String(baseUrl).replace(/\/$/, '')}/verify/${batch.verification_token}`;
    const qr = await renderQr(url);
    const updated = await this.store.updateBatch(batchId, { qr_payload: url });
    await this.audit(
      {
        action: EVENTS.QR_GENERATED,
        entityType: 'TraceabilityBatch',
        entityId: batchId,
        organizationId: batch.organization_id,
        before: dto.toBatchDto(batch),
        after: dto.toBatchDto(updated),
        batchId,
      },
      request,
    );
    return { token: batch.verification_token, url, qr };
  }

  async verifyPublic({ token }) {
    const value = validate(dto.verificationTokenSchema, token, 'verification token');
    const batch = await this.store.findBatchByToken(value);
    if (!batch || batch.verification_status !== 'VERIFIED' || batch.public_disclosure !== true) {
      return dto.toPublicVerificationDto(null, []);
    }
    await callPort(this.traceabilityBatch, 'getPublicFacts', value);
    const events = await this.store.listEvents({ batch_id: batch.id });
    return dto.toPublicVerificationDto(batch, events);
  }

  // ---------------------------------------------------------------------------
  // Audits
  // ---------------------------------------------------------------------------

  async listAudits({ context, query = {} }) {
    const value = validate(dto.timelineQuerySchema, query || {}, 'audit query');
    const audits = await this.store.listAudits({
      ...(value.batchId ? { batch_id: value.batchId } : {}),
      ...(value.since ? { since: new Date(value.since) } : {}),
      ...(value.until ? { until: new Date(value.until) } : {}),
    });
    const rows = [];
    for (const audit of audits) {
      if (!audit.batch_id) {
        if (context.isSuperAdmin) rows.push(dto.toAuditDto(audit));
        continue;
      }
      try {
        await this.requireBatch(context, audit.batch_id);
        rows.push(dto.toAuditDto(audit));
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) continue;
        throw error;
      }
    }
    return rows;
  }
}

module.exports = { TraceabilityService, TraceabilityServiceToken, EVENTS };

const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const { ConflictError, ForbiddenError, NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, QualityEntity } = require('../domain/quality.entity');
const {
  QUALITY_STORE_METHODS,
  QualityRepositoryToken,
  QualityStoreToken,
} = require('../domain/quality.repository');
const dto = require('./quality.dto');
const { moduleInfoSchema, toModuleInfoDto } = require('./quality.dto');

const QualityServiceToken = Symbol.for('cropsy.service.quality');

const EVENTS = Object.freeze({
  INITIALIZED: 'quality.initialized',
  INSPECTION_CREATED: 'quality.inspection.created',
  INSPECTION_UPDATED: 'quality.inspection.updated',
  INSPECTION_GRADED: 'quality.inspection.graded',
  INSPECTION_VERIFIED: 'quality.inspection.verified',
  INSPECTION_REJECTED: 'quality.inspection.rejected',
  EVIDENCE_ADDED: 'quality.evidence.added',
  IMAGE_ATTACHED: 'quality.evidence.image_attached',
});

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

function organizationOf(record) {
  if (!record) return null;
  return record.organization_id ?? record.organizationId ?? null;
}

class QualityService {
  constructor({
    repository,
    store,
    identityStore,
    authorization,
    eventBus,
    logger,
    metadata,
    config,
    referenceAccess,
  }) {
    assertRepository(repository, ['get', 'save'], QualityRepositoryToken);
    assertRepository(store, QUALITY_STORE_METHODS, QualityStoreToken);
    assertRepository(identityStore, IDENTITY_METHODS, 'IdentityStore');
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('QualityService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('QualityService requires module metadata.');
    }
    for (const [name, dependency] of Object.entries({ authorization, config })) {
      if (!dependency) throw new TypeError(`QualityService requires ${name}.`);
    }
    this.repository = repository;
    this.store = store;
    this.identityStore = identityStore;
    this.authorization = authorization;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.config = config;
    this.referenceAccess = referenceAccess || null;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new QualityEntity();
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
    return validate(moduleInfoSchema, dto, 'quality module info');
  }

  publish(type, payload, aggregateId) {
    this.eventBus.publish({
      type,
      moduleId: MODULE_ID,
      aggregateId: aggregateId || payload?.inspectionId || 'anonymous',
      payload,
    });
  }

  async audit(
    { action, entityType, entityId, inspectionId, organizationId = null, before, after = {} },
    request,
  ) {
    const meta = requestMeta(request);
    const entry = {
      id: randomUUID(),
      inspection_id: inspectionId ?? (entityType === 'QualityInspection' ? entityId : null),
      action,
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
    this.publish(action, entry.after, inspectionId || entityId);
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

  assertSameTenant(record, organizationId, label) {
    const recordOrganizationId = organizationOf(record);
    if (recordOrganizationId === null || recordOrganizationId === undefined) return record;
    if (organizationId && recordOrganizationId !== organizationId) {
      throw new ForbiddenError({
        message: `${label} belongs to another organization.`,
        details: { code: 'cross_organization_access_denied' },
      });
    }
    return record;
  }

  async assertOrganizationAccess(context, record, organizationId, label) {
    if (!record) return record;
    if (organizationId) this.assertSameTenant(record, organizationId, label);
    const recordOrganizationId = organizationOf(record);
    if (!context.isSuperAdmin && recordOrganizationId) {
      await this.authorization.assertOrganization(context, recordOrganizationId);
    }
    return record;
  }

  async requireUser(userId, label) {
    return requireRecord(await this.identityStore.findUserById(userId), label);
  }

  async requireInspection(context, inspectionId) {
    const inspection = requireRecord(
      await this.store.findInspection(inspectionId),
      'Quality inspection',
    );
    const organizationId = await this.resolveTenantId(context, null);
    await this.assertOrganizationAccess(context, inspection, organizationId, 'Quality inspection');
    return inspection;
  }

  // Cross-module references are consumed through read-only composition ports.
  // An absent port means the reference cannot be verified in this deployment;
  // a present port returning null means the referenced record does not exist.
  async requireShipmentReference(context, shipmentId, organizationId) {
    if (typeof this.referenceAccess?.findShipment !== 'function') return null;
    const shipment = await this.referenceAccess.findShipment(shipmentId);
    if (shipment === undefined) return null;
    if (!shipment) throw new NotFoundError({ message: 'Shipment was not found.' });
    return this.assertOrganizationAccess(context, shipment, organizationId, 'Shipment');
  }

  async requireInventoryReference(context, inventoryId, organizationId) {
    if (typeof this.referenceAccess?.findInventory !== 'function') return null;
    const inventory = await this.referenceAccess.findInventory(inventoryId);
    if (inventory === undefined) return null;
    if (!inventory) throw new NotFoundError({ message: 'Warehouse inventory was not found.' });
    if (typeof this.referenceAccess?.findWarehouse !== 'function') return inventory;
    const warehouse = await this.referenceAccess.findWarehouse(inventory.warehouse_id);
    if (warehouse === undefined) return inventory;
    if (!warehouse) throw new NotFoundError({ message: 'Warehouse was not found.' });
    await this.assertOrganizationAccess(context, warehouse, organizationId, 'Warehouse');
    return inventory;
  }

  async requireProductReference(context, productId, organizationId) {
    if (typeof this.referenceAccess?.findProduct !== 'function') return null;
    const product = await this.referenceAccess.findProduct(productId);
    if (product === undefined) return null;
    if (!product) throw new NotFoundError({ message: 'Product was not found.' });
    return this.assertOrganizationAccess(context, product, organizationId, 'Product');
  }

  async assertReferences(context, value, organizationId) {
    if (value.shipmentId) {
      await this.requireShipmentReference(context, value.shipmentId, organizationId);
    }
    if (value.warehouseInventoryId) {
      await this.requireInventoryReference(context, value.warehouseInventoryId, organizationId);
    }
    if (value.productId) {
      await this.requireProductReference(context, value.productId, organizationId);
    }
  }

  async listInspections({ context, query = {} }) {
    const value = validate(dto.inspectionQuerySchema, query || {}, 'inspection query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const inspections = await this.store.listInspections({
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(value.shipmentId ? { shipment_id: value.shipmentId } : {}),
      ...(value.warehouseInventoryId ? { warehouse_inventory_id: value.warehouseInventoryId } : {}),
      ...(value.productId ? { product_id: value.productId } : {}),
      ...(value.batchCode ? { batch_code: value.batchCode } : {}),
      ...(value.result ? { result: value.result } : {}),
      ...(value.gradeCode ? { grade_code: value.gradeCode } : {}),
      ...(value.verificationStatus ? { verification_status: value.verificationStatus } : {}),
    });
    return inspections.map(dto.toInspectionDto);
  }

  async getInspection({ context, inspectionId }) {
    return dto.toInspectionDto(await this.requireInspection(context, inspectionId));
  }

  async createInspection({ context, input, request }) {
    const value = validate(dto.inspectionCreateSchema, input || {}, 'inspection input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    await this.assertReferences(context, value, organizationId);
    if (value.inspectorUserId) {
      await this.requireUser(value.inspectorUserId, 'Quality inspector');
    }
    const record = await this.store.createInspection({
      id: randomUUID(),
      organization_id: organizationId,
      shipment_id: value.shipmentId ?? null,
      warehouse_inventory_id: value.warehouseInventoryId ?? null,
      product_id: value.productId ?? null,
      batch_code: value.batchCode ?? null,
      inspector_user_id: value.inspectorUserId || context.user.id,
      inspected_at: value.inspectedAt ? new Date(value.inspectedAt) : new Date(),
      result: value.result,
      grade_code: value.gradeCode ?? null,
      grade_source: value.gradeSource,
      notes: value.notes ?? null,
      verification_status: 'UNVERIFIED',
      verified_by_user_id: null,
      verified_at: null,
    });
    await this.audit(
      {
        action: EVENTS.INSPECTION_CREATED,
        entityType: 'QualityInspection',
        entityId: record.id,
        inspectionId: record.id,
        organizationId,
        after: dto.toInspectionDto(record),
      },
      request,
    );
    return dto.toInspectionDto(record);
  }

  async updateInspection({ context, inspectionId, input, request }) {
    const value = validate(dto.inspectionUpdateSchema, input || {}, 'inspection update');
    const current = await this.requireInspection(context, inspectionId);
    await this.assertReferences(context, value, current.organization_id);
    if (value.inspectorUserId) {
      await this.requireUser(value.inspectorUserId, 'Quality inspector');
    }
    const patch = {
      ...(value.shipmentId !== undefined ? { shipment_id: value.shipmentId } : {}),
      ...(value.warehouseInventoryId !== undefined
        ? { warehouse_inventory_id: value.warehouseInventoryId }
        : {}),
      ...(value.productId !== undefined ? { product_id: value.productId } : {}),
      ...(value.batchCode !== undefined ? { batch_code: value.batchCode } : {}),
      ...(value.inspectorUserId !== undefined ? { inspector_user_id: value.inspectorUserId } : {}),
      ...(value.inspectedAt !== undefined ? { inspected_at: new Date(value.inspectedAt) } : {}),
      ...(value.result !== undefined ? { result: value.result } : {}),
      ...(value.gradeCode !== undefined ? { grade_code: value.gradeCode } : {}),
      ...(value.gradeSource !== undefined ? { grade_source: value.gradeSource } : {}),
      ...(value.notes !== undefined ? { notes: value.notes } : {}),
      ...(value.result !== undefined && value.result !== current.result
        ? {
            verification_status: 'UNVERIFIED',
            verified_by_user_id: null,
            verified_at: null,
          }
        : {}),
    };
    const updated = await this.store.updateInspection(inspectionId, patch);
    await this.audit(
      {
        action: EVENTS.INSPECTION_UPDATED,
        entityType: 'QualityInspection',
        entityId: inspectionId,
        inspectionId,
        organizationId: current.organization_id,
        before: dto.toInspectionDto(current),
        after: dto.toInspectionDto(updated),
      },
      request,
    );
    return dto.toInspectionDto(updated);
  }

  async listEvidence({ context, inspectionId, query = {} }) {
    await this.requireInspection(context, inspectionId);
    const value = validate(dto.evidenceQuerySchema, query || {}, 'evidence query');
    const evidence = await this.store.listEvidence({
      inspection_id: inspectionId,
      ...(value.evidenceType ? { evidence_type: value.evidenceType } : {}),
      ...(value.publicDisclosure === undefined
        ? {}
        : { public_disclosure: value.publicDisclosure }),
    });
    return evidence.map(dto.toEvidenceDto);
  }

  async appendEvidence({
    context,
    inspectionId,
    input,
    request,
    schema,
    label,
    action,
    forcedType,
  }) {
    const inspection = await this.requireInspection(context, inspectionId);
    if (inspection.verification_status === 'REJECTED') {
      throw new ConflictError({
        message: 'Evidence cannot be attached to a rejected inspection.',
      });
    }
    const value = validate(schema, input || {}, label);
    if (value.recordedByUserId) {
      await this.requireUser(value.recordedByUserId, 'Evidence recorder');
    }
    const record = await this.store.createEvidence({
      id: randomUUID(),
      inspection_id: inspection.id,
      evidence_type: forcedType || value.evidenceType,
      uri: value.uri,
      checksum: value.checksum ?? null,
      mime_type: value.mimeType ?? null,
      description: value.description ?? null,
      captured_at: value.capturedAt ? new Date(value.capturedAt) : null,
      recorded_by_user_id: value.recordedByUserId || context.user.id,
      public_disclosure: value.publicDisclosure === true,
    });
    await this.audit(
      {
        action,
        entityType: 'InspectionEvidence',
        entityId: record.id,
        inspectionId: inspection.id,
        organizationId: inspection.organization_id,
        after: dto.toEvidenceDto(record),
      },
      request,
    );
    return dto.toEvidenceDto(record);
  }

  async createEvidence({ context, inspectionId, input, request }) {
    return this.appendEvidence({
      context,
      inspectionId,
      input,
      request,
      schema: dto.evidenceCreateSchema,
      label: 'inspection evidence input',
      action: EVENTS.EVIDENCE_ADDED,
    });
  }

  async createImage({ context, inspectionId, input, request }) {
    return this.appendEvidence({
      context,
      inspectionId,
      input,
      request,
      schema: dto.imageCreateSchema,
      label: 'inspection image input',
      action: EVENTS.IMAGE_ATTACHED,
      forcedType: 'IMAGE',
    });
  }

  async gradeInspection({ context, inspectionId, input, request }) {
    const value = validate(dto.gradeSchema, input || {}, 'inspection grade input');
    const current = await this.requireInspection(context, inspectionId);
    const updated = await this.store.updateInspection(inspectionId, {
      grade_code: value.gradeCode,
      grade_source: value.gradeSource,
    });
    await this.audit(
      {
        action: EVENTS.INSPECTION_GRADED,
        entityType: 'QualityInspection',
        entityId: inspectionId,
        inspectionId,
        organizationId: current.organization_id,
        before: dto.toInspectionDto(current),
        after: dto.toInspectionDto(updated),
      },
      request,
    );
    return dto.toInspectionDto(updated);
  }

  async verifyInspection({ context, inspectionId, input, request }) {
    const value = validate(dto.verifySchema, input || {}, 'inspection verification input');
    const current = await this.requireInspection(context, inspectionId);
    if (!['PASSED', 'CONDITIONAL'].includes(current.result)) {
      throw new ConflictError({
        message: 'Only PASSED or CONDITIONAL inspections can be verified.',
      });
    }
    if (current.verification_status !== 'UNVERIFIED') {
      throw new ConflictError({ message: 'Inspection verification has already been resolved.' });
    }
    const patch = {
      verification_status: 'VERIFIED',
      verified_by_user_id: context.user.id,
      verified_at: new Date(),
    };
    if (value.note !== undefined && value.note !== null) patch.notes = value.note;
    const updated = await this.store.updateInspection(inspectionId, patch);
    await this.audit(
      {
        action: EVENTS.INSPECTION_VERIFIED,
        entityType: 'QualityInspection',
        entityId: inspectionId,
        inspectionId,
        organizationId: current.organization_id,
        before: dto.toInspectionDto(current),
        after: dto.toInspectionDto(updated),
      },
      request,
    );
    return dto.toInspectionDto(updated);
  }

  async rejectInspection({ context, inspectionId, input, request }) {
    const value = validate(dto.rejectSchema, input || {}, 'inspection rejection input');
    const current = await this.requireInspection(context, inspectionId);
    if (current.verification_status !== 'UNVERIFIED') {
      throw new ConflictError({ message: 'Inspection verification has already been resolved.' });
    }
    const updated = await this.store.updateInspection(inspectionId, {
      verification_status: 'REJECTED',
      verified_by_user_id: context.user.id,
      verified_at: new Date(),
      notes: value.note,
    });
    await this.audit(
      {
        action: EVENTS.INSPECTION_REJECTED,
        entityType: 'QualityInspection',
        entityId: inspectionId,
        inspectionId,
        organizationId: current.organization_id,
        before: dto.toInspectionDto(current),
        after: dto.toInspectionDto(updated),
      },
      request,
    );
    return dto.toInspectionDto(updated);
  }

  async listAudits({ context, query = {} }) {
    const value = validate(dto.auditQuerySchema, query || {}, 'audit query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const audits = await this.store.listAudits({
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(value.inspectionId ? { inspection_id: value.inspectionId } : {}),
      ...(value.action ? { action: value.action } : {}),
      ...(value.since ? { since: new Date(value.since) } : {}),
      ...(value.until ? { until: new Date(value.until) } : {}),
    });
    return audits.map(dto.toAuditDto);
  }
}

module.exports = { QualityService, QualityServiceToken, EVENTS };

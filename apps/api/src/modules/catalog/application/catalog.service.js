const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const dto = require('./catalog.dto');
const { MODULE_ID, CatalogEntity } = require('../domain/catalog.entity');
const {
  CATALOG_STORE_METHODS,
  CatalogRepositoryToken,
  CatalogStoreToken,
} = require('../domain/catalog.repository');

const CatalogServiceToken = Symbol.for('cropsy.service.catalog');

const EVENTS = Object.freeze({
  INITIALIZED: 'catalog.initialized',
  CATEGORY_CREATED: 'catalog.category.created',
  CATEGORY_UPDATED: 'catalog.category.updated',
  UNIT_CREATED: 'catalog.unit.created',
  UNIT_UPDATED: 'catalog.unit.updated',
  QUALITY_GRADE_CREATED: 'catalog.quality-grade.created',
  QUALITY_GRADE_UPDATED: 'catalog.quality-grade.updated',
  ATTRIBUTE_CREATED: 'catalog.attribute.created',
  ATTRIBUTE_UPDATED: 'catalog.attribute.updated',
  PRODUCT_CREATED: 'catalog.product.created',
  PRODUCT_UPDATED: 'catalog.product.updated',
  PRODUCT_PUBLISHED: 'catalog.product.published',
  VARIETY_CREATED: 'catalog.variety.created',
  VARIETY_UPDATED: 'catalog.variety.updated',
  ATTRIBUTE_VALUES_UPDATED: 'catalog.attribute-values.updated',
  IMAGE_ADDED: 'catalog.image.added',
  IMAGE_REMOVED: 'catalog.image.removed',
});

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

function matchesSearch(record, search) {
  if (!search) return true;
  const needle = search.toLowerCase();
  return [record.name, record.name_bn, record.sku, record.code]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

class CatalogService {
  constructor({
    repository,
    store,
    eventBus,
    logger,
    metadata,
    authorization,
    identityStore,
    config,
  }) {
    assertRepository(repository, ['get', 'save'], CatalogRepositoryToken);
    assertRepository(store, CATALOG_STORE_METHODS, CatalogStoreToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('CatalogService requires an event bus.');
    }
    if (!metadata) throw new TypeError('CatalogService requires module metadata.');
    for (const [name, dependency] of Object.entries({
      store,
      authorization,
      identityStore,
      config,
    })) {
      if (!dependency) throw new TypeError(`CatalogService requires ${name}.`);
    }
    this.repository = repository;
    this.store = store;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.authorization = authorization;
    this.identityStore = identityStore;
    this.config = config;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new CatalogEntity();
      await this.repository.save(entity);
      this.publish(EVENTS.INITIALIZED, { name: entity.name }, entity.id);
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    const data = dto.toModuleInfoDto(entity, this.metadata);
    return validate(dto.moduleInfoSchema, data, 'catalog module info');
  }

  publish(type, payload, entityId) {
    this.eventBus.publish({
      type,
      moduleId: MODULE_ID,
      aggregateId: entityId || payload?.productId || payload?.categoryId || 'anonymous',
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
  }

  async assertUnique(rows, field, value, label, excludeId) {
    if (value === null || value === undefined) return;
    if (rows.some((row) => row[field] === value && row.id !== excludeId)) {
      throw new ConflictError({ message: `${label} '${value}' is already in use.` });
    }
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

  assertPlatformScope(context) {
    if (!context.isSuperAdmin) {
      throw new ForbiddenError({
        message: 'Only platform administrators may manage platform-scoped catalog records.',
        details: { code: 'platform_scope_required' },
      });
    }
  }

  async visibleRows(context, rows, query = {}) {
    if (query.organizationId && !context.isSuperAdmin) {
      await this.authorization.assertOrganization(context, query.organizationId);
    }
    const includeGlobal = query.includeGlobal !== false;
    if (context.isSuperAdmin) {
      if (!query.organizationId) return rows;
      return rows.filter(
        (row) =>
          row.organization_id === query.organizationId ||
          (includeGlobal && row.organization_id === null),
      );
    }
    return rows.filter(
      (row) =>
        row.organization_id === context.organizationId ||
        (includeGlobal && row.organization_id === null),
    );
  }

  async assertRecordAccess(context, record, label, { write = false } = {}) {
    requireRecord(record, label);
    if (context.isSuperAdmin) return record;
    if (record.organization_id === null) {
      if (write) this.assertPlatformScope(context);
      return record;
    }
    if (record.organization_id !== context.organizationId) {
      await this.authorization.assertOrganization(context, record.organization_id);
      throw new ForbiddenError({
        message: `Access to the ${label.toLowerCase()} is denied.`,
        details: { code: 'cross_organization_access_denied' },
      });
    }
    return record;
  }

  async assertReference(context, record, label, organizationId) {
    requireRecord(record, label);
    if (record.organization_id === null) return record;
    if (record.organization_id !== organizationId) {
      throw new ForbiddenError({
        message: `${label} belongs to another organization.`,
        details: { code: 'cross_organization_access_denied' },
      });
    }
    if (!context.isSuperAdmin) {
      await this.authorization.assertOrganization(context, record.organization_id);
    }
    return record;
  }

  async relatedFor(products) {
    const [categories, units, attributeDefinitions, attributeValues, images] = await Promise.all([
      this.store.listCategories(),
      this.store.listUnits(),
      this.store.listAttributes(),
      this.store.listAttributeValues(),
      this.store.listImages(),
    ]);
    const productIds = new Set(products.map((product) => product.id));
    return {
      categories,
      units,
      attributeDefinitions,
      attributeValues: attributeValues.filter(
        (value) => value.entity_type === 'PRODUCT' && productIds.has(value.entity_id),
      ),
      images: images.filter((image) => productIds.has(image.product_id)),
    };
  }

  async validateAttributeValues({ values, entityType, categoryId, organizationId }) {
    if (!Array.isArray(values)) return [];
    const definitions = await this.store.listAttributes({ is_active: true });
    const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
    const seen = new Set();
    const prepared = [];

    for (const value of values) {
      if (seen.has(value.attributeId)) {
        throw new ValidationError({
          message: 'An attribute may only be supplied once.',
          details: { field: 'values', attributeId: value.attributeId },
        });
      }
      seen.add(value.attributeId);
      const definition = definitionsById.get(value.attributeId);
      requireRecord(definition, 'Product attribute');
      if (definition.organization_id !== null && definition.organization_id !== organizationId) {
        throw new ForbiddenError({
          message: 'Product attribute belongs to another organization.',
          details: { code: 'cross_organization_access_denied' },
        });
      }
      if (definition.category_id !== null && categoryId && definition.category_id !== categoryId) {
        throw new ValidationError({
          message: 'Product attribute does not apply to the selected category.',
          details: { field: 'values', attributeId: value.attributeId },
        });
      }

      const record = {
        id: randomUUID(),
        organization_id: organizationId,
        attribute_id: definition.id,
        entity_type: entityType,
        entity_id: null,
        value_text: null,
        value_number: null,
        value_boolean: null,
        value_date: null,
        value_json: null,
      };

      switch (definition.value_type) {
        case 'TEXT':
          if (typeof value.value !== 'string') {
            throw new ValidationError({ message: 'TEXT attributes require a string value.' });
          }
          record.value_text = value.value;
          break;
        case 'NUMBER':
          if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
            throw new ValidationError({ message: 'NUMBER attributes require a numeric value.' });
          }
          record.value_number = value.value;
          break;
        case 'BOOLEAN':
          if (typeof value.value !== 'boolean') {
            throw new ValidationError({ message: 'BOOLEAN attributes require a boolean value.' });
          }
          record.value_boolean = value.value;
          break;
        case 'DATE':
          if (typeof value.value !== 'string' || !dtoToDate(value.value)) {
            throw new ValidationError({ message: 'DATE attributes require a YYYY-MM-DD value.' });
          }
          record.value_date = dtoToDate(value.value);
          break;
        case 'ENUM': {
          const allowed = definition.allowed_values || [];
          if (typeof value.value !== 'string' || !allowed.includes(value.value)) {
            throw new ValidationError({
              message: 'ENUM attribute value is not allowed.',
              details: { allowedValues: allowed },
            });
          }
          record.value_text = value.value;
          break;
        }
        default:
          throw new ValidationError({ message: 'Unsupported attribute value type.' });
      }
      prepared.push(record);
    }

    for (const definition of definitions) {
      if (
        !definition.is_required ||
        definition.organization_id !== organizationId ||
        (definition.category_id !== null && definition.category_id !== categoryId)
      ) {
        continue;
      }
      if (!seen.has(definition.id)) {
        throw new ValidationError({
          message: `Required attribute '${definition.code}' is missing.`,
          details: { field: 'values', attributeId: definition.id },
        });
      }
    }

    return prepared;
  }

  async replaceAttributeValues({ entityType, entityId, prepared }) {
    await this.store.deleteAttributeValues(entityType, entityId);
    for (const value of prepared) {
      await this.store.createAttributeValue({ ...value, entity_id: entityId });
    }
  }

  // -------------------------------------------------------------------------
  // Categories, units, and quality grades
  // -------------------------------------------------------------------------

  async listCategories({ context, query = {} }) {
    const value = validate(dto.categoryQuerySchema, query, 'category query');
    const rows = await this.visibleRows(context, await this.store.listCategories(), value);
    const filtered = rows.filter((row) => {
      if (value.parentId && row.parent_id !== value.parentId) return false;
      if (value.code && row.code !== value.code) return false;
      if (value.isActive !== undefined && row.is_active !== value.isActive) return false;
      return matchesSearch(row, value.search);
    });
    return filtered.map(dto.toCategoryDto);
  }

  async createCategory({ context, input, request }) {
    const value = validate(dto.categoryCreateSchema, input, 'category input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    await this.assertUnique(await this.store.listCategories(), 'code', value.code, 'Category code');
    if (value.parentId) {
      const parent = await this.assertReference(
        context,
        await this.store.findCategory(value.parentId),
        'Parent category',
        organizationId,
      );
      if (parent.parent_id) {
        throw new ValidationError({
          message: 'Nested categories beyond one level are not supported.',
        });
      }
    }
    const record = await this.store.createCategory({
      id: randomUUID(),
      organization_id: organizationId,
      parent_id: value.parentId || null,
      code: value.code,
      name: value.name,
      name_bn: value.nameBn ?? null,
      description: value.description ?? null,
      description_bn: value.descriptionBn ?? null,
      is_active: value.isActive,
    });
    await this.audit(
      {
        action: EVENTS.CATEGORY_CREATED,
        entityType: 'ProductCategory',
        entityId: record.id,
        organizationId,
        after: record,
      },
      request,
    );
    return dto.toCategoryDto(record);
  }

  async updateCategory({ context, categoryId, input, request }) {
    const value = validate(dto.categoryUpdateSchema, input, 'category update');
    const record = await this.assertRecordAccess(
      context,
      await this.store.findCategory(categoryId),
      'Category',
      { write: true },
    );
    if (value.parentId) {
      if (value.parentId === categoryId) {
        throw new ValidationError({ message: 'A category cannot be its own parent.' });
      }
      await this.assertReference(
        context,
        await this.store.findCategory(value.parentId),
        'Parent category',
        record.organization_id,
      );
    }
    const updated = await this.store.updateCategory(categoryId, {
      ...(value.parentId !== undefined ? { parent_id: value.parentId || null } : {}),
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.nameBn !== undefined ? { name_bn: value.nameBn } : {}),
      ...(value.description !== undefined ? { description: value.description } : {}),
      ...(value.descriptionBn !== undefined ? { description_bn: value.descriptionBn } : {}),
      ...(value.isActive !== undefined ? { is_active: value.isActive } : {}),
    });
    await this.audit(
      {
        action: EVENTS.CATEGORY_UPDATED,
        entityType: 'ProductCategory',
        entityId: updated.id,
        organizationId: updated.organization_id,
        before: record,
        after: updated,
      },
      request,
    );
    return dto.toCategoryDto(updated);
  }

  async listUnits({ context, query = {} }) {
    const value = validate(dto.unitQuerySchema, query, 'unit query');
    const rows = await this.visibleRows(context, await this.store.listUnits(), value);
    return rows
      .filter((row) => {
        if (value.isActive !== undefined && row.is_active !== value.isActive) return false;
        return matchesSearch(row, value.search);
      })
      .map(dto.toUnitDto);
  }

  async createUnit({ context, input, request }) {
    const value = validate(dto.unitCreateSchema, input, 'unit input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    await this.assertUnique(await this.store.listUnits(), 'code', value.code, 'Unit code');
    const record = await this.store.createUnit({
      id: randomUUID(),
      organization_id: organizationId,
      code: value.code,
      name: value.name,
      name_bn: value.nameBn ?? null,
      dimension: value.dimension ?? null,
      is_active: value.isActive,
    });
    await this.audit(
      {
        action: EVENTS.UNIT_CREATED,
        entityType: 'UnitOfMeasure',
        entityId: record.id,
        organizationId,
        after: record,
      },
      request,
    );
    return dto.toUnitDto(record);
  }

  async updateUnit({ context, unitId, input, request }) {
    const value = validate(dto.unitUpdateSchema, input, 'unit update');
    const record = await this.assertRecordAccess(
      context,
      await this.store.findUnit(unitId),
      'Unit',
      { write: true },
    );
    const updated = await this.store.updateUnit(unitId, {
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.nameBn !== undefined ? { name_bn: value.nameBn } : {}),
      ...(value.dimension !== undefined ? { dimension: value.dimension } : {}),
      ...(value.isActive !== undefined ? { is_active: value.isActive } : {}),
    });
    await this.audit(
      {
        action: EVENTS.UNIT_UPDATED,
        entityType: 'UnitOfMeasure',
        entityId: updated.id,
        organizationId: updated.organization_id,
        before: record,
        after: updated,
      },
      request,
    );
    return dto.toUnitDto(updated);
  }

  async listQualityGrades({ context, query = {} }) {
    const value = validate(dto.qualityGradeQuerySchema, query, 'quality grade query');
    const rows = await this.visibleRows(context, await this.store.listQualityGrades(), value);
    return rows
      .filter((row) => {
        if (value.isActive !== undefined && row.is_active !== value.isActive) return false;
        return matchesSearch(row, value.search);
      })
      .map(dto.toQualityGradeDto);
  }

  async createQualityGrade({ context, input, request }) {
    const value = validate(dto.qualityGradeCreateSchema, input, 'quality grade input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    await this.assertUnique(
      await this.store.listQualityGrades(),
      'code',
      value.code,
      'Quality grade code',
    );
    const record = await this.store.createQualityGrade({
      id: randomUUID(),
      organization_id: organizationId,
      code: value.code,
      name: value.name,
      name_bn: value.nameBn ?? null,
      description: value.description ?? null,
      min_score: value.minScore ?? null,
      is_active: value.isActive,
    });
    await this.audit(
      {
        action: EVENTS.QUALITY_GRADE_CREATED,
        entityType: 'QualityGrade',
        entityId: record.id,
        organizationId,
        after: record,
      },
      request,
    );
    return dto.toQualityGradeDto(record);
  }

  async updateQualityGrade({ context, qualityGradeId, input, request }) {
    const value = validate(dto.qualityGradeUpdateSchema, input, 'quality grade update');
    const record = await this.assertRecordAccess(
      context,
      await this.store.findQualityGrade(qualityGradeId),
      'Quality grade',
      { write: true },
    );
    const updated = await this.store.updateQualityGrade(qualityGradeId, {
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.nameBn !== undefined ? { name_bn: value.nameBn } : {}),
      ...(value.description !== undefined ? { description: value.description } : {}),
      ...(value.minScore !== undefined ? { min_score: value.minScore } : {}),
      ...(value.isActive !== undefined ? { is_active: value.isActive } : {}),
    });
    await this.audit(
      {
        action: EVENTS.QUALITY_GRADE_UPDATED,
        entityType: 'QualityGrade',
        entityId: updated.id,
        organizationId: updated.organization_id,
        before: record,
        after: updated,
      },
      request,
    );
    return dto.toQualityGradeDto(updated);
  }

  // -------------------------------------------------------------------------
  // Flexible attributes
  // -------------------------------------------------------------------------

  async listAttributes({ context, query = {} }) {
    const value = validate(dto.attributeQuerySchema, query, 'attribute query');
    const rows = await this.visibleRows(context, await this.store.listAttributes(), value);
    const filtered = rows.filter((row) => {
      if (value.categoryId && row.category_id !== value.categoryId) return false;
      if (value.valueType && row.value_type !== value.valueType) return false;
      if (value.isActive !== undefined && row.is_active !== value.isActive) return false;
      return matchesSearch(row, value.search);
    });
    return filtered.map(dto.toAttributeDto);
  }

  async createAttribute({ context, input, request }) {
    const value = validate(dto.attributeCreateSchema, input, 'attribute input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    await this.assertUnique(
      await this.store.listAttributes(),
      'code',
      value.code,
      'Attribute code',
    );
    if (value.categoryId) {
      await this.assertReference(
        context,
        await this.store.findCategory(value.categoryId),
        'Category',
        organizationId,
      );
    }
    const record = await this.store.createAttribute({
      id: randomUUID(),
      organization_id: organizationId,
      category_id: value.categoryId || null,
      code: value.code,
      name: value.name,
      name_bn: value.nameBn ?? null,
      value_type: value.valueType,
      allowed_values: value.allowedValues ?? null,
      unit_code: value.unitCode ?? null,
      group_code: value.groupCode ?? null,
      is_required: value.isRequired,
      is_active: value.isActive,
    });
    await this.audit(
      {
        action: EVENTS.ATTRIBUTE_CREATED,
        entityType: 'ProductAttribute',
        entityId: record.id,
        organizationId,
        after: record,
      },
      request,
    );
    return dto.toAttributeDto(record);
  }

  async updateAttribute({ context, attributeId, input, request }) {
    const value = validate(dto.attributeUpdateSchema, input, 'attribute update');
    const record = await this.assertRecordAccess(
      context,
      await this.store.findAttribute(attributeId),
      'Attribute',
      { write: true },
    );
    if (value.categoryId) {
      await this.assertReference(
        context,
        await this.store.findCategory(value.categoryId),
        'Category',
        record.organization_id,
      );
    }
    const updated = await this.store.updateAttribute(attributeId, {
      ...(value.categoryId !== undefined ? { category_id: value.categoryId || null } : {}),
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.nameBn !== undefined ? { name_bn: value.nameBn } : {}),
      ...(value.allowedValues !== undefined ? { allowed_values: value.allowedValues } : {}),
      ...(value.unitCode !== undefined ? { unit_code: value.unitCode } : {}),
      ...(value.groupCode !== undefined ? { group_code: value.groupCode } : {}),
      ...(value.isRequired !== undefined ? { is_required: value.isRequired } : {}),
      ...(value.isActive !== undefined ? { is_active: value.isActive } : {}),
    });
    await this.audit(
      {
        action: EVENTS.ATTRIBUTE_UPDATED,
        entityType: 'ProductAttribute',
        entityId: updated.id,
        organizationId: updated.organization_id,
        before: record,
        after: updated,
      },
      request,
    );
    return dto.toAttributeDto(updated);
  }

  // -------------------------------------------------------------------------
  // Products, varieties, and images
  // -------------------------------------------------------------------------

  async listProducts({ context, query = {} }) {
    const value = validate(dto.productQuerySchema, query, 'product query');
    let rows = await this.visibleRows(context, await this.store.listProducts(), value);
    rows = rows.filter((row) => row.deleted_at === null || row.deleted_at === undefined);

    if (value.categoryId) rows = rows.filter((row) => row.category_id === value.categoryId);
    if (value.unitCode) rows = rows.filter((row) => row.unit_code === value.unitCode);
    if (value.isAvailable !== undefined) {
      rows = rows.filter((row) => row.is_available === value.isAvailable);
    }
    if (value.categoryCode) {
      const categories = await this.store.listCategories({ code: value.categoryCode });
      const ids = new Set(categories.map((category) => category.id));
      rows = rows.filter((row) => ids.has(row.category_id));
    }

    const related = await this.relatedFor(rows);
    related.categoryById = new Map(related.categories.map((category) => [category.id, category]));
    related.unitById = new Map(related.units.map((unit) => [unit.id, unit]));
    related.attributeDefinitionById = new Map(
      related.attributeDefinitions.map((definition) => [definition.id, definition]),
    );
    if (value.search || value.attributeCode) {
      const categoriesById = new Map(related.categories.map((category) => [category.id, category]));
      const definitionsById = new Map(
        related.attributeDefinitions.map((definition) => [definition.id, definition]),
      );
      const valuesByEntity = new Map();
      for (const item of related.attributeValues) {
        const key = `${item.entity_type}:${item.entity_id}`;
        if (!valuesByEntity.has(key)) valuesByEntity.set(key, []);
        valuesByEntity.get(key).push(item);
      }

      if (value.attributeCode) {
        const attributeIds = new Set(
          related.attributeDefinitions
            .filter((definition) => definition.code === value.attributeCode)
            .map((definition) => definition.id),
        );
        rows = rows.filter((row) =>
          (valuesByEntity.get(`PRODUCT:${row.id}`) || []).some((item) => {
            if (!attributeIds.has(item.attribute_id)) return false;
            if (value.attributeValue === undefined) return true;
            return (
              String(
                dto.toAttributeValueDto(item, definitionsById.get(item.attribute_id)).value,
              ) === value.attributeValue
            );
          }),
        );
      }

      if (value.search) {
        const needle = value.search.toLowerCase();
        rows = rows.filter((row) => {
          const category = categoriesById.get(row.category_id);
          return [row.name, row.name_bn, row.sku, category?.name, category?.name_bn]
            .filter(Boolean)
            .some((item) => String(item).toLowerCase().includes(needle));
        });
      }
    }

    return rows.map((row) => dto.toProductDto(row, related));
  }

  async getProduct({ context, productId }) {
    const record = await this.assertRecordAccess(
      context,
      await this.store.findProduct(productId),
      'Product',
    );
    if (record.deleted_at) throw new NotFoundError({ message: 'Product was not found.' });
    const related = await this.relatedFor([record]);
    return dto.toProductDto(record, related);
  }

  async resolveUnit(context, unitCode, organizationId) {
    const units = await this.visibleRows(context, await this.store.listUnits({ code: unitCode }), {
      organizationId,
      includeGlobal: true,
    });
    const unit = units.find(
      (candidate) =>
        candidate.is_active &&
        (candidate.organization_id === null || candidate.organization_id === organizationId),
    );
    requireRecord(unit, 'Unit of measure');
    return unit;
  }

  async createProduct({ context, input, request }) {
    const value = validate(dto.productCreateSchema, input, 'product input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    await this.assertUnique(await this.store.listProducts(), 'sku', value.sku, 'Product SKU');
    const category = await this.assertReference(
      context,
      await this.store.findCategory(value.categoryId),
      'Category',
      organizationId,
    );
    if (!category.is_active) {
      throw new ValidationError({ message: 'The selected category is inactive.' });
    }
    const unit = await this.resolveUnit(context, value.unitCode, organizationId);
    const prepared = await this.validateAttributeValues({
      values: value.values,
      entityType: 'PRODUCT',
      categoryId: category.id,
      organizationId,
    });

    const record = await this.store.createProduct({
      id: randomUUID(),
      organization_id: organizationId,
      category_id: category.id,
      farmer_profile_id: null,
      unit_id: unit.id,
      sku: value.sku,
      name: value.name,
      name_bn: value.nameBn ?? null,
      unit_code: unit.code,
      description: value.description ?? null,
      description_bn: value.descriptionBn ?? null,
      is_available: value.isAvailable,
      deleted_at: null,
    });

    await this.replaceAttributeValues({
      entityType: 'PRODUCT',
      entityId: record.id,
      prepared,
    });
    for (const image of value.images) {
      await this.store.createImage({
        id: randomUUID(),
        product_id: record.id,
        url: image.url,
        alt_text: image.altText ?? null,
        alt_text_bn: image.altTextBn ?? null,
        sort_order: image.sortOrder,
      });
    }

    await this.audit(
      {
        action: EVENTS.PRODUCT_CREATED,
        entityType: 'Product',
        entityId: record.id,
        organizationId,
        after: record,
      },
      request,
    );
    if (record.is_available) {
      this.publish(EVENTS.PRODUCT_PUBLISHED, { productId: record.id }, record.id);
    }
    return this.getProduct({ context, productId: record.id });
  }

  async updateProduct({ context, productId, input, request }) {
    const value = validate(dto.productUpdateSchema, input, 'product update');
    const record = await this.assertRecordAccess(
      context,
      await this.store.findProduct(productId),
      'Product',
      { write: true },
    );
    if (record.deleted_at) throw new NotFoundError({ message: 'Product was not found.' });

    let categoryId = record.category_id;
    if (value.categoryId) {
      const category = await this.assertReference(
        context,
        await this.store.findCategory(value.categoryId),
        'Category',
        record.organization_id,
      );
      categoryId = category.id;
    }
    let unitCode = record.unit_code;
    let unitId = record.unit_id;
    if (value.unitCode) {
      const unit = await this.resolveUnit(context, value.unitCode, record.organization_id);
      unitCode = unit.code;
      unitId = unit.id;
    }

    const updated = await this.store.updateProduct(productId, {
      ...(categoryId !== record.category_id ? { category_id: categoryId } : {}),
      ...(unitCode !== record.unit_code ? { unit_code: unitCode, unit_id: unitId } : {}),
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.nameBn !== undefined ? { name_bn: value.nameBn } : {}),
      ...(value.description !== undefined ? { description: value.description } : {}),
      ...(value.descriptionBn !== undefined ? { description_bn: value.descriptionBn } : {}),
      ...(value.isAvailable !== undefined ? { is_available: value.isAvailable } : {}),
    });
    await this.audit(
      {
        action: EVENTS.PRODUCT_UPDATED,
        entityType: 'Product',
        entityId: updated.id,
        organizationId: updated.organization_id,
        before: record,
        after: updated,
      },
      request,
    );
    if (updated.is_available && !record.is_available) {
      this.publish(EVENTS.PRODUCT_PUBLISHED, { productId: updated.id }, updated.id);
    }
    return this.getProduct({ context, productId: updated.id });
  }

  async replaceProductAttributes({ context, productId, input, request }) {
    const value = validate(dto.attributeValuesReplaceSchema, input, 'attribute values');
    const product = await this.assertRecordAccess(
      context,
      await this.store.findProduct(productId),
      'Product',
      { write: true },
    );
    const prepared = await this.validateAttributeValues({
      values: value.values,
      entityType: 'PRODUCT',
      categoryId: product.category_id,
      organizationId: product.organization_id,
    });
    await this.replaceAttributeValues({ entityType: 'PRODUCT', entityId: productId, prepared });
    await this.audit(
      {
        action: EVENTS.ATTRIBUTE_VALUES_UPDATED,
        entityType: 'Product',
        entityId: productId,
        organizationId: product.organization_id,
        after: { values: value.values },
      },
      request,
    );
    return this.getProduct({ context, productId });
  }

  async addProductImage({ context, productId, input, request }) {
    const value = validate(dto.productImageCreateSchema, input, 'product image input');
    const product = await this.assertRecordAccess(
      context,
      await this.store.findProduct(productId),
      'Product',
      { write: true },
    );
    const images = await this.store.listImages({ product_id: productId });
    await this.assertUnique(images, 'sort_order', value.sortOrder, 'Image sort order');
    const record = await this.store.createImage({
      id: randomUUID(),
      product_id: productId,
      url: value.url,
      alt_text: value.altText ?? null,
      alt_text_bn: value.altTextBn ?? null,
      sort_order: value.sortOrder,
    });
    await this.audit(
      {
        action: EVENTS.IMAGE_ADDED,
        entityType: 'ProductImage',
        entityId: record.id,
        organizationId: product.organization_id,
        after: record,
      },
      request,
    );
    return dto.toImageDto(record);
  }

  async deleteProductImage({ context, productId, imageId, request }) {
    const product = await this.assertRecordAccess(
      context,
      await this.store.findProduct(productId),
      'Product',
      { write: true },
    );
    const image = requireRecord(await this.store.findImage(imageId), 'Product image');
    if (image.product_id !== productId) {
      throw new NotFoundError({ message: 'Product image was not found.' });
    }
    await this.store.deleteImage(imageId);
    await this.audit(
      {
        action: EVENTS.IMAGE_REMOVED,
        entityType: 'ProductImage',
        entityId: imageId,
        organizationId: product.organization_id,
        before: image,
      },
      request,
    );
    return { id: imageId, deleted: true };
  }

  async listVarieties({ context, productId, query = {} }) {
    const value = validate(dto.varietyQuerySchema, query, 'variety query');
    await this.assertRecordAccess(context, await this.store.findProduct(productId), 'Product');
    const rows = (await this.store.listVarieties({ product_id: productId })).filter((row) => {
      if (value.isActive !== undefined && row.is_active !== value.isActive) return false;
      return matchesSearch(row, value.search);
    });
    const definitions = await this.store.listAttributes();
    const attributeValues = await this.store.listAttributeValues({ entity_type: 'VARIETY' });
    return rows.map((row) =>
      dto.toVarietyDto(row, {
        attributeDefinitions: definitions,
        attributeValues: attributeValues.filter((item) => item.entity_id === row.id),
      }),
    );
  }

  async createVariety({ context, productId, input, request }) {
    const value = validate(dto.varietyCreateSchema, input, 'variety input');
    const product = await this.assertRecordAccess(
      context,
      await this.store.findProduct(productId),
      'Product',
      { write: true },
    );
    await this.assertUnique(
      await this.store.listVarieties({ product_id: productId }),
      'code',
      value.code,
      'Variety code',
    );
    const prepared = await this.validateAttributeValues({
      values: value.values,
      entityType: 'VARIETY',
      categoryId: product.category_id,
      organizationId: product.organization_id,
    });
    const record = await this.store.createVariety({
      id: randomUUID(),
      organization_id: product.organization_id,
      product_id: productId,
      code: value.code,
      name: value.name,
      name_bn: value.nameBn ?? null,
      description: value.description ?? null,
      description_bn: value.descriptionBn ?? null,
      is_active: value.isActive,
    });
    await this.replaceAttributeValues({ entityType: 'VARIETY', entityId: record.id, prepared });
    await this.audit(
      {
        action: EVENTS.VARIETY_CREATED,
        entityType: 'ProductVariety',
        entityId: record.id,
        organizationId: record.organization_id,
        after: record,
      },
      request,
    );
    const definitions = await this.store.listAttributes();
    const values = await this.store.listAttributeValues({
      entity_type: 'VARIETY',
      entity_id: record.id,
    });
    return dto.toVarietyDto(record, { attributeDefinitions: definitions, attributeValues: values });
  }

  async updateVariety({ context, productId, varietyId, input, request }) {
    const value = validate(dto.varietyUpdateSchema, input, 'variety update');
    const product = await this.assertRecordAccess(
      context,
      await this.store.findProduct(productId),
      'Product',
      { write: true },
    );
    const variety = requireRecord(await this.store.findVariety(varietyId), 'Product variety');
    if (variety.product_id !== productId) {
      throw new NotFoundError({ message: 'Product variety was not found.' });
    }
    const updated = await this.store.updateVariety(varietyId, {
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.nameBn !== undefined ? { name_bn: value.nameBn } : {}),
      ...(value.description !== undefined ? { description: value.description } : {}),
      ...(value.descriptionBn !== undefined ? { description_bn: value.descriptionBn } : {}),
      ...(value.isActive !== undefined ? { is_active: value.isActive } : {}),
    });
    await this.audit(
      {
        action: EVENTS.VARIETY_UPDATED,
        entityType: 'ProductVariety',
        entityId: varietyId,
        organizationId: product.organization_id,
        before: variety,
        after: updated,
      },
      request,
    );
    const definitions = await this.store.listAttributes();
    const values = await this.store.listAttributeValues({
      entity_type: 'VARIETY',
      entity_id: varietyId,
    });
    return dto.toVarietyDto(updated, {
      attributeDefinitions: definitions,
      attributeValues: values,
    });
  }

  async replaceVarietyAttributes({ context, productId, varietyId, input, request }) {
    const value = validate(dto.attributeValuesReplaceSchema, input, 'attribute values');
    const product = await this.assertRecordAccess(
      context,
      await this.store.findProduct(productId),
      'Product',
      { write: true },
    );
    const variety = requireRecord(await this.store.findVariety(varietyId), 'Product variety');
    if (variety.product_id !== productId) {
      throw new NotFoundError({ message: 'Product variety was not found.' });
    }
    const prepared = await this.validateAttributeValues({
      values: value.values,
      entityType: 'VARIETY',
      categoryId: product.category_id,
      organizationId: product.organization_id,
    });
    await this.replaceAttributeValues({ entityType: 'VARIETY', entityId: varietyId, prepared });
    await this.audit(
      {
        action: EVENTS.ATTRIBUTE_VALUES_UPDATED,
        entityType: 'ProductVariety',
        entityId: varietyId,
        organizationId: product.organization_id,
        after: { values: value.values },
      },
      request,
    );
    const definitions = await this.store.listAttributes();
    const values = await this.store.listAttributeValues({
      entity_type: 'VARIETY',
      entity_id: varietyId,
    });
    return dto.toVarietyDto(variety, {
      attributeDefinitions: definitions,
      attributeValues: values,
    });
  }
}

function dtoToDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

module.exports = { CatalogService, CatalogServiceToken, EVENTS };

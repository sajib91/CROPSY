const { randomBytes, randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const {
  AI_WRITE_PERMISSION,
  GLOBAL_SCOPE_KEY,
  MODULE_ID,
  AgricultureEntity,
} = require('../domain/agriculture.entity');
const {
  AGRICULTURE_STORE_METHODS,
  AgricultureRepositoryToken,
  AgricultureStoreToken,
} = require('../domain/agriculture.repository');
const dto = require('./agriculture.dto');

const AgricultureServiceToken = Symbol.for('cropsy.service.agriculture');

const EVENTS = Object.freeze({
  INITIALIZED: 'agriculture.initialized',
  SEASON_CREATED: 'agriculture.season.created',
  CROP_CREATED: 'agriculture.crop.created',
  CROP_UPDATED: 'agriculture.crop.updated',
  VARIETY_CREATED: 'agriculture.variety.created',
  VARIETY_UPDATED: 'agriculture.variety.updated',
  CALENDAR_CREATED: 'agriculture.calendar.created',
  CALENDAR_UPDATED: 'agriculture.calendar.updated',
  RECOMMENDATION_CREATED: 'agriculture.recommendation.created',
  RECOMMENDATION_UPDATED: 'agriculture.recommendation.updated',
  CULTIVATION_CREATED: 'agriculture.cultivation.created',
  CULTIVATION_UPDATED: 'agriculture.cultivation.updated',
  ACTIVITY_RECORDED: 'agriculture.activity.recorded',
  HARVEST_RECORDED: 'agriculture.harvest.recorded',
  EXPENSE_RECORDED: 'agriculture.expense.recorded',
  EXPENSE_UPDATED: 'agriculture.expense.updated',
  EXPENSE_ESTIMATED: 'agriculture.expense.estimated',
});

function requestMeta(request) {
  const forwarded = request?.headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return {
    ipAddress: String(raw || request?.ip || 'unknown')
      .split(',')[0]
      .trim()
      .slice(0, 64),
    userAgent: request?.headers?.['user-agent']
      ? String(request.headers['user-agent']).slice(0, 2000)
      : null,
    requestId: request?.requestId || null,
  };
}

function generateCode(prefix, size = 5) {
  const normalized =
    String(prefix || 'CROP')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6) || 'CROP';
  return `${normalized}-${randomBytes(size).toString('hex').toUpperCase()}`;
}

function asDate(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(value);
}

function asIsoInput(value) {
  if (value === null || value === undefined) return value;
  return value instanceof Date ? value.toISOString() : value;
}

function requireRecord(record, label) {
  if (!record) throw new NotFoundError({ message: `${label} was not found.` });
  return record;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function timestampInRange(value, from, to) {
  if (!from && !to) return true;
  const time = Date.parse(asDate(value));
  if (from && time < Date.parse(from)) return false;
  if (to && time > Date.parse(to)) return false;
  return true;
}

function groupMoney(expenses, source) {
  const grouped = new Map();
  for (const expense of expenses) {
    if (source && expense.source !== source) continue;
    const currency = expense.currency || 'BDT';
    if (!grouped.has(currency)) grouped.set(currency, { currency, amount: 0, count: 0 });
    const entry = grouped.get(currency);
    entry.amount += Number(expense.amount);
    entry.count += 1;
  }
  return [...grouped.values()];
}

function calculateCost(expenses) {
  const recorded = groupMoney(expenses, 'RECORDED');
  const estimated = groupMoney(expenses, 'AI_ESTIMATED');
  const currencies = new Set([
    ...recorded.map((entry) => entry.currency),
    ...estimated.map((entry) => entry.currency),
  ]);
  const singleCurrency = currencies.size === 1 ? [...currencies][0] : null;
  const amountFor = (entries, currency) =>
    entries.find((entry) => entry.currency === currency) || { amount: 0, count: 0 };

  return {
    currency: singleCurrency,
    mixedCurrency: currencies.size > 1,
    recordedCost: singleCurrency ? roundMoney(amountFor(recorded, singleCurrency).amount) : null,
    aiEstimatedCost: singleCurrency
      ? roundMoney(amountFor(estimated, singleCurrency).amount)
      : null,
    recordedExpenseCount: recorded.reduce((sum, entry) => sum + entry.count, 0),
    aiEstimatedExpenseCount: estimated.reduce((sum, entry) => sum + entry.count, 0),
    byCurrency: [...currencies].sort().map((currency) => ({
      currency,
      recordedCost: roundMoney(amountFor(recorded, currency).amount),
      aiEstimatedCost: roundMoney(amountFor(estimated, currency).amount),
    })),
  };
}

function categoryBreakdown(expenses) {
  const grouped = new Map();
  for (const expense of expenses) {
    if (!grouped.has(expense.category)) {
      grouped.set(expense.category, {
        category: expense.category,
        recordedCost: 0,
        aiEstimatedCost: 0,
      });
    }
    const entry = grouped.get(expense.category);
    if (expense.source === 'AI_ESTIMATED') entry.aiEstimatedCost += Number(expense.amount);
    else entry.recordedCost += Number(expense.amount);
  }
  return [...grouped.values()]
    .sort((a, b) => a.category.localeCompare(b.category))
    .map((entry) => ({
      category: entry.category,
      recordedCost: roundMoney(entry.recordedCost),
      aiEstimatedCost: roundMoney(entry.aiEstimatedCost),
    }));
}

function sumYield(harvests) {
  return roundQuantity(harvests.reduce((sum, harvest) => sum + Number(harvest.quantity_kg), 0));
}

function profitability({ yieldKg, recordedCost, pricePerKg, currency }) {
  const revenue =
    pricePerKg !== undefined && pricePerKg !== null && recordedCost !== null
      ? roundMoney(Number(pricePerKg) * Number(yieldKg))
      : null;
  const profit = revenue !== null ? roundMoney(revenue - Number(recordedCost)) : null;
  const marginPercent =
    revenue !== null && revenue > 0 ? roundMoney((profit / revenue) * 100) : null;
  const costPerKg =
    recordedCost !== null && Number(yieldKg) > 0
      ? roundMoney(Number(recordedCost) / Number(yieldKg))
      : null;
  return {
    yieldKg,
    currency,
    recordedCost,
    revenue,
    profit,
    marginPercent,
    costPerKg,
  };
}

class AgricultureService {
  constructor({
    repository,
    store,
    eventBus,
    logger,
    metadata,
    farmAccess,
    authorization,
    identityStore,
    config,
  }) {
    assertRepository(repository, ['get', 'save'], AgricultureRepositoryToken);
    assertRepository(store, AGRICULTURE_STORE_METHODS, AgricultureStoreToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('AgricultureService requires an event bus.');
    }
    if (!metadata) throw new TypeError('AgricultureService requires module metadata.');
    for (const [name, dependency] of Object.entries({
      store,
      farmAccess,
      authorization,
      identityStore,
      config,
    })) {
      if (!dependency) throw new TypeError(`AgricultureService requires ${name}.`);
    }
    if (
      typeof farmAccess.findFarmById !== 'function' ||
      typeof farmAccess.listFarms !== 'function'
    ) {
      throw new TypeError('AgricultureService requires a read-only farm access port.');
    }

    this.repository = repository;
    this.store = store;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.farmAccess = farmAccess;
    this.authorization = authorization;
    this.identityStore = identityStore;
    this.config = config;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new AgricultureEntity();
      await this.repository.save(entity);
      this.publish(EVENTS.INITIALIZED, { name: entity.name }, entity.id);
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    const data = dto.toModuleInfoDto(entity, this.metadata);
    return validate(dto.moduleInfoSchema, data, 'agriculture module info');
  }

  publish(type, payload, entityId) {
    this.eventBus.publish({
      type,
      moduleId: MODULE_ID,
      aggregateId: entityId || payload?.farmId || payload?.cropId || 'anonymous',
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

  async resolveTenantId(context, explicit, { allowGlobal = false } = {}) {
    if (explicit) {
      if (!context.isSuperAdmin) {
        await this.authorization.assertOrganization(context, explicit);
      }
      return explicit;
    }
    if (context.isSuperAdmin) return null;
    if (!context.organizationId) {
      if (allowGlobal) return null;
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
        message: 'Only platform administrators may create platform-scoped records.',
        details: { code: 'platform_scope_required' },
      });
    }
  }

  async resolveScope(context, scope, explicitOrganizationId) {
    if (scope === 'GLOBAL') {
      this.assertPlatformScope(context);
      return { organizationId: null, scopeKey: GLOBAL_SCOPE_KEY };
    }
    const organizationId = await this.resolveTenantId(context, explicitOrganizationId);
    if (!organizationId) {
      throw new ForbiddenError({
        message: 'An organization-scoped record requires an organization.',
        details: { code: 'organization_context_required' },
      });
    }
    return { organizationId, scopeKey: organizationId };
  }

  async visibleScopedRows(context, rows, query = {}, { allowGlobal = true } = {}) {
    if (query.organizationId && !context.isSuperAdmin) {
      await this.authorization.assertOrganization(context, query.organizationId);
    }
    if (context.isSuperAdmin) {
      if (!query.organizationId) return rows;
      return rows.filter(
        (row) =>
          row.organization_id === query.organizationId ||
          (allowGlobal && query.includeGlobal && row.organization_id === null),
      );
    }
    return rows.filter((row) => {
      if (query.organizationId && row.organization_id === query.organizationId) return true;
      if (row.organization_id === null) return allowGlobal && query.includeGlobal;
      return row.organization_id === context.organizationId;
    });
  }

  async assertScopedReference(context, record, label) {
    requireRecord(record, label);
    if (context.isSuperAdmin || record.organization_id === null) return record;
    if (record.organization_id !== context.organizationId) {
      await this.authorization.assertOrganization(context, record.organization_id);
      throw new ForbiddenError({
        message: `Access to the ${label.toLowerCase()} is denied.`,
        details: { code: 'cross_organization_access_denied' },
      });
    }
    return record;
  }

  async allowedFarmIds(context) {
    if (context.isSuperAdmin) return null;
    const [owned, tenant] = await Promise.all([
      this.farmAccess.listFarms({ ownerUserId: context.user.id, includeArchived: true }),
      context.organizationId
        ? this.farmAccess.listFarms({
            organizationId: context.organizationId,
            includeArchived: true,
          })
        : Promise.resolve([]),
    ]);
    return new Set([...owned, ...tenant].map((farm) => farm.id));
  }

  async filterFarmRows(context, rows) {
    const allowed = await this.allowedFarmIds(context);
    if (!allowed) return rows;
    return rows.filter((row) => allowed.has(row.farm_id));
  }

  async getFarmOrThrow(context, farmId) {
    const farm = await this.farmAccess.findFarmById(farmId);
    requireRecord(farm, 'Farm');
    if (context.isSuperAdmin) return farm;
    if (farm.owner_user_id === context.user.id) return farm;
    if (farm.organization_id) {
      await this.authorization.assertOrganization(context, farm.organization_id);
      return farm;
    }
    throw new ForbiddenError({ message: 'Access to this farm is denied.' });
  }

  assertAiWrite(context) {
    if (context.isSuperAdmin || context.permissions.includes(AI_WRITE_PERMISSION)) return;
    throw new ForbiddenError({
      message: `Missing required permission '${AI_WRITE_PERMISSION}' for AI-estimated records.`,
      details: { permission: AI_WRITE_PERMISSION },
    });
  }

  assertLandParcel(farm, landParcelId) {
    if (!landParcelId) return;
    const parcels = farm.parcels || [];
    if (!parcels.some((parcel) => parcel.id === landParcelId)) {
      throw new ValidationError({
        message: 'Land parcel must belong to the selected farm.',
        details: { field: 'landParcelId' },
      });
    }
  }

  async assertCultivationReferences(context, value, organizationId) {
    const variety = requireRecord(
      await this.store.findVariety(value.cropVarietyId),
      'Crop variety',
    );
    if (value.cropId && variety.crop_id !== value.cropId) {
      throw new ValidationError({
        message: 'Crop variety does not belong to the selected crop.',
        details: { field: 'cropVarietyId' },
      });
    }

    let season = null;
    if (value.cropSeasonId) {
      season = await this.assertScopedReference(
        context,
        await this.store.findSeason(value.cropSeasonId),
        'Crop season',
      );
      if (organizationId && season.organization_id && season.organization_id !== organizationId) {
        throw new ForbiddenError({ message: 'Crop season belongs to another organization.' });
      }
    }

    let calendar = null;
    if (value.cropCalendarId) {
      calendar = await this.assertScopedReference(
        context,
        await this.store.findCalendar(value.cropCalendarId),
        'Crop calendar',
      );
      if (calendar.crop_id !== variety.crop_id) {
        throw new ValidationError({
          message: 'Crop calendar does not belong to the selected crop.',
          details: { field: 'cropCalendarId' },
        });
      }
      if (calendar.crop_variety_id && calendar.crop_variety_id !== value.cropVarietyId) {
        throw new ValidationError({
          message: 'Crop calendar does not belong to the selected crop variety.',
          details: { field: 'cropCalendarId' },
        });
      }
      if (
        organizationId &&
        calendar.organization_id &&
        calendar.organization_id !== organizationId
      ) {
        throw new ForbiddenError({ message: 'Crop calendar belongs to another organization.' });
      }
    }

    return { variety, season, calendar };
  }

  // -------------------------------------------------------------------------
  // Crop catalog and varieties
  // -------------------------------------------------------------------------

  async listCrops({ query }) {
    const parsed = validate(dto.cropQuerySchema, query || {}, 'crop query');
    const rows = await this.store.listCrops(parsed.category ? { category: parsed.category } : {});
    return rows.filter((row) => parsed.includeInactive || row.is_active).map(dto.toCropDto);
  }

  async createCrop({ input, request }) {
    const value = validate(dto.cropCreateSchema, input, 'crop input');
    await this.assertUnique(await this.store.listCrops(), 'code', value.code, 'Crop code');
    const now = new Date();
    const record = await this.store.createCrop({
      id: randomUUID(),
      code: value.code,
      name: value.name,
      name_bn: value.nameBn ?? null,
      category: value.category,
      is_active: value.isActive,
      created_at: now,
      updated_at: now,
    });
    await this.audit(
      { action: EVENTS.CROP_CREATED, entityType: 'Crop', entityId: record.id, after: record },
      request,
    );
    return dto.toCropDto(record);
  }

  async updateCrop({ cropId, input, request }) {
    const current = requireRecord(await this.store.findCrop(cropId), 'Crop');
    const value = validate(dto.cropUpdateSchema, input, 'crop update');
    const patch = {};
    if (value.name !== undefined) patch.name = value.name;
    if (value.nameBn !== undefined) patch.name_bn = value.nameBn;
    if (value.category !== undefined) patch.category = value.category;
    if (value.isActive !== undefined) patch.is_active = value.isActive;
    const record = requireRecord(await this.store.updateCrop(cropId, patch), 'Crop');
    await this.audit(
      {
        action: EVENTS.CROP_UPDATED,
        entityType: 'Crop',
        entityId: cropId,
        before: current,
        after: record,
      },
      request,
    );
    return dto.toCropDto(record);
  }

  async listVarieties({ query }) {
    const parsed = validate(dto.varietyQuerySchema, query || {}, 'variety query');
    const rows = await this.store.listVarieties(parsed.cropId ? { crop_id: parsed.cropId } : {});
    return rows.map(dto.toVarietyDto);
  }

  async createVariety({ cropId, input, request }) {
    requireRecord(await this.store.findCrop(cropId), 'Crop');
    const value = validate(dto.varietyCreateSchema, input, 'variety input');
    await this.assertUnique(
      await this.store.listVarieties({ crop_id: cropId }),
      'code',
      value.code,
      'Variety code',
    );
    const now = new Date();
    const record = await this.store.createVariety({
      id: randomUUID(),
      crop_id: cropId,
      code: value.code,
      name: value.name,
      name_bn: value.nameBn ?? null,
      maturity_days: value.maturityDays ?? null,
      created_at: now,
      updated_at: now,
    });
    await this.audit(
      {
        action: EVENTS.VARIETY_CREATED,
        entityType: 'CropVariety',
        entityId: record.id,
        organizationId: null,
        after: record,
      },
      request,
    );
    return dto.toVarietyDto(record);
  }

  async updateVariety({ cropId, varietyId, input, request }) {
    const current = requireRecord(await this.store.findVariety(varietyId), 'Crop variety');
    if (current.crop_id !== cropId) {
      throw new NotFoundError({ message: 'Crop variety does not belong to this crop.' });
    }
    const value = validate(dto.varietyUpdateSchema, input, 'variety update');
    const patch = {};
    if (value.name !== undefined) patch.name = value.name;
    if (value.nameBn !== undefined) patch.name_bn = value.nameBn;
    if (value.maturityDays !== undefined) patch.maturity_days = value.maturityDays;
    const record = requireRecord(await this.store.updateVariety(varietyId, patch), 'Crop variety');
    await this.audit(
      {
        action: EVENTS.VARIETY_UPDATED,
        entityType: 'CropVariety',
        entityId: varietyId,
        before: current,
        after: record,
      },
      request,
    );
    return dto.toVarietyDto(record);
  }

  // -------------------------------------------------------------------------
  // Seasons, calendars, and recommendations
  // -------------------------------------------------------------------------

  async listSeasons({ context, query }) {
    const parsed = validate(dto.seasonQuerySchema, query || {}, 'season query');
    const filters = {};
    if (parsed.organizationId) filters.organization_id = parsed.organizationId;
    if (parsed.year !== undefined) filters.year = parsed.year;
    const rows = await this.store.listSeasons(filters);
    const visible = await this.visibleScopedRows(context, rows, parsed);
    return visible
      .filter((row) => parsed.isActive === undefined || row.is_active === parsed.isActive)
      .map(dto.toSeasonDto);
  }

  async createSeason({ context, input, request }) {
    const value = validate(dto.seasonCreateSchema, input, 'season input');
    const organizationId = value.organizationId
      ? await this.resolveTenantId(context, value.organizationId)
      : await this.resolveTenantId(context, null, { allowGlobal: true });
    if (!organizationId) this.assertPlatformScope(context);
    await this.assertUnique(await this.store.listSeasons(), 'code', value.code, 'Season code');
    const now = new Date();
    const record = await this.store.createSeason({
      id: randomUUID(),
      organization_id: organizationId,
      code: value.code,
      name: value.name,
      name_bn: value.nameBn ?? null,
      start_month: value.startMonth,
      end_month: value.endMonth,
      year: value.year ?? null,
      is_active: value.isActive,
      created_at: now,
      updated_at: now,
    });
    await this.audit(
      {
        action: EVENTS.SEASON_CREATED,
        entityType: 'CropSeason',
        entityId: record.id,
        organizationId,
        after: record,
      },
      request,
    );
    return dto.toSeasonDto(record);
  }

  async updateSeason({ context, seasonId, input, request }) {
    const current = requireRecord(await this.store.findSeason(seasonId), 'Crop season');
    if (!context.isSuperAdmin && current.organization_id !== context.organizationId) {
      throw new ForbiddenError({ message: 'Access to this crop season is denied.' });
    }
    const value = validate(dto.seasonUpdateSchema, input, 'season update');
    const patch = {};
    if (value.name !== undefined) patch.name = value.name;
    if (value.nameBn !== undefined) patch.name_bn = value.nameBn;
    if (value.startMonth !== undefined) patch.start_month = value.startMonth;
    if (value.endMonth !== undefined) patch.end_month = value.endMonth;
    if (value.year !== undefined) patch.year = value.year;
    if (value.isActive !== undefined) patch.is_active = value.isActive;
    const record = requireRecord(await this.store.updateSeason(seasonId, patch), 'Crop season');
    await this.audit(
      {
        action: 'agriculture.season.updated',
        entityType: 'CropSeason',
        entityId: seasonId,
        organizationId: current.organization_id,
        before: current,
        after: record,
      },
      request,
    );
    return dto.toSeasonDto(record);
  }

  async listCalendars({ context, query }) {
    const parsed = validate(dto.calendarQuerySchema, query || {}, 'calendar query');
    const filters = {};
    if (parsed.organizationId) filters.organization_id = parsed.organizationId;
    if (parsed.cropId) filters.crop_id = parsed.cropId;
    if (parsed.cropVarietyId) filters.crop_variety_id = parsed.cropVarietyId;
    const rows = await this.store.listCalendars(filters);
    const visible = await this.visibleScopedRows(context, rows, parsed);
    return visible
      .filter((row) => parsed.isActive === undefined || row.is_active === parsed.isActive)
      .map(dto.toCalendarDto);
  }

  async createCalendar({ context, input, request }) {
    const value = validate(dto.calendarCreateSchema, input, 'calendar input');
    const { organizationId, scopeKey } = await this.resolveScope(
      context,
      value.scope,
      value.organizationId,
    );
    requireRecord(await this.store.findCrop(value.cropId), 'Crop');
    if (value.cropVarietyId) {
      const variety = requireRecord(
        await this.store.findVariety(value.cropVarietyId),
        'Crop variety',
      );
      if (variety.crop_id !== value.cropId) {
        throw new ValidationError({
          message: 'Crop variety does not belong to the selected crop.',
          details: { field: 'cropVarietyId' },
        });
      }
    }
    await this.assertUnique(
      await this.store.listCalendars({ scope_key: scopeKey }),
      'code',
      value.code,
      'Calendar code',
    );
    const now = new Date();
    const record = await this.store.createCalendar({
      id: randomUUID(),
      organization_id: organizationId,
      scope_key: scopeKey,
      crop_id: value.cropId,
      crop_variety_id: value.cropVarietyId ?? null,
      code: value.code,
      name: value.name,
      sowing_start_month: value.sowingStartMonth,
      sowing_end_month: value.sowingEndMonth,
      harvest_days_min: value.harvestDaysMin ?? null,
      harvest_days_max: value.harvestDaysMax ?? null,
      is_active: value.isActive,
      notes: value.notes ?? null,
      created_at: now,
      updated_at: now,
    });
    await this.audit(
      {
        action: EVENTS.CALENDAR_CREATED,
        entityType: 'CropCalendar',
        entityId: record.id,
        organizationId,
        after: record,
      },
      request,
    );
    return dto.toCalendarDto(record);
  }

  async updateCalendar({ context, calendarId, input, request }) {
    const current = requireRecord(await this.store.findCalendar(calendarId), 'Crop calendar');
    if (!context.isSuperAdmin && current.organization_id !== context.organizationId) {
      throw new ForbiddenError({ message: 'Access to this crop calendar is denied.' });
    }
    const value = validate(dto.calendarUpdateSchema, input, 'calendar update');
    const scope =
      value.scope || (current.scope_key === GLOBAL_SCOPE_KEY ? 'GLOBAL' : 'ORGANIZATION');
    const explicitOrg =
      value.organizationId !== undefined ? value.organizationId : current.organization_id;
    const { organizationId, scopeKey } = await this.resolveScope(context, scope, explicitOrg);
    const cropVarietyId =
      value.cropVarietyId !== undefined ? value.cropVarietyId : current.crop_variety_id;
    if (cropVarietyId) {
      const variety = requireRecord(await this.store.findVariety(cropVarietyId), 'Crop variety');
      if (variety.crop_id !== current.crop_id) {
        throw new ValidationError({
          message: 'Crop variety does not belong to the selected crop.',
          details: { field: 'cropVarietyId' },
        });
      }
    }
    const harvestDaysMin =
      value.harvestDaysMin !== undefined ? value.harvestDaysMin : current.harvest_days_min;
    const harvestDaysMax =
      value.harvestDaysMax !== undefined ? value.harvestDaysMax : current.harvest_days_max;
    if (
      (harvestDaysMin == null) !== (harvestDaysMax == null) ||
      (harvestDaysMin != null && harvestDaysMin > harvestDaysMax)
    ) {
      throw new ValidationError({
        message: 'Harvest days must be provided as a valid min/max pair.',
        details: { field: 'harvestDaysMax' },
      });
    }
    const patch = {
      organization_id: organizationId,
      scope_key: scopeKey,
      crop_variety_id: cropVarietyId,
      sowing_start_month:
        value.sowingStartMonth !== undefined ? value.sowingStartMonth : current.sowing_start_month,
      sowing_end_month:
        value.sowingEndMonth !== undefined ? value.sowingEndMonth : current.sowing_end_month,
      harvest_days_min: harvestDaysMin,
      harvest_days_max: harvestDaysMax,
      is_active: value.isActive !== undefined ? value.isActive : current.is_active,
    };
    if (value.name !== undefined) patch.name = value.name;
    if (value.notes !== undefined) patch.notes = value.notes;
    await this.assertUnique(
      await this.store.listCalendars({ scope_key: scopeKey }),
      'code',
      current.code,
      'Calendar code',
      calendarId,
    );
    const record = requireRecord(
      await this.store.updateCalendar(calendarId, patch),
      'Crop calendar',
    );
    await this.audit(
      {
        action: EVENTS.CALENDAR_UPDATED,
        entityType: 'CropCalendar',
        entityId: calendarId,
        organizationId,
        before: current,
        after: record,
      },
      request,
    );
    return dto.toCalendarDto(record);
  }

  recommendationInputFromRecord(record) {
    return {
      organizationId: record.organization_id,
      scope: record.scope_key === GLOBAL_SCOPE_KEY ? 'GLOBAL' : 'ORGANIZATION',
      cropId: record.crop_id,
      cropVarietyId: record.crop_variety_id,
      calendarId: record.calendar_id,
      code: record.code,
      title: record.title,
      body: record.body,
      source: record.source,
      confidence: record.confidence,
      ruleKey: record.rule_key,
      validFrom: asIsoInput(record.valid_from),
      validUntil: asIsoInput(record.valid_until),
      isActive: record.is_active,
    };
  }

  async assertRecommendationReferences(context, value, organizationId) {
    requireRecord(await this.store.findCrop(value.cropId), 'Crop');
    if (value.cropVarietyId) {
      const variety = requireRecord(
        await this.store.findVariety(value.cropVarietyId),
        'Crop variety',
      );
      if (variety.crop_id !== value.cropId) {
        throw new ValidationError({
          message: 'Crop variety does not belong to the selected crop.',
          details: { field: 'cropVarietyId' },
        });
      }
    }
    if (value.calendarId) {
      const calendar = await this.assertScopedReference(
        context,
        await this.store.findCalendar(value.calendarId),
        'Crop calendar',
      );
      if (calendar.crop_id !== value.cropId) {
        throw new ValidationError({
          message: 'Calendar does not belong to the selected crop.',
          details: { field: 'calendarId' },
        });
      }
      if (calendar.crop_variety_id && calendar.crop_variety_id !== value.cropVarietyId) {
        throw new ValidationError({
          message: 'Calendar does not belong to the selected crop variety.',
          details: { field: 'calendarId' },
        });
      }
      if (calendar.organization_id && calendar.organization_id !== organizationId) {
        throw new ForbiddenError({ message: 'Calendar belongs to another organization.' });
      }
    }
  }

  async listRecommendations({ context, query }) {
    const parsed = validate(dto.recommendationQuerySchema, query || {}, 'recommendation query');
    const filters = {};
    if (parsed.organizationId) filters.organization_id = parsed.organizationId;
    if (parsed.cropId) filters.crop_id = parsed.cropId;
    if (parsed.cropVarietyId) filters.crop_variety_id = parsed.cropVarietyId;
    if (parsed.source) filters.source = parsed.source;
    const rows = await this.store.listRecommendations(filters);
    const visible = await this.visibleScopedRows(context, rows, parsed);
    return visible
      .filter((row) => parsed.isActive === undefined || row.is_active === parsed.isActive)
      .map(dto.toRecommendationDto);
  }

  async createRecommendation({ context, input, request }) {
    const value = validate(dto.recommendationCreateSchema, input, 'recommendation input');
    const { organizationId, scopeKey } = await this.resolveScope(
      context,
      value.scope,
      value.organizationId,
    );
    if (value.source === 'AI_ESTIMATED') this.assertAiWrite(context);
    await this.assertRecommendationReferences(context, value, organizationId);
    await this.assertUnique(
      await this.store.listRecommendations({ scope_key: scopeKey }),
      'code',
      value.code,
      'Recommendation code',
    );
    const now = new Date();
    const record = await this.store.createRecommendation({
      id: randomUUID(),
      organization_id: organizationId,
      scope_key: scopeKey,
      crop_id: value.cropId,
      crop_variety_id: value.cropVarietyId ?? null,
      calendar_id: value.calendarId ?? null,
      code: value.code,
      title: value.title,
      body: value.body,
      source: value.source,
      confidence: value.confidence ?? null,
      rule_key: value.ruleKey ?? null,
      valid_from: asDate(value.validFrom),
      valid_until: asDate(value.validUntil),
      is_active: value.isActive,
      created_at: now,
      updated_at: now,
    });
    await this.audit(
      {
        action: EVENTS.RECOMMENDATION_CREATED,
        entityType: 'AgronomicRecommendation',
        entityId: record.id,
        organizationId,
        after: record,
      },
      request,
    );
    return dto.toRecommendationDto(record);
  }

  async updateRecommendation({ context, recommendationId, input, request }) {
    const current = requireRecord(
      await this.store.findRecommendation(recommendationId),
      'Agronomic recommendation',
    );
    if (!context.isSuperAdmin && current.organization_id !== context.organizationId) {
      throw new ForbiddenError({ message: 'Access to this recommendation is denied.' });
    }
    const patch = validate(dto.recommendationUpdateSchema, input, 'recommendation update');
    const merged = validate(
      dto.recommendationCreateSchema,
      { ...this.recommendationInputFromRecord(current), ...patch },
      'recommendation input',
    );
    const { organizationId, scopeKey } = await this.resolveScope(
      context,
      merged.scope,
      merged.organizationId,
    );
    if (merged.source === 'AI_ESTIMATED') this.assertAiWrite(context);
    await this.assertRecommendationReferences(context, merged, organizationId);
    await this.assertUnique(
      await this.store.listRecommendations({ scope_key: scopeKey }),
      'code',
      current.code,
      'Recommendation code',
      recommendationId,
    );
    const record = requireRecord(
      await this.store.updateRecommendation(recommendationId, {
        organization_id: organizationId,
        scope_key: scopeKey,
        crop_variety_id: merged.cropVarietyId ?? null,
        calendar_id: merged.calendarId ?? null,
        title: merged.title,
        body: merged.body,
        source: merged.source,
        confidence: merged.confidence ?? null,
        rule_key: merged.ruleKey ?? null,
        valid_from: asDate(merged.validFrom),
        valid_until: asDate(merged.validUntil),
        is_active: merged.isActive,
      }),
      'Agronomic recommendation',
    );
    await this.audit(
      {
        action: EVENTS.RECOMMENDATION_UPDATED,
        entityType: 'AgronomicRecommendation',
        entityId: recommendationId,
        organizationId,
        before: current,
        after: record,
      },
      request,
    );
    return dto.toRecommendationDto(record);
  }

  // -------------------------------------------------------------------------
  // Cultivations and activity history
  // -------------------------------------------------------------------------

  async listCultivations({ context, query }) {
    const parsed = validate(dto.cultivationQuerySchema, query || {}, 'cultivation query');
    if (parsed.organizationId && !context.isSuperAdmin) {
      await this.authorization.assertOrganization(context, parsed.organizationId);
    }
    const filters = {};
    if (parsed.farmId) filters.farm_id = parsed.farmId;
    if (parsed.cropId) filters.crop_id = parsed.cropId;
    if (parsed.cropVarietyId) filters.crop_variety_id = parsed.cropVarietyId;
    if (parsed.cropSeasonId) filters.crop_season_id = parsed.cropSeasonId;
    if (parsed.status) filters.status = parsed.status;
    let rows = await this.store.listCultivations(filters);
    rows = await this.filterFarmRows(context, rows);
    if (parsed.organizationId) {
      rows = rows.filter((row) => row.organization_id === parsed.organizationId);
    }
    return rows.map(dto.toCultivationDto);
  }

  async getCultivation({ context, cultivationId }) {
    const record = requireRecord(await this.store.findCultivation(cultivationId), 'Cultivation');
    await this.getFarmOrThrow(context, record.farm_id);
    return dto.toCultivationDto(record);
  }

  async createCultivation({ context, input, request }) {
    const value = validate(dto.cultivationCreateSchema, input, 'cultivation input');
    const farm = await this.getFarmOrThrow(context, value.farmId);
    const farmOrganizationId = farm.organization_id || null;
    if (value.organizationId && value.organizationId !== farmOrganizationId) {
      throw new ForbiddenError({
        message: 'Cultivation organization must match the farm organization.',
        details: { code: 'cross_organization_access_denied' },
      });
    }
    this.assertLandParcel(farm, value.landParcelId);
    const { variety } = await this.assertCultivationReferences(context, value, farmOrganizationId);

    const rows = await this.store.listCultivations({ farm_id: value.farmId });
    const code = value.code || generateCode('CULT');
    await this.assertUnique(rows, 'code', code, 'Cultivation code');
    const now = new Date();
    const record = await this.store.createCultivation({
      id: randomUUID(),
      organization_id: farmOrganizationId,
      farm_id: value.farmId,
      land_parcel_id: value.landParcelId ?? null,
      crop_id: variety.crop_id,
      crop_variety_id: variety.id,
      crop_season_id: value.cropSeasonId ?? null,
      crop_calendar_id: value.cropCalendarId ?? null,
      code,
      status: value.status,
      sown_at: asDate(value.sownAt),
      planted_at: asDate(value.plantedAt),
      expected_harvest_at: asDate(value.expectedHarvestAt),
      harvested_at: null,
      growth_stage: value.growthStage,
      area_hectares: value.areaHectares,
      expected_yield_kg: value.expectedYieldKg ?? null,
      notes: value.notes ?? null,
      created_at: now,
      updated_at: now,
    });
    await this.audit(
      {
        action: EVENTS.CULTIVATION_CREATED,
        entityType: 'Cultivation',
        entityId: record.id,
        organizationId: farmOrganizationId,
        after: record,
      },
      request,
    );
    return dto.toCultivationDto(record);
  }

  async updateCultivation({ context, cultivationId, input, request }) {
    const current = requireRecord(await this.store.findCultivation(cultivationId), 'Cultivation');
    const farm = await this.getFarmOrThrow(context, current.farm_id);
    const patch = validate(dto.cultivationUpdateSchema, input, 'cultivation update');
    const merged = validate(
      dto.cultivationCreateSchema,
      {
        farmId: current.farm_id,
        organizationId: current.organization_id,
        cropVarietyId: patch.cropVarietyId || current.crop_variety_id,
        cropSeasonId:
          patch.cropSeasonId !== undefined ? patch.cropSeasonId : current.crop_season_id,
        cropCalendarId:
          patch.cropCalendarId !== undefined ? patch.cropCalendarId : current.crop_calendar_id,
        landParcelId:
          patch.landParcelId !== undefined ? patch.landParcelId : current.land_parcel_id,
        code: patch.code || current.code,
        status: patch.status || current.status,
        sownAt: asIsoInput(patch.sownAt !== undefined ? patch.sownAt : current.sown_at),
        plantedAt: asIsoInput(patch.plantedAt !== undefined ? patch.plantedAt : current.planted_at),
        expectedHarvestAt: asIsoInput(
          patch.expectedHarvestAt !== undefined
            ? patch.expectedHarvestAt
            : current.expected_harvest_at,
        ),
        areaHectares:
          patch.areaHectares !== undefined ? patch.areaHectares : Number(current.area_hectares),
        expectedYieldKg:
          patch.expectedYieldKg !== undefined
            ? patch.expectedYieldKg
            : current.expected_yield_kg == null
              ? null
              : Number(current.expected_yield_kg),
        growthStage: patch.growthStage || current.growth_stage,
        notes: patch.notes !== undefined ? patch.notes : current.notes,
      },
      'cultivation input',
    );
    const harvestedAt = asIsoInput(
      patch.harvestedAt !== undefined ? patch.harvestedAt : current.harvested_at,
    );
    if (!dto.assertCultivationDates({ ...merged, harvestedAt })) {
      throw new ValidationError({
        message: 'Cultivation dates must be in chronological order.',
        details: { field: 'harvestedAt' },
      });
    }
    this.assertLandParcel(farm, merged.landParcelId);
    await this.assertCultivationReferences(
      context,
      { ...merged, cropId: current.crop_id },
      current.organization_id,
    );
    const record = requireRecord(
      await this.store.updateCultivation(cultivationId, {
        crop_season_id: merged.cropSeasonId ?? null,
        crop_calendar_id: merged.cropCalendarId ?? null,
        land_parcel_id: merged.landParcelId ?? null,
        code: merged.code,
        status: merged.status,
        sown_at: asDate(merged.sownAt),
        planted_at: asDate(merged.plantedAt),
        expected_harvest_at: asDate(merged.expectedHarvestAt),
        harvested_at: asDate(harvestedAt),
        growth_stage: merged.growthStage,
        area_hectares: merged.areaHectares,
        expected_yield_kg: merged.expectedYieldKg ?? null,
        notes: merged.notes ?? null,
      }),
      'Cultivation',
    );
    await this.audit(
      {
        action: EVENTS.CULTIVATION_UPDATED,
        entityType: 'Cultivation',
        entityId: cultivationId,
        organizationId: current.organization_id,
        before: current,
        after: record,
      },
      request,
    );
    return dto.toCultivationDto(record);
  }

  async createActivityRecord(context, farm, value, request) {
    const organizationId = farm.organization_id || null;
    if (value.cultivationId) {
      const cultivation = requireRecord(
        await this.store.findCultivation(value.cultivationId),
        'Cultivation',
      );
      if (cultivation.farm_id !== farm.id) {
        throw new ValidationError({
          message: 'Cultivation must belong to the selected farm.',
          details: { field: 'cultivationId' },
        });
      }
    }
    this.assertLandParcel(farm, value.landParcelId);
    const now = new Date();
    const record = await this.store.createActivity({
      id: randomUUID(),
      organization_id: organizationId,
      farm_id: farm.id,
      cultivation_id: value.cultivationId ?? null,
      land_parcel_id: value.landParcelId ?? null,
      input_id: value.inputId ?? null,
      performed_by_user_id: value.performedByUserId ?? context.user.id,
      activity_type: value.activityType,
      activity_date: asDate(value.activityDate),
      growth_stage: value.growthStage,
      observation_severity: value.observationSeverity ?? null,
      quantity: value.quantity ?? null,
      unit_code: value.unitCode ?? null,
      cost_amount: value.costAmount ?? null,
      currency: value.currency,
      notes: value.notes ?? null,
      created_at: now,
      updated_at: now,
    });
    await this.audit(
      {
        action: EVENTS.ACTIVITY_RECORDED,
        entityType: 'FarmActivity',
        entityId: record.id,
        organizationId,
        after: record,
      },
      request,
    );
    return dto.toActivityDto(record);
  }

  async createFarmActivity({ context, farmId, input, request }) {
    const farm = await this.getFarmOrThrow(context, farmId);
    const value = validate(
      dto.activityCreateSchema,
      { ...input, farmId, organizationId: farm.organization_id || null },
      'activity input',
    );
    return this.createActivityRecord(context, farm, value, request);
  }

  async createCultivationActivity({ context, cultivationId, input, request }) {
    const cultivation = requireRecord(
      await this.store.findCultivation(cultivationId),
      'Cultivation',
    );
    const farm = await this.getFarmOrThrow(context, cultivation.farm_id);
    const value = validate(
      dto.activityCreateSchema,
      {
        ...input,
        farmId: cultivation.farm_id,
        organizationId: cultivation.organization_id,
        cultivationId,
      },
      'activity input',
    );
    return this.createActivityRecord(context, farm, value, request);
  }

  async listFarmActivities({ context, farmId, query }) {
    await this.getFarmOrThrow(context, farmId);
    const parsed = validate(dto.activityQuerySchema, query || {}, 'activity query');
    const rows = await this.store.listActivities({ farm_id: farmId });
    return rows
      .filter((row) => !parsed.cultivationId || row.cultivation_id === parsed.cultivationId)
      .filter((row) => !parsed.activityType || row.activity_type === parsed.activityType)
      .filter((row) => timestampInRange(row.activity_date, parsed.from, parsed.to))
      .map(dto.toActivityDto);
  }

  async listCultivationActivities({ context, cultivationId, query }) {
    const cultivation = requireRecord(
      await this.store.findCultivation(cultivationId),
      'Cultivation',
    );
    await this.getFarmOrThrow(context, cultivation.farm_id);
    const parsed = validate(dto.activityQuerySchema, query || {}, 'activity query');
    const rows = await this.store.listActivities({ cultivation_id: cultivationId });
    return rows
      .filter((row) => !parsed.activityType || row.activity_type === parsed.activityType)
      .filter((row) => timestampInRange(row.activity_date, parsed.from, parsed.to))
      .map(dto.toActivityDto);
  }

  // -------------------------------------------------------------------------
  // Harvests
  // -------------------------------------------------------------------------

  async createHarvest({ context, cultivationId, input, request }) {
    const cultivation = requireRecord(
      await this.store.findCultivation(cultivationId),
      'Cultivation',
    );
    const farm = await this.getFarmOrThrow(context, cultivation.farm_id);
    const value = validate(
      dto.harvestCreateSchema,
      {
        ...input,
        farmId: cultivation.farm_id,
        organizationId: cultivation.organization_id,
        cultivationId,
      },
      'harvest input',
    );
    const now = new Date();
    const record = await this.store.createHarvest({
      id: randomUUID(),
      organization_id: farm.organization_id || null,
      farm_id: farm.id,
      cultivation_id: cultivationId,
      harvested_at: asDate(value.harvestedAt),
      quantity_kg: value.quantityKg,
      quality_grade: value.qualityGrade ?? null,
      status: value.status,
      created_at: now,
      updated_at: now,
    });
    await this.audit(
      {
        action: EVENTS.HARVEST_RECORDED,
        entityType: 'Harvest',
        entityId: record.id,
        organizationId: record.organization_id,
        after: record,
      },
      request,
    );
    return dto.toHarvestDto(record);
  }

  async listFarmHarvests({ context, farmId, query }) {
    await this.getFarmOrThrow(context, farmId);
    const parsed = validate(dto.harvestQuerySchema, query || {}, 'harvest query');
    const rows = await this.store.listHarvests({ farm_id: farmId });
    return rows
      .filter((row) => !parsed.cultivationId || row.cultivation_id === parsed.cultivationId)
      .filter((row) => !parsed.status || row.status === parsed.status)
      .filter((row) => timestampInRange(row.harvested_at, parsed.from, parsed.to))
      .map(dto.toHarvestDto);
  }

  async listCultivationHarvests({ context, cultivationId, query }) {
    const cultivation = requireRecord(
      await this.store.findCultivation(cultivationId),
      'Cultivation',
    );
    await this.getFarmOrThrow(context, cultivation.farm_id);
    const parsed = validate(dto.harvestQuerySchema, query || {}, 'harvest query');
    const rows = await this.store.listHarvests({ cultivation_id: cultivationId });
    return rows
      .filter((row) => !parsed.status || row.status === parsed.status)
      .filter((row) => timestampInRange(row.harvested_at, parsed.from, parsed.to))
      .map(dto.toHarvestDto);
  }

  // -------------------------------------------------------------------------
  // Farm expenses
  // -------------------------------------------------------------------------

  async filterExpenses(rows, query = {}) {
    return rows
      .filter((row) => !query.farmId || row.farm_id === query.farmId)
      .filter((row) => !query.cultivationId || row.cultivation_id === query.cultivationId)
      .filter((row) => !query.category || row.category === query.category)
      .filter((row) => !query.source || row.source === query.source)
      .filter((row) => timestampInRange(row.expense_date, query.from, query.to));
  }

  async listExpenses({ context, query }) {
    const parsed = validate(dto.expenseQuerySchema, query || {}, 'expense query');
    let rows = await this.store.listExpenses(parsed.farmId ? { farm_id: parsed.farmId } : {});
    rows = await this.filterFarmRows(context, rows);
    return (await this.filterExpenses(rows, parsed)).map(dto.toExpenseDto);
  }

  async listFarmExpenses({ context, farmId, query }) {
    await this.getFarmOrThrow(context, farmId);
    const parsed = validate(dto.expenseQuerySchema, query || {}, 'expense query');
    const rows = await this.store.listExpenses({ farm_id: farmId });
    return (await this.filterExpenses(rows, parsed)).map(dto.toExpenseDto);
  }

  async assertExpenseCultivation(expense, farmId) {
    if (!expense.cultivationId) return;
    const cultivation = requireRecord(
      await this.store.findCultivation(expense.cultivationId),
      'Cultivation',
    );
    if (cultivation.farm_id !== farmId) {
      throw new ValidationError({
        message: 'Cultivation must belong to the selected farm.',
        details: { field: 'cultivationId' },
      });
    }
  }

  async createExpense({ context, input, request }) {
    const value = validate(dto.expenseCreateSchema, input, 'expense input');
    const farm = await this.getFarmOrThrow(context, value.farmId);
    await this.assertExpenseCultivation(value, farm.id);
    if (value.source === 'AI_ESTIMATED') this.assertAiWrite(context);
    const now = new Date();
    const record = await this.store.createExpense({
      id: randomUUID(),
      organization_id: farm.organization_id || null,
      farm_id: farm.id,
      cultivation_id: value.cultivationId ?? null,
      category: value.category,
      source: value.source,
      expense_date: asDate(value.expenseDate),
      amount: value.amount,
      currency: value.currency,
      description: value.description ?? null,
      quantity: value.quantity ?? null,
      unit_code: value.unitCode ?? null,
      receipt_url: value.receiptUrl ?? null,
      receipt_note: value.receiptNote ?? null,
      estimate_rule_key: value.estimateRuleKey ?? null,
      confidence: value.confidence ?? null,
      created_at: now,
      updated_at: now,
    });
    const action =
      record.source === 'AI_ESTIMATED' ? EVENTS.EXPENSE_ESTIMATED : EVENTS.EXPENSE_RECORDED;
    await this.audit(
      {
        action,
        entityType: 'FarmExpense',
        entityId: record.id,
        organizationId: record.organization_id,
        after: record,
      },
      request,
    );
    return dto.toExpenseDto(record);
  }

  expenseInputFromRecord(record) {
    return {
      farmId: record.farm_id,
      organizationId: record.organization_id,
      cultivationId: record.cultivation_id,
      category: record.category,
      source: record.source,
      expenseDate: asIsoInput(record.expense_date),
      amount: Number(record.amount),
      currency: record.currency,
      description: record.description,
      quantity: record.quantity == null ? null : Number(record.quantity),
      unitCode: record.unit_code,
      receiptUrl: record.receipt_url,
      receiptNote: record.receipt_note,
      estimateRuleKey: record.estimate_rule_key,
      confidence: record.confidence == null ? null : Number(record.confidence),
    };
  }

  async updateExpense({ context, expenseId, input, request }) {
    const current = requireRecord(await this.store.findExpense(expenseId), 'Farm expense');
    const farm = await this.getFarmOrThrow(context, current.farm_id);
    const patch = validate(dto.expenseUpdateSchema, input, 'expense update');
    const merged = validate(
      dto.expenseCreateSchema,
      { ...this.expenseInputFromRecord(current), ...patch },
      'expense input',
    );
    await this.assertExpenseCultivation(merged, farm.id);
    if (merged.source === 'AI_ESTIMATED') this.assertAiWrite(context);
    const record = requireRecord(
      await this.store.updateExpense(expenseId, {
        category: merged.category,
        source: merged.source,
        expense_date: asDate(merged.expenseDate),
        amount: merged.amount,
        currency: merged.currency,
        description: merged.description ?? null,
        quantity: merged.quantity ?? null,
        unit_code: merged.unitCode ?? null,
        receipt_url: merged.receiptUrl ?? null,
        receipt_note: merged.receiptNote ?? null,
        estimate_rule_key: merged.estimateRuleKey ?? null,
        confidence: merged.confidence ?? null,
      }),
      'Farm expense',
    );
    await this.audit(
      {
        action: EVENTS.EXPENSE_UPDATED,
        entityType: 'FarmExpense',
        entityId: expenseId,
        organizationId: record.organization_id,
        before: current,
        after: record,
      },
      request,
    );
    return dto.toExpenseDto(record);
  }

  // -------------------------------------------------------------------------
  // Reports and calculation helpers
  // -------------------------------------------------------------------------

  async reportContext(farmId, query, context) {
    await this.getFarmOrThrow(context, farmId);
    const parsed = validate(dto.reportQuerySchema, query || {}, 'report query');
    const expenses = await this.filterExpenses(
      await this.store.listExpenses({ farm_id: farmId }),
      parsed,
    );
    const harvests = (await this.store.listHarvests({ farm_id: farmId })).filter((harvest) =>
      timestampInRange(harvest.harvested_at, parsed.from, parsed.to),
    );
    const cultivations = await this.store.listCultivations({ farm_id: farmId });
    return { parsed, expenses, harvests, cultivations };
  }

  async getFarmExpenseReport({ context, farmId, query }) {
    const { parsed, expenses } = await this.reportContext(farmId, query, context);
    const cost = calculateCost(expenses);
    return {
      farmId,
      from: parsed.from || null,
      to: parsed.to || null,
      sourcePolicy:
        'Recorded expenses are actual production costs; AI estimates are reported separately.',
      ...cost,
      categoryBreakdown: categoryBreakdown(expenses),
      expenses: expenses.map(dto.toExpenseDto),
    };
  }

  async getProductionCost({ context, farmId, query }) {
    const { parsed, expenses, harvests, cultivations } = await this.reportContext(
      farmId,
      query,
      context,
    );
    const summary = calculateCost(expenses);
    const byCultivation = new Map();
    for (const expense of expenses) {
      if (!expense.cultivation_id) continue;
      if (!byCultivation.has(expense.cultivation_id)) byCultivation.set(expense.cultivation_id, []);
      byCultivation.get(expense.cultivation_id).push(expense);
    }
    const harvestsByCultivation = new Map();
    for (const harvest of harvests) {
      if (!harvestsByCultivation.has(harvest.cultivation_id)) {
        harvestsByCultivation.set(harvest.cultivation_id, []);
      }
      harvestsByCultivation.get(harvest.cultivation_id).push(harvest);
    }
    const rows = cultivations.map((cultivation) => {
      const cultivationExpenses = byCultivation.get(cultivation.id) || [];
      const cost = calculateCost(cultivationExpenses);
      const yieldKg = sumYield(harvestsByCultivation.get(cultivation.id) || []);
      return {
        cultivationId: cultivation.id,
        code: cultivation.code,
        varietyId: cultivation.crop_variety_id,
        yieldKg,
        ...cost,
        costPerKg:
          cost.recordedCost !== null && yieldKg > 0
            ? roundMoney(cost.recordedCost / yieldKg)
            : null,
      };
    });
    const unallocated = expenses.filter((expense) => !expense.cultivation_id);
    return {
      farmId,
      from: parsed.from || null,
      to: parsed.to || null,
      ...summary,
      totalYieldKg: sumYield(harvests),
      unallocatedFarmCost: calculateCost(unallocated),
      cultivations: rows,
    };
  }

  async getYieldCostComparison({ context, farmId, query }) {
    const { parsed, expenses, harvests, cultivations } = await this.reportContext(
      farmId,
      query,
      context,
    );
    const expensesByCultivation = new Map();
    for (const expense of expenses) {
      if (!expense.cultivation_id) continue;
      if (!expensesByCultivation.has(expense.cultivation_id)) {
        expensesByCultivation.set(expense.cultivation_id, []);
      }
      expensesByCultivation.get(expense.cultivation_id).push(expense);
    }
    const harvestsByCultivation = new Map();
    for (const harvest of harvests) {
      if (!harvestsByCultivation.has(harvest.cultivation_id)) {
        harvestsByCultivation.set(harvest.cultivation_id, []);
      }
      harvestsByCultivation.get(harvest.cultivation_id).push(harvest);
    }
    const rows = cultivations.map((cultivation) => {
      const cost = calculateCost(expensesByCultivation.get(cultivation.id) || []);
      const actualYieldKg = sumYield(harvestsByCultivation.get(cultivation.id) || []);
      const expectedYieldKg =
        cultivation.expected_yield_kg == null ? null : roundQuantity(cultivation.expected_yield_kg);
      return {
        cultivationId: cultivation.id,
        code: cultivation.code,
        expectedYieldKg,
        actualYieldKg,
        yieldVarianceKg:
          expectedYieldKg !== null ? roundQuantity(actualYieldKg - expectedYieldKg) : null,
        recordedCost: cost.recordedCost,
        aiEstimatedCost: cost.aiEstimatedCost,
        currency: cost.currency,
        costPerKg:
          cost.recordedCost !== null && actualYieldKg > 0
            ? roundMoney(cost.recordedCost / actualYieldKg)
            : null,
      };
    });
    return {
      farmId,
      from: parsed.from || null,
      to: parsed.to || null,
      rows,
    };
  }

  async getHarvestProfitability({ context, farmId, query }) {
    const { parsed, expenses, harvests, cultivations } = await this.reportContext(
      farmId,
      query,
      context,
    );
    const expensesByCultivation = new Map();
    for (const expense of expenses) {
      if (!expense.cultivation_id) continue;
      if (!expensesByCultivation.has(expense.cultivation_id)) {
        expensesByCultivation.set(expense.cultivation_id, []);
      }
      expensesByCultivation.get(expense.cultivation_id).push(expense);
    }
    const harvestsByCultivation = new Map();
    for (const harvest of harvests) {
      if (!harvestsByCultivation.has(harvest.cultivation_id)) {
        harvestsByCultivation.set(harvest.cultivation_id, []);
      }
      harvestsByCultivation.get(harvest.cultivation_id).push(harvest);
    }
    const rows = [];
    for (const cultivation of cultivations) {
      const cultivationHarvests = harvestsByCultivation.get(cultivation.id) || [];
      if (cultivationHarvests.length === 0) continue;
      const cost = calculateCost(expensesByCultivation.get(cultivation.id) || []);
      const yieldKg = sumYield(cultivationHarvests);
      // Costs are allocated once per cultivation, never repeated per harvest.
      rows.push({
        cultivationId: cultivation.id,
        code: cultivation.code,
        harvestCount: cultivationHarvests.length,
        pricePerKg: parsed.pricePerKg ?? null,
        ...profitability({
          yieldKg,
          recordedCost: cost.recordedCost,
          pricePerKg: parsed.pricePerKg,
          currency: cost.currency,
        }),
        aiEstimatedCost: cost.aiEstimatedCost,
      });
    }
    return {
      farmId,
      from: parsed.from || null,
      to: parsed.to || null,
      note: 'Profit uses recorded costs only. AI-estimated costs are reported separately.',
      rows,
    };
  }

  async getCultivationCost({ context, cultivationId }) {
    const cultivation = requireRecord(
      await this.store.findCultivation(cultivationId),
      'Cultivation',
    );
    await this.getFarmOrThrow(context, cultivation.farm_id);
    const expenses = await this.store.listExpenses({ cultivation_id: cultivationId });
    const cost = calculateCost(expenses);
    return {
      cultivationId,
      ...cost,
      categoryBreakdown: categoryBreakdown(expenses),
      expenses: expenses.map(dto.toExpenseDto),
    };
  }
}

module.exports = {
  EVENTS,
  AgricultureService,
  AgricultureServiceToken,
};

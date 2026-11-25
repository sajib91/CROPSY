const { randomBytes } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, FarmersEntity } = require('../domain/farmers.entity');
const { FarmersRepositoryToken } = require('../domain/farmers.repository');
const { FarmStoreToken } = require('../domain/farm.repository');
const {
  assertBangladeshPoint,
  assertValidPolygon,
  pointInPolygon,
  toHectares,
} = require('../domain/farm.entity');
const { moduleInfoSchema, toModuleInfoDto } = require('./farmers.dto');
const {
  farmCreateSchema,
  farmParamsSchema,
  farmQuerySchema,
  farmUpdateSchema,
  geoParamsSchema,
  irrigationCreateSchema,
  irrigationParamsSchema,
  irrigationUpdateSchema,
  locationUpsertSchema,
  numberOrNull,
  parcelCreateSchema,
  parcelParamsSchema,
  parcelUpdateSchema,
  soilCreateSchema,
  soilUpdateSchema,
  spatialQuerySchema,
  toFarmDto,
  toFeatureCollection,
  toGeoDto,
  toIrrigationDto,
  toParcelDto,
  toSoilDto,
} = require('./farm.dto');

const FarmersServiceToken = Symbol.for('cropsy.service.farmers');

const EVENTS = Object.freeze({
  CREATED: 'farmers.farm.created',
  UPDATED: 'farmers.farm.updated',
  ARCHIVED: 'farmers.farm.archived',
  LOCATION_UPDATED: 'farmers.farm.location.updated',
  PARCEL_CREATED: 'farmers.parcel.created',
  PARCEL_UPDATED: 'farmers.parcel.updated',
  SOIL_UPDATED: 'farmers.soil.updated',
  IRRIGATION_CREATED: 'farmers.irrigation.created',
  IRRIGATION_UPDATED: 'farmers.irrigation.updated',
  COORDINATES_READ: 'farmers.coordinates.read',
  COORDINATES_DENIED: 'farmers.coordinates.denied',
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
    String(prefix || 'FARM')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6) || 'FARM';
  return `${normalized}-${randomBytes(size).toString('hex').toUpperCase()}`;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function toIsoDate(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(value);
}

class FarmersService {
  constructor({
    repository,
    eventBus,
    logger,
    metadata,
    farmStore,
    identityStore,
    authorization,
    config,
  }) {
    assertRepository(repository, ['get', 'save'], FarmersRepositoryToken);
    assertRepository(
      farmStore,
      [
        'createFarmBundle',
        'findFarmById',
        'listFarms',
        'updateFarm',
        'archiveFarm',
        'upsertLocation',
        'listParcels',
        'createParcel',
        'updateParcel',
        'upsertSoilProfile',
        'findSoilProfile',
        'listIrrigations',
        'createIrrigation',
        'updateIrrigation',
        'listDivisions',
        'listDistricts',
        'listUpazilas',
        'listUnions',
        'findGeoContext',
        'querySpatial',
      ],
      FarmStoreToken,
    );
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('FarmersService requires an event bus.');
    }
    if (!metadata) throw new TypeError('FarmersService requires module metadata.');
    for (const [name, dependency] of Object.entries({
      farmStore,
      identityStore,
      authorization,
      config,
    })) {
      if (!dependency) throw new TypeError(`FarmersService requires ${name}.`);
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.farmStore = farmStore;
    this.identityStore = identityStore;
    this.authorization = authorization;
    this.config = config;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new FarmersEntity();
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
    return validate(moduleInfoSchema, dto, 'farmers module info');
  }

  async audit(
    {
      action,
      entityType,
      entityId,
      actorUserId = null,
      organizationId = null,
      before = undefined,
      after = {},
      severity = 'INFO',
    },
    request,
  ) {
    const meta = requestMeta(request);
    const entry = {
      action,
      entityType,
      entityId: entityId || null,
      actorUserId,
      organizationId,
      before: before === undefined ? undefined : before,
      after: { ...after, ...(meta.requestId ? { requestId: meta.requestId } : {}) },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      severity,
    };
    await this.identityStore.appendAudit(entry);
    this.eventBus?.publish({
      type: action,
      moduleId: MODULE_ID,
      aggregateId: actorUserId || entityId || 'anonymous',
      payload: entry.after,
    });
    return entry;
  }

  publish(type, payload, entityId) {
    this.eventBus.publish({
      type,
      moduleId: MODULE_ID,
      aggregateId: entityId || payload?.farmId || 'anonymous',
      payload,
    });
  }

  async getFarmOrThrow(farmId) {
    const farm = await this.farmStore.findFarmById(farmId);
    if (!farm) throw new NotFoundError({ message: 'Farm was not found.' });
    return farm;
  }

  async assertFarmRead(context, farm) {
    if (context.isSuperAdmin) return;
    if (farm.owner_user_id === context.user.id) return;
    if (farm.organization_id) {
      await this.authorization.assertOrganization(context, farm.organization_id);
    }
    if (!context.permissions.includes('farms.read')) {
      throw new ForbiddenError({ message: "Missing required permission 'farms.read'." });
    }
  }

  async assertFarmWrite(context, farm) {
    if (context.isSuperAdmin) return;
    if (farm.owner_user_id === context.user.id) return;
    if (farm.organization_id) {
      await this.authorization.assertOrganization(context, farm.organization_id);
      if (!context.permissions.includes('farms.manage')) {
        throw new ForbiddenError({ message: "Missing required permission 'farms.manage'." });
      }
      return;
    }
    throw new ForbiddenError({
      message: 'Access to this farm is denied.',
      details: { code: 'farm_access_denied' },
    });
  }

  canAccessCoordinates(context, farm) {
    if (context.isSuperAdmin) return true;
    if (farm.owner_user_id === context.user.id) return true;
    return Boolean(
      farm.organization_id &&
      context.organizationId === farm.organization_id &&
      context.organizationIds.includes(farm.organization_id) &&
      context.permissions.includes('farms.read'),
    );
  }

  async assertCoordinateAccess(context, farm, request) {
    if (this.canAccessCoordinates(context, farm)) return true;
    await this.audit(
      {
        action: EVENTS.COORDINATES_DENIED,
        entityType: 'farm',
        entityId: farm.id,
        actorUserId: context.user.id,
        organizationId: farm.organization_id,
        after: { reason: 'private_coordinates' },
        severity: 'WARN',
      },
      request,
    );
    throw new ForbiddenError({
      message: 'Private farm coordinates are not available to this account.',
      details: { code: 'private_farm_coordinates' },
    });
  }

  async validateOperator(operatorUserId, organizationId) {
    if (!operatorUserId) return;
    const user = await this.identityStore.findUserById(operatorUserId);
    if (!user) {
      throw new ValidationError({ message: 'The selected operator user was not found.' });
    }
    if (organizationId) {
      const memberships = await this.identityStore.listOrganizationMemberships(operatorUserId);
      if (!memberships.some((membership) => membership.organization_id === organizationId)) {
        throw new ValidationError({
          message: 'The selected operator must be an active member of the farm organization.',
        });
      }
    }
  }

  async prepareLocation(input) {
    const geo = await this.farmStore.findGeoContext({
      divisionId: input.divisionId,
      districtId: input.districtId,
      upazilaId: input.upazilaId,
      unionId: input.unionId,
    });
    if (!geo || geo.country_code !== 'BD') {
      throw new ValidationError({
        message: 'The Bangladesh administrative chain is invalid.',
        details: { code: 'invalid_bangladesh_admin_chain' },
      });
    }
    if (input.point) assertBangladeshPoint(input.point, 'Farm location');
    if (input.boundary) assertValidPolygon(input.boundary, 'Farm boundary');
    if (input.point && input.boundary && !pointInPolygon(input.point, input.boundary)) {
      throw new ValidationError({
        message: 'The farm coordinate must fall inside its declared boundary.',
      });
    }
    return {
      record: {
        address_line: input.addressLine,
        division_id: input.divisionId,
        district_id: input.districtId,
        upazila_id: input.upazilaId,
        union_id: input.unionId,
        point: input.point || null,
        boundary: input.boundary || null,
      },
      geo,
    };
  }

  prepareParcel(input, organizationId) {
    const codeValue = input.code || generateCode(input.name || 'PARCEL', 4);
    return {
      code: codeValue,
      organization_id: organizationId || null,
      name: input.name || null,
      area_unit: input.areaUnit,
      area_value: input.areaValue,
      area_hectares: toHectares(input.areaValue, input.areaUnit),
      ownership_type: input.ownershipType,
      status: input.status,
      boundary: input.boundary || null,
    };
  }

  prepareSoil(input, organizationId) {
    return {
      organization_id: organizationId || null,
      soil_type: input.soilType,
      texture: input.texture,
      ph: input.ph ?? null,
      organic_matter_percent: input.organicMatterPercent ?? null,
      fertility: input.fertility,
      drainage: input.drainage || null,
      tested_at: toIsoDate(input.testedAt),
      testing_lab: input.testingLab || null,
      notes: input.notes || null,
    };
  }

  prepareIrrigation(input, organizationId) {
    return {
      code: input.code || generateCode('IRR', 4),
      organization_id: organizationId || null,
      source: input.source,
      method: input.method,
      status: input.status,
      capacity_liters_per_minute: input.capacityLitersPerMinute ?? null,
      command_area_hectares: input.commandAreaHectares ?? null,
      frequency_per_week: input.frequencyPerWeek ?? null,
      notes: input.notes || null,
    };
  }

  async farmPatch(input, current) {
    const patch = {};
    const mapping = {
      name: 'name',
      description: 'description',
      farmType: 'farm_type',
      areaUnit: 'area_unit',
      areaValue: 'area_value',
      ownershipType: 'ownership_type',
      ownershipReference: 'ownership_reference',
      operatorUserId: 'operator_user_id',
      operatorName: 'operator_name',
      operatorPhone: 'operator_phone',
      operatorEmail: 'operator_email',
      operatingSince: 'operating_since',
    };
    for (const [key, column] of Object.entries(mapping)) {
      if (hasOwn(input, key)) patch[column] = input[key];
    }
    if (hasOwn(patch, 'operating_since')) {
      patch.operating_since = toIsoDate(patch.operating_since);
    }
    if (hasOwn(patch, 'area_value')) {
      const unit = patch.area_unit || current.area_unit;
      patch.total_area_hectares = toHectares(patch.area_value, unit);
    } else if (hasOwn(patch, 'area_unit')) {
      patch.total_area_hectares = toHectares(current.area_value, patch.area_unit);
    }
    return patch;
  }

  async listFarms({ context, query = {} }) {
    const filter = validate(farmQuerySchema, query, 'farm query');
    if (filter.organizationId) {
      await this.authorization.assertOrganization(context, filter.organizationId);
    }
    if (context.isSuperAdmin && !filter.organizationId) {
      return (await this.farmStore.listFarms(filter)).map((farm) => toFarmDto(farm));
    }

    const filters = {
      status: filter.status,
      includeArchived: filter.includeArchived,
    };
    const scopeOrganization = filter.organizationId || context.organizationId;
    const collections = [];
    if (scopeOrganization) {
      collections.push(
        await this.farmStore.listFarms({ ...filters, organizationId: scopeOrganization }),
      );
    }
    collections.push(await this.farmStore.listFarms({ ...filters, ownerUserId: context.user.id }));
    const byId = new Map();
    for (const farm of collections.flat()) byId.set(farm.id, farm);
    return [...byId.values()]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((farm) => toFarmDto(farm));
  }

  async createFarm({ context, input, request }) {
    const data = validate(farmCreateSchema, input, 'farm registration');
    const organizationId = data.organizationId || null;
    if (organizationId) await this.authorization.assertOrganization(context, organizationId);
    await this.validateOperator(data.operatorUserId, organizationId);

    const preparedLocation = data.location ? await this.prepareLocation(data.location) : null;
    for (const parcel of data.parcels || []) {
      if (parcel.boundary) assertValidPolygon(parcel.boundary, 'Parcel boundary');
    }

    let farm;
    try {
      farm = await this.farmStore.createFarmBundle({
        farm: {
          organization_id: organizationId,
          owner_user_id: context.user.id,
          name: data.name,
          description: data.description || null,
          code: data.code || generateCode(data.name),
          farm_type: data.farmType,
          area_unit: data.areaUnit,
          area_value: data.areaValue,
          total_area_hectares: toHectares(data.areaValue, data.areaUnit),
          ownership_type: data.ownershipType,
          ownership_reference: data.ownershipReference || null,
          operator_user_id: data.operatorUserId || null,
          operator_name: data.operatorName || null,
          operator_phone: data.operatorPhone || null,
          operator_email: data.operatorEmail || null,
          operating_since: toIsoDate(data.operatingSince),
        },
        location: preparedLocation?.record,
        parcels: (data.parcels || []).map((parcel) => this.prepareParcel(parcel, organizationId)),
        soilProfile: data.soilProfile ? this.prepareSoil(data.soilProfile, organizationId) : null,
        irrigations: (data.irrigations || []).map((irrigation) =>
          this.prepareIrrigation(irrigation, organizationId),
        ),
      });
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      throw error;
    }

    await this.audit(
      {
        action: EVENTS.CREATED,
        entityType: 'farm',
        entityId: farm.id,
        actorUserId: context.user.id,
        organizationId,
        after: {
          name: farm.name,
          code: farm.code,
          areaHectares: farm.total_area_hectares,
          division: preparedLocation?.geo?.division?.name || null,
          district: preparedLocation?.geo?.district?.name || null,
        },
      },
      request,
    );
    this.publish(EVENTS.CREATED, { farmId: farm.id, organizationId, name: farm.name }, farm.id);
    return toFarmDto(farm, { includeCoordinates: true });
  }

  async getFarm({ context, farmId }) {
    const { farmId: id } = validate(farmParamsSchema, { farmId }, 'farm id');
    const farm = await this.getFarmOrThrow(id);
    await this.assertFarmRead(context, farm);
    const includeCoordinates = this.canAccessCoordinates(context, farm);
    return toFarmDto(farm, { includeCoordinates });
  }

  async updateFarm({ context, farmId, input, request }) {
    const { farmId: id } = validate(farmParamsSchema, { farmId }, 'farm id');
    const current = await this.getFarmOrThrow(id);
    await this.assertFarmWrite(context, current);
    const data = validate(farmUpdateSchema, input, 'farm update');
    if (Object.keys(data).length === 0) {
      throw new ValidationError({ message: 'No farm fields were supplied.' });
    }
    if (hasOwn(data, 'operatorUserId')) {
      await this.validateOperator(data.operatorUserId, current.organization_id);
    }
    const patch = await this.farmPatch(data, current);
    let updated;
    try {
      updated = await this.farmStore.updateFarm(id, patch);
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      throw error;
    }
    await this.audit(
      {
        action: EVENTS.UPDATED,
        entityType: 'farm',
        entityId: id,
        actorUserId: context.user.id,
        organizationId: current.organization_id,
        before: toFarmDto(current),
        after: toFarmDto(updated),
      },
      request,
    );
    this.publish(EVENTS.UPDATED, { farmId: id, fields: Object.keys(patch) }, id);
    return toFarmDto(updated, { includeCoordinates: this.canAccessCoordinates(context, updated) });
  }

  async archiveFarm({ context, farmId, request }) {
    const { farmId: id } = validate(farmParamsSchema, { farmId }, 'farm id');
    const current = await this.getFarmOrThrow(id);
    await this.assertFarmWrite(context, current);
    const updated = await this.farmStore.archiveFarm(id);
    await this.audit(
      {
        action: EVENTS.ARCHIVED,
        entityType: 'farm',
        entityId: id,
        actorUserId: context.user.id,
        organizationId: current.organization_id,
        before: { status: current.status },
        after: { status: updated.status },
      },
      request,
    );
    this.publish(EVENTS.ARCHIVED, { farmId: id, status: updated.status }, id);
    return toFarmDto(updated, { includeCoordinates: this.canAccessCoordinates(context, updated) });
  }

  async upsertLocation({ context, farmId, input, request }) {
    const { farmId: id } = validate(farmParamsSchema, { farmId }, 'farm id');
    const farm = await this.getFarmOrThrow(id);
    await this.assertFarmWrite(context, farm);
    const data = validate(locationUpsertSchema, input, 'farm location');
    const prepared = await this.prepareLocation(data);
    await this.farmStore.upsertLocation(id, prepared.record);
    const updated = await this.getFarmOrThrow(id);
    await this.audit(
      {
        action: EVENTS.LOCATION_UPDATED,
        entityType: 'farm_location',
        entityId: id,
        actorUserId: context.user.id,
        organizationId: farm.organization_id,
        after: {
          addressLine: data.addressLine,
          division: prepared.geo.division.name,
          district: prepared.geo.district.name,
          hasCoordinates: Boolean(prepared.record.point),
          hasBoundary: Boolean(prepared.record.boundary),
        },
      },
      request,
    );
    this.publish(EVENTS.LOCATION_UPDATED, { farmId: id }, id);
    return toFarmDto(updated, { includeCoordinates: true });
  }

  async listParcels({ context, farmId }) {
    const { farmId: id } = validate(farmParamsSchema, { farmId }, 'farm id');
    const farm = await this.getFarmOrThrow(id);
    await this.assertFarmRead(context, farm);
    const includeCoordinates = this.canAccessCoordinates(context, farm);
    const parcels = await this.farmStore.listParcels(id);
    return parcels.map((parcel) => toParcelDto(parcel, includeCoordinates));
  }

  async addParcel({ context, farmId, input, request }) {
    const { farmId: id } = validate(farmParamsSchema, { farmId }, 'farm id');
    const farm = await this.getFarmOrThrow(id);
    await this.assertFarmWrite(context, farm);
    const data = validate(parcelCreateSchema, input, 'land parcel');
    if (data.boundary) assertValidPolygon(data.boundary, 'Parcel boundary');
    const parcel = await this.farmStore.createParcel(
      id,
      this.prepareParcel(data, farm.organization_id),
    );
    await this.audit(
      {
        action: EVENTS.PARCEL_CREATED,
        entityType: 'land_parcel',
        entityId: parcel.id,
        actorUserId: context.user.id,
        organizationId: farm.organization_id,
        after: { farmId: id, code: parcel.code, areaHectares: parcel.area_hectares },
      },
      request,
    );
    this.publish(EVENTS.PARCEL_CREATED, { farmId: id, parcelId: parcel.id }, id);
    return toParcelDto(parcel, this.canAccessCoordinates(context, farm));
  }

  async updateParcel({ context, farmId, parcelId, input, request }) {
    const params = validate(parcelParamsSchema, { farmId, parcelId }, 'parcel id');
    const farm = await this.getFarmOrThrow(params.farmId);
    await this.assertFarmWrite(context, farm);
    const parcels = await this.farmStore.listParcels(params.farmId);
    const current = parcels.find((parcel) => parcel.id === params.parcelId);
    if (!current) throw new NotFoundError({ message: 'Land parcel was not found.' });
    const data = validate(parcelUpdateSchema, input, 'land parcel update');
    if (Object.keys(data).length === 0) {
      throw new ValidationError({ message: 'No parcel fields were supplied.' });
    }
    if (data.boundary) assertValidPolygon(data.boundary, 'Parcel boundary');
    const patch = {};
    for (const [key, column] of Object.entries({
      name: 'name',
      areaUnit: 'area_unit',
      areaValue: 'area_value',
      ownershipType: 'ownership_type',
      status: 'status',
      boundary: 'boundary',
    })) {
      if (hasOwn(data, key)) patch[column] = data[key];
    }
    const unit = patch.area_unit || current.area_unit;
    const value = patch.area_value ?? current.area_value;
    if (hasOwn(patch, 'area_value') || hasOwn(patch, 'area_unit')) {
      patch.area_hectares = toHectares(value, unit);
    }
    const updated = await this.farmStore.updateParcel(params.parcelId, patch);
    await this.audit(
      {
        action: EVENTS.PARCEL_UPDATED,
        entityType: 'land_parcel',
        entityId: params.parcelId,
        actorUserId: context.user.id,
        organizationId: farm.organization_id,
        before: toParcelDto(current),
        after: toParcelDto(updated),
      },
      request,
    );
    this.publish(
      EVENTS.PARCEL_UPDATED,
      { farmId: params.farmId, parcelId: params.parcelId },
      params.farmId,
    );
    return toParcelDto(updated, this.canAccessCoordinates(context, farm));
  }

  async upsertSoil({ context, farmId, input, request }) {
    const { farmId: id } = validate(farmParamsSchema, { farmId }, 'farm id');
    const farm = await this.getFarmOrThrow(id);
    await this.assertFarmWrite(context, farm);
    const data = validate(soilCreateSchema, input, 'soil information');
    const record = await this.farmStore.upsertSoilProfile(
      id,
      this.prepareSoil(data, farm.organization_id),
    );
    await this.audit(
      {
        action: EVENTS.SOIL_UPDATED,
        entityType: 'farm_soil_profile',
        entityId: record.id,
        actorUserId: context.user.id,
        organizationId: farm.organization_id,
        after: { farmId: id, soilType: record.soil_type, fertility: record.fertility },
      },
      request,
    );
    this.publish(EVENTS.SOIL_UPDATED, { farmId: id, soilType: record.soil_type }, id);
    return toSoilDto(record);
  }

  async updateSoil({ context, farmId, input, request }) {
    const { farmId: id } = validate(farmParamsSchema, { farmId }, 'farm id');
    const farm = await this.getFarmOrThrow(id);
    await this.assertFarmWrite(context, farm);
    const current = await this.farmStore.findSoilProfile(id);
    if (!current) throw new NotFoundError({ message: 'Soil information was not found.' });
    const data = validate(soilUpdateSchema, input, 'soil information update');
    if (Object.keys(data).length === 0) {
      throw new ValidationError({ message: 'No soil fields were supplied.' });
    }
    const merged = {
      soilType: data.soilType ?? current.soil_type,
      texture: data.texture ?? current.texture,
      ph: hasOwn(data, 'ph') ? data.ph : numberOrNull(current.ph),
      organicMatterPercent: hasOwn(data, 'organicMatterPercent')
        ? data.organicMatterPercent
        : numberOrNull(current.organic_matter_percent),
      fertility: data.fertility ?? current.fertility,
      drainage: hasOwn(data, 'drainage') ? data.drainage : current.drainage,
      testedAt: hasOwn(data, 'testedAt') ? data.testedAt : current.tested_at,
      testingLab: hasOwn(data, 'testingLab') ? data.testingLab : current.testing_lab,
      notes: hasOwn(data, 'notes') ? data.notes : current.notes,
    };
    return this.upsertSoil({ context, farmId, input: merged, request });
  }

  async getSoil({ context, farmId }) {
    const { farmId: id } = validate(farmParamsSchema, { farmId }, 'farm id');
    const farm = await this.getFarmOrThrow(id);
    await this.assertFarmRead(context, farm);
    const profile = await this.farmStore.findSoilProfile(id);
    if (!profile) throw new NotFoundError({ message: 'Soil information was not found.' });
    return toSoilDto(profile);
  }

  async listIrrigations({ context, farmId }) {
    const { farmId: id } = validate(farmParamsSchema, { farmId }, 'farm id');
    const farm = await this.getFarmOrThrow(id);
    await this.assertFarmRead(context, farm);
    return (await this.farmStore.listIrrigations(id)).map(toIrrigationDto);
  }

  async addIrrigation({ context, farmId, input, request }) {
    const { farmId: id } = validate(farmParamsSchema, { farmId }, 'farm id');
    const farm = await this.getFarmOrThrow(id);
    await this.assertFarmWrite(context, farm);
    const data = validate(irrigationCreateSchema, input, 'irrigation information');
    const record = await this.farmStore.createIrrigation(
      id,
      this.prepareIrrigation(data, farm.organization_id),
    );
    await this.audit(
      {
        action: EVENTS.IRRIGATION_CREATED,
        entityType: 'farm_irrigation',
        entityId: record.id,
        actorUserId: context.user.id,
        organizationId: farm.organization_id,
        after: { farmId: id, code: record.code, source: record.source, method: record.method },
      },
      request,
    );
    this.publish(EVENTS.IRRIGATION_CREATED, { farmId: id, irrigationId: record.id }, id);
    return toIrrigationDto(record);
  }

  async updateIrrigation({ context, farmId, irrigationId, input, request }) {
    const params = validate(irrigationParamsSchema, { farmId, irrigationId }, 'irrigation id');
    const farm = await this.getFarmOrThrow(params.farmId);
    await this.assertFarmWrite(context, farm);
    const existing = (await this.farmStore.listIrrigations(params.farmId)).find(
      (item) => item.id === params.irrigationId,
    );
    if (!existing) throw new NotFoundError({ message: 'Irrigation record was not found.' });
    const data = validate(irrigationUpdateSchema, input, 'irrigation update');
    if (Object.keys(data).length === 0) {
      throw new ValidationError({ message: 'No irrigation fields were supplied.' });
    }
    const patch = {};
    for (const [key, column] of Object.entries({
      source: 'source',
      method: 'method',
      status: 'status',
      capacityLitersPerMinute: 'capacity_liters_per_minute',
      commandAreaHectares: 'command_area_hectares',
      frequencyPerWeek: 'frequency_per_week',
      notes: 'notes',
    })) {
      if (hasOwn(data, key)) patch[column] = data[key];
    }
    const updated = await this.farmStore.updateIrrigation(params.irrigationId, patch);
    await this.audit(
      {
        action: EVENTS.IRRIGATION_UPDATED,
        entityType: 'farm_irrigation',
        entityId: params.irrigationId,
        actorUserId: context.user.id,
        organizationId: farm.organization_id,
        before: toIrrigationDto(existing),
        after: toIrrigationDto(updated),
      },
      request,
    );
    this.publish(
      EVENTS.IRRIGATION_UPDATED,
      { farmId: params.farmId, irrigationId: params.irrigationId },
      params.farmId,
    );
    return toIrrigationDto(updated);
  }

  async getCoordinates({ context, farmId, request }) {
    const { farmId: id } = validate(farmParamsSchema, { farmId }, 'farm id');
    const farm = await this.getFarmOrThrow(id);
    await this.assertFarmRead(context, farm);
    await this.assertCoordinateAccess(context, farm, request);
    const location = farm.location;
    if (!location?.point && !location?.boundary) {
      throw new NotFoundError({ message: 'No geo coordinates are recorded for this farm.' });
    }
    await this.audit(
      {
        action: EVENTS.COORDINATES_READ,
        entityType: 'farm_location',
        entityId: id,
        actorUserId: context.user.id,
        organizationId: farm.organization_id,
        after: {
          farmId: id,
          hadPoint: Boolean(location.point),
          hadBoundary: Boolean(location.boundary),
        },
      },
      request,
    );
    return {
      farmId: id,
      coordinates: location.point ? { type: 'Point', coordinates: [...location.point] } : null,
      boundary: location.boundary
        ? { type: 'Polygon', coordinates: [location.boundary.map((point) => [...point])] }
        : null,
    };
  }

  async getMap({ context, query = {} }) {
    const filter = validate(farmQuerySchema, query, 'farm map query');
    const farms = await this.accessibleFarms(context, filter);
    const visible = farms.filter(
      (farm) =>
        this.canAccessCoordinates(context, farm) &&
        Boolean(farm.location?.point || farm.location?.boundary),
    );
    return toFeatureCollection(visible);
  }

  async querySpatial({ context, query = {} }) {
    const filter = validate(spatialQuerySchema, query, 'spatial query');
    let spatialQuery;
    if (filter.mode === 'bbox') {
      for (const key of ['minLng', 'minLat', 'maxLng', 'maxLat']) {
        if (filter[key] === undefined) {
          throw new ValidationError({ message: `bbox queries require ${key}.` });
        }
      }
      const corners = [
        [filter.minLng, filter.minLat],
        [filter.maxLng, filter.maxLat],
      ];
      corners.forEach((corner) => assertBangladeshPoint(corner, 'Bounding box'));
      if (filter.minLng >= filter.maxLng || filter.minLat >= filter.maxLat) {
        throw new ValidationError({ message: 'Bounding box boundaries are invalid.' });
      }
      spatialQuery = {
        mode: 'bbox',
        bbox: {
          minLng: filter.minLng,
          minLat: filter.minLat,
          maxLng: filter.maxLng,
          maxLat: filter.maxLat,
        },
        includeArchived: filter.includeArchived,
      };
    } else if (filter.mode === 'near') {
      if (
        filter.lng === undefined ||
        filter.lat === undefined ||
        filter.radiusMeters === undefined
      ) {
        throw new ValidationError({ message: 'near queries require lng, lat, and radiusMeters.' });
      }
      assertBangladeshPoint([filter.lng, filter.lat], 'Search origin');
      spatialQuery = {
        mode: 'near',
        point: [filter.lng, filter.lat],
        radiusMeters: filter.radiusMeters,
        includeArchived: filter.includeArchived,
      };
    } else {
      if (!filter.polygon) {
        throw new ValidationError({ message: 'within queries require a polygon.' });
      }
      let polygon;
      try {
        polygon = JSON.parse(filter.polygon);
      } catch {
        throw new ValidationError({ message: 'Spatial polygon must be valid JSON.' });
      }
      assertValidPolygon(polygon, 'Spatial polygon');
      spatialQuery = {
        mode: 'within',
        polygon,
        includeArchived: filter.includeArchived,
      };
    }

    const candidates = await this.farmStore.querySpatial(spatialQuery);
    const accessible = await this.accessibleFarms(context, {
      organizationId: filter.organizationId,
      status: filter.status,
      includeArchived: filter.includeArchived,
    });
    const allowed = new Set(accessible.map((farm) => farm.id));
    return {
      mode: spatialQuery.mode,
      farms: candidates.filter((farm) => allowed.has(farm.id)).map((farm) => toFarmDto(farm)),
    };
  }

  async accessibleFarms(context, filter = {}) {
    if (filter.organizationId) {
      await this.authorization.assertOrganization(context, filter.organizationId);
    }
    if (context.isSuperAdmin && !filter.organizationId) {
      return this.farmStore.listFarms({
        status: filter.status,
        includeArchived: filter.includeArchived,
      });
    }
    const base = { status: filter.status, includeArchived: filter.includeArchived };
    const scopeOrganization = filter.organizationId || context.organizationId;
    const collections = [];
    if (scopeOrganization) {
      collections.push(
        await this.farmStore.listFarms({ ...base, organizationId: scopeOrganization }),
      );
    }
    collections.push(await this.farmStore.listFarms({ ...base, ownerUserId: context.user.id }));
    const byId = new Map();
    for (const farm of collections.flat()) byId.set(farm.id, farm);
    return [...byId.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async listDivisions() {
    return (await this.farmStore.listDivisions()).map(toGeoDto);
  }

  async listDistricts({ divisionId }) {
    const { id } = validate(geoParamsSchema, { id: divisionId }, 'division id');
    return (await this.farmStore.listDistricts(id)).map(toGeoDto);
  }

  async listUpazilas({ districtId }) {
    const { id } = validate(geoParamsSchema, { id: districtId }, 'district id');
    return (await this.farmStore.listUpazilas(id)).map(toGeoDto);
  }

  async listUnions({ upazilaId }) {
    const { id } = validate(geoParamsSchema, { id: upazilaId }, 'upazila id');
    return (await this.farmStore.listUnions(id)).map(toGeoDto);
  }
}

module.exports = { FarmersService, FarmersServiceToken, EVENTS };

const { isoDateTime, z } = require('@cropsy/validation');

const {
  AREA_UNITS,
  FARM_STATUSES,
  FARM_TYPES,
  IRRIGATION_METHODS,
  IRRIGATION_SOURCES,
  IRRIGATION_STATUSES,
  LAND_OWNERSHIP_TYPES,
  LAND_PARCEL_STATUSES,
  SOIL_FERTILITY_LEVELS,
  SOIL_TEXTURES,
  isBangladeshPoint,
  isValidPolygon,
} = require('../domain/farm.entity');

const uuid = z.string().uuid();
const shortText = z.string().trim().min(1).max(180);
const longText = z.string().trim().max(4000);
const code = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Z0-9_-]+$/i, 'Code may contain letters, digits, underscores, and hyphens.');
const areaValue = z.number().min(0).max(1e9);
const nullableText = (schema, max = 180) => schema.trim().max(max).nullable().optional();

const pointSchema = z
  .tuple([z.number(), z.number()])
  .refine(isBangladeshPoint, 'Coordinate must be inside Bangladesh.');

const polygonSchema = z
  .array(pointSchema)
  .min(4)
  .max(512)
  .refine(isValidPolygon, 'Boundary must be a closed, simple polygon inside Bangladesh.');

const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'));

const areaUnitSchema = z.enum(AREA_UNITS);
const farmTypeSchema = z.enum(FARM_TYPES);
const farmStatusSchema = z.enum(FARM_STATUSES);
const ownershipTypeSchema = z.enum(LAND_OWNERSHIP_TYPES);
const parcelStatusSchema = z.enum(LAND_PARCEL_STATUSES);
const soilTextureSchema = z.enum(SOIL_TEXTURES);
const soilFertilitySchema = z.enum(SOIL_FERTILITY_LEVELS);
const irrigationSourceSchema = z.enum(IRRIGATION_SOURCES);
const irrigationMethodSchema = z.enum(IRRIGATION_METHODS);
const irrigationStatusSchema = z.enum(IRRIGATION_STATUSES);

const locationUpsertSchema = z
  .object({
    addressLine: z.string().trim().min(1).max(255),
    divisionId: uuid,
    districtId: uuid,
    upazilaId: uuid,
    unionId: uuid,
    point: pointSchema.nullable().optional(),
    boundary: polygonSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.point || value.boundary), {
    message: 'A location must include coordinates, a boundary, or both.',
  });

const parcelCreateSchema = z
  .object({
    code: code.optional(),
    name: nullableText(shortText),
    areaUnit: areaUnitSchema.default('HECTARE'),
    areaValue: areaValue.refine((value) => value > 0, 'Parcel area must be greater than zero.'),
    ownershipType: ownershipTypeSchema.default('OWNED'),
    status: parcelStatusSchema.default('AVAILABLE'),
    boundary: polygonSchema.nullable().optional(),
  })
  .strict();

const parcelUpdateSchema = z
  .object({
    name: nullableText(shortText),
    areaUnit: areaUnitSchema.optional(),
    areaValue: areaValue
      .refine((value) => value > 0, 'Parcel area must be greater than zero.')
      .optional(),
    ownershipType: ownershipTypeSchema.optional(),
    status: parcelStatusSchema.optional(),
    boundary: polygonSchema.nullable().optional(),
  })
  .strict();

const soilCreateSchema = z
  .object({
    soilType: shortText,
    texture: soilTextureSchema.default('OTHER'),
    ph: z.number().min(0).max(14).nullable().optional(),
    organicMatterPercent: z.number().min(0).max(100).nullable().optional(),
    fertility: soilFertilitySchema.default('UNKNOWN'),
    drainage: nullableText(shortText),
    testedAt: isoDateTime.nullable().optional(),
    testingLab: nullableText(shortText),
    notes: nullableText(longText, 4000),
  })
  .strict();

const soilUpdateSchema = soilCreateSchema.partial();

const irrigationCreateSchema = z
  .object({
    code: code.optional(),
    source: irrigationSourceSchema,
    method: irrigationMethodSchema,
    status: irrigationStatusSchema.default('ACTIVE'),
    capacityLitersPerMinute: z.number().min(0).max(1e9).nullable().optional(),
    commandAreaHectares: z.number().min(0).max(1e9).nullable().optional(),
    frequencyPerWeek: z.number().int().min(0).max(21).nullable().optional(),
    notes: nullableText(longText, 4000),
  })
  .strict();

const irrigationUpdateSchema = irrigationCreateSchema.partial().omit({ code: true });

const farmCreateSchema = z
  .object({
    name: shortText,
    description: longText.nullable().optional(),
    code: code.optional(),
    organizationId: uuid.nullable().optional(),
    farmType: farmTypeSchema.default('OTHER'),
    areaUnit: areaUnitSchema.default('HECTARE'),
    areaValue: areaValue.default(0),
    ownershipType: ownershipTypeSchema.default('OWNED'),
    ownershipReference: nullableText(shortText),
    operatorUserId: uuid.nullable().optional(),
    operatorName: nullableText(shortText),
    operatorPhone: nullableText(z.string().trim().min(1).max(32)),
    operatorEmail: z.string().trim().email().max(255).nullable().optional(),
    operatingSince: isoDateTime.nullable().optional(),
    location: locationUpsertSchema.optional(),
    parcels: z.array(parcelCreateSchema).max(100).optional(),
    soilProfile: soilCreateSchema.optional(),
    irrigations: z.array(irrigationCreateSchema).max(50).optional(),
  })
  .strict();

const farmUpdateSchema = z
  .object({
    name: shortText.optional(),
    description: longText.nullable().optional(),
    farmType: farmTypeSchema.optional(),
    areaUnit: areaUnitSchema.optional(),
    areaValue: areaValue.optional(),
    ownershipType: ownershipTypeSchema.optional(),
    ownershipReference: nullableText(shortText),
    operatorUserId: uuid.nullable().optional(),
    operatorName: nullableText(shortText),
    operatorPhone: nullableText(z.string().trim().min(1).max(32)),
    operatorEmail: z.string().trim().email().max(255).nullable().optional(),
    operatingSince: isoDateTime.nullable().optional(),
  })
  .strict();

const farmQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    status: farmStatusSchema.optional(),
    includeArchived: booleanQuery.default(false),
  })
  .strict();

const spatialQuerySchema = z
  .object({
    mode: z.enum(['bbox', 'near', 'within']).default('bbox'),
    minLng: z.coerce.number().optional(),
    minLat: z.coerce.number().optional(),
    maxLng: z.coerce.number().optional(),
    maxLat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    lat: z.coerce.number().optional(),
    radiusMeters: z.coerce.number().min(1).max(50000).optional(),
    polygon: z.string().trim().min(1).optional(),
    organizationId: uuid.optional(),
    status: farmStatusSchema.optional(),
    includeArchived: booleanQuery.default(false),
  })
  .strict();

const geoParamsSchema = z.object({ id: uuid });
const farmParamsSchema = z.object({ farmId: uuid });
const parcelParamsSchema = z.object({ farmId: uuid, parcelId: uuid });
const irrigationParamsSchema = z.object({ farmId: uuid, irrigationId: uuid });

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function numberOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

function toAdminDto(admin) {
  if (!admin) return null;
  return {
    id: admin.id,
    code: admin.code,
    name: admin.name,
    nameBn: admin.name_bn || null,
  };
}

function toLocationDto(location, includeCoordinates) {
  if (!location) return null;
  const dto = {
    addressLine: location.address_line,
    division: toAdminDto(location.division),
    district: toAdminDto(location.district),
    upazila: toAdminDto(location.upazila),
    union: toAdminDto(location.union),
    hasCoordinates: Boolean(location.point),
    hasBoundary: Boolean(location.boundary),
  };
  if (includeCoordinates) {
    dto.coordinates = location.point ? { type: 'Point', coordinates: [...location.point] } : null;
    dto.boundary = location.boundary
      ? { type: 'Polygon', coordinates: [location.boundary.map((point) => [...point])] }
      : null;
  }
  return dto;
}

function toParcelDto(parcel, includeCoordinates) {
  const dto = {
    id: parcel.id,
    code: parcel.code,
    name: parcel.name || null,
    area: {
      value: Number(parcel.area_value),
      unit: parcel.area_unit,
      hectares: Number(parcel.area_hectares),
    },
    ownershipType: parcel.ownership_type,
    status: parcel.status,
    hasBoundary: Boolean(parcel.boundary),
    createdAt: iso(parcel.created_at),
    updatedAt: iso(parcel.updated_at),
  };
  if (includeCoordinates) {
    dto.boundary = parcel.boundary
      ? { type: 'Polygon', coordinates: [parcel.boundary.map((point) => [...point])] }
      : null;
  }
  return dto;
}

function toSoilDto(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    soilType: profile.soil_type,
    texture: profile.texture,
    ph: numberOrNull(profile.ph),
    organicMatterPercent: numberOrNull(profile.organic_matter_percent),
    fertility: profile.fertility,
    drainage: profile.drainage || null,
    testedAt: iso(profile.tested_at),
    testingLab: profile.testing_lab || null,
    notes: profile.notes || null,
  };
}

function toIrrigationDto(irrigation) {
  return {
    id: irrigation.id,
    code: irrigation.code,
    source: irrigation.source,
    method: irrigation.method,
    status: irrigation.status,
    capacityLitersPerMinute: numberOrNull(irrigation.capacity_liters_per_minute),
    commandAreaHectares: numberOrNull(irrigation.command_area_hectares),
    frequencyPerWeek: irrigation.frequency_per_week ?? null,
    notes: irrigation.notes || null,
    createdAt: iso(irrigation.created_at),
    updatedAt: iso(irrigation.updated_at),
  };
}

function toFarmDto(farm, { includeCoordinates = false } = {}) {
  return {
    id: farm.id,
    organizationId: farm.organization_id || null,
    ownerUserId: farm.owner_user_id,
    name: farm.name,
    description: farm.description || null,
    code: farm.code,
    farmType: farm.farm_type,
    status: farm.status,
    area: {
      value: Number(farm.area_value),
      unit: farm.area_unit,
      hectares: Number(farm.total_area_hectares),
    },
    ownershipType: farm.ownership_type,
    ownershipReference: farm.ownership_reference || null,
    operator: {
      userId: farm.operator_user_id || null,
      name: farm.operator_name || null,
      phone: farm.operator_phone || null,
      email: farm.operator_email || null,
      operatingSince: iso(farm.operating_since),
    },
    location: toLocationDto(farm.location, includeCoordinates),
    parcels: (farm.parcels || []).map((parcel) => toParcelDto(parcel, includeCoordinates)),
    soilProfile: toSoilDto(farm.soil_profile),
    irrigations: (farm.irrigations || []).map(toIrrigationDto),
    coordinatesAccess: includeCoordinates ? 'GRANTED' : 'REDACTED',
    createdAt: iso(farm.created_at),
    updatedAt: iso(farm.updated_at),
  };
}

function toGeoDto(record) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    nameBn: record.name_bn || null,
  };
}

function toFeatureCollection(farms) {
  return {
    type: 'FeatureCollection',
    features: farms
      .filter((farm) => farm.location?.point || farm.location?.boundary)
      .map((farm) => {
        const geometry = farm.location.boundary
          ? { type: 'Polygon', coordinates: [farm.location.boundary.map((point) => [...point])] }
          : { type: 'Point', coordinates: [...farm.location.point] };
        const dto = toFarmDto(farm, { includeCoordinates: false });
        delete dto.location;
        return {
          type: 'Feature',
          id: farm.id,
          geometry,
          properties: {
            farmId: farm.id,
            name: farm.name,
            code: farm.code,
            status: farm.status,
            farmType: farm.farm_type,
            areaHectares: Number(farm.total_area_hectares),
            organizationId: farm.organization_id || null,
            geometryType: geometry.type,
            summary: dto,
          },
        };
      }),
  };
}

module.exports = {
  farmCreateSchema,
  farmParamsSchema,
  farmQuerySchema,
  farmUpdateSchema,
  geoParamsSchema,
  irrigationCreateSchema,
  irrigationParamsSchema,
  irrigationUpdateSchema,
  locationUpsertSchema,
  mapQuerySchema: farmQuerySchema,
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
};

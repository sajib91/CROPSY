const { Prisma } = require('@prisma/client');

const { assertRepository } = require('../../../shared/domain/repository');
const { ConflictError } = require('../../../shared/kernel/errors');
const { FarmStoreToken, COOPERATIVE_STORE_METHODS } = require('../domain/farm.repository');
const { attachPrismaCooperative } = require('./cooperative.store');

function conflict(message) {
  return new ConflictError({ message });
}

function translateError(error) {
  if (error instanceof ConflictError) return error;
  if (error?.code === 'P2002') return conflict('A unique farm field is already in use.');
  return error;
}

function toNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function wktFromRing(ring) {
  return `POLYGON((${ring.map(([lng, lat]) => `${lng} ${lat}`).join(',')}))`;
}

function ringFromWkt(value) {
  if (!value) return null;
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
  const match = /POLYGON\s*\(\(([^)]+)\)\)/i.exec(text);
  if (!match) return null;
  const ring = match[1]
    .split(',')
    .map((pair) => pair.trim().split(/\s+/).slice(0, 2).map(Number))
    .filter((point) => point.length === 2 && point.every(Number.isFinite));
  return ring.length >= 4 ? ring : null;
}

function serializeGeo(record) {
  return {
    ...record,
    area_value: toNumber(record.area_value),
    total_area_hectares: toNumber(record.total_area_hectares),
    area_hectares: toNumber(record.area_hectares),
    ph: toNumber(record.ph),
    organic_matter_percent: toNumber(record.organic_matter_percent),
    capacity_liters_per_minute: toNumber(record.capacity_liters_per_minute),
    command_area_hectares: toNumber(record.command_area_hectares),
  };
}

function serializeFarm(farm, locationGeometry, parcelGeometry) {
  return {
    id: farm.id,
    organization_id: farm.organization_id,
    owner_user_id: farm.owner_user_id,
    name: farm.name,
    description: farm.description,
    code: farm.code,
    farm_type: farm.farm_type,
    status: farm.status,
    area_unit: farm.area_unit,
    area_value: toNumber(farm.area_value),
    total_area_hectares: toNumber(farm.total_area_hectares),
    ownership_type: farm.ownership_type,
    ownership_reference: farm.ownership_reference,
    operator_user_id: farm.operator_user_id,
    operator_name: farm.operator_name,
    operator_phone: farm.operator_phone,
    operator_email: farm.operator_email,
    operating_since: farm.operating_since,
    created_at: farm.created_at,
    updated_at: farm.updated_at,
    location: farm.location
      ? {
          ...farm.location,
          point:
            locationGeometry && locationGeometry.lng !== null && locationGeometry.lat !== null
              ? [Number(locationGeometry.lng), Number(locationGeometry.lat)]
              : null,
          boundary: ringFromWkt(locationGeometry?.boundary),
        }
      : null,
    soil_profile: farm.soil_profile ? serializeGeo(farm.soil_profile) : null,
    parcels: farm.parcels.map((parcel) => ({
      ...serializeGeo(parcel),
      boundary: ringFromWkt(parcelGeometry.get(parcel.id)) || null,
    })),
    irrigations: farm.irrigations.map(serializeGeo),
  };
}

const FARM_INCLUDE = {
  location: {
    include: {
      division: true,
      district: true,
      upazila: true,
      union: true,
    },
  },
  parcels: true,
  soil_profile: true,
  irrigations: true,
};

/**
 * Prisma/PostGIS implementation of the farm store. Geometry is written with
 * raw PostGIS expressions because Prisma maps geometry columns as Unsupported.
 */
class FarmPrismaStore {
  constructor({ prisma }) {
    if (!prisma) throw new TypeError('FarmPrismaStore requires a Prisma client.');
    this.prisma = prisma;
    attachPrismaCooperative(this);
    assertRepository(
      this,
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
        ...COOPERATIVE_STORE_METHODS,
      ],
      FarmStoreToken,
    );
  }

  async createFarmBundle(bundle) {
    try {
      const farmId = await this.prisma.$transaction(async (tx) => {
        const farm = await tx.farm.create({
          data: {
            organization_id: bundle.farm.organization_id || null,
            owner_user_id: bundle.farm.owner_user_id,
            name: bundle.farm.name,
            description: bundle.farm.description || null,
            code: bundle.farm.code,
            farm_type: bundle.farm.farm_type,
            area_unit: bundle.farm.area_unit,
            area_value: bundle.farm.area_value,
            total_area_hectares: bundle.farm.total_area_hectares,
            ownership_type: bundle.farm.ownership_type,
            ownership_reference: bundle.farm.ownership_reference || null,
            operator_user_id: bundle.farm.operator_user_id || null,
            operator_name: bundle.farm.operator_name || null,
            operator_phone: bundle.farm.operator_phone || null,
            operator_email: bundle.farm.operator_email || null,
            operating_since: bundle.farm.operating_since || null,
          },
        });

        if (bundle.location) await this.writeLocation(tx, farm.id, bundle.location);
        for (const parcel of bundle.parcels || []) await this.writeParcel(tx, farm.id, parcel);
        if (bundle.soilProfile) await this.writeSoil(tx, farm.id, bundle.soilProfile);
        for (const irrigation of bundle.irrigations || []) {
          await tx.farmIrrigation.create({
            data: { ...irrigation, farm_id: farm.id, organization_id: farm.organization_id },
          });
        }
        return farm.id;
      });
      return this.findFarmById(farmId);
    } catch (error) {
      throw translateError(error);
    }
  }

  async writeLocation(tx, farmId, input) {
    const data = {
      address_line: input.address_line,
      division_id: input.division_id,
      district_id: input.district_id,
      upazila_id: input.upazila_id,
      union_id: input.union_id,
    };
    await tx.farmLocation.upsert({
      where: { farm_id: farmId },
      create: { farm_id: farmId, ...data },
      update: data,
    });
    const point = input.point
      ? Prisma.sql`ST_SetSRID(ST_MakePoint(${input.point[0]}::float8, ${input.point[1]}::float8), 4326)`
      : Prisma.sql`NULL`;
    const boundary = input.boundary
      ? Prisma.sql`ST_GeomFromText(${wktFromRing(input.boundary)}, 4326)`
      : Prisma.sql`NULL`;
    await tx.$executeRaw`
      UPDATE farm_locations
      SET location = ${point}, boundary = ${boundary}, updated_at = NOW()
      WHERE farm_id = ${farmId}::uuid
    `;
  }

  async writeParcel(tx, farmId, input) {
    const parcel = await tx.landParcel.create({
      data: {
        organization_id: input.organization_id,
        farm_id: farmId,
        code: input.code,
        name: input.name || null,
        area_unit: input.area_unit,
        area_value: input.area_value,
        area_hectares: input.area_hectares,
        ownership_type: input.ownership_type,
        status: input.status,
      },
    });
    if (input.boundary) {
      await tx.$executeRaw`
        UPDATE land_parcels
        SET boundary = ST_GeomFromText(${wktFromRing(input.boundary)}, 4326)
        WHERE id = ${parcel.id}::uuid
      `;
    }
    return parcel;
  }

  async writeSoil(tx, farmId, input) {
    const data = {
      organization_id: input.organization_id,
      soil_type: input.soil_type,
      texture: input.texture,
      ph: input.ph ?? null,
      organic_matter_percent: input.organic_matter_percent ?? null,
      fertility: input.fertility,
      drainage: input.drainage || null,
      tested_at: input.tested_at || null,
      testing_lab: input.testing_lab || null,
      notes: input.notes || null,
    };
    return tx.farmSoilProfile.upsert({
      where: { farm_id: farmId },
      create: { farm_id: farmId, ...data },
      update: data,
    });
  }

  async findFarmById(id) {
    const farm = await this.prisma.farm.findUnique({ where: { id }, include: FARM_INCLUDE });
    if (!farm) return null;
    const locationRows = await this.prisma.$queryRaw`
      SELECT ST_X("location") AS lng, ST_Y("location") AS lat, ST_AsText("boundary") AS boundary
      FROM "farm_locations" WHERE farm_id = ${id}::uuid
    `;
    const parcelRows = await this.prisma.$queryRaw`
      SELECT id::text AS id, ST_AsText("boundary") AS boundary
      FROM "land_parcels" WHERE farm_id = ${id}::uuid AND "boundary" IS NOT NULL
    `;
    const parcelGeometry = new Map(parcelRows.map((row) => [row.id, row.boundary]));
    return serializeFarm(farm, locationRows[0], parcelGeometry);
  }

  async listFarms(filters = {}) {
    const where = {};
    if (filters.organizationId) where.organization_id = filters.organizationId;
    if (filters.ownerUserId) where.owner_user_id = filters.ownerUserId;
    if (filters.status) where.status = filters.status;
    else if (!filters.includeArchived) where.status = { not: 'ARCHIVED' };
    const farms = await this.prisma.farm.findMany({
      where,
      select: { id: true },
      orderBy: { created_at: 'desc' },
    });
    return Promise.all(farms.map((farm) => this.findFarmById(farm.id)));
  }

  async updateFarm(id, patch) {
    try {
      await this.prisma.farm.update({ where: { id }, data: patch });
      return this.findFarmById(id);
    } catch (error) {
      throw translateError(error);
    }
  }

  async archiveFarm(id) {
    return this.updateFarm(id, { status: 'ARCHIVED' });
  }

  async upsertLocation(farmId, input) {
    try {
      await this.prisma.$transaction((tx) => this.writeLocation(tx, farmId, input));
      const farm = await this.findFarmById(farmId);
      return farm?.location || null;
    } catch (error) {
      throw translateError(error);
    }
  }

  async listParcels(farmId) {
    const rows = await this.prisma.$queryRaw`
      SELECT id::text AS id, ST_AsText("boundary") AS boundary
      FROM "land_parcels" WHERE farm_id = ${farmId}::uuid
    `;
    const geometry = new Map(rows.map((row) => [row.id, row.boundary]));
    const parcels = await this.prisma.landParcel.findMany({
      where: { farm_id: farmId },
      orderBy: { code: 'asc' },
    });
    return parcels.map((parcel) =>
      serializeGeo({ ...parcel, boundary: ringFromWkt(geometry.get(parcel.id)) || null }),
    );
  }

  async createParcel(farmId, input) {
    try {
      const farm = await this.prisma.farm.findUnique({
        where: { id: farmId },
        select: { organization_id: true },
      });
      if (!farm) throw conflict('Farm was not found.');
      const parcel = await this.prisma.$transaction((tx) =>
        this.writeParcel(tx, farmId, { ...input, organization_id: farm.organization_id }),
      );
      const boundaryRows = await this.prisma.$queryRaw`
        SELECT ST_AsText("boundary") AS boundary
        FROM "land_parcels" WHERE id = ${parcel.id}::uuid
      `;
      return serializeGeo({
        ...parcel,
        boundary: ringFromWkt(boundaryRows[0]?.boundary) || null,
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  async updateParcel(id, patch) {
    try {
      const { boundary, ...data } = patch;
      const parcel = await this.prisma.landParcel.update({ where: { id }, data });
      if (boundary) {
        await this.prisma.$executeRaw`
          UPDATE "land_parcels"
          SET "boundary" = ST_GeomFromText(${wktFromRing(boundary)}, 4326)
          WHERE id = ${id}::uuid
        `;
      } else if (boundary === null) {
        await this.prisma.$executeRaw`
          UPDATE "land_parcels" SET "boundary" = NULL WHERE id = ${id}::uuid
        `;
      }
      const boundaryRows = await this.prisma.$queryRaw`
        SELECT ST_AsText("boundary") AS boundary
        FROM "land_parcels" WHERE id = ${id}::uuid
      `;
      return serializeGeo({
        ...parcel,
        boundary: ringFromWkt(boundaryRows[0]?.boundary) || null,
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  async upsertSoilProfile(farmId, input) {
    try {
      const farm = await this.prisma.farm.findUnique({
        where: { id: farmId },
        select: { organization_id: true },
      });
      if (!farm) throw conflict('Farm was not found.');
      const profile = await this.prisma.$transaction((tx) =>
        this.writeSoil(tx, farmId, { ...input, organization_id: farm.organization_id }),
      );
      return serializeGeo(profile);
    } catch (error) {
      throw translateError(error);
    }
  }

  async findSoilProfile(farmId) {
    const profile = await this.prisma.farmSoilProfile.findUnique({ where: { farm_id: farmId } });
    return profile ? serializeGeo(profile) : null;
  }

  async listIrrigations(farmId) {
    const rows = await this.prisma.farmIrrigation.findMany({
      where: { farm_id: farmId },
      orderBy: { code: 'asc' },
    });
    return rows.map(serializeGeo);
  }

  async createIrrigation(farmId, input) {
    try {
      const farm = await this.prisma.farm.findUnique({
        where: { id: farmId },
        select: { organization_id: true },
      });
      if (!farm) throw conflict('Farm was not found.');
      const irrigation = await this.prisma.farmIrrigation.create({
        data: { ...input, farm_id: farmId, organization_id: farm.organization_id },
      });
      return serializeGeo(irrigation);
    } catch (error) {
      throw translateError(error);
    }
  }

  async updateIrrigation(id, patch) {
    try {
      const irrigation = await this.prisma.farmIrrigation.update({ where: { id }, data: patch });
      return serializeGeo(irrigation);
    } catch (error) {
      throw translateError(error);
    }
  }

  async listDivisions() {
    const rows = await this.prisma.division.findMany({
      where: { country: { code: 'BD' }, is_active: true },
      select: { id: true, code: true, name: true, name_bn: true },
      orderBy: { name: 'asc' },
    });
    return rows;
  }

  async listDistricts(divisionId) {
    return this.prisma.district.findMany({
      where: { division_id: divisionId },
      select: { id: true, code: true, name: true, name_bn: true, division_id: true },
      orderBy: { name: 'asc' },
    });
  }

  async listUpazilas(districtId) {
    return this.prisma.upazila.findMany({
      where: { district_id: districtId },
      select: { id: true, code: true, name: true, name_bn: true, district_id: true },
      orderBy: { name: 'asc' },
    });
  }

  async listUnions(upazilaId) {
    return this.prisma.union.findMany({
      where: { upazila_id: upazilaId },
      select: { id: true, code: true, name: true, name_bn: true, upazila_id: true },
      orderBy: { name: 'asc' },
    });
  }

  async findGeoContext({ divisionId, districtId, upazilaId, unionId }) {
    const union = await this.prisma.union.findUnique({
      where: { id: unionId },
      include: {
        upazila: {
          include: {
            district: {
              include: { division: { include: { country: true } } },
            },
          },
        },
      },
    });
    if (
      !union ||
      union.upazila_id !== upazilaId ||
      union.upazila?.district_id !== districtId ||
      union.upazila?.district?.division_id !== divisionId ||
      union.upazila?.district?.division?.country?.code !== 'BD'
    ) {
      return null;
    }
    const { upazila } = union;
    const { district } = upazila;
    const { division } = district;
    return {
      country_code: division.country.code,
      division: {
        id: division.id,
        code: division.code,
        name: division.name,
        name_bn: division.name_bn,
      },
      district: {
        id: district.id,
        code: district.code,
        name: district.name,
        name_bn: district.name_bn,
      },
      upazila: {
        id: upazila.id,
        code: upazila.code,
        name: upazila.name,
        name_bn: upazila.name_bn,
      },
      union: {
        id: union.id,
        code: union.code,
        name: union.name,
        name_bn: union.name_bn,
      },
    };
  }

  async querySpatial(query) {
    const statusFilter = query.includeArchived
      ? Prisma.empty
      : Prisma.sql`AND f."status" <> 'ARCHIVED'`;
    let condition;
    if (query.mode === 'bbox') {
      condition = Prisma.sql`
        (
          (fl."location" IS NOT NULL AND ST_Intersects(fl."location", ST_MakeEnvelope(
            ${query.bbox.minLng}::float8, ${query.bbox.minLat}::float8,
            ${query.bbox.maxLng}::float8, ${query.bbox.maxLat}::float8, 4326)))
          OR (fl."boundary" IS NOT NULL AND ST_Intersects(fl."boundary", ST_MakeEnvelope(
            ${query.bbox.minLng}::float8, ${query.bbox.minLat}::float8,
            ${query.bbox.maxLng}::float8, ${query.bbox.maxLat}::float8, 4326)))
        )
      `;
    } else if (query.mode === 'near') {
      condition = Prisma.sql`
        fl."location" IS NOT NULL AND ST_DWithin(
          fl."location"::geography,
          ST_SetSRID(ST_MakePoint(${query.point[0]}::float8, ${query.point[1]}::float8), 4326)::geography,
          ${query.radiusMeters}::float8
        )
      `;
    } else {
      condition = Prisma.sql`
        fl."location" IS NOT NULL AND ST_Within(
          fl."location", ST_GeomFromText(${wktFromRing(query.polygon)}, 4326)
        )
      `;
    }

    const rows = await this.prisma.$queryRaw(Prisma.sql`
      SELECT f."id"::text AS id
      FROM "farms" f
      LEFT JOIN "farm_locations" fl ON fl."farm_id" = f."id"
      WHERE (${condition}) ${statusFilter}
      ORDER BY f."created_at" DESC
    `);
    return Promise.all(rows.map((row) => this.findFarmById(row.id)));
  }
}

module.exports = { FarmPrismaStore };

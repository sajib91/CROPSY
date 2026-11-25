const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const { ConflictError } = require('../../../shared/kernel/errors');
const {
  BANGLADESH_BOUNDS,
  haversineMeters,
  pointInPolygon,
  polygonIntersectsBbox,
  toHectares,
} = require('../domain/farm.entity');
const { FarmStoreToken } = require('../domain/farm.repository');
const { createBangladeshGeoFixture } = require('./bangladesh-geo');

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function now() {
  return new Date();
}

function conflict(message) {
  return new ConflictError({ message });
}

/**
 * In-memory implementation of the farm store. It mirrors the Prisma adapter's
 * snake_case record shape and applies the same Bangladesh geo validation so
 * API tests exercise identical service behaviour without PostgreSQL.
 */
class FarmInMemoryStore {
  constructor() {
    this.farms = new Map();
    this.locations = new Map();
    this.parcels = new Map();
    this.soilProfiles = new Map();
    this.irrigations = new Map();
    this.geo = createBangladeshGeoFixture();
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
      ],
      FarmStoreToken,
    );
  }

  async createFarmBundle(bundle) {
    const timestamp = now();
    const farm = {
      id: randomUUID(),
      organization_id: bundle.farm.organization_id || null,
      owner_user_id: bundle.farm.owner_user_id,
      name: bundle.farm.name,
      description: bundle.farm.description || null,
      code: bundle.farm.code,
      farm_type: bundle.farm.farm_type,
      status: 'ACTIVE',
      area_unit: bundle.farm.area_unit,
      area_value: bundle.farm.area_value,
      total_area_hectares: toHectares(bundle.farm.area_value, bundle.farm.area_unit),
      ownership_type: bundle.farm.ownership_type,
      ownership_reference: bundle.farm.ownership_reference || null,
      operator_user_id: bundle.farm.operator_user_id || null,
      operator_name: bundle.farm.operator_name || null,
      operator_phone: bundle.farm.operator_phone || null,
      operator_email: bundle.farm.operator_email || null,
      operating_since: bundle.farm.operating_since || null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    if ([...this.farms.values()].some((candidate) => candidate.code === farm.code)) {
      throw conflict('Farm code is already in use.');
    }
    this.farms.set(farm.id, farm);

    if (bundle.location) await this.upsertLocation(farm.id, bundle.location);
    for (const parcel of bundle.parcels || []) await this.createParcel(farm.id, parcel);
    if (bundle.soilProfile) await this.upsertSoilProfile(farm.id, bundle.soilProfile);
    for (const irrigation of bundle.irrigations || []) {
      await this.createIrrigation(farm.id, irrigation);
    }
    return this.findFarmById(farm.id);
  }

  async findFarmById(id) {
    const farm = this.farms.get(id);
    if (!farm) return null;
    return clone({
      ...farm,
      location: this.locations.get(id) || null,
      parcels: [...this.parcels.values()].filter((parcel) => parcel.farm_id === id),
      soil_profile: this.soilProfiles.get(id) || null,
      irrigations: [...this.irrigations.values()].filter((item) => item.farm_id === id),
    });
  }

  async listFarms(filters = {}) {
    let farms = [...this.farms.values()];
    if (filters.organizationId) {
      farms = farms.filter((farm) => farm.organization_id === filters.organizationId);
    }
    if (filters.ownerUserId) {
      farms = farms.filter((farm) => farm.owner_user_id === filters.ownerUserId);
    }
    if (filters.status) {
      farms = farms.filter((farm) => farm.status === filters.status);
    } else if (!filters.includeArchived) {
      farms = farms.filter((farm) => farm.status !== 'ARCHIVED');
    }
    farms.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return Promise.all(farms.map((farm) => this.findFarmById(farm.id)));
  }

  async updateFarm(id, patch) {
    const farm = this.farms.get(id);
    if (!farm) throw conflict('Farm was not found.');
    for (const [key, value] of Object.entries(patch)) {
      farm[key] = value;
    }
    farm.updated_at = now();
    return this.findFarmById(id);
  }

  async archiveFarm(id) {
    return this.updateFarm(id, { status: 'ARCHIVED' });
  }

  async upsertLocation(farmId, input) {
    if (!this.farms.has(farmId)) throw conflict('Farm was not found.');
    const existing = this.locations.get(farmId);
    const timestamp = now();
    const location = {
      id: existing?.id || randomUUID(),
      farm_id: farmId,
      address_line: input.address_line,
      division_id: input.division_id,
      district_id: input.district_id,
      upazila_id: input.upazila_id,
      union_id: input.union_id,
      point: input.point || null,
      boundary: input.boundary || null,
      created_at: existing?.created_at || timestamp,
      updated_at: timestamp,
      division: this.geo.divisions.find((item) => item.id === input.division_id) || null,
      district: this.geo.districts.find((item) => item.id === input.district_id) || null,
      upazila: this.geo.upazilas.find((item) => item.id === input.upazila_id) || null,
      union: this.geo.unions.find((item) => item.id === input.union_id) || null,
    };
    this.locations.set(farmId, location);
    return clone(location);
  }

  async listParcels(farmId) {
    return clone(
      [...this.parcels.values()]
        .filter((parcel) => parcel.farm_id === farmId)
        .sort((a, b) => a.code.localeCompare(b.code)),
    );
  }

  async createParcel(farmId, input) {
    const farm = this.farms.get(farmId);
    if (!farm) throw conflict('Farm was not found.');
    const existing = await this.listParcels(farmId);
    if (existing.some((parcel) => parcel.code === input.code)) {
      throw conflict('Parcel code is already used by this farm.');
    }
    const timestamp = now();
    const parcel = {
      id: randomUUID(),
      organization_id: farm.organization_id,
      farm_id: farmId,
      code: input.code,
      name: input.name || null,
      area_unit: input.area_unit,
      area_value: input.area_value,
      area_hectares: toHectares(input.area_value, input.area_unit),
      ownership_type: input.ownership_type,
      status: input.status,
      boundary: input.boundary || null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.parcels.set(parcel.id, parcel);
    return clone(parcel);
  }

  async updateParcel(id, patch) {
    const parcel = this.parcels.get(id);
    if (!parcel) throw conflict('Parcel was not found.');
    for (const [key, value] of Object.entries(patch)) {
      parcel[key] = value;
    }
    if (patch.area_value !== undefined || patch.area_unit !== undefined) {
      parcel.area_hectares = toHectares(parcel.area_value, parcel.area_unit);
    }
    parcel.updated_at = now();
    return clone(parcel);
  }

  async upsertSoilProfile(farmId, input) {
    const farm = this.farms.get(farmId);
    if (!farm) throw conflict('Farm was not found.');
    const existing = this.soilProfiles.get(farmId);
    const timestamp = now();
    const profile = {
      id: existing?.id || randomUUID(),
      organization_id: farm.organization_id,
      farm_id: farmId,
      soil_type: input.soil_type,
      texture: input.texture,
      ph: input.ph ?? null,
      organic_matter_percent: input.organic_matter_percent ?? null,
      fertility: input.fertility,
      drainage: input.drainage || null,
      tested_at: input.tested_at || null,
      testing_lab: input.testing_lab || null,
      notes: input.notes || null,
      created_at: existing?.created_at || timestamp,
      updated_at: timestamp,
    };
    this.soilProfiles.set(farmId, profile);
    return clone(profile);
  }

  async findSoilProfile(farmId) {
    const profile = this.soilProfiles.get(farmId);
    return profile ? clone(profile) : null;
  }

  async listIrrigations(farmId) {
    return clone(
      [...this.irrigations.values()]
        .filter((item) => item.farm_id === farmId)
        .sort((a, b) => a.code.localeCompare(b.code)),
    );
  }

  async createIrrigation(farmId, input) {
    const farm = this.farms.get(farmId);
    if (!farm) throw conflict('Farm was not found.');
    const existing = await this.listIrrigations(farmId);
    if (existing.some((item) => item.code === input.code)) {
      throw conflict('Irrigation code is already used by this farm.');
    }
    const timestamp = now();
    const irrigation = {
      id: randomUUID(),
      organization_id: farm.organization_id,
      farm_id: farmId,
      code: input.code,
      source: input.source,
      method: input.method,
      status: input.status,
      capacity_liters_per_minute: input.capacity_liters_per_minute ?? null,
      command_area_hectares: input.command_area_hectares ?? null,
      frequency_per_week: input.frequency_per_week ?? null,
      notes: input.notes || null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.irrigations.set(irrigation.id, irrigation);
    return clone(irrigation);
  }

  async updateIrrigation(id, patch) {
    const irrigation = this.irrigations.get(id);
    if (!irrigation) throw conflict('Irrigation record was not found.');
    for (const [key, value] of Object.entries(patch)) {
      irrigation[key] = value;
    }
    irrigation.updated_at = now();
    return clone(irrigation);
  }

  async listDivisions() {
    return clone(this.geo.divisions).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listDistricts(divisionId) {
    return clone(this.geo.districts.filter((item) => item.division_id === divisionId)).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
  }

  async listUpazilas(districtId) {
    return clone(this.geo.upazilas.filter((item) => item.district_id === districtId)).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async listUnions(upazilaId) {
    return clone(this.geo.unions.filter((item) => item.upazila_id === upazilaId)).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async findGeoContext({ divisionId, districtId, upazilaId, unionId }) {
    const union = this.geo.unions.find((item) => item.id === unionId);
    const upazila = this.geo.upazilas.find((item) => item.id === upazilaId);
    const district = this.geo.districts.find((item) => item.id === districtId);
    const division = this.geo.divisions.find((item) => item.id === divisionId);
    if (!union || !upazila || !district || !division) return null;
    if (
      union.upazila_id !== upazila.id ||
      upazila.district_id !== district.id ||
      district.division_id !== division.id ||
      union.country_code !== 'BD'
    ) {
      return null;
    }
    return clone({
      country_code: 'BD',
      division,
      district,
      upazila,
      union,
    });
  }

  async querySpatial(query) {
    const bbox = query.bbox || BANGLADESH_BOUNDS;
    const farms = await this.listFarms({ includeArchived: query.includeArchived });
    const matches = [];
    for (const farm of farms) {
      const point = farm.location?.point || null;
      const boundary = farm.location?.boundary || null;
      let matched = false;
      if (query.mode === 'bbox') {
        matched =
          (point &&
            point[0] >= bbox.minLng &&
            point[0] <= bbox.maxLng &&
            point[1] >= bbox.minLat &&
            point[1] <= bbox.maxLat) ||
          (boundary && polygonIntersectsBbox(boundary, bbox));
      } else if (query.mode === 'near') {
        matched = Boolean(point && haversineMeters(point, query.point) <= query.radiusMeters);
      } else if (query.mode === 'within') {
        matched = Boolean(point && pointInPolygon(point, query.polygon));
      }
      if (matched) matches.push(farm);
    }
    return matches;
  }
}

module.exports = { FarmInMemoryStore };

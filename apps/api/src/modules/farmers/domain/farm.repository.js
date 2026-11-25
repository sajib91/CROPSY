const { defineRepositoryToken } = require('../../../shared/domain/repository');

const FarmStoreToken = defineRepositoryToken('farmers.farm-store');

/**
 * Persistence port for farm management. Implementations must return plain
 * records in snake_case so that in-memory and Prisma adapters are
 * interchangeable. Geometry fields are represented as ordered [lng, lat]
 * pairs, never as raw database values.
 *
 * @typedef {object} FarmStoreContract
 * @property {(bundle: object) => Promise<object>} createFarmBundle
 * @property {(id: string) => Promise<object|null>} findFarmById
 * @property {(filters?: object) => Promise<object[]>} listFarms
 * @property {(id: string, patch: object) => Promise<object>} updateFarm
 * @property {(id: string) => Promise<object>} archiveFarm
 * @property {(farmId: string, input: object) => Promise<object>} upsertLocation
 * @property {(farmId: string) => Promise<object[]>} listParcels
 * @property {(farmId: string, input: object) => Promise<object>} createParcel
 * @property {(id: string, patch: object) => Promise<object>} updateParcel
 * @property {(farmId: string, input: object) => Promise<object>} upsertSoilProfile
 * @property {(farmId: string) => Promise<object|null>} findSoilProfile
 * @property {(farmId: string) => Promise<object[]>} listIrrigations
 * @property {(farmId: string, input: object) => Promise<object>} createIrrigation
 * @property {(id: string, patch: object) => Promise<object>} updateIrrigation
 * @property {() => Promise<object[]>} listDivisions
 * @property {(divisionId: string) => Promise<object[]>} listDistricts
 * @property {(districtId: string) => Promise<object[]>} listUpazilas
 * @property {(upazilaId: string) => Promise<object[]>} listUnions
 * @property {(ids: object) => Promise<object|null>} findGeoContext
 * @property {(query: object) => Promise<object[]>} querySpatial
 */

module.exports = { FarmStoreToken };

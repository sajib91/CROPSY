const { defineRepositoryToken } = require('../../../shared/domain/repository');

const AgricultureRepositoryToken = defineRepositoryToken('agriculture');
const AgricultureStoreToken = defineRepositoryToken('agriculture.store');

/**
 * Repository port for the module info entity.
 * @typedef {object} AgricultureRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

/**
 * Persistence port for crop, cultivation, activity, and expense records.
 * Every implementation returns plain records in snake_case so the service can
 * apply identical business rules in memory and with Prisma.
 *
 * @typedef {object} AgricultureStoreContract
 * @property {(filters?: object) => Promise<object[]>} listCrops
 * @property {(id: string) => Promise<object|null>} findCrop
 * @property {(input: object) => Promise<object>} createCrop
 * @property {(id: string, patch: object) => Promise<object>} updateCrop
 * @property {(filters?: object) => Promise<object[]>} listVarieties
 * @property {(id: string) => Promise<object|null>} findVariety
 * @property {(input: object) => Promise<object>} createVariety
 * @property {(id: string, patch: object) => Promise<object>} updateVariety
 * @property {(filters?: object) => Promise<object[]>} listSeasons
 * @property {(id: string) => Promise<object|null>} findSeason
 * @property {(input: object) => Promise<object>} createSeason
 * @property {(id: string, patch: object) => Promise<object>} updateSeason
 * @property {(filters?: object) => Promise<object[]>} listCalendars
 * @property {(id: string) => Promise<object|null>} findCalendar
 * @property {(input: object) => Promise<object>} createCalendar
 * @property {(id: string, patch: object) => Promise<object>} updateCalendar
 * @property {(filters?: object) => Promise<object[]>} listRecommendations
 * @property {(id: string) => Promise<object|null>} findRecommendation
 * @property {(input: object) => Promise<object>} createRecommendation
 * @property {(id: string, patch: object) => Promise<object>} updateRecommendation
 * @property {(filters?: object) => Promise<object[]>} listCultivations
 * @property {(id: string) => Promise<object|null>} findCultivation
 * @property {(input: object) => Promise<object>} createCultivation
 * @property {(id: string, patch: object) => Promise<object>} updateCultivation
 * @property {(filters?: object) => Promise<object[]>} listActivities
 * @property {(id: string) => Promise<object|null>} findActivity
 * @property {(input: object) => Promise<object>} createActivity
 * @property {(filters?: object) => Promise<object[]>} listHarvests
 * @property {(id: string) => Promise<object|null>} findHarvest
 * @property {(input: object) => Promise<object>} createHarvest
 * @property {(filters?: object) => Promise<object[]>} listExpenses
 * @property {(id: string) => Promise<object|null>} findExpense
 * @property {(input: object) => Promise<object>} createExpense
 * @property {(id: string, patch: object) => Promise<object>} updateExpense
 */

const AGRICULTURE_STORE_METHODS = Object.freeze([
  'listCrops',
  'findCrop',
  'createCrop',
  'updateCrop',
  'listVarieties',
  'findVariety',
  'createVariety',
  'updateVariety',
  'listSeasons',
  'findSeason',
  'createSeason',
  'updateSeason',
  'listCalendars',
  'findCalendar',
  'createCalendar',
  'updateCalendar',
  'listRecommendations',
  'findRecommendation',
  'createRecommendation',
  'updateRecommendation',
  'listCultivations',
  'findCultivation',
  'createCultivation',
  'updateCultivation',
  'listActivities',
  'findActivity',
  'createActivity',
  'listHarvests',
  'findHarvest',
  'createHarvest',
  'listExpenses',
  'findExpense',
  'createExpense',
  'updateExpense',
]);

module.exports = { AGRICULTURE_STORE_METHODS, AgricultureRepositoryToken, AgricultureStoreToken };

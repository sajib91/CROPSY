const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'agriculture';
const MODULE_NAME = 'Agriculture and Crop Management';

const CROP_CATEGORIES = Object.freeze([
  'CEREAL',
  'PULSE',
  'OILSEED',
  'VEGETABLE',
  'FRUIT',
  'ROOT_CROP',
  'SPICE',
  'LIVESTOCK',
  'FISHERY',
  'OTHER',
]);

const CULTIVATION_STATUSES = Object.freeze([
  'PLANNED',
  'ACTIVE',
  'HARVESTED',
  'FAILED',
  'CANCELLED',
]);

const FARM_ACTIVITY_TYPES = Object.freeze([
  'LAND_PREPARATION',
  'SOWING',
  'PLANTING',
  'IRRIGATION',
  'FERTILIZATION',
  'PEST_CONTROL',
  'GROWTH_STAGE',
  'DISEASE_OBSERVATION',
  'PEST_OBSERVATION',
  'WEEDING',
  'PRUNING',
  'MONITORING',
  'HARVEST_PREP',
  'OTHER',
]);

const OBSERVATION_ACTIVITY_TYPES = Object.freeze(['DISEASE_OBSERVATION', 'PEST_OBSERVATION']);

const GROWTH_STAGES = Object.freeze([
  'NOT_SET',
  'GERMINATION',
  'VEGETATIVE',
  'FLOWERING',
  'FRUITING',
  'MATURITY',
  'HARVEST_READY',
]);

const OBSERVATION_SEVERITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']);

const EXPENSE_CATEGORIES = Object.freeze([
  'SEEDS',
  'FERTILIZER',
  'PESTICIDE',
  'IRRIGATION',
  'LABOR',
  'MACHINERY',
  'TRANSPORTATION',
  'LAND_PREPARATION',
  'OTHER',
]);

const EXPENSE_SOURCES = Object.freeze(['RECORDED', 'AI_ESTIMATED']);

const RECOMMENDATION_SOURCES = Object.freeze(['CONFIGURED', 'AI_ESTIMATED']);

const CALENDAR_SCOPES = Object.freeze(['GLOBAL', 'ORGANIZATION']);

const HARVEST_STATUSES = Object.freeze(['DRAFT', 'CONFIRMED', 'RECONCILED']);

const GLOBAL_SCOPE_KEY = 'GLOBAL';

// Creation or modification of AI-derived records needs an explicit AI grant in
// addition to the normal agriculture permission. Super admins bypass it.
const AI_WRITE_PERMISSION = 'ai.feedback';

class AgricultureEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = {
  AI_WRITE_PERMISSION,
  CALENDAR_SCOPES,
  CROP_CATEGORIES,
  CULTIVATION_STATUSES,
  EXPENSE_CATEGORIES,
  EXPENSE_SOURCES,
  FARM_ACTIVITY_TYPES,
  GLOBAL_SCOPE_KEY,
  GROWTH_STAGES,
  HARVEST_STATUSES,
  MODULE_ID,
  MODULE_NAME,
  OBSERVATION_ACTIVITY_TYPES,
  OBSERVATION_SEVERITIES,
  RECOMMENDATION_SOURCES,
  AgricultureEntity,
};

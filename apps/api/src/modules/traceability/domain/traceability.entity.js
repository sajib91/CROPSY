const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'traceability';
const MODULE_NAME = 'Traceability';

const BATCH_STATUSES = Object.freeze(['DRAFT', 'ACTIVE', 'SEALED']);
const VERIFICATION_STATUSES = Object.freeze(['UNVERIFIED', 'VERIFIED', 'REJECTED']);
const TRACEABILITY_EVENT_TYPES = Object.freeze([
  'PRODUCED',
  'FARM_ORIGIN',
  'CULTIVATION',
  'HARVESTED',
  'INSPECTED',
  'WAREHOUSE_ENTRY',
  'STORAGE_HISTORY',
  'STORED',
  'SHIPPED',
  'DELIVERED',
  'BUYER_CONFIRMED',
  'SELLER',
  'RECALLED',
]);

class TraceabilityEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = {
  MODULE_ID,
  MODULE_NAME,
  TraceabilityEntity,
  BATCH_STATUSES,
  VERIFICATION_STATUSES,
  TRACEABILITY_EVENT_TYPES,
};

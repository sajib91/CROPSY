const { defineRepositoryToken } = require('../../../shared/domain/repository');

const TraceabilityRepositoryToken = defineRepositoryToken('traceability');
const TraceabilityStoreToken = defineRepositoryToken('traceability.store');

const TRACEABILITY_STORE_METHODS = Object.freeze([
  'listBatches',
  'findBatch',
  'findBatchByToken',
  'createBatch',
  'updateBatch',
  'listEvents',
  'createEvent',
  'listAudits',
  'createAudit',
]);

/**
 * Repository port for Traceability. Module metadata uses the generic
 * repository; operational records use the store port below.
 * @typedef {object} TraceabilityRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = {
  TraceabilityRepositoryToken,
  TraceabilityStoreToken,
  TRACEABILITY_STORE_METHODS,
};

const { defineRepositoryToken } = require('../../../shared/domain/repository');

const QualityRepositoryToken = defineRepositoryToken('quality');
const QualityStoreToken = defineRepositoryToken('quality.store');

const QUALITY_STORE_METHODS = Object.freeze([
  'listInspections',
  'findInspection',
  'createInspection',
  'updateInspection',
  'listEvidence',
  'findEvidence',
  'createEvidence',
  'listAudits',
  'createAudit',
]);

/**
 * Repository port for Quality Inspection. Module info uses the generic
 * repository; operational inspection records use the store port below.
 */
module.exports = {
  QualityRepositoryToken,
  QualityStoreToken,
  QUALITY_STORE_METHODS,
};

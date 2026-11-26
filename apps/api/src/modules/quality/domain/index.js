const {
  EVIDENCE_TYPES,
  GRADE_SOURCES,
  INSPECTION_RESULTS,
  MODULE_ID,
  MODULE_NAME,
  QualityEntity,
  VERIFICATION_STATUSES,
} = require('./quality.entity');
const {
  QUALITY_STORE_METHODS,
  QualityRepositoryToken,
  QualityStoreToken,
} = require('./quality.repository');

module.exports = {
  MODULE_ID,
  MODULE_NAME,
  QualityEntity,
  QualityRepositoryToken,
  QualityStoreToken,
  QUALITY_STORE_METHODS,
  INSPECTION_RESULTS,
  GRADE_SOURCES,
  VERIFICATION_STATUSES,
  EVIDENCE_TYPES,
};

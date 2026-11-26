const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'quality';
const MODULE_NAME = 'Quality Inspection';

const INSPECTION_RESULTS = Object.freeze(['PENDING', 'PASSED', 'FAILED', 'CONDITIONAL']);
const GRADE_SOURCES = Object.freeze(['INSPECTOR', 'CATALOG', 'EXTERNAL']);
const VERIFICATION_STATUSES = Object.freeze(['UNVERIFIED', 'VERIFIED', 'REJECTED']);
const EVIDENCE_TYPES = Object.freeze(['IMAGE', 'DOCUMENT', 'MEASUREMENT', 'OTHER']);

class QualityEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = {
  MODULE_ID,
  MODULE_NAME,
  QualityEntity,
  INSPECTION_RESULTS,
  GRADE_SOURCES,
  VERIFICATION_STATUSES,
  EVIDENCE_TYPES,
};

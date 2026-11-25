const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'traceability';
const MODULE_NAME = 'Traceability';

class TraceabilityEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, TraceabilityEntity };

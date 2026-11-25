const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'quality';
const MODULE_NAME = 'Quality Inspection';

class QualityEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, QualityEntity };

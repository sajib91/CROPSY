const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'agriculture';
const MODULE_NAME = 'Agriculture and Crop Management';

class AgricultureEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, AgricultureEntity };

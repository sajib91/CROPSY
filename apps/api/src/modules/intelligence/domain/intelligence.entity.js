const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'intelligence';
const MODULE_NAME = 'Agricultural Intelligence';

class IntelligenceEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, IntelligenceEntity };

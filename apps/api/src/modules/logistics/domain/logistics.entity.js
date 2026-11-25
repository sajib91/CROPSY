const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'logistics';
const MODULE_NAME = 'Logistics';

class LogisticsEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, LogisticsEntity };

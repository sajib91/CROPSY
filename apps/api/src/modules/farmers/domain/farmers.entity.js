const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'farmers';
const MODULE_NAME = 'Farmer Management';

class FarmersEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, FarmersEntity };

const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'warehouse';
const MODULE_NAME = 'Warehouse';

class WarehouseEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, WarehouseEntity };

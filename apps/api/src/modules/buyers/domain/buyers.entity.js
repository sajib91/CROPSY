const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'buyers';
const MODULE_NAME = 'Buyer Management';

class BuyersEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, BuyersEntity };

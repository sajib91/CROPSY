const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'payments';
const MODULE_NAME = 'Payments';

class PaymentsEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, PaymentsEntity };

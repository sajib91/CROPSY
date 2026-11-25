const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'billing';
const MODULE_NAME = 'Subscription and SaaS Billing';

class BillingEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, BillingEntity };

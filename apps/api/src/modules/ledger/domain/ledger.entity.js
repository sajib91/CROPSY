const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'ledger';
const MODULE_NAME = 'Financial Ledger';

class LedgerEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, LedgerEntity };

const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'marketplace';
const MODULE_NAME = 'Marketplace';

class MarketplaceEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, MarketplaceEntity };

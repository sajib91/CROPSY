const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'catalog';
const MODULE_NAME = 'Product Catalog';

class CatalogEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, CatalogEntity };

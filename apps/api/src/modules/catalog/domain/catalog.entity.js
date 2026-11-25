const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'catalog';
const MODULE_NAME = 'Product Catalog';

// The first eight codes cover the product families required by the platform.
// CEREALS and the legacy produce codes remain available to existing tenants.
const PRODUCT_CATEGORY_CODES = Object.freeze([
  'GRAINS',
  'VEGETABLES',
  'FRUITS',
  'SPICES',
  'PULSES',
  'SEEDS',
  'AGRICULTURAL_INPUTS',
  'CEREALS',
  'ROOT_CROPS',
  'LIVESTOCK',
  'FISHERY',
  'DAIRY',
  'OTHER_PRODUCE',
]);

const ATTRIBUTE_VALUE_TYPES = Object.freeze(['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'ENUM']);
const CATALOG_ENTITY_TYPES = Object.freeze(['PRODUCT', 'VARIETY']);

class CatalogEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = {
  ATTRIBUTE_VALUE_TYPES,
  CATALOG_ENTITY_TYPES,
  MODULE_ID,
  MODULE_NAME,
  PRODUCT_CATEGORY_CODES,
  CatalogEntity,
};

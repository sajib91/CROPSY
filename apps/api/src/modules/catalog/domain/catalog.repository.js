const { defineRepositoryToken } = require('../../../shared/domain/repository');

const CatalogRepositoryToken = defineRepositoryToken('catalog');

/**
 * Repository port for Product Catalog.
 * @typedef {object} CatalogRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { CatalogRepositoryToken };

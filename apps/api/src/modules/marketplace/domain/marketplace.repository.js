const { defineRepositoryToken } = require('../../../shared/domain/repository');

const MarketplaceRepositoryToken = defineRepositoryToken('marketplace');

/**
 * Repository port for Marketplace.
 * @typedef {object} MarketplaceRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { MarketplaceRepositoryToken };

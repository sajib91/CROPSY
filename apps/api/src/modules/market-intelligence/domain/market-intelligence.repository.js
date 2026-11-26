const { defineRepositoryToken } = require('../../../shared/domain/repository');

const MarketIntelligenceRepositoryToken = defineRepositoryToken('market-intelligence');

/**
 * Repository port for the module info entity. All market facts are read through
 * the narrow marketplace observation port; this repository stores no prices.
 *
 * @typedef {object} MarketIntelligenceRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { MarketIntelligenceRepositoryToken };

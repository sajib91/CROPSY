const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class MarketplaceInMemoryRepository extends InMemoryRepository {}

module.exports = { MarketplaceInMemoryRepository };

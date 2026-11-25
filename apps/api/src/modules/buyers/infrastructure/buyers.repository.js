const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class BuyersInMemoryRepository extends InMemoryRepository {}

module.exports = { BuyersInMemoryRepository };

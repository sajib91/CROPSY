const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class BillingInMemoryRepository extends InMemoryRepository {}

module.exports = { BillingInMemoryRepository };

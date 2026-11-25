const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class LedgerInMemoryRepository extends InMemoryRepository {}

module.exports = { LedgerInMemoryRepository };

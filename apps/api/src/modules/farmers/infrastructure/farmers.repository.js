const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class FarmersInMemoryRepository extends InMemoryRepository {}

module.exports = { FarmersInMemoryRepository };

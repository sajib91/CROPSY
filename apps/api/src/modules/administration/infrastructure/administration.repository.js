const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class AdministrationInMemoryRepository extends InMemoryRepository {}

module.exports = { AdministrationInMemoryRepository };

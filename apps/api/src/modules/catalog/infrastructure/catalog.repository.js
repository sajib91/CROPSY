const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class CatalogInMemoryRepository extends InMemoryRepository {}

module.exports = { CatalogInMemoryRepository };

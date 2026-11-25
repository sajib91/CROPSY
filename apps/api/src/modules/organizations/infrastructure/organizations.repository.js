const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class OrganizationsInMemoryRepository extends InMemoryRepository {}

module.exports = { OrganizationsInMemoryRepository };

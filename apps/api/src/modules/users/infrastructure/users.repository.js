const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class UsersInMemoryRepository extends InMemoryRepository {}

module.exports = { UsersInMemoryRepository };

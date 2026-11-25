const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class IamInMemoryRepository extends InMemoryRepository {}

module.exports = { IamInMemoryRepository };

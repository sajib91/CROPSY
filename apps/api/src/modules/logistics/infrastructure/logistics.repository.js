const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class LogisticsInMemoryRepository extends InMemoryRepository {}

module.exports = { LogisticsInMemoryRepository };

const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class AnalyticsInMemoryRepository extends InMemoryRepository {}

module.exports = { AnalyticsInMemoryRepository };

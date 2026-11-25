const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class TraceabilityInMemoryRepository extends InMemoryRepository {}

module.exports = { TraceabilityInMemoryRepository };

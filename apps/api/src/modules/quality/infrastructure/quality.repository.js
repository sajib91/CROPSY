const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class QualityInMemoryRepository extends InMemoryRepository {}

module.exports = { QualityInMemoryRepository };

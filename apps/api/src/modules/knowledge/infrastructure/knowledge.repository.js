const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class KnowledgeInMemoryRepository extends InMemoryRepository {}

module.exports = { KnowledgeInMemoryRepository };

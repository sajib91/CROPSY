const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/knowledge.entity');
const { KnowledgeRepositoryToken } = require('./domain/knowledge.repository');
const { KnowledgeInMemoryRepository } = require('./infrastructure/knowledge.repository');
const { KnowledgeService, KnowledgeServiceToken } = require('./application/knowledge.service');
const knowledgeRoutes = require('./presentation/knowledge.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'knowledge',
  description: 'Curated agricultural content, taxonomies, and editorial workflows.',
  dependsOn: ['agriculture', 'intelligence', 'organizations'],
  publishes: ['knowledge.initialized', 'knowledge.article.published'],
  subscribes: [],
  repositoryToken: KnowledgeRepositoryToken,
  repository: KnowledgeInMemoryRepository,
  serviceToken: KnowledgeServiceToken,
  service: KnowledgeService,
  routes: knowledgeRoutes,
});

module.exports = { definition, routes: knowledgeRoutes };

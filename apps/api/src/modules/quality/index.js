const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/quality.entity');
const { QualityRepositoryToken } = require('./domain/quality.repository');
const { QualityInMemoryRepository } = require('./infrastructure/quality.repository');
const { QualityService, QualityServiceToken } = require('./application/quality.service');
const qualityRoutes = require('./presentation/quality.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'quality',
  description: 'Inspection plans, results, certificates, and quality holds.',
  dependsOn: ['organizations', 'catalog', 'farmers'],
  publishes: ['quality.initialized', 'quality.inspection.completed'],
  subscribes: [],
  repositoryToken: QualityRepositoryToken,
  repository: QualityInMemoryRepository,
  serviceToken: QualityServiceToken,
  service: QualityService,
  routes: qualityRoutes,
});

module.exports = { definition, routes: qualityRoutes };

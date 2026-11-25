const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/intelligence.entity');
const { IntelligenceRepositoryToken } = require('./domain/intelligence.repository');
const { IntelligenceInMemoryRepository } = require('./infrastructure/intelligence.repository');
const {
  IntelligenceService,
  IntelligenceServiceToken,
} = require('./application/intelligence.service');
const intelligenceRoutes = require('./presentation/intelligence.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'intelligence',
  description: 'Forecasts, recommendations, and agronomic model outputs.',
  dependsOn: ['agriculture', 'traceability', 'orders'],
  publishes: ['intelligence.initialized', 'intelligence.forecast.generated'],
  subscribes: [],
  repositoryToken: IntelligenceRepositoryToken,
  repository: IntelligenceInMemoryRepository,
  serviceToken: IntelligenceServiceToken,
  service: IntelligenceService,
  routes: intelligenceRoutes,
});

module.exports = { definition, routes: intelligenceRoutes };

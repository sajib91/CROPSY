const {
  AgricultureAccessPortToken,
  ConfigToken,
  FarmAccessPortToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/intelligence.entity');
const { AiGatewayToken } = require('./domain/ai-gateway.entity');
const { IntelligenceRepositoryToken } = require('./domain/intelligence.repository');
const { IntelligenceInMemoryRepository } = require('./infrastructure/intelligence.repository');
const { createAiGateway } = require('./infrastructure/http-ai-gateway');
const {
  IntelligenceService,
  IntelligenceServiceToken,
} = require('./application/intelligence.service');
const intelligenceRoutes = require('./presentation/intelligence.routes');

function registerAiGateway({ container }) {
  // Overrides (tests and composition root) win; never register twice.
  if (container.has(AiGatewayToken)) return;
  container.register(AiGatewayToken, (resolver) => createAiGateway(resolver.resolve(ConfigToken)));
}

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
  serviceDependencies: {
    aiGateway: AiGatewayToken,
    farmAccess: FarmAccessPortToken,
    agricultureAccess: AgricultureAccessPortToken,
  },
  routes: intelligenceRoutes,
  subscriptions: registerAiGateway,
});

module.exports = { definition, routes: intelligenceRoutes, registerAiGateway };

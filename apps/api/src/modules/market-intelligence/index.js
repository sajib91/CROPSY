const {
  AiGatewayToken,
  ConfigToken,
  MarketObservationPortToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/market-intelligence.entity');
const { MarketIntelligenceRepositoryToken } = require('./domain/market-intelligence.repository');
const { MarketIntelligenceInMemoryRepository } = require('./infrastructure');
const {
  MarketIntelligenceService,
  MarketIntelligenceServiceToken,
  EVENTS,
} = require('./application/market-intelligence.service');
const marketIntelligenceRoutes = require('./presentation/market-intelligence.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'market-intelligence',
  description:
    'Read-only market analytics from collected marketplace observations and verified external evidence.',
  dependsOn: ['catalog', 'marketplace', 'intelligence'],
  publishes: [...new Set(Object.values(EVENTS || {}))],
  subscribes: [],
  repositoryToken: MarketIntelligenceRepositoryToken,
  repository: MarketIntelligenceInMemoryRepository,
  serviceToken: MarketIntelligenceServiceToken,
  service: MarketIntelligenceService,
  serviceDependencies: {
    marketObservation: MarketObservationPortToken,
    aiGateway: AiGatewayToken,
    config: ConfigToken,
  },
  routes: marketIntelligenceRoutes,
});

module.exports = { definition, routes: marketIntelligenceRoutes };

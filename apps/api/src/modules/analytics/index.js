const { ConfigToken } = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { ANALYTICS_EVENTS, MODULE_ID, MODULE_NAME } = require('./domain/analytics.entity');
const { AnalyticsRepositoryToken, AnalyticsStoreToken } = require('./domain/analytics.repository');
const {
  AnalyticsInMemoryRepository,
  AnalyticsInMemoryStore,
  AnalyticsPrismaStore,
} = require('./infrastructure');
const { AnalyticsService, AnalyticsServiceToken } = require('./application/analytics.service');
const analyticsRoutes = require('./presentation/analytics.routes');

function registerAnalyticsInfrastructure({ container }) {
  if (container.has(AnalyticsStoreToken)) return;
  container.register(AnalyticsStoreToken, (resolver) => {
    const env = resolver.resolve(ConfigToken);
    if (env.ANALYTICS_STORE === 'prisma') {
      const { getPrismaClient } = require('../../shared/database/prisma');
      return new AnalyticsPrismaStore({ prisma: getPrismaClient(env) });
    }
    return new AnalyticsInMemoryStore();
  });
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'analytics',
  description:
    'Read-only tenant and platform reports with explicit historical, calculated, and predictive sections.',
  dependsOn: [
    'agriculture',
    'catalog',
    'farmers',
    'intelligence',
    'logistics',
    'marketplace',
    'orders',
    'payments',
    'warehouse',
  ],
  publishes: [...new Set(Object.values(ANALYTICS_EVENTS))],
  subscribes: [],
  repositoryToken: AnalyticsRepositoryToken,
  repository: AnalyticsInMemoryRepository,
  serviceToken: AnalyticsServiceToken,
  service: AnalyticsService,
  serviceDependencies: { store: AnalyticsStoreToken },
  routes: analyticsRoutes,
  subscriptions: registerAnalyticsInfrastructure,
});

module.exports = { definition, routes: analyticsRoutes, registerAnalyticsInfrastructure };

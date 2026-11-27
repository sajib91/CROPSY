const {
  AgricultureAccessPortToken,
  ConfigToken,
  FarmAccessPortToken,
  IdentityStoreToken,
  PlatformAuthorizationToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/agriculture.entity');
const {
  AgricultureRepositoryToken,
  AgricultureStoreToken,
} = require('./domain/agriculture.repository');
const {
  AgricultureInMemoryRepository,
  AgricultureInMemoryStore,
  AgriculturePrismaStore,
} = require('./infrastructure');
const {
  AgricultureService,
  AgricultureServiceToken,
  EVENTS,
} = require('./application/agriculture.service');
const agricultureRoutes = require('./presentation/agriculture.routes');

function registerAgricultureStore({ container }) {
  if (!container.has(AgricultureStoreToken)) {
    container.register(AgricultureStoreToken, (resolver) => {
      const env = resolver.resolve(ConfigToken);
      if (env.AGRICULTURE_STORE === 'prisma') {
        const { getPrismaClient } = require('../../shared/database/prisma');
        return new AgriculturePrismaStore({
          prisma: getPrismaClient(resolver.resolve(ConfigToken)),
        });
      }
      return new AgricultureInMemoryStore();
    });
  }

  if (!container.has(AgricultureAccessPortToken)) {
    container.register(AgricultureAccessPortToken, (resolver) => {
      const store = resolver.resolve(AgricultureStoreToken);
      return Object.freeze({
        findCultivation: (id) => store.findCultivation(id),
        listCultivations: (filters) => store.listCultivations(filters),
      });
    });
  }
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'agriculture',
  description:
    'Crop catalog, calendars, cultivations, activities, harvests, and production expenses.',
  dependsOn: ['organizations', 'farmers'],
  publishes: [...new Set(Object.values(EVENTS))],
  subscribes: [],
  repositoryToken: AgricultureRepositoryToken,
  repository: AgricultureInMemoryRepository,
  serviceToken: AgricultureServiceToken,
  service: AgricultureService,
  serviceDependencies: {
    store: AgricultureStoreToken,
    farmAccess: FarmAccessPortToken,
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
    config: ConfigToken,
  },
  routes: agricultureRoutes,
  subscriptions: registerAgricultureStore,
});

module.exports = { definition, routes: agricultureRoutes, registerAgricultureStore };

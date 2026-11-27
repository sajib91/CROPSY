const {
  CatalogAccessPortToken,
  ConfigToken,
  FarmAccessPortToken,
  IdentityStoreToken,
  PlatformAuthorizationToken,
  WarehouseAccessPortToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/farmers.entity');
const { FarmersRepositoryToken } = require('./domain/farmers.repository');
const { FarmStoreToken } = require('./domain/farm.repository');
const {
  FarmersInMemoryRepository,
  FarmInMemoryStore,
  FarmPrismaStore,
} = require('./infrastructure');
const { FarmersService, FarmersServiceToken, EVENTS } = require('./application/farmers.service');
const farmersRoutes = require('./presentation/farmers.routes');

function registerFarmStore({ container }) {
  if (container.has(FarmStoreToken)) return;

  container.register(FarmStoreToken, (resolver) => {
    const env = resolver.resolve(ConfigToken);
    if (env.FARM_STORE === 'prisma') {
      const { getPrismaClient } = require('../../shared/database/prisma');
      return new FarmPrismaStore({ prisma: getPrismaClient(resolver.resolve(ConfigToken)) });
    }
    return new FarmInMemoryStore();
  });

  // Read-only composition port. Agriculture uses this to validate farm scope
  // without importing the farmers module or gaining mutation capabilities.
  container.register(FarmAccessPortToken, (resolver) => {
    const store = resolver.resolve(FarmStoreToken);
    return Object.freeze({
      findFarmById: (id) => store.findFarmById(id),
      listFarms: (filters) => store.listFarms(filters),
    });
  });
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'farmers',
  description:
    'Farmer profiles, farms, cooperative groups, campaigns, contributions, allocations, and earnings.',
  dependsOn: ['iam', 'users', 'organizations', 'catalog', 'warehouse'],
  publishes: ['farmers.initialized', 'farmers.registered', ...new Set(Object.values(EVENTS))],
  subscribes: [],
  repositoryToken: FarmersRepositoryToken,
  repository: FarmersInMemoryRepository,
  serviceToken: FarmersServiceToken,
  service: FarmersService,
  serviceDependencies: {
    farmStore: FarmStoreToken,
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
    config: ConfigToken,
    catalog: CatalogAccessPortToken,
    warehouseAccess: WarehouseAccessPortToken,
  },
  routes: farmersRoutes,
  subscriptions: registerFarmStore,
});

module.exports = { definition, routes: farmersRoutes, registerFarmStore };

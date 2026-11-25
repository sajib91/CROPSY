const {
  CatalogAccessPortToken,
  ConfigToken,
  IdentityStoreToken,
  PlatformAuthorizationToken,
  WarehouseAccessPortToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/warehouse.entity');
const { WarehouseRepositoryToken, WarehouseStoreToken } = require('./domain/warehouse.repository');
const {
  WarehouseInMemoryRepository,
  WarehouseInMemoryStore,
  WarehousePrismaStore,
} = require('./infrastructure');
const {
  WarehouseService,
  WarehouseServiceToken,
  EVENTS,
} = require('./application/warehouse.service');
const warehouseRoutes = require('./presentation/warehouse.routes');

function copy(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function registerWarehouseInfrastructure({ container }) {
  if (!container.has(WarehouseStoreToken)) {
    container.register(WarehouseStoreToken, (resolver) => {
      const env = resolver.resolve(ConfigToken);
      if (env.WAREHOUSE_STORE === 'prisma') {
        const { PrismaClient } = require('@prisma/client');
        return new WarehousePrismaStore({ prisma: new PrismaClient() });
      }
      return new WarehouseInMemoryStore();
    });
  }

  // Read-only composition port. Farmers uses it to validate cooperative stock
  // references; it deliberately exposes no mutation or reservation methods.
  if (!container.has(WarehouseAccessPortToken)) {
    container.register(WarehouseAccessPortToken, (resolver) => {
      const store = resolver.resolve(WarehouseStoreToken);
      return Object.freeze({
        findWarehouseById: async (id) => copy(await store.findWarehouse(id)),
        findInventoryById: async (id) => copy(await store.findInventoryById(id)),
        listInventories: async (filters) => (await store.listInventories(filters)).map(copy),
      });
    });
  }
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'warehouse',
  description:
    'Warehouses, stock registration, reservations, movements, alerts, and inventory history.',
  dependsOn: ['organizations', 'catalog', 'iam'],
  publishes: ['warehouse.initialized', ...new Set(Object.values(EVENTS))],
  subscribes: [],
  repositoryToken: WarehouseRepositoryToken,
  repository: WarehouseInMemoryRepository,
  serviceToken: WarehouseServiceToken,
  service: WarehouseService,
  serviceDependencies: {
    store: WarehouseStoreToken,
    catalog: CatalogAccessPortToken,
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
    config: ConfigToken,
  },
  routes: warehouseRoutes,
  subscriptions: registerWarehouseInfrastructure,
});

module.exports = { definition, routes: warehouseRoutes, registerWarehouseInfrastructure };

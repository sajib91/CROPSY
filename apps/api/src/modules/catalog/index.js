const {
  CatalogAccessPortToken,
  ConfigToken,
  IdentityStoreToken,
  PlatformAuthorizationToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/catalog.entity');
const { CatalogRepositoryToken, CatalogStoreToken } = require('./domain/catalog.repository');
const {
  CatalogInMemoryRepository,
  CatalogInMemoryStore,
  CatalogPrismaStore,
} = require('./infrastructure');
const { CatalogService, CatalogServiceToken, EVENTS } = require('./application/catalog.service');
const catalogRoutes = require('./presentation/catalog.routes');

function copy(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function registerCatalogInfrastructure({ container }) {
  if (!container.has(CatalogStoreToken)) {
    container.register(CatalogStoreToken, (resolver) => {
      const env = resolver.resolve(ConfigToken);
      if (env.CATALOG_STORE === 'prisma') {
        const { PrismaClient } = require('@prisma/client');
        return new CatalogPrismaStore({ prisma: new PrismaClient() });
      }
      return new CatalogInMemoryStore();
    });
  }

  // Marketplace consumes this read-only composition port. It deliberately
  // exposes persistence records rather than the catalog service so no buyer-
  // facing route can mutate catalog data through the port.
  if (!container.has(CatalogAccessPortToken)) {
    container.register(CatalogAccessPortToken, (resolver) => {
      const store = resolver.resolve(CatalogStoreToken);
      return {
        findProduct: async (id) => {
          const product = await store.findProduct(id);
          return product && !product.deleted_at && product.is_available ? copy(product) : null;
        },
        findCategory: async (id) => copy(await store.findCategory(id)),
        findUnit: async (id) => copy(await store.findUnit(id)),
        findUnitByCode: async (code) => {
          const rows = await store.listUnits({ code });
          return rows.length ? copy(rows[0]) : null;
        },
        findQualityGrade: async (id) => copy(await store.findQualityGrade(id)),
        findQualityGradeByCode: async (code) => {
          const rows = await store.listQualityGrades({ code });
          return rows.length ? copy(rows[0]) : null;
        },
        listProductImages: async (productId) =>
          (await store.listImages({ product_id: productId })).map(copy),
        listProducts: async () =>
          (await store.listProducts())
            .filter((product) => !product.deleted_at && product.is_available)
            .map(copy),
        listCategories: async () => (await store.listCategories({ is_active: true })).map(copy),
      };
    });
  }
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'catalog',
  description: 'Product taxonomy, flexible attributes, varieties, images, and availability.',
  dependsOn: ['organizations', 'farmers'],
  publishes: [...new Set(Object.values(EVENTS))],
  subscribes: [],
  repositoryToken: CatalogRepositoryToken,
  repository: CatalogInMemoryRepository,
  serviceToken: CatalogServiceToken,
  service: CatalogService,
  serviceDependencies: {
    store: CatalogStoreToken,
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
    config: ConfigToken,
  },
  routes: catalogRoutes,
  subscriptions: registerCatalogInfrastructure,
});

module.exports = { definition, routes: catalogRoutes, registerCatalogInfrastructure };

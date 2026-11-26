const {
  CatalogAccessPortToken,
  ConfigToken,
  IdentityStoreToken,
  MarketplaceAccessPortToken,
  MarketplaceListingStockToken,
  PlatformAuthorizationToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/orders.entity');
const { OrdersRepositoryToken, OrdersStoreToken } = require('./domain/orders.repository');
const {
  OrdersInMemoryRepository,
  OrdersInMemoryStore,
  OrdersPrismaStore,
} = require('./infrastructure');
const { EVENTS, OrdersService, OrdersServiceToken } = require('./application/orders.service');
const ordersRoutes = require('./presentation/orders.routes');

function registerOrdersInfrastructure({ container }) {
  if (container.has(OrdersStoreToken)) return;

  container.register(OrdersStoreToken, (resolver) => {
    const env = resolver.resolve(ConfigToken);
    if (env.ORDERS_STORE === 'prisma') {
      const { PrismaClient } = require('@prisma/client');
      return new OrdersPrismaStore({ prisma: new PrismaClient() });
    }
    return new OrdersInMemoryStore({
      listingStock: resolver.resolve(MarketplaceListingStockToken),
    });
  });
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'orders',
  description: 'Cart, checkout, seller fulfillments, order lifecycle, and receipts.',
  dependsOn: ['marketplace', 'buyers', 'catalog'],
  publishes: [...new Set(Object.values(EVENTS))],
  subscribes: [],
  repositoryToken: OrdersRepositoryToken,
  repository: OrdersInMemoryRepository,
  serviceToken: OrdersServiceToken,
  service: OrdersService,
  serviceDependencies: {
    store: OrdersStoreToken,
    catalog: CatalogAccessPortToken,
    marketplace: MarketplaceAccessPortToken,
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
    config: ConfigToken,
  },
  routes: ordersRoutes,
  subscriptions: registerOrdersInfrastructure,
});

module.exports = { definition, routes: ordersRoutes, registerOrdersInfrastructure };

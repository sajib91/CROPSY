const {
  CatalogAccessPortToken,
  ConfigToken,
  IdentityStoreToken,
  MarketplaceAccessPortToken,
  MarketplaceListingStockToken,
  OrderAccessPortToken,
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
  // Publish a deliberately narrow read-only port. Consumers receive fulfillment
  // facts for delivery and traceability, never order mutation capabilities.
  if (!container.has(OrderAccessPortToken)) {
    container.register(OrderAccessPortToken, (resolver) => {
      const store = resolver.resolve(OrdersStoreToken);
      return {
        async findOrder(orderId) {
          const order = await store.findOrder({ id: orderId });
          if (!order) return null;
          return {
            id: order.id,
            organizationId: order.organization_id ?? null,
            checkoutId: order.purchase_group_id ?? null,
            buyerUserId: order.buyer_user_id ?? null,
            sellerUserId: order.seller_user_id ?? null,
            status: order.status,
            placedAt: order.placed_at ?? null,
            completedAt: order.completed_at ?? null,
          };
        },
      };
    });
  }

  if (container.has(OrdersStoreToken)) return;

  container.register(OrdersStoreToken, (resolver) => {
    const env = resolver.resolve(ConfigToken);
    if (env.ORDERS_STORE === 'prisma') {
      const { getPrismaClient } = require('../../shared/database/prisma');
      return new OrdersPrismaStore({ prisma: getPrismaClient(resolver.resolve(ConfigToken)) });
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

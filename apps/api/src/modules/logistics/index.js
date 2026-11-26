const {
  ConfigToken,
  IdentityStoreToken,
  LogisticsAccessPortToken,
  OrderAccessPortToken,
  PlatformAuthorizationToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/logistics.entity');
const { LogisticsRepositoryToken, LogisticsStoreToken } = require('./domain/logistics.repository');
const {
  LogisticsInMemoryRepository,
  LogisticsInMemoryStore,
  LogisticsPrismaStore,
} = require('./infrastructure');
const {
  EVENTS,
  LogisticsService,
  LogisticsServiceToken,
} = require('./application/logistics.service');
const logisticsRoutes = require('./presentation/logistics.routes');

function registerLogisticsInfrastructure({ container }) {
  if (!container.has(LogisticsStoreToken)) {
    container.register(LogisticsStoreToken, (resolver) => {
      const env = resolver.resolve(ConfigToken);
      if (env.LOGISTICS_STORE === 'prisma') {
        const { PrismaClient } = require('@prisma/client');
        return new LogisticsPrismaStore({ prisma: new PrismaClient() });
      }
      return new LogisticsInMemoryStore();
    });
  }

  if (!container.has(LogisticsAccessPortToken)) {
    container.register(LogisticsAccessPortToken, (resolver) => {
      const store = resolver.resolve(LogisticsStoreToken);
      return {
        async getShipmentFacts(shipmentId) {
          const shipment = await store.findShipment(shipmentId);
          if (!shipment) return null;
          const deliveries = await store.listDeliveries({ shipment_id: shipmentId });
          return {
            id: shipment.id,
            trackingNumber: shipment.tracking_number ?? null,
            status: shipment.status,
            shippedAt: shipment.shipped_at ?? null,
            deliveredAt: shipment.delivered_at ?? null,
            deliveries: deliveries.map((delivery) => ({
              attemptNumber: Number(delivery.attempt_number),
              status: delivery.status,
              deliveredAt: delivery.delivered_at ?? null,
              confirmedAt: delivery.confirmed_at ?? null,
              proofUrl: delivery.proof_url ?? null,
            })),
          };
        },
      };
    });
  }
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'logistics',
  description: 'Shipments, carriers, route events, and delivery milestones.',
  dependsOn: ['orders', 'organizations', 'warehouse'],
  publishes: [...new Set(Object.values(EVENTS))],
  subscribes: [],
  repositoryToken: LogisticsRepositoryToken,
  repository: LogisticsInMemoryRepository,
  serviceToken: LogisticsServiceToken,
  service: LogisticsService,
  serviceDependencies: {
    store: LogisticsStoreToken,
    orderAccess: OrderAccessPortToken,
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
    config: ConfigToken,
  },
  routes: logisticsRoutes,
  subscriptions: registerLogisticsInfrastructure,
});

module.exports = {
  definition,
  routes: logisticsRoutes,
  registerLogisticsInfrastructure,
};

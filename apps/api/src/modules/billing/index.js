const { defineModule } = require('../../shared/module/define-module');
const {
  ConfigToken,
  PaymentProviderRegistryToken,
  PlatformAuthorizationToken,
  SubscriptionEntitlementPortToken,
} = require('../../shared/di/tokens');
const { MODULE_ID, MODULE_NAME, BILLING_EVENTS } = require('./domain/billing.entity');
const { BillingRepositoryToken, BillingStoreToken } = require('./domain/billing.repository');
const {
  BillingInMemoryRepository,
  BillingInMemoryStore,
  BillingPrismaStore,
} = require('./infrastructure');
const { BillingService, BillingServiceToken } = require('./application/billing.service');
const billingRoutes = require('./presentation/billing.routes');

function registerBillingInfrastructure({ container }) {
  if (!container.has(BillingStoreToken)) {
    container.register(BillingStoreToken, (resolver) => {
      const env = resolver.resolve(ConfigToken);
      if (env.BILLING_STORE === 'prisma') {
        const { getPrismaClient } = require('../../shared/database/prisma');
        return new BillingPrismaStore({ prisma: getPrismaClient(env) });
      }
      return new BillingInMemoryStore();
    });
  }

  if (!container.has(SubscriptionEntitlementPortToken)) {
    container.register(SubscriptionEntitlementPortToken, (resolver) => {
      const service = resolver.resolve(BillingServiceToken);
      return Object.freeze({
        assertFeature: ({ context, featureCode, organizationId }) =>
          service.assertFeature({ context, featureCode, organizationId }),
        checkFeature: ({ context, input }) => service.checkEntitlement({ context, input }),
        recordUsage: ({ context, input }) => service.recordUsage({ context, input }),
      });
    });
  }
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'billing',
  description: 'Configurable plans, tenant subscriptions, invoices, usage, and entitlements.',
  dependsOn: ['organizations', 'payments', 'ledger'],
  publishes: [...new Set(Object.values(BILLING_EVENTS))],
  subscribes: [],
  repositoryToken: BillingRepositoryToken,
  repository: BillingInMemoryRepository,
  serviceToken: BillingServiceToken,
  service: BillingService,
  serviceDependencies: {
    store: BillingStoreToken,
    providerRegistry: PaymentProviderRegistryToken,
    authorization: PlatformAuthorizationToken,
  },
  routes: billingRoutes,
  subscriptions: registerBillingInfrastructure,
});

module.exports = { definition, routes: billingRoutes, registerBillingInfrastructure };

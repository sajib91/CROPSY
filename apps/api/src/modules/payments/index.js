const {
  ConfigToken,
  IdentityStoreToken,
  LedgerPostingPortToken,
  PaymentProviderRegistryToken,
  PlatformAuthorizationToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { DomainError } = require('../../shared/kernel/errors');
const { MODULE_ID, MODULE_NAME } = require('./domain/payments.entity');
const { PaymentsRepositoryToken, PaymentsStoreToken } = require('./domain/payments.repository');
const {
  HttpPaymentProvider,
  MockPaymentProvider,
  PaymentProviderRegistry,
  PaymentsInMemoryRepository,
  PaymentsInMemoryStore,
  PaymentsPrismaStore,
  parseProviderConfig,
} = require('./infrastructure');
const { EVENTS, PaymentsService, PaymentsServiceToken } = require('./application/payments.service');
const paymentsRoutes = require('./presentation/payments.routes');

function buildProviderRegistry(env) {
  const configs = parseProviderConfig(env.PAYMENT_PROVIDERS_JSON);
  if (env.PAYMENT_PROVIDER_MODE === 'mock') {
    if (env.NODE_ENV !== 'test') {
      throw new DomainError({
        message: 'The mock payment adapter can only be enabled in automated tests.',
      });
    }
    return new PaymentProviderRegistry(
      configs.map((config) => ({
        code: config.code,
        methods: config.methods || [],
        adapter: new MockPaymentProvider({
          code: config.code,
          methods: config.methods || [],
          webhookSecret: config.webhookSecret,
        }),
      })),
    );
  }

  return new PaymentProviderRegistry(
    configs.map((config) => ({
      code: config.code,
      methods: config.methods || [],
      adapter: new HttpPaymentProvider(config),
    })),
  );
}

function registerPaymentsInfrastructure({ container }) {
  if (!container.has(PaymentsStoreToken)) {
    container.register(PaymentsStoreToken, (resolver) => {
      const env = resolver.resolve(ConfigToken);
      if (env.PAYMENTS_STORE === 'prisma') {
        const { PrismaClient } = require('@prisma/client');
        return new PaymentsPrismaStore({ prisma: new PrismaClient() });
      }
      return new PaymentsInMemoryStore();
    });
  }

  if (!container.has(PaymentProviderRegistryToken)) {
    container.register(PaymentProviderRegistryToken, (resolver) =>
      buildProviderRegistry(resolver.resolve(ConfigToken)),
    );
  }
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'payments',
  description: 'Provider-agnostic payment attempts, callbacks, refunds, and history.',
  dependsOn: ['orders', 'organizations', 'ledger'],
  publishes: [...new Set(Object.values(EVENTS))],
  subscribes: [],
  repositoryToken: PaymentsRepositoryToken,
  repository: PaymentsInMemoryRepository,
  serviceToken: PaymentsServiceToken,
  service: PaymentsService,
  serviceDependencies: {
    store: PaymentsStoreToken,
    providerRegistry: PaymentProviderRegistryToken,
    ledger: LedgerPostingPortToken,
    config: ConfigToken,
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
  },
  routes: paymentsRoutes,
  subscriptions: registerPaymentsInfrastructure,
});

module.exports = {
  definition,
  routes: paymentsRoutes,
  registerPaymentsInfrastructure,
  buildProviderRegistry,
};

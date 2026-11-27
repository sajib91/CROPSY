const {
  ConfigToken,
  IdentityStoreToken,
  LedgerPostingPortToken,
  PlatformAuthorizationToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/ledger.entity');
const { LedgerRepositoryToken, LedgerStoreToken } = require('./domain/ledger.repository');
const {
  LedgerInMemoryRepository,
  LedgerInMemoryStore,
  LedgerPrismaStore,
} = require('./infrastructure');
const { EVENTS, LedgerService, LedgerServiceToken } = require('./application/ledger.service');
const ledgerRoutes = require('./presentation/ledger.routes');

function registerLedgerInfrastructure({ container }) {
  if (!container.has(LedgerStoreToken)) {
    container.register(LedgerStoreToken, (resolver) => {
      const env = resolver.resolve(ConfigToken);
      if (env.LEDGER_STORE === 'prisma') {
        const { getPrismaClient } = require('../../shared/database/prisma');
        return new LedgerPrismaStore({ prisma: getPrismaClient(resolver.resolve(ConfigToken)) });
      }
      return new LedgerInMemoryStore();
    });
  }

  // Payments may record financial effects and reconciliation expectations
  // through this narrow port, but cannot alter ledger accounts or balances.
  if (!container.has(LedgerPostingPortToken)) {
    container.register(LedgerPostingPortToken, (resolver) => {
      const service = resolver.resolve(LedgerServiceToken);
      return Object.freeze({
        recordExpectation: (input) => service.recordExpectation(input),
        postJournal: (input) => service.postJournalFromPort(input),
        getBalance: (filters) => service.getBalanceFromPort(filters),
        accountCodes: () => service.accountCodes(),
      });
    });
  }
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'ledger',
  description: 'Immutable double-entry accounts, postings, and balances.',
  dependsOn: ['orders', 'organizations'],
  publishes: [...new Set(Object.values(EVENTS))],
  subscribes: [],
  repositoryToken: LedgerRepositoryToken,
  repository: LedgerInMemoryRepository,
  serviceToken: LedgerServiceToken,
  service: LedgerService,
  serviceDependencies: {
    store: LedgerStoreToken,
    config: ConfigToken,
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
  },
  routes: ledgerRoutes,
  subscriptions: registerLedgerInfrastructure,
});

module.exports = { definition, routes: ledgerRoutes, registerLedgerInfrastructure };

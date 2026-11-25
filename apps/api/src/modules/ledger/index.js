const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/ledger.entity');
const { LedgerRepositoryToken } = require('./domain/ledger.repository');
const { LedgerInMemoryRepository } = require('./infrastructure/ledger.repository');
const { LedgerService, LedgerServiceToken } = require('./application/ledger.service');
const ledgerRoutes = require('./presentation/ledger.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'ledger',
  description: 'Immutable double-entry accounts, postings, and balances.',
  dependsOn: ['payments', 'orders', 'organizations'],
  publishes: ['ledger.initialized', 'ledger.entry.posted'],
  subscribes: [],
  repositoryToken: LedgerRepositoryToken,
  repository: LedgerInMemoryRepository,
  serviceToken: LedgerServiceToken,
  service: LedgerService,
  routes: ledgerRoutes,
});

module.exports = { definition, routes: ledgerRoutes };

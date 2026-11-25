const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/billing.entity');
const { BillingRepositoryToken } = require('./domain/billing.repository');
const { BillingInMemoryRepository } = require('./infrastructure/billing.repository');
const { BillingService, BillingServiceToken } = require('./application/billing.service');
const billingRoutes = require('./presentation/billing.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'billing',
  description: 'Plans, subscriptions, invoices, and tenant entitlement state.',
  dependsOn: ['organizations', 'payments', 'ledger'],
  publishes: ['billing.initialized', 'billing.subscription.changed'],
  subscribes: [],
  repositoryToken: BillingRepositoryToken,
  repository: BillingInMemoryRepository,
  serviceToken: BillingServiceToken,
  service: BillingService,
  routes: billingRoutes,
});

module.exports = { definition, routes: billingRoutes };

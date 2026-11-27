const { defineRepositoryToken } = require('../../../shared/domain/repository');

const BillingRepositoryToken = defineRepositoryToken('billing');

/**
 * Persistence port for configurable plans, tenant subscriptions, invoices,
 * and usage records. Implementations must be adapters only; pricing and
 * policy decisions stay in the application service.
 */
const BillingStoreToken = defineRepositoryToken('billing.store');

const BILLING_STORE_METHODS = Object.freeze([
  'createPlan',
  'findPlanById',
  'findPlanByCode',
  'listPlans',
  'updatePlan',
  'createSubscription',
  'findSubscriptionById',
  'findActiveSubscription',
  'listSubscriptions',
  'updateSubscription',
  'createInvoice',
  'findInvoiceById',
  'listInvoices',
  'updateInvoice',
  'recordUsage',
  'listUsage',
]);

module.exports = { BillingRepositoryToken, BillingStoreToken, BILLING_STORE_METHODS };

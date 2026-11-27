const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'billing';
const MODULE_NAME = 'Subscription and SaaS Billing';

// Segment codes are descriptive plan metadata. They are configurable by
// callers; the platform does not assume that every role needs a paid plan.
const PLAN_SEGMENTS = Object.freeze([
  'INDIVIDUAL_FARMER',
  'FARMER_COOPERATIVE',
  'AGRICULTURAL_BUSINESS',
  'SUPPLIER',
  'LOGISTICS_COMPANY',
]);

const BILLING_INTERVALS = Object.freeze(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_TIME']);
const SUBSCRIPTION_STATUSES = Object.freeze([
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
]);
const ACTIVE_SUBSCRIPTION_STATUSES = Object.freeze(['TRIALING', 'ACTIVE', 'PAST_DUE']);
const INVOICE_STATUSES = Object.freeze(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE']);

const BILLING_EVENTS = Object.freeze({
  PLAN_CREATED: 'billing.plan.created',
  PLAN_UPDATED: 'billing.plan.updated',
  SUBSCRIPTION_CREATED: 'billing.subscription.created',
  SUBSCRIPTION_RENEWED: 'billing.subscription.renewed',
  SUBSCRIPTION_CHANGED: 'billing.subscription.changed',
  SUBSCRIPTION_CANCELLED: 'billing.subscription.cancelled',
  INVOICE_ISSUED: 'billing.invoice.issued',
  INVOICE_UPDATED: 'billing.invoice.updated',
  USAGE_RECORDED: 'billing.usage.recorded',
});

class BillingEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = {
  ACTIVE_SUBSCRIPTION_STATUSES,
  BILLING_EVENTS,
  BILLING_INTERVALS,
  INVOICE_STATUSES,
  MODULE_ID,
  MODULE_NAME,
  PLAN_SEGMENTS,
  SUBSCRIPTION_STATUSES,
  BillingEntity,
};

const { randomUUID } = require('node:crypto');

const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { assertRepository } = require('../../../shared/domain/repository');
const {
  ACTIVE_SUBSCRIPTION_STATUSES,
  BILLING_STORE_METHODS,
  BillingStoreToken,
} = require('../domain');

function clone(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  }
  return value;
}

function matches(value, filters, keys) {
  return keys.every((key) => {
    const expected = filters[key];
    if (expected === undefined) return true;
    return clone(value[key]) === clone(expected);
  });
}

class BillingInMemoryStore {
  constructor() {
    this.plans = new Map();
    this.subscriptions = new Map();
    this.invoices = new Map();
    this.usage = new Map();
    assertRepository(this, BILLING_STORE_METHODS, BillingStoreToken);
  }

  async createPlan(input) {
    if (await this.findPlanByCode(input.code)) {
      throw new ConflictError({ message: `Plan code '${input.code}' is already in use.` });
    }
    const timestamp = new Date();
    const plan = {
      ...clone(input),
      id: input.id || randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.plans.set(plan.id, clone(plan));
    return clone(plan);
  }

  async findPlanById(planId) {
    const plan = this.plans.get(planId);
    return plan ? clone(plan) : null;
  }

  async findPlanByCode(code) {
    const plan = [...this.plans.values()].find((entry) => entry.code === code);
    return plan ? clone(plan) : null;
  }

  async listPlans(filters = {}) {
    const search = filters.search?.toLowerCase();
    return [...this.plans.values()]
      .filter((plan) => matches(plan, filters, ['isActive']))
      .filter((plan) => !filters.segmentCode || plan.segmentCodes.includes(filters.segmentCode))
      .filter(
        (plan) =>
          !search ||
          plan.code.toLowerCase().includes(search) ||
          plan.name.toLowerCase().includes(search),
      )
      .map(clone);
  }

  async updatePlan(planId, patch) {
    const plan = await this.findPlanById(planId);
    if (!plan) throw new NotFoundError({ message: 'Subscription plan was not found.' });
    const updated = { ...plan, ...clone(patch), id: plan.id, updatedAt: new Date() };
    this.plans.set(plan.id, clone(updated));
    return clone(updated);
  }

  async createSubscription(input) {
    if (ACTIVE_SUBSCRIPTION_STATUSES.includes(input.status)) {
      const active = await this.findActiveSubscription(input.organizationId);
      if (active) {
        throw new ConflictError({
          message: 'This organization already has an active subscription.',
          details: { code: 'subscription_already_active', subscriptionId: active.id },
        });
      }
    }
    const timestamp = new Date();
    const subscription = {
      ...clone(input),
      id: input.id || randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.subscriptions.set(subscription.id, clone(subscription));
    return clone(subscription);
  }

  async findSubscriptionById(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    return subscription ? clone(subscription) : null;
  }

  async findActiveSubscription(organizationId) {
    const subscription = [...this.subscriptions.values()].find(
      (entry) =>
        entry.organizationId === organizationId &&
        ACTIVE_SUBSCRIPTION_STATUSES.includes(entry.status),
    );
    return subscription ? clone(subscription) : null;
  }

  async listSubscriptions(filters = {}) {
    return [...this.subscriptions.values()]
      .filter((subscription) => matches(subscription, filters, ['organizationId', 'status']))
      .map(clone);
  }

  async updateSubscription(subscriptionId, patch) {
    const subscription = await this.findSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new NotFoundError({ message: 'Subscription was not found.' });
    }
    const updated = {
      ...subscription,
      ...clone(patch),
      id: subscription.id,
      updatedAt: new Date(),
    };
    this.subscriptions.set(subscription.id, clone(updated));
    return clone(updated);
  }

  async createInvoice(input) {
    if (await this.findInvoiceByNumber(input.invoiceNumber)) {
      throw new ConflictError({ message: 'Invoice number is already in use.' });
    }
    const timestamp = new Date();
    const invoice = {
      ...clone(input),
      id: input.id || randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.invoices.set(invoice.id, clone(invoice));
    return clone(invoice);
  }

  async findInvoiceById(invoiceId) {
    const invoice = this.invoices.get(invoiceId);
    return invoice ? clone(invoice) : null;
  }

  async findInvoiceByNumber(invoiceNumber) {
    const invoice = [...this.invoices.values()].find(
      (entry) => entry.invoiceNumber === invoiceNumber,
    );
    return invoice ? clone(invoice) : null;
  }

  async listInvoices(filters = {}) {
    return [...this.invoices.values()]
      .filter((invoice) =>
        matches(invoice, filters, ['organizationId', 'subscriptionId', 'status']),
      )
      .map(clone);
  }

  async updateInvoice(invoiceId, patch) {
    const invoice = await this.findInvoiceById(invoiceId);
    if (!invoice) throw new NotFoundError({ message: 'Invoice was not found.' });
    const updated = { ...invoice, ...clone(patch), id: invoice.id, updatedAt: new Date() };
    this.invoices.set(invoice.id, clone(updated));
    return clone(updated);
  }

  async recordUsage(input) {
    const timestamp = new Date();
    const usage = {
      ...clone(input),
      id: input.id || randomUUID(),
      recordedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.usage.set(usage.id, clone(usage));
    return clone(usage);
  }

  async listUsage(filters = {}) {
    return [...this.usage.values()]
      .filter(
        (usage) =>
          matches(usage, filters, ['organizationId', 'subscriptionId', 'metricCode']) &&
          (!filters.from || usage.periodEnd >= filters.from) &&
          (!filters.to || usage.periodStart <= filters.to),
      )
      .map(clone);
  }
}

module.exports = { BillingInMemoryStore };

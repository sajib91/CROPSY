const { randomUUID } = require('node:crypto');

const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const {
  ACTIVE_SUBSCRIPTION_STATUSES,
  BILLING_EVENTS,
  BillingEntity,
  BillingRepositoryToken,
  BILLING_STORE_METHODS,
  BillingStoreToken,
  MODULE_ID,
} = require('../domain');
const dto = require('./billing.dto');

const BillingServiceToken = Symbol.for('cropsy.service.billing');

const INTERVAL_MONTHS = Object.freeze({ MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 });
const DAY_MS = 24 * 60 * 60 * 1000;

function addMonths(value, months) {
  const date = new Date(value.getTime());
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const daysInTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, daysInTargetMonth));
  return date;
}

function entitlementEnabled(value) {
  if (value === true) return true;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (value && typeof value === 'object') return value.enabled !== false;
  return false;
}

function paginate(rows, query) {
  const sorted = [...rows];
  const direction = query.sort === 'oldest' ? -1 : 1;
  sorted.sort(
    (left, right) =>
      direction * (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
  );
  return {
    items: sorted.slice(query.offset, query.offset + query.limit),
    pagination: {
      total: rows.length,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + query.limit < rows.length,
    },
  };
}

class BillingService {
  constructor({ repository, store, providerRegistry, authorization, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], BillingRepositoryToken);
    assertRepository(store, BILLING_STORE_METHODS, BillingStoreToken);
    assertRepository(providerRegistry, ['get', 'list'], 'PaymentProviderRegistry');
    if (!authorization || typeof authorization.assertOrganization !== 'function') {
      throw new TypeError('BillingService requires a platform authorization port.');
    }
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('BillingService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('BillingService requires module metadata.');
    }
    this.repository = repository;
    this.store = store;
    this.providerRegistry = providerRegistry;
    this.authorization = authorization;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new BillingEntity();
      await this.repository.save(entity);
      this.eventBus.publish({
        type: `${MODULE_ID}.initialized`,
        moduleId: MODULE_ID,
        aggregateId: entity.id,
        payload: { name: entity.name },
      });
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    return validate(
      dto.moduleInfoSchema,
      dto.toModuleInfoDto(entity, this.metadata),
      'billing module info',
    );
  }

  publish(type, context, entityId, after) {
    this.eventBus.publish({
      type,
      moduleId: this.metadata.id,
      aggregateId: entityId || context?.user?.id || 'anonymous',
      payload: {
        actorUserId: context?.user?.id || null,
        organizationId: context?.organizationId || null,
        ...after,
      },
    });
  }

  async assertProvider(providerCode) {
    if (!providerCode) return null;
    try {
      return this.providerRegistry.get(providerCode).code;
    } catch (error) {
      throw new ValidationError({
        message: `Payment provider '${providerCode}' is not configured.`,
        details: { providerCode, cause: error?.message || null },
      });
    }
  }

  async resolveOrganizationId(context, requestedOrganizationId, { required = true } = {}) {
    const organizationId = requestedOrganizationId || context.organizationId || null;
    if (!organizationId) {
      if (!required) return null;
      throw new ForbiddenError({
        message: 'An active organization context is required for billing.',
        details: { code: 'organization_context_required' },
      });
    }
    await this.authorization.assertOrganization(context, organizationId);
    return organizationId;
  }

  async requirePlanByCode(code) {
    const plan = await this.store.findPlanByCode(code);
    if (!plan || !plan.isActive) {
      throw new NotFoundError({ message: `Subscription plan '${code}' is not available.` });
    }
    return plan;
  }

  periodEndFor(plan, startsAt) {
    if (plan.billingInterval === 'ONE_TIME') return null;
    const months =
      plan.billingCycleMonths || INTERVAL_MONTHS[plan.billingInterval] || INTERVAL_MONTHS.MONTHLY;
    return addMonths(new Date(startsAt), months);
  }

  currentPeriod(subscription, plan) {
    let start = new Date(subscription.startsAt);
    let end = subscription.endsAt || this.periodEndFor(plan, start);
    if (!end) {
      return { start, end: new Date(Math.max(Date.now(), start.getTime() + DAY_MS)) };
    }
    const intervalMs = (plan.billingCycleMonths || 1) * 30 * DAY_MS;
    while (end.getTime() <= Date.now() && intervalMs > 0 && end.getTime() - start.getTime() > 0) {
      start = new Date(end);
      end = this.periodEndFor(plan, start);
      if (!end) break;
    }
    return { start, end };
  }

  async usageForMetric(subscriptionId, metricCode, period) {
    const records = await this.store.listUsage({
      subscriptionId,
      metricCode,
      from: period.start,
      to: period.end,
    });
    return records.reduce((total, record) => total + Number(record.quantity || 0), 0);
  }

  async listPlans({ query = {} }) {
    const value = validate(dto.planQuerySchema, query, 'plan query');
    const plans = await this.store.listPlans({
      search: value.search,
      segmentCode: value.segmentCode,
      isActive: value.isActive,
    });
    const sorted = [...plans];
    if (value.sort === 'name') {
      sorted.sort((left, right) => left.name.localeCompare(right.name));
    } else if (value.sort === 'price') {
      sorted.sort((left, right) => Number(left.priceAmount) - Number(right.priceAmount));
    } else {
      sorted.sort(
        (left, right) =>
          (value.sort === 'oldest' ? -1 : 1) *
          (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
      );
    }
    const result = {
      items: sorted.slice(value.offset, value.offset + value.limit).map(dto.toPlanDto),
      pagination: {
        total: plans.length,
        limit: value.limit,
        offset: value.offset,
        hasMore: value.offset + value.limit < plans.length,
      },
    };
    return { plans: result.items, pagination: result.pagination };
  }

  async getPlan({ planId }) {
    const plan = await this.store.findPlanById(planId);
    if (!plan) throw new NotFoundError({ message: 'Subscription plan was not found.' });
    return { plan: dto.toPlanDto(plan) };
  }

  async createPlan({ context, input }) {
    const value = validate(dto.planCreateSchema, input, 'plan input');
    await this.assertProvider(value.providerCode);
    const plan = await this.store.createPlan({
      code: value.code,
      name: value.name,
      description: value.description || null,
      billingInterval: value.billingInterval,
      billingCycleMonths: value.billingCycleMonths ?? null,
      currency: value.currency,
      priceAmount: value.priceAmount,
      trialDays: value.trialDays,
      segmentCodes: value.segmentCodes,
      entitlements: value.entitlements,
      usageLimits: value.usageLimits,
      providerCode: value.providerCode || null,
      isActive: true,
      metadata: value.metadata,
    });
    this.publish(BILLING_EVENTS.PLAN_CREATED, context, plan.id, { planCode: plan.code });
    return { plan: dto.toPlanDto(plan) };
  }

  async updatePlan({ context, planId, input }) {
    const current = await this.store.findPlanById(planId);
    if (!current) throw new NotFoundError({ message: 'Subscription plan was not found.' });
    const value = validate(dto.planUpdateSchema, input, 'plan update');
    if (value.providerCode) await this.assertProvider(value.providerCode);
    const plan = await this.store.updatePlan(planId, value);
    this.publish(BILLING_EVENTS.PLAN_UPDATED, context, plan.id, {
      planCode: plan.code,
      after: value,
    });
    return { plan: dto.toPlanDto(plan) };
  }

  async issueInvoice({ context, subscription, plan, period, amount, providerCode }) {
    const numericAmount = Number(amount || 0);
    if (numericAmount <= 0) return null;
    const invoice = await this.store.createInvoice({
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}-${randomUUID()
        .slice(0, 8)
        .toUpperCase()}`,
      amount: numericAmount,
      currency: plan.currency,
      status: 'OPEN',
      providerCode: providerCode || null,
      periodStart: period.start,
      periodEnd: period.end,
      issuedAt: new Date(),
      dueAt: null,
      paidAt: null,
      metadata: { sourcePlanCode: plan.code },
    });
    this.publish(BILLING_EVENTS.INVOICE_ISSUED, context, invoice.id, {
      organizationId: subscription.organizationId,
      amount: numericAmount,
      currency: plan.currency,
    });
    return invoice;
  }

  async createSubscription({ context, input }) {
    const value = validate(dto.subscriptionCreateSchema, input, 'subscription input');
    const organizationId = await this.resolveOrganizationId(context, value.organizationId);
    const plan = await this.requirePlanByCode(value.planCode);
    const providerCode = await this.assertProvider(value.providerCode || plan.providerCode);
    const active = await this.store.findActiveSubscription(organizationId);
    if (active) {
      throw new ConflictError({
        message: 'This organization already has an active subscription.',
        details: { code: 'subscription_already_active', subscriptionId: active.id },
      });
    }

    const startsAt = value.startsAt ? new Date(value.startsAt) : new Date();
    const trialing = plan.trialDays > 0;
    const endsAt = trialing
      ? new Date(startsAt.getTime() + plan.trialDays * DAY_MS)
      : this.periodEndFor(plan, startsAt);
    const subscription = await this.store.createSubscription({
      organizationId,
      planId: plan.id,
      status: trialing ? 'TRIALING' : 'ACTIVE',
      startsAt,
      endsAt,
      cancelledAt: null,
      providerCode,
      cancelReason: null,
      metadata: value.metadata,
    });
    const invoice = await this.issueInvoice({
      context,
      subscription,
      plan,
      period: { start: startsAt, end: endsAt },
      amount: plan.priceAmount,
      providerCode,
    });
    this.publish(BILLING_EVENTS.SUBSCRIPTION_CREATED, context, subscription.id, {
      organizationId,
      planCode: plan.code,
      status: subscription.status,
    });
    return {
      subscription: dto.toSubscriptionDto(subscription, plan),
      plan: dto.toPlanDto(plan),
      invoice: invoice ? dto.toInvoiceDto(invoice) : null,
    };
  }

  async requireSubscription({ context, subscriptionId, organizationId }) {
    const subscription = await this.store.findSubscriptionById(subscriptionId);
    if (!subscription) throw new NotFoundError({ message: 'Subscription was not found.' });
    const resolved = await this.resolveOrganizationId(
      context,
      organizationId || subscription.organizationId,
    );
    if (resolved !== subscription.organizationId && !context.isSuperAdmin) {
      throw new ForbiddenError({
        message: 'Access to this subscription is denied.',
        details: { code: 'cross_organization_access_denied' },
      });
    }
    const plan = await this.store.findPlanById(subscription.planId);
    if (!plan) throw new NotFoundError({ message: 'The subscription plan was not found.' });
    return { subscription, plan };
  }

  async getCurrentSubscription({ context, query = {} }) {
    const value = validate(dto.subscriptionQuerySchema, query, 'subscription query');
    const organizationId = await this.resolveOrganizationId(context, value.organizationId, {
      required: !context.isSuperAdmin,
    });
    if (!organizationId) return { subscription: null, plan: null, invoices: [], usage: [] };
    const subscription = await this.store.findActiveSubscription(organizationId);
    if (!subscription) return { subscription: null, plan: null, invoices: [], usage: [] };
    const plan = await this.store.findPlanById(subscription.planId);
    const invoices = await this.store.listInvoices({ subscriptionId: subscription.id });
    const usage = await this.store.listUsage({ subscriptionId: subscription.id });
    return {
      subscription: dto.toSubscriptionDto(subscription, plan),
      plan: plan ? dto.toPlanDto(plan) : null,
      invoices: invoices.map(dto.toInvoiceDto),
      usage: usage.map(dto.toUsageDto),
    };
  }

  async listSubscriptions({ context, query = {} }) {
    const value = validate(dto.subscriptionQuerySchema, query, 'subscription query');
    const organizationId = await this.resolveOrganizationId(context, value.organizationId, {
      required: false,
    });
    const filters = {};
    if (organizationId) filters.organizationId = organizationId;
    if (value.status) filters.status = value.status;
    const subscriptions = await this.store.listSubscriptions(filters);
    const result = paginate(subscriptions, value);
    const plans = new Map();
    for (const item of result.items) {
      if (!plans.has(item.planId))
        plans.set(item.planId, await this.store.findPlanById(item.planId));
    }
    return {
      subscriptions: result.items.map((item) =>
        dto.toSubscriptionDto(item, plans.get(item.planId)),
      ),
      pagination: result.pagination,
    };
  }

  async renewSubscription({ context, subscriptionId }) {
    const { subscription, plan } = await this.requireSubscription({ context, subscriptionId });
    if (subscription.status === 'CANCELLED' && subscription.cancelledAt) {
      throw new ConflictError({
        message: 'A cancelled subscription cannot be renewed; create a new subscription instead.',
        details: { code: 'subscription_cancelled' },
      });
    }
    const startsAt = new Date();
    const endsAt = this.periodEndFor(plan, startsAt);
    const renewed = await this.store.updateSubscription(subscriptionId, {
      status: 'ACTIVE',
      startsAt,
      endsAt,
      cancelledAt: null,
      cancelReason: null,
      providerCode: subscription.providerCode || plan.providerCode || null,
    });
    const invoice = await this.issueInvoice({
      context,
      subscription: renewed,
      plan,
      period: { start: startsAt, end: endsAt },
      amount: plan.priceAmount,
      providerCode: renewed.providerCode,
    });
    this.publish(BILLING_EVENTS.SUBSCRIPTION_RENEWED, context, renewed.id, {
      organizationId: renewed.organizationId,
      planCode: plan.code,
    });
    return {
      subscription: dto.toSubscriptionDto(renewed, plan),
      invoice: invoice ? dto.toInvoiceDto(invoice) : null,
    };
  }

  async changePlan({ context, subscriptionId, input }) {
    const value = validate(dto.subscriptionChangePlanSchema, input, 'plan change input');
    const { subscription, plan: currentPlan } = await this.requireSubscription({
      context,
      subscriptionId,
    });
    if (['CANCELLED', 'EXPIRED'].includes(subscription.status)) {
      throw new ConflictError({
        message: 'Only a live subscription can change plans.',
        details: { code: 'subscription_not_live' },
      });
    }
    const targetPlan = await this.requirePlanByCode(value.planCode);
    const providerCode = await this.assertProvider(
      targetPlan.providerCode || subscription.providerCode,
    );
    const direction =
      Number(targetPlan.priceAmount) > Number(currentPlan.priceAmount)
        ? 'upgrade'
        : Number(targetPlan.priceAmount) < Number(currentPlan.priceAmount)
          ? 'downgrade'
          : 'same';
    const startsAt = new Date();
    const endsAt = this.periodEndFor(targetPlan, startsAt);
    const changed = await this.store.updateSubscription(subscriptionId, {
      planId: targetPlan.id,
      providerCode,
      startsAt,
      endsAt,
      status: subscription.status === 'TRIALING' ? 'TRIALING' : subscription.status,
      metadata: { ...(subscription.metadata || {}), ...(value.metadata || {}) },
    });
    const invoice = await this.issueInvoice({
      context,
      subscription: changed,
      plan: targetPlan,
      period: { start: startsAt, end: endsAt },
      amount: targetPlan.priceAmount,
      providerCode,
    });
    this.publish(BILLING_EVENTS.SUBSCRIPTION_CHANGED, context, changed.id, {
      organizationId: changed.organizationId,
      fromPlanCode: currentPlan.code,
      toPlanCode: targetPlan.code,
      direction,
    });
    return {
      subscription: dto.toSubscriptionDto(changed, targetPlan),
      plan: dto.toPlanDto(targetPlan),
      direction,
      invoice: invoice ? dto.toInvoiceDto(invoice) : null,
    };
  }

  async cancelSubscription({ context, subscriptionId, input }) {
    const value = validate(dto.subscriptionCancelSchema, input || {}, 'subscription cancel input');
    const { subscription, plan } = await this.requireSubscription({ context, subscriptionId });
    if (subscription.status === 'CANCELLED') {
      throw new ConflictError({
        message: 'Subscription is already cancelled.',
        details: { code: 'subscription_cancelled' },
      });
    }
    const now = new Date();
    const cancelled = await this.store.updateSubscription(subscriptionId, {
      status: value.atPeriodEnd ? subscription.status : 'CANCELLED',
      cancelledAt: now,
      cancelReason: value.reason || null,
      endsAt: value.atPeriodEnd ? subscription.endsAt : now,
    });
    this.publish(BILLING_EVENTS.SUBSCRIPTION_CANCELLED, context, cancelled.id, {
      organizationId: cancelled.organizationId,
      planCode: plan.code,
      atPeriodEnd: value.atPeriodEnd,
      reason: value.reason || null,
    });
    return { subscription: dto.toSubscriptionDto(cancelled, plan), atPeriodEnd: value.atPeriodEnd };
  }

  async listInvoices({ context, query = {} }) {
    const value = validate(dto.invoiceQuerySchema, query, 'invoice query');
    const organizationId = await this.resolveOrganizationId(context, value.organizationId, {
      required: false,
    });
    const filters = {};
    if (organizationId) filters.organizationId = organizationId;
    if (value.subscriptionId) filters.subscriptionId = value.subscriptionId;
    if (value.status) filters.status = value.status;
    const invoices = await this.store.listInvoices(filters);
    const result = paginate(invoices, value);
    return {
      invoices: result.items.map(dto.toInvoiceDto),
      pagination: result.pagination,
    };
  }

  async updateInvoice({ context, invoiceId, input }) {
    const value = validate(dto.invoiceStatusSchema, input, 'invoice status input');
    const invoice = await this.store.findInvoiceById(invoiceId);
    if (!invoice) throw new NotFoundError({ message: 'Invoice was not found.' });
    await this.resolveOrganizationId(context, invoice.organizationId);
    if (invoice.status !== 'OPEN' && value.status !== invoice.status) {
      throw new ConflictError({
        message: 'Only an open invoice can change status.',
        details: { code: 'invoice_not_open', status: invoice.status },
      });
    }
    const updated = await this.store.updateInvoice(invoiceId, {
      status: value.status,
      paidAt: value.status === 'PAID' ? (value.paidAt ? new Date(value.paidAt) : new Date()) : null,
      metadata: { ...(invoice.metadata || {}), ...(value.metadata || {}) },
    });
    this.publish(BILLING_EVENTS.INVOICE_UPDATED, context, updated.id, {
      organizationId: updated.organizationId,
      status: updated.status,
    });
    return { invoice: dto.toInvoiceDto(updated) };
  }

  async recordUsage({ context, input }) {
    const value = validate(dto.usageRecordSchema, input, 'usage input');
    const organizationId = await this.resolveOrganizationId(
      context,
      value.organizationId || context.organizationId,
      { required: false },
    );
    let subscription = null;
    let plan = null;
    if (value.subscriptionId) {
      const result = await this.requireSubscription({
        context,
        subscriptionId: value.subscriptionId,
        organizationId,
      });
      subscription = result.subscription;
      plan = result.plan;
    } else if (organizationId) {
      subscription = await this.store.findActiveSubscription(organizationId);
      if (subscription) plan = await this.store.findPlanById(subscription.planId);
    }
    if (subscription && !ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
      throw new ConflictError({
        message: 'Usage can only be recorded for a live subscription.',
        details: { code: 'subscription_not_live' },
      });
    }

    const period =
      subscription && plan
        ? this.currentPeriod(subscription, plan)
        : {
            start: new Date(value.periodStart || Date.now()),
            end: new Date(value.periodEnd || Date.now() + DAY_MS),
          };
    if (period.end.getTime() < period.start.getTime()) {
      throw new ValidationError({ message: 'periodEnd must be after periodStart.' });
    }

    if (value.idempotencyKey && subscription) {
      const existing = (await this.store.listUsage({ subscriptionId: subscription.id })).find(
        (record) => record.metadata?.idempotencyKey === value.idempotencyKey,
      );
      if (existing) return { usage: dto.toUsageDto(existing), duplicate: true };
    }

    const limit =
      subscription && plan ? Number(plan.usageLimits?.[value.metricCode] ?? Infinity) : Infinity;
    if (Number.isFinite(limit)) {
      const used = subscription
        ? await this.usageForMetric(subscription.id, value.metricCode, period)
        : 0;
      if (used + value.quantity > limit && !value.allowOverage) {
        throw new ForbiddenError({
          message: `Usage limit exceeded for '${value.metricCode}'.`,
          details: {
            code: 'usage_limit_exceeded',
            metricCode: value.metricCode,
            limit,
            used,
            requested: value.quantity,
          },
        });
      }
    }

    const record = await this.store.recordUsage({
      organizationId,
      subscriptionId: subscription?.id || null,
      metricCode: value.metricCode,
      quantity: value.quantity,
      periodStart: period.start,
      periodEnd: period.end,
      metadata: {
        ...value.metadata,
        ...(value.idempotencyKey ? { idempotencyKey: value.idempotencyKey } : {}),
      },
    });
    this.publish(BILLING_EVENTS.USAGE_RECORDED, context, record.id, {
      organizationId,
      metricCode: record.metricCode,
      quantity: record.quantity,
    });
    const used = subscription
      ? await this.usageForMetric(subscription.id, value.metricCode, period)
      : Number(record.quantity);
    return {
      usage: dto.toUsageDto(record),
      duplicate: false,
      usageInPeriod: used,
      limit: Number.isFinite(limit) ? limit : null,
    };
  }

  async listUsage({ context, query = {} }) {
    const value = validate(dto.usageQuerySchema, query, 'usage query');
    const organizationId = await this.resolveOrganizationId(context, value.organizationId, {
      required: false,
    });
    const filters = {};
    if (organizationId) filters.organizationId = organizationId;
    if (value.subscriptionId) filters.subscriptionId = value.subscriptionId;
    if (value.metricCode) filters.metricCode = value.metricCode;
    if (value.from) filters.from = new Date(value.from);
    if (value.to) filters.to = new Date(value.to);
    const records = await this.store.listUsage(filters);
    const result = paginate(records, value);
    return {
      usage: result.items.map(dto.toUsageDto),
      pagination: result.pagination,
    };
  }

  async checkEntitlement({ context, input }) {
    const value = validate(dto.entitlementCheckSchema, input || {}, 'entitlement check');
    const organizationId = await this.resolveOrganizationId(context, value.organizationId, {
      required: false,
    });
    const base = {
      allowed: false,
      featureCode: value.featureCode,
      organizationId: organizationId || null,
      subscriptionId: null,
      planCode: null,
    };
    if (!organizationId) return { ...base, reason: 'organization_required' };
    const subscription = await this.store.findActiveSubscription(organizationId);
    if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
      return { ...base, reason: 'no_active_subscription' };
    }
    const plan = await this.store.findPlanById(subscription.planId);
    if (!plan) return { ...base, reason: 'plan_unavailable', subscriptionId: subscription.id };
    const entitlement = plan.entitlements?.[value.featureCode];
    if (!entitlementEnabled(entitlement)) {
      return {
        ...base,
        reason: 'feature_not_entitled',
        subscriptionId: subscription.id,
        planCode: plan.code,
      };
    }

    let usage = null;
    if (value.metricCode) {
      const period = this.currentPeriod(subscription, plan);
      const limit = Number(plan.usageLimits?.[value.metricCode] ?? Infinity);
      const used = await this.usageForMetric(subscription.id, value.metricCode, period);
      const remaining = Number.isFinite(limit) ? Math.max(0, limit - used) : null;
      usage = {
        metricCode: value.metricCode,
        limit: Number.isFinite(limit) ? limit : null,
        used,
        remaining,
      };
      if (usage.remaining === 0) {
        return {
          ...base,
          allowed: false,
          reason: 'usage_limit_exceeded',
          subscriptionId: subscription.id,
          planCode: plan.code,
          usage,
        };
      }
    }

    return {
      ...base,
      allowed: true,
      reason: 'entitled',
      subscriptionId: subscription.id,
      planCode: plan.code,
      ...(usage ? { usage } : {}),
    };
  }

  async assertFeature({ context, featureCode, organizationId }) {
    const result = await this.checkEntitlement({
      context,
      input: { featureCode, organizationId },
    });
    if (!result.allowed) {
      throw new ForbiddenError({
        message: `Feature '${featureCode}' is not available for this subscription.`,
        details: { code: 'subscription_feature_denied', reason: result.reason },
      });
    }
    return result;
  }
}

module.exports = { BillingService, BillingServiceToken, INTERVAL_MONTHS };

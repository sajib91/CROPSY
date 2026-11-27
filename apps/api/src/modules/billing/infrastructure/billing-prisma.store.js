const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { assertRepository } = require('../../../shared/domain/repository');
const {
  ACTIVE_SUBSCRIPTION_STATUSES,
  BILLING_STORE_METHODS,
  BillingStoreToken,
} = require('../domain');

function normalize(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toNumber === 'function') return Number(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalize(entry)]));
  }
  return value;
}

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function translateError(error) {
  if (error instanceof ConflictError || error instanceof NotFoundError) return error;
  if (error?.code === 'P2002') {
    return new ConflictError({ message: 'A unique billing constraint was violated.' });
  }
  if (error?.code === 'P2025') {
    return new NotFoundError({ message: 'Billing record was not found.' });
  }
  if (error?.code === 'P2010' || error?.code === 'P2014') {
    const databaseCode = String(error?.meta?.code || '');
    if (['23503', '23514', '22004', '22023'].includes(databaseCode)) {
      return new ConflictError({
        message: error?.meta?.message || error?.message || 'Billing operation was rejected.',
      });
    }
  }
  return error;
}

function planDto(row) {
  if (!row) return null;
  const value = normalize(row);
  return {
    id: value.id,
    code: value.code,
    name: value.name,
    description: value.description || null,
    billingInterval: value.billing_interval,
    billingCycleMonths: value.billing_cycle_months ?? null,
    currency: value.currency,
    priceAmount: money(value.price_amount),
    trialDays: value.trial_days,
    isActive: Boolean(value.is_active),
    segmentCodes: value.segment_codes || [],
    entitlements: value.entitlements || {},
    usageLimits: value.usage_limits || {},
    providerCode: value.provider_code || null,
    metadata: value.metadata || {},
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function subscriptionDto(row) {
  if (!row) return null;
  const value = normalize(row);
  return {
    id: value.id,
    organizationId: value.organization_id,
    planId: value.plan_id,
    status: value.status,
    startsAt: value.starts_at,
    endsAt: value.ends_at || null,
    cancelledAt: value.cancelled_at || null,
    providerCode: value.provider_code || null,
    cancelReason: value.cancel_reason || null,
    metadata: value.metadata || {},
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function invoiceDto(row) {
  if (!row) return null;
  const value = normalize(row);
  return {
    id: value.id,
    organizationId: value.organization_id || null,
    subscriptionId: value.subscription_id,
    invoiceNumber: value.invoice_number,
    amount: money(value.amount),
    currency: value.currency,
    status: value.status,
    providerCode: value.provider_code || null,
    periodStart: value.period_start || null,
    periodEnd: value.period_end || null,
    metadata: value.metadata || {},
    issuedAt: value.issued_at,
    dueAt: value.due_at || null,
    paidAt: value.paid_at || null,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function usageDto(row) {
  if (!row) return null;
  const value = normalize(row);
  return {
    id: value.id,
    organizationId: value.organization_id || null,
    subscriptionId: value.subscription_id || null,
    metricCode: value.metric_code,
    quantity: Number(value.quantity || 0),
    periodStart: value.period_start,
    periodEnd: value.period_end,
    recordedAt: value.recorded_at,
    metadata: value.metadata || {},
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function planData(input) {
  return {
    id: input.id,
    code: input.code,
    name: input.name,
    description: input.description ?? null,
    billing_interval: input.billingInterval,
    billing_cycle_months: input.billingCycleMonths ?? null,
    currency: input.currency,
    price_amount: input.priceAmount,
    trial_days: input.trialDays,
    is_active: input.isActive,
    segment_codes: input.segmentCodes,
    entitlements: input.entitlements,
    usage_limits: input.usageLimits,
    provider_code: input.providerCode ?? null,
    metadata: input.metadata,
  };
}

function planPatch(patch) {
  const data = {};
  const fields = {
    name: 'name',
    description: 'description',
    billingInterval: 'billing_interval',
    billingCycleMonths: 'billing_cycle_months',
    currency: 'currency',
    priceAmount: 'price_amount',
    trialDays: 'trial_days',
    isActive: 'is_active',
    segmentCodes: 'segment_codes',
    entitlements: 'entitlements',
    usageLimits: 'usage_limits',
    providerCode: 'provider_code',
    metadata: 'metadata',
  };
  for (const [source, target] of Object.entries(fields)) {
    if (patch[source] !== undefined) data[target] = patch[source];
  }
  return data;
}

function subscriptionData(input) {
  return {
    id: input.id,
    organization_id: input.organizationId,
    plan_id: input.planId,
    status: input.status,
    starts_at: input.startsAt,
    ends_at: input.endsAt ?? null,
    cancelled_at: input.cancelledAt ?? null,
    provider_code: input.providerCode ?? null,
    cancel_reason: input.cancelReason ?? null,
    metadata: input.metadata || {},
  };
}

function subscriptionPatch(patch) {
  const data = {};
  const fields = {
    planId: 'plan_id',
    status: 'status',
    startsAt: 'starts_at',
    endsAt: 'ends_at',
    cancelledAt: 'cancelled_at',
    providerCode: 'provider_code',
    cancelReason: 'cancel_reason',
    metadata: 'metadata',
  };
  for (const [source, target] of Object.entries(fields)) {
    if (patch[source] !== undefined) data[target] = patch[source];
  }
  return data;
}

function invoiceData(input) {
  return {
    id: input.id,
    organization_id: input.organizationId ?? null,
    subscription_id: input.subscriptionId,
    invoice_number: input.invoiceNumber,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
    provider_code: input.providerCode ?? null,
    period_start: input.periodStart ?? null,
    period_end: input.periodEnd ?? null,
    metadata: input.metadata || {},
    issued_at: input.issuedAt || new Date(),
    due_at: input.dueAt ?? null,
    paid_at: input.paidAt ?? null,
  };
}

function invoicePatch(patch) {
  const data = {};
  const fields = {
    status: 'status',
    paidAt: 'paid_at',
    providerCode: 'provider_code',
    metadata: 'metadata',
  };
  for (const [source, target] of Object.entries(fields)) {
    if (patch[source] !== undefined) data[target] = patch[source];
  }
  return data;
}

class BillingPrismaStore {
  constructor({ prisma }) {
    if (!prisma) throw new TypeError('BillingPrismaStore requires a Prisma client.');
    this.prisma = prisma;
    assertRepository(this, BILLING_STORE_METHODS, BillingStoreToken);
  }

  async createPlan(input) {
    try {
      return planDto(await this.prisma.subscriptionPlan.create({ data: planData(input) }));
    } catch (error) {
      throw translateError(error);
    }
  }

  async findPlanById(planId) {
    return planDto(await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } }));
  }

  async findPlanByCode(code) {
    return planDto(await this.prisma.subscriptionPlan.findUnique({ where: { code } }));
  }

  async listPlans(filters = {}) {
    const where = {};
    if (filters.isActive !== undefined) where.is_active = filters.isActive;
    if (filters.segmentCode) where.segment_codes = { has: filters.segmentCode };
    if (filters.search) {
      where.OR = [
        { code: { contains: filters.search, mode: 'insensitive' } },
        { name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.subscriptionPlan.findMany({ where });
    return rows.map(planDto);
  }

  async updatePlan(planId, patch) {
    try {
      return planDto(
        await this.prisma.subscriptionPlan.update({
          where: { id: planId },
          data: planPatch(patch),
        }),
      );
    } catch (error) {
      throw translateError(error);
    }
  }

  async createSubscription(input) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (ACTIVE_SUBSCRIPTION_STATUSES.includes(input.status)) {
          const active = await transaction.subscription.findFirst({
            where: {
              organization_id: input.organizationId,
              status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
            },
            select: { id: true },
          });
          if (active) {
            throw new ConflictError({
              message: 'This organization already has an active subscription.',
              details: { code: 'subscription_already_active', subscriptionId: active.id },
            });
          }
        }
        const row = await transaction.subscription.create({ data: subscriptionData(input) });
        return subscriptionDto(row);
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  async findSubscriptionById(subscriptionId) {
    return subscriptionDto(
      await this.prisma.subscription.findUnique({ where: { id: subscriptionId } }),
    );
  }

  async findActiveSubscription(organizationId) {
    return subscriptionDto(
      await this.prisma.subscription.findFirst({
        where: {
          organization_id: organizationId,
          status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
        },
      }),
    );
  }

  async listSubscriptions(filters = {}) {
    const where = {};
    if (filters.organizationId) where.organization_id = filters.organizationId;
    if (filters.status) where.status = filters.status;
    const rows = await this.prisma.subscription.findMany({ where });
    return rows.map(subscriptionDto);
  }

  async updateSubscription(subscriptionId, patch) {
    try {
      return subscriptionDto(
        await this.prisma.subscription.update({
          where: { id: subscriptionId },
          data: subscriptionPatch(patch),
        }),
      );
    } catch (error) {
      throw translateError(error);
    }
  }

  async createInvoice(input) {
    try {
      return invoiceDto(await this.prisma.subscriptionInvoice.create({ data: invoiceData(input) }));
    } catch (error) {
      throw translateError(error);
    }
  }

  async findInvoiceById(invoiceId) {
    return invoiceDto(
      await this.prisma.subscriptionInvoice.findUnique({ where: { id: invoiceId } }),
    );
  }

  async findInvoiceByNumber(invoiceNumber) {
    return invoiceDto(
      await this.prisma.subscriptionInvoice.findUnique({
        where: { invoice_number: invoiceNumber },
      }),
    );
  }

  async listInvoices(filters = {}) {
    const where = {};
    if (filters.organizationId) where.organization_id = filters.organizationId;
    if (filters.subscriptionId) where.subscription_id = filters.subscriptionId;
    if (filters.status) where.status = filters.status;
    const rows = await this.prisma.subscriptionInvoice.findMany({ where });
    return rows.map(invoiceDto);
  }

  async updateInvoice(invoiceId, patch) {
    try {
      return invoiceDto(
        await this.prisma.subscriptionInvoice.update({
          where: { id: invoiceId },
          data: invoicePatch(patch),
        }),
      );
    } catch (error) {
      throw translateError(error);
    }
  }

  async recordUsage(input) {
    try {
      return usageDto(
        await this.prisma.usageRecord.create({
          data: {
            id: input.id,
            organization_id: input.organizationId ?? null,
            subscription_id: input.subscriptionId ?? null,
            metric_code: input.metricCode,
            quantity: input.quantity,
            period_start: input.periodStart,
            period_end: input.periodEnd,
            recorded_at: input.recordedAt || new Date(),
            metadata: input.metadata || {},
          },
        }),
      );
    } catch (error) {
      throw translateError(error);
    }
  }

  async listUsage(filters = {}) {
    const where = {};
    if (filters.organizationId) where.organization_id = filters.organizationId;
    if (filters.subscriptionId) where.subscription_id = filters.subscriptionId;
    if (filters.metricCode) where.metric_code = filters.metricCode;
    if (filters.from || filters.to) {
      where.period_start = {};
      if (filters.to) where.period_start.lte = filters.to;
      if (filters.from) {
        where.period_end = { gte: filters.from };
      }
    }
    const rows = await this.prisma.usageRecord.findMany({ where });
    return rows.map(usageDto);
  }
}

module.exports = { BillingPrismaStore };

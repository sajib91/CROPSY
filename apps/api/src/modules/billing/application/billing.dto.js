const { z, isoDateTime } = require('@cropsy/validation');
const {
  BILLING_INTERVALS,
  INVOICE_STATUSES,
  SUBSCRIPTION_STATUSES,
} = require('../domain/billing.entity');

const nonEmptyString = z.string().trim().min(1);
const uuid = z.string().uuid();
const code = nonEmptyString
  .max(80)
  .regex(/^[A-Za-z0-9_.:-]+$/, 'Use letters, numbers, _, ., :, or -.');
const currency = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase());
const metadata = z.record(z.unknown()).default({});
const entitlements = z.record(z.unknown()).default({});
const usageLimits = z.record(z.number().finite().nonnegative()).default({});
const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

const moduleInfoSchema = z.object({
  id: z.string().uuid(),
  moduleId: nonEmptyString,
  name: nonEmptyString,
  description: nonEmptyString,
  status: nonEmptyString,
  path: nonEmptyString,
  dependsOn: z.array(nonEmptyString),
  publishes: z.array(nonEmptyString),
  subscribes: z.array(nonEmptyString),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const planQuerySchema = z
  .object({
    search: z.string().trim().max(180).optional(),
    segmentCode: code.optional(),
    isActive: booleanQuery.optional(),
    sort: z.enum(['newest', 'oldest', 'name', 'price']).default('newest'),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();

const subscriptionQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    status: z.enum(SUBSCRIPTION_STATUSES).optional(),
    sort: z.enum(['newest', 'oldest']).default('newest'),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();

const invoiceQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    subscriptionId: uuid.optional(),
    status: z.enum(INVOICE_STATUSES).optional(),
    sort: z.enum(['newest', 'oldest']).default('newest'),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();

const usageQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    subscriptionId: uuid.optional(),
    metricCode: code.optional(),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
    sort: z.enum(['newest', 'oldest']).default('newest'),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();

const planIdParamSchema = z.object({ planId: uuid }).strict();
const subscriptionIdParamSchema = z.object({ subscriptionId: uuid }).strict();
const invoiceIdParamSchema = z.object({ invoiceId: uuid }).strict();

const planCreateSchema = z
  .object({
    code,
    name: nonEmptyString.max(180),
    description: z.string().trim().max(1000).optional(),
    billingInterval: z.enum(BILLING_INTERVALS),
    billingCycleMonths: z.number().int().min(1).max(36).optional(),
    currency,
    priceAmount: z.number().finite().nonnegative(),
    trialDays: z.number().int().min(0).max(365).default(0),
    segmentCodes: z.array(code).max(20).default([]),
    entitlements,
    usageLimits,
    providerCode: code.optional(),
    metadata,
  })
  .strict();

const planUpdateSchema = z
  .object({
    name: nonEmptyString.max(180).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    billingInterval: z.enum(BILLING_INTERVALS).optional(),
    billingCycleMonths: z.number().int().min(1).max(36).nullable().optional(),
    currency: currency.optional(),
    priceAmount: z.number().finite().nonnegative().optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
    segmentCodes: z.array(code).max(20).optional(),
    entitlements: entitlements.optional(),
    usageLimits: usageLimits.optional(),
    providerCode: code.nullable().optional(),
    isActive: z.boolean().optional(),
    metadata: metadata.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one plan field must be updated.',
  });

const subscriptionCreateSchema = z
  .object({
    planCode: code,
    organizationId: uuid.optional(),
    providerCode: code.optional(),
    startsAt: isoDateTime.optional(),
    metadata,
  })
  .strict();

const subscriptionChangePlanSchema = z
  .object({
    planCode: code,
    metadata: metadata.optional(),
  })
  .strict();

const subscriptionCancelSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
    atPeriodEnd: z.boolean().default(true),
  })
  .strict();

const invoiceStatusSchema = z
  .object({
    status: z.enum(['PAID', 'VOID', 'UNCOLLECTIBLE']),
    paidAt: isoDateTime.optional(),
    metadata: metadata.optional(),
  })
  .strict();

const usageRecordSchema = z
  .object({
    metricCode: code,
    quantity: z.number().finite().positive(),
    organizationId: uuid.optional(),
    subscriptionId: uuid.optional(),
    periodStart: isoDateTime.optional(),
    periodEnd: isoDateTime.optional(),
    allowOverage: z.boolean().default(false),
    idempotencyKey: code.optional(),
    metadata,
  })
  .strict();

const entitlementCheckSchema = z
  .object({
    featureCode: code,
    metricCode: code.optional(),
    organizationId: uuid.optional(),
  })
  .strict();

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toModuleInfoDto(entity, metadataValue) {
  return {
    id: entity.id,
    moduleId: metadataValue.id,
    name: metadataValue.name,
    description: metadataValue.description,
    status: entity.status,
    path: metadataValue.path,
    dependsOn: [...metadataValue.dependsOn],
    publishes: [...metadataValue.publishes],
    subscribes: [...metadataValue.subscribes],
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

function toPlanDto(plan) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description || null,
    billingInterval: plan.billingInterval,
    billingCycleMonths: plan.billingCycleMonths || null,
    currency: plan.currency,
    priceAmount: Number(plan.priceAmount),
    trialDays: plan.trialDays,
    isActive: Boolean(plan.isActive),
    segmentCodes: [...(plan.segmentCodes || [])],
    entitlements: { ...(plan.entitlements || {}) },
    usageLimits: { ...(plan.usageLimits || {}) },
    providerCode: plan.providerCode || null,
    metadata: { ...(plan.metadata || {}) },
    createdAt: iso(plan.createdAt),
    updatedAt: iso(plan.updatedAt),
  };
}

function toSubscriptionDto(subscription, plan = null) {
  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    planId: subscription.planId,
    planCode: plan?.code || null,
    status: subscription.status,
    startsAt: iso(subscription.startsAt),
    endsAt: iso(subscription.endsAt),
    cancelledAt: iso(subscription.cancelledAt),
    providerCode: subscription.providerCode || null,
    cancelReason: subscription.cancelReason || null,
    metadata: { ...(subscription.metadata || {}) },
    createdAt: iso(subscription.createdAt),
    updatedAt: iso(subscription.updatedAt),
  };
}

function toInvoiceDto(invoice) {
  return {
    id: invoice.id,
    organizationId: invoice.organizationId || null,
    subscriptionId: invoice.subscriptionId,
    invoiceNumber: invoice.invoiceNumber,
    amount: Number(invoice.amount),
    currency: invoice.currency,
    status: invoice.status,
    providerCode: invoice.providerCode || null,
    periodStart: iso(invoice.periodStart),
    periodEnd: iso(invoice.periodEnd),
    issuedAt: iso(invoice.issuedAt),
    dueAt: iso(invoice.dueAt),
    paidAt: iso(invoice.paidAt),
    metadata: { ...(invoice.metadata || {}) },
    createdAt: iso(invoice.createdAt),
    updatedAt: iso(invoice.updatedAt),
  };
}

function toUsageDto(record) {
  return {
    id: record.id,
    organizationId: record.organizationId || null,
    subscriptionId: record.subscriptionId || null,
    metricCode: record.metricCode,
    quantity: Number(record.quantity),
    periodStart: iso(record.periodStart),
    periodEnd: iso(record.periodEnd),
    recordedAt: iso(record.recordedAt),
    createdAt: iso(record.createdAt),
  };
}

module.exports = {
  booleanQuery,
  entitlementCheckSchema,
  invoiceIdParamSchema,
  invoiceQuerySchema,
  invoiceStatusSchema,
  moduleInfoSchema,
  planCreateSchema,
  planIdParamSchema,
  planQuerySchema,
  planUpdateSchema,
  subscriptionCancelSchema,
  subscriptionChangePlanSchema,
  subscriptionCreateSchema,
  subscriptionIdParamSchema,
  subscriptionQuerySchema,
  usageQuerySchema,
  usageRecordSchema,
  toInvoiceDto,
  toModuleInfoDto,
  toPlanDto,
  toSubscriptionDto,
  toUsageDto,
};

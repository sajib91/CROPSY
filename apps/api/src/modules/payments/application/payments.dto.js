const { z, isoDateTime } = require('@cropsy/validation');

const nonEmptyString = z.string().trim().min(1);
const uuid = z.string().uuid();
const amount = z.coerce.number().positive().finite();
const currency = z.string().trim().length(3).toUpperCase().default('BDT');

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

const allocationSchema = z
  .object({
    sellerUserId: uuid,
    sellerNetAmount: z.coerce.number().min(0).finite(),
    commissionAmount: z.coerce.number().min(0).finite(),
  })
  .strict();

const commissionRuleSchema = z
  .object({
    ruleKey: nonEmptyString.max(120),
    basis: nonEmptyString.max(40).optional(),
    rate: z.coerce.number().min(0).finite().optional(),
    snapshot: z.record(z.unknown()).default({}),
  })
  .strict();

const initiatePaymentSchema = z
  .object({
    orderId: uuid,
    purchaseGroupId: uuid.optional(),
    providerCode: nonEmptyString.max(80),
    method: z.enum(['CARD', 'BANK_TRANSFER', 'MOBILE_BANKING', 'CASH', 'OTHER']),
    amount,
    currency: currency.optional(),
    idempotencyKey: nonEmptyString.max(255).optional(),
    allocation: allocationSchema,
    commissionRule: commissionRuleSchema.default({ ruleKey: 'CALLER_SUPPLIED', snapshot: {} }),
    providerOptions: z.record(z.unknown()).default({}),
  })
  .strict()
  .refine(
    (value) =>
      Math.round((value.allocation.sellerNetAmount + value.allocation.commissionAmount) * 100) /
        100 ===
      Math.round(value.amount * 100) / 100,
    { message: 'Allocation must sum exactly to the payment amount.' },
  );

const verifyPaymentSchema = z
  .object({
    providerOptions: z.record(z.unknown()).default({}),
  })
  .strict();

const refundSchema = z
  .object({
    paymentId: uuid,
    amount,
    reason: z.enum([
      'BUYER_CANCELLATION',
      'SELLER_CANCELLATION',
      'QUALITY_ISSUE',
      'DELIVERY_FAILURE',
      'DUPLICATE_PAYMENT',
      'OTHER',
    ]),
    idempotencyKey: nonEmptyString.max(255).optional(),
    allocation: z
      .object({
        sellerUserId: uuid,
        sellerNetAmount: z.coerce.number().min(0).finite(),
        commissionReversalAmount: z.coerce.number().min(0).finite(),
      })
      .strict(),
    providerOptions: z.record(z.unknown()).default({}),
  })
  .strict()
  .refine(
    (value) =>
      Math.round(
        (value.allocation.sellerNetAmount + value.allocation.commissionReversalAmount) * 100,
      ) /
        100 ===
      Math.round(value.amount * 100) / 100,
    { message: 'Refund allocation must sum exactly to the refund amount.' },
  );

const webhookSchema = z
  .object({
    eventId: nonEmptyString.max(255),
    paymentReference: nonEmptyString.max(255),
    status: z.enum(['INITIATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED']),
    amount: z.coerce.number().positive().finite().optional(),
    currency: z.string().trim().length(3).optional(),
    failureCode: nonEmptyString.max(120).optional(),
  })
  .strict();

const listQuerySchema = z
  .object({
    status: z
      .enum([
        'INITIATED',
        'AUTHORIZED',
        'CAPTURED',
        'FAILED',
        'CANCELLED',
        'REFUNDED',
        'PARTIALLY_REFUNDED',
      ])
      .optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

const paramsSchema = z.object({
  paymentId: uuid,
  providerCode: nonEmptyString,
});

function toModuleInfoDto(entity, metadata) {
  return {
    id: entity.id,
    moduleId: metadata.id,
    name: metadata.name,
    description: metadata.description,
    status: entity.status,
    path: metadata.path,
    dependsOn: [...metadata.dependsOn],
    publishes: [...metadata.publishes],
    subscribes: [...metadata.subscribes],
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

module.exports = {
  moduleInfoSchema,
  toModuleInfoDto,
  initiatePaymentSchema,
  verifyPaymentSchema,
  refundSchema,
  webhookSchema,
  listQuerySchema,
  paramsSchema,
};

const { isoDateTime, z } = require('@cropsy/validation');

const {
  ORDER_STATUSES,
  PRICING_RULE_MODES,
  PRICING_RULE_TYPES,
} = require('../domain/orders.entity');

const nonEmptyString = z.string().trim().min(1);
const uuid = z.string().uuid();
const optionalUuid = uuid.nullable().optional();
const currency = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Currency must be a three-letter uppercase code.');
const quantity = z.number().min(0.001).max(1e9);
const money = z.number().min(0).max(1e12);
const referenceKey = z.string().trim().min(8).max(255);
const reason = z.string().trim().max(1000);

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

const cartQuerySchema = z.object({ organizationId: optionalUuid }).strict();

const cartItemCreateSchema = z
  .object({
    organizationId: optionalUuid,
    listingId: uuid,
    quantity,
    currency: currency.optional(),
  })
  .strict();

const cartItemUpdateSchema = z
  .object({
    organizationId: optionalUuid,
    quantity,
  })
  .strict();

const pricingRuleSchema = z
  .object({
    ruleKey: z.string().trim().min(2).max(120),
    type: z.enum(PRICING_RULE_TYPES),
    mode: z.enum(PRICING_RULE_MODES),
    sellerUserId: uuid.optional(),
    amount: money.optional(),
    // Caller-supplied fraction of the server-calculated seller subtotal.
    percentage: z.number().min(0).max(1).optional(),
    currency: currency.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === 'FLAT') {
      if (value.amount === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amount'],
          message: 'FLAT rules require amount.',
        });
      }
      if (value.percentage !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['percentage'],
          message: 'FLAT rules must not supply percentage.',
        });
      }
    } else {
      if (value.percentage === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['percentage'],
          message: 'PERCENTAGE rules require percentage.',
        });
      }
      if (value.amount !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amount'],
          message: 'PERCENTAGE rules must not supply amount.',
        });
      }
    }
  });

// Unknown fields (including client-supplied totals) are intentionally stripped
// rather than rejected: all amounts are recomputed from current listing prices.
const checkoutSchema = z.object({
  organizationId: optionalUuid,
  referenceKey,
  pricingRules: z.array(pricingRuleSchema).max(50).default([]),
});

const orderParamsSchema = z.object({ orderId: uuid }).strict();
const checkoutParamsSchema = z.object({ checkoutId: uuid }).strict();
const listingParamsSchema = z.object({ listingId: uuid }).strict();

const listOrdersQuerySchema = z
  .object({
    organizationId: optionalUuid,
    status: z.enum(ORDER_STATUSES).optional(),
    purchaseGroupId: optionalUuid,
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();

const historyQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();

const cancelSchema = z
  .object({
    organizationId: optionalUuid,
    reason: reason.optional(),
  })
  .strict();

const transitionSchema = z
  .object({
    organizationId: optionalUuid,
    toStatus: z.enum(ORDER_STATUSES),
    reason: reason.optional(),
  })
  .strict();

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
  cancelSchema,
  cartItemCreateSchema,
  cartItemUpdateSchema,
  cartQuerySchema,
  checkoutParamsSchema,
  checkoutSchema,
  historyQuerySchema,
  listOrdersQuerySchema,
  listingParamsSchema,
  moduleInfoSchema,
  orderParamsSchema,
  pricingRuleSchema,
  referenceKey,
  toModuleInfoDto,
  transitionSchema,
};

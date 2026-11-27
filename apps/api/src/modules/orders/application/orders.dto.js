const { isoDateTime, z } = require('@cropsy/validation');

const { ORDER_STATUSES } = require('../domain/orders.entity');

const nonEmptyString = z.string().trim().min(1);
const uuid = z.string().uuid();
const optionalUuid = uuid.nullable().optional();
const currency = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Currency must be a three-letter uppercase code.');
const quantity = z.number().min(0.001).max(1e9);
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

// Client-supplied pricing rules are intentionally not part of the checkout
// contract. Discounts and delivery fees are business policy and must be sourced
// from trusted server-side configuration, never from the buyer's request.
// Unknown fields (including client-supplied totals) are stripped.
const checkoutSchema = z.object({
  organizationId: optionalUuid,
  referenceKey,
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
  referenceKey,
  toModuleInfoDto,
  transitionSchema,
};

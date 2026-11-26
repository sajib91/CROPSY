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

const journalLineSchema = z
  .object({
    accountCode: nonEmptyString,
    direction: z.enum(['DEBIT', 'CREDIT']),
    bucket: z.enum(['PENDING', 'AVAILABLE', 'SETTLED']),
    amount,
    ownerUserId: uuid.optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict();

const postJournalSchema = z
  .object({
    idempotencyKey: nonEmptyString.max(255),
    referenceType: nonEmptyString.max(80),
    referenceId: uuid.optional(),
    description: z.string().trim().max(500).optional(),
    currency: currency.optional(),
    expectationKey: nonEmptyString.max(255).optional(),
    lines: z.array(journalLineSchema).min(2),
  })
  .strict();

const expectationSchema = z
  .object({
    expectationKey: nonEmptyString.max(255),
    referenceType: nonEmptyString.max(80),
    referenceId: uuid.optional(),
    amount,
    currency: currency.optional(),
  })
  .strict();

const settlementSchema = z
  .object({
    idempotencyKey: nonEmptyString.max(255),
    sellerUserId: uuid,
    ruleKey: nonEmptyString.max(120),
    periodStart: isoDateTime,
    periodEnd: isoDateTime,
    grossAmount: amount,
    deductionsAmount: z.coerce.number().min(0).finite(),
    netAmount: amount,
    currency: currency.optional(),
    allocationSnapshot: z.record(z.unknown()).default({}),
    journal: postJournalSchema,
  })
  .strict()
  .refine((value) => new Date(value.periodEnd) >= new Date(value.periodStart), {
    message: 'Settlement period end must not precede period start.',
  })
  .refine((value) => value.netAmount <= value.grossAmount, {
    message: 'Settlement net amount must not exceed gross amount.',
  });

const balanceQuerySchema = z
  .object({
    accountCode: nonEmptyString.optional(),
    ownerKey: nonEmptyString.optional(),
    bucket: z.enum(['PENDING', 'AVAILABLE', 'SETTLED']).optional(),
    currency: z.string().trim().length(3).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

const listQuerySchema = z
  .object({
    status: nonEmptyString.optional(),
    referenceType: nonEmptyString.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

const paramsSchema = z.object({ moduleId: nonEmptyString, journalId: uuid, accountId: uuid });

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
  journalLineSchema,
  postJournalSchema,
  expectationSchema,
  settlementSchema,
  balanceQuerySchema,
  listQuerySchema,
  paramsSchema,
};

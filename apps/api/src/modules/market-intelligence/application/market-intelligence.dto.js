const { z, isoDateTime } = require('@cropsy/validation');

const nonEmptyString = z.string().trim().min(1).max(200);
const timeString = z.string().trim().min(1).max(50);
const limitSchema = z.coerce.number().int().min(1).max(500).default(100);

const moduleInfoSchema = z.object({
  id: z.string().uuid(),
  moduleId: nonEmptyString,
  name: nonEmptyString,
  description: z.string().trim().min(1).max(500),
  status: nonEmptyString,
  path: nonEmptyString,
  dependsOn: z.array(nonEmptyString),
  publishes: z.array(nonEmptyString),
  subscribes: z.array(nonEmptyString),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const observationQuerySchema = z
  .object({
    productId: nonEmptyString.optional(),
    region: z.string().trim().max(200).optional(),
    status: z.enum(['ACTIVE', 'RESERVED', 'INACTIVE', 'EXPIRED', 'CANCELLED', 'DRAFT']).optional(),
    from: timeString.optional(),
    to: timeString.optional(),
    limit: limitSchema,
  })
  .strict();

const analysisQuerySchema = observationQuerySchema.extend({
  productId: nonEmptyString,
});

const forecastQuerySchema = z
  .object({
    productId: nonEmptyString,
    region: z.string().trim().max(200).optional(),
    from: timeString.optional(),
    to: timeString.optional(),
    horizon: z.coerce.number().int().min(1).max(12).default(3),
    model: z.enum(['moving_average', 'seasonal_naive', 'linear_trend']).optional(),
    seasonLength: z.coerce.number().int().min(1).max(24).optional(),
    language: z.enum(['en', 'bn']).default('en'),
    includeExplanation: z.boolean().default(false),
  })
  .strict();

const trendQuerySchema = analysisQuerySchema.extend({
  granularity: z.enum(['observation', 'day', 'month']).default('observation'),
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
  analysisQuerySchema,
  forecastQuerySchema,
  moduleInfoSchema,
  observationQuerySchema,
  toModuleInfoDto,
  trendQuerySchema,
};

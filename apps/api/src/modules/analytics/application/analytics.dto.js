const { z } = require('@cropsy/validation');
const {
  DATA_CLASSIFICATIONS,
  DEFAULT_GRAIN,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  TIMESTAMP_GRAINS,
} = require('../domain/analytics.entity');

const nonEmptyString = z.string().trim().min(1);

const dateParam = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Must be an ISO date or timestamp.');

const analyticsQuerySchema = z.object({
  organizationId: z
    .string()
    .trim()
    .uuid()
    .optional()
    .describe('Tenant UUID. Non-admin callers may only request their active organization.'),
  from: dateParam.optional().describe('Inclusive lower bound for recorded events.'),
  to: dateParam.optional().describe('Inclusive upper bound for recorded events.'),
  grain: z
    .enum(TIMESTAMP_GRAINS)
    .default(DEFAULT_GRAIN)
    .describe('Time bucket used for historical rows and projections.'),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

const moduleInfoSchema = z.object({
  id: z.string().uuid(),
  moduleId: nonEmptyString,
  status: z.literal('ACTIVE'),
  name: nonEmptyString,
  description: nonEmptyString,
  path: nonEmptyString,
  dependsOn: z.array(nonEmptyString),
  publishes: z.array(nonEmptyString),
  subscribes: z.array(nonEmptyString),
  reports: z.array(nonEmptyString),
  dataClassifications: z.array(z.enum(DATA_CLASSIFICATIONS)),
  createdAt: nonEmptyString,
  updatedAt: nonEmptyString,
});

module.exports = { analyticsQuerySchema, moduleInfoSchema };

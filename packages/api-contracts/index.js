const { z } = require('zod');
const { isoDateTime, nonEmptyString } = require('@cropsy/validation');

const healthDataSchema = z.object({
  status: z.enum(['ok', 'ready']),
  service: nonEmptyString,
  timestamp: isoDateTime,
  uptimeSeconds: z.number().nonnegative(),
  checks: z.record(z.string()).optional(),
});

const healthResponseSchema = z.object({
  success: z.literal(true),
  data: healthDataSchema,
});

function createHealthResponse({ status = 'ok', service, startedAt = Date.now(), checks }) {
  return healthResponseSchema.parse({
    success: true,
    data: {
      status,
      service,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.max(0, (Date.now() - startedAt) / 1000),
      ...(checks === undefined ? {} : { checks }),
    },
  });
}

module.exports = {
  healthDataSchema,
  healthResponseSchema,
  createHealthResponse,
};

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

/**
 * Every CROPSY HTTP response uses this envelope. `meta` is transport metadata
 * (request id, API version) and is never business data.
 */
const apiSuccessEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z.unknown(),
    meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

const apiErrorEnvelopeSchema = z
  .object({
    success: z.literal(false),
    error: nonEmptyString,
    meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

// Mobile auth uses bearer tokens only. Cookies are a web-client concern and are
// intentionally absent from these contracts.
const authTokensSchema = z
  .object({
    accessToken: nonEmptyString,
    refreshToken: nonEmptyString,
    client: nonEmptyString.optional(),
  })
  .passthrough();

const authResponseSchema = z.object({
  success: z.literal(true),
  data: authTokensSchema,
});

const refreshResponseSchema = authResponseSchema;

const notificationRecordSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid().nullable().optional(),
    userId: z.string().uuid(),
    channel: z.enum(['IN_APP', 'EMAIL', 'SMS', 'PUSH']),
    type: nonEmptyString,
    title: nonEmptyString,
    body: z.string(),
    data: z.record(z.unknown()).default({}),
    status: z.enum(['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ']),
    readAt: isoDateTime.nullable().optional(),
    sentAt: isoDateTime.nullable().optional(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime.optional(),
  })
  .passthrough();

const notificationListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    notifications: z.array(notificationRecordSchema),
  }),
});

const notificationPreferenceSchema = z
  .object({
    channel: z.enum(['IN_APP', 'EMAIL', 'SMS', 'PUSH']),
    eventType: nonEmptyString,
    enabled: z.boolean(),
  })
  .passthrough();

const notificationPreferenceListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(notificationPreferenceSchema),
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
  apiSuccessEnvelopeSchema,
  apiErrorEnvelopeSchema,
  authTokensSchema,
  authResponseSchema,
  refreshResponseSchema,
  notificationRecordSchema,
  notificationListResponseSchema,
  notificationPreferenceSchema,
  notificationPreferenceListResponseSchema,
};

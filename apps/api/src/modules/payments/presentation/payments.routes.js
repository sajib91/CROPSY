const { z } = require('@cropsy/validation');
const { ok } = require('@cropsy/shared');

const { RateLimiterToken } = require('../../../shared/di/tokens');
const { requireAuthenticated } = require('../../../shared/http/authorization');
const {
  NotFoundError,
  TooManyRequestsError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { PaymentsServiceToken } = require('../application/payments.service');
const { MODULE_ID } = require('../domain/payments.entity');

const infoParamsSchema = z.object({ moduleId: z.string().trim().min(1) });
const paymentParamsSchema = z.object({ paymentId: z.string().uuid() });
const webhookParamsSchema = z.object({ providerCode: z.string().trim().min(1).max(80) });
const readPayments = Object.freeze({ auth: { permissions: ['payments.read'] } });
const managePayments = Object.freeze({ auth: { permissions: ['payments.manage'] } });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

function context(request) {
  return requireAuthenticated(request);
}

function headerValue(request, name) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function withIdempotencyKey(request, body) {
  const headerKey = headerValue(request, 'idempotency-key');
  const payload = { ...(body || {}) };
  if (headerKey && payload.idempotencyKey && headerKey !== payload.idempotencyKey) {
    throw new ValidationError({
      message: 'Idempotency-Key and idempotencyKey must match when both are supplied.',
    });
  }
  if (headerKey && !payload.idempotencyKey) payload.idempotencyKey = headerKey;
  return payload;
}

module.exports = async function paymentsRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(PaymentsServiceToken);
  const rateLimiter = fastify.cropsyContainer.resolve(RateLimiterToken);

  // Provider callbacks are authenticated by HMAC over the exact request bytes.
  // Fastify's default JSON parser discards those bytes, so this module parses
  // JSON from a buffer and preserves the raw payload for signature checks.
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    try {
      request.rawBody = body;
      done(null, JSON.parse(body.toString('utf8')));
    } catch (error) {
      done(error);
    }
  });

  fastify.addHook('preHandler', async (request) => {
    if (request.method !== 'POST') return;
    const path = request.url.split('?')[0];
    const moneyOperation =
      path.endsWith('/payments') ||
      path.endsWith('/refunds') ||
      path.endsWith('/verify') ||
      path.includes('/webhooks/');
    if (!moneyOperation) return;
    const auth = request.auth || {};
    const key = `payments:${request.method}:${auth.organizationId || 'global'}:${auth.user?.id || 'anonymous'}`;
    const result = rateLimiter.consume(key, { maxAttempts: 100, windowSeconds: 60 });
    if (!result.allowed) {
      throw new TooManyRequestsError({
        message: 'Too many payment operations. Try again later.',
        details: { retryAfterSeconds: result.retryAfterSeconds },
      });
    }
  });

  fastify.get('/info', async (request) => ok(await service.describe(), meta(request)));

  fastify.get('/info/:moduleId', async (request) => {
    const { moduleId } = validate(infoParamsSchema, request.params, 'module id');
    if (moduleId !== MODULE_ID) {
      throw new NotFoundError({
        message: `Module '${moduleId}' is not handled by ${MODULE_ID}.`,
      });
    }
    return ok(await service.describe(), meta(request));
  });

  fastify.get('/providers', { config: readPayments }, async (request) =>
    ok({ providers: await service.providers() }, meta(request)),
  );

  fastify.post('/payments', { config: managePayments }, async (request, reply) => {
    const payment = await service.initiate({
      context: context(request),
      input: withIdempotencyKey(request, request.body),
      request,
    });
    return reply.code(201).send(ok(payment, meta(request)));
  });

  fastify.get('/payments', { config: readPayments }, async (request) =>
    ok(
      { payments: await service.payments({ context: context(request), query: request.query }) },
      meta(request),
    ),
  );

  fastify.get('/payments/:paymentId', { config: readPayments }, async (request) => {
    const { paymentId } = validate(paymentParamsSchema, request.params, 'payment id');
    return ok(await service.payment({ context: context(request), paymentId }), meta(request));
  });

  fastify.get('/payments/:paymentId/history', { config: readPayments }, async (request) => {
    const { paymentId } = validate(paymentParamsSchema, request.params, 'payment id');
    return ok(
      {
        history: await service.history({
          context: context(request),
          paymentId,
          query: request.query,
        }),
      },
      meta(request),
    );
  });

  fastify.post('/payments/:paymentId/verify', { config: managePayments }, async (request) => {
    const { paymentId } = validate(paymentParamsSchema, request.params, 'payment id');
    return ok(
      await service.verify({
        context: context(request),
        paymentId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.post('/refunds', { config: managePayments }, async (request, reply) => {
    const refund = await service.refund({
      context: context(request),
      input: withIdempotencyKey(request, request.body),
      request,
    });
    return reply.code(201).send(ok(refund, meta(request)));
  });

  fastify.get('/refunds', { config: readPayments }, async (request) =>
    ok(
      { refunds: await service.refunds({ context: context(request), query: request.query }) },
      meta(request),
    ),
  );

  // Provider callbacks remain default-deny. A deployment ingress must map the
  // provider request to an authenticated internal principal; the provider
  // signature is verified independently by the adapter.
  fastify.post('/webhooks/:providerCode', { config: managePayments }, async (request) => {
    const { providerCode } = validate(webhookParamsSchema, request.params, 'provider code');
    const result = await service.handleWebhook({
      providerCode,
      input: request.body,
      headers: request.headers,
      rawBody: request.rawBody,
      request,
    });
    return ok(result, meta(request));
  });
};

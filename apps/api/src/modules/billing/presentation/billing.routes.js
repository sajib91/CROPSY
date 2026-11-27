const { z } = require('@cropsy/validation');
const { ok } = require('@cropsy/shared');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID } = require('../domain/billing.entity');
const { BillingServiceToken } = require('../application/billing.service');
const dto = require('../application/billing.dto');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });

const readBilling = Object.freeze({ auth: { permissions: ['subscriptions.read'] } });
const manageSubscriptions = Object.freeze({ auth: { permissions: ['subscriptions.manage'] } });
const managePlans = Object.freeze({ auth: { permissions: ['plans.manage'] } });
const readInvoices = Object.freeze({ auth: { permissions: ['invoices.read'] } });
const checkFeature = Object.freeze({ auth: { permissions: [] } });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

function context(request) {
  return request.auth;
}

module.exports = async function billingRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(BillingServiceToken);

  fastify.get('/info', async (request) => ok(await service.describe(), meta(request)));

  fastify.get('/info/:moduleId', async (request) => {
    const { moduleId } = validate(paramsSchema, request.params, 'module id');
    if (moduleId !== MODULE_ID) {
      throw new NotFoundError({
        message: `Module '${moduleId}' is not handled by ${MODULE_ID}.`,
      });
    }
    return ok(await service.describe(), meta(request));
  });

  fastify.get('/plans', { config: readBilling }, async (request) =>
    ok(await service.listPlans({ context: context(request), query: request.query }), meta(request)),
  );

  fastify.post('/plans', { config: managePlans }, async (request, reply) => {
    const result = await service.createPlan({
      context: context(request),
      input: request.body,
    });
    return reply.code(201).send(ok(result, meta(request)));
  });

  fastify.get('/plans/:planId', { config: readBilling }, async (request) => {
    const { planId } = validate(dto.planIdParamSchema, request.params, 'plan id');
    return ok(await service.getPlan({ context: context(request), planId }), meta(request));
  });

  fastify.patch('/plans/:planId', { config: managePlans }, async (request) => {
    const { planId } = validate(dto.planIdParamSchema, request.params, 'plan id');
    return ok(
      await service.updatePlan({
        context: context(request),
        planId,
        input: request.body,
      }),
      meta(request),
    );
  });

  fastify.get('/subscriptions/current', { config: readBilling }, async (request) =>
    ok(
      await service.getCurrentSubscription({ context: context(request), query: request.query }),
      meta(request),
    ),
  );

  fastify.get('/subscriptions', { config: readBilling }, async (request) =>
    ok(
      await service.listSubscriptions({ context: context(request), query: request.query }),
      meta(request),
    ),
  );

  fastify.post('/subscriptions', { config: manageSubscriptions }, async (request, reply) => {
    const result = await service.createSubscription({
      context: context(request),
      input: request.body,
    });
    return reply.code(201).send(ok(result, meta(request)));
  });

  fastify.post(
    '/subscriptions/:subscriptionId/renew',
    { config: manageSubscriptions },
    async (request) => {
      const { subscriptionId } = validate(
        dto.subscriptionIdParamSchema,
        request.params,
        'subscription id',
      );
      return ok(
        await service.renewSubscription({ context: context(request), subscriptionId }),
        meta(request),
      );
    },
  );

  fastify.post(
    '/subscriptions/:subscriptionId/change-plan',
    { config: manageSubscriptions },
    async (request) => {
      const { subscriptionId } = validate(
        dto.subscriptionIdParamSchema,
        request.params,
        'subscription id',
      );
      return ok(
        await service.changePlan({
          context: context(request),
          subscriptionId,
          input: request.body,
        }),
        meta(request),
      );
    },
  );

  fastify.post(
    '/subscriptions/:subscriptionId/cancel',
    { config: manageSubscriptions },
    async (request) => {
      const { subscriptionId } = validate(
        dto.subscriptionIdParamSchema,
        request.params,
        'subscription id',
      );
      return ok(
        await service.cancelSubscription({
          context: context(request),
          subscriptionId,
          input: request.body || {},
        }),
        meta(request),
      );
    },
  );

  fastify.get('/invoices', { config: readInvoices }, async (request) =>
    ok(
      await service.listInvoices({ context: context(request), query: request.query }),
      meta(request),
    ),
  );

  fastify.post('/invoices/:invoiceId/status', { config: manageSubscriptions }, async (request) => {
    const { invoiceId } = validate(dto.invoiceIdParamSchema, request.params, 'invoice id');
    return ok(
      await service.updateInvoice({
        context: context(request),
        invoiceId,
        input: request.body,
      }),
      meta(request),
    );
  });

  fastify.get('/usage', { config: readBilling }, async (request) =>
    ok(await service.listUsage({ context: context(request), query: request.query }), meta(request)),
  );

  fastify.post('/usage', { config: manageSubscriptions }, async (request, reply) => {
    const result = await service.recordUsage({
      context: context(request),
      input: request.body,
    });
    return reply.code(201).send(ok(result, meta(request)));
  });

  fastify.post('/entitlements/check', { config: checkFeature }, async (request) =>
    ok(
      await service.checkEntitlement({ context: context(request), input: request.body || {} }),
      meta(request),
    ),
  );
};

const { z } = require('@cropsy/validation');
const { ok } = require('@cropsy/shared');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { requireAuthenticated } = require('../../../shared/http/authorization');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID } = require('../domain/traceability.entity');
const { TraceabilityServiceToken } = require('../application/traceability.service');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const idParamsSchema = z.object({ batchId: z.string().uuid() }).strict();

const readTraceability = Object.freeze({
  config: { auth: { permissions: ['traceability.read'] } },
});
const manageTraceability = Object.freeze({
  config: {
    auth: {
      anyPermissions: [
        'farms.manage',
        'harvests.manage',
        'quality.manage',
        'warehouses.manage',
        'shipments.manage',
        'organizations.manage',
      ],
    },
  },
});
const publicVerification = Object.freeze({ config: { auth: false } });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

function context(request) {
  return requireAuthenticated(request);
}

function batchId(request) {
  return validate(idParamsSchema, request.params, 'route parameters').batchId;
}

module.exports = async function traceabilityRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(TraceabilityServiceToken);

  fastify.get('/info', async (request) =>
    ok(await service.describe(), {
      requestId: request.requestId,
      apiVersion: request.apiVersion,
    }),
  );

  fastify.get('/info/:moduleId', async (request) => {
    const { moduleId } = validate(paramsSchema, request.params, 'module id');
    if (moduleId !== MODULE_ID) {
      throw new NotFoundError({
        message: `Module '${moduleId}' is not handled by ${MODULE_ID}.`,
      });
    }
    return ok(await service.describe(), {
      requestId: request.requestId,
      apiVersion: request.apiVersion,
    });
  });

  fastify.get('/batches', readTraceability, async (request) =>
    ok(
      await service.listBatches({ context: context(request), query: request.query }),
      meta(request),
    ),
  );

  fastify.post('/batches', manageTraceability, async (request, reply) => {
    const batch = await service.createBatch({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(batch, meta(request)));
  });

  fastify.get('/batches/:batchId', readTraceability, async (request) =>
    ok(
      await service.getBatch({ context: context(request), batchId: batchId(request) }),
      meta(request),
    ),
  );

  fastify.patch('/batches/:batchId', manageTraceability, async (request) =>
    ok(
      await service.updateBatch({
        context: context(request),
        batchId: batchId(request),
        input: request.body,
        request,
      }),
      meta(request),
    ),
  );

  fastify.get('/batches/:batchId/timeline', readTraceability, async (request) =>
    ok(
      await service.listTimeline({
        context: context(request),
        batchId: batchId(request),
        query: request.query,
      }),
      meta(request),
    ),
  );

  fastify.post('/batches/:batchId/events', manageTraceability, async (request, reply) => {
    const event = await service.createEvent({
      context: context(request),
      batchId: batchId(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(event, meta(request)));
  });

  fastify.post('/batches/:batchId/verify', manageTraceability, async (request) =>
    ok(
      await service.verifyBatch({
        context: context(request),
        batchId: batchId(request),
        input: request.body,
        request,
      }),
      meta(request),
    ),
  );

  fastify.post('/batches/:batchId/reject', manageTraceability, async (request) =>
    ok(
      await service.rejectBatch({
        context: context(request),
        batchId: batchId(request),
        input: request.body,
        request,
      }),
      meta(request),
    ),
  );

  fastify.post('/batches/:batchId/qr', manageTraceability, async (request) =>
    ok(
      await service.generateQr({
        context: context(request),
        batchId: batchId(request),
        request,
      }),
      meta(request),
    ),
  );

  fastify.get('/audits', readTraceability, async (request) =>
    ok(
      await service.listAudits({ context: context(request), query: request.query }),
      meta(request),
    ),
  );

  fastify.get('/verify/:token', publicVerification, async (request) =>
    ok(await service.verifyPublic({ token: request.params.token }), meta(request)),
  );
};

const { z } = require('@cropsy/validation');
const { ok } = require('@cropsy/shared');

const { requireAuthenticated } = require('../../../shared/http/authorization');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID } = require('../domain/quality.entity');
const { QualityServiceToken } = require('../application/quality.service');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const idParamsSchema = z
  .object({
    inspectionId: z.string().uuid().optional(),
  })
  .strict();

const readQuality = Object.freeze({
  config: { auth: { permissions: ['quality.read'] } },
});
const manageQuality = Object.freeze({
  config: { auth: { permissions: ['quality.manage'] } },
});

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

function context(request) {
  return requireAuthenticated(request);
}

function ids(request) {
  return validate(idParamsSchema, request.params, 'route parameters');
}

module.exports = async function qualityRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(QualityServiceToken);

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

  // -------------------------------------------------------------------------
  // Inspections
  // -------------------------------------------------------------------------

  fastify.get('/inspections', readQuality, async (request) =>
    ok(
      await service.listInspections({ context: context(request), query: request.query }),
      meta(request),
    ),
  );

  fastify.post('/inspections', manageQuality, async (request, reply) => {
    const inspection = await service.createInspection({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(inspection, meta(request)));
  });

  fastify.get('/inspections/:inspectionId', readQuality, async (request) =>
    ok(
      await service.getInspection({
        context: context(request),
        inspectionId: ids(request).inspectionId,
      }),
      meta(request),
    ),
  );

  fastify.patch('/inspections/:inspectionId', manageQuality, async (request) =>
    ok(
      await service.updateInspection({
        context: context(request),
        inspectionId: ids(request).inspectionId,
        input: request.body,
        request,
      }),
      meta(request),
    ),
  );

  // -------------------------------------------------------------------------
  // Evidence and image attachments
  // -------------------------------------------------------------------------

  fastify.get('/inspections/:inspectionId/evidence', readQuality, async (request) =>
    ok(
      await service.listEvidence({
        context: context(request),
        inspectionId: ids(request).inspectionId,
        query: request.query,
      }),
      meta(request),
    ),
  );

  fastify.post('/inspections/:inspectionId/evidence', manageQuality, async (request, reply) => {
    const evidence = await service.createEvidence({
      context: context(request),
      inspectionId: ids(request).inspectionId,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(evidence, meta(request)));
  });

  fastify.post('/inspections/:inspectionId/images', manageQuality, async (request, reply) => {
    const image = await service.createImage({
      context: context(request),
      inspectionId: ids(request).inspectionId,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(image, meta(request)));
  });

  // -------------------------------------------------------------------------
  // Grading and verification
  // -------------------------------------------------------------------------

  fastify.post('/inspections/:inspectionId/grade', manageQuality, async (request) =>
    ok(
      await service.gradeInspection({
        context: context(request),
        inspectionId: ids(request).inspectionId,
        input: request.body,
        request,
      }),
      meta(request),
    ),
  );

  fastify.post('/inspections/:inspectionId/verify', manageQuality, async (request) =>
    ok(
      await service.verifyInspection({
        context: context(request),
        inspectionId: ids(request).inspectionId,
        input: request.body || {},
        request,
      }),
      meta(request),
    ),
  );

  fastify.post('/inspections/:inspectionId/reject', manageQuality, async (request) =>
    ok(
      await service.rejectInspection({
        context: context(request),
        inspectionId: ids(request).inspectionId,
        input: request.body || {},
        request,
      }),
      meta(request),
    ),
  );

  // -------------------------------------------------------------------------
  // Audits
  // -------------------------------------------------------------------------

  fastify.get('/audits', readQuality, async (request) =>
    ok(
      await service.listAudits({ context: context(request), query: request.query }),
      meta(request),
    ),
  );
};

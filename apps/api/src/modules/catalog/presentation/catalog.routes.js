const { z } = require('@cropsy/validation');
const { ok } = require('@cropsy/shared');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID } = require('../domain/catalog.entity');
const { CatalogServiceToken } = require('../application/catalog.service');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });

module.exports = async function catalogRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(CatalogServiceToken);

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
};

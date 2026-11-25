const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const { EventBusToken } = require('../shared/di/tokens');
const { NotFoundError } = require('../shared/kernel/errors');
const { validate } = require('../shared/validation/validate');
const { modules } = require('../modules/registry');

const moduleIdSchema = z.object({ moduleId: z.string().trim().min(1) });
const observabilityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function toSummary(module) {
  const { id, name, path, description, dependsOn, publishes, subscribes } = module.metadata;
  return { id, name, path, description, dependsOn, publishes, subscribes };
}

module.exports = async function platformRoutes(fastify) {
  const apiVersion = fastify.cropsyApiVersion;
  const eventBus = fastify.cropsyContainer.resolve(EventBusToken);

  fastify.get('/', async () =>
    ok({
      service: fastify.cropsyEnv.SERVICE_NAME,
      apiVersion: apiVersion.version,
      prefix: apiVersion.prefix,
      supportedVersions: apiVersion.supportedVersions,
      modules: modules.map(toSummary),
    }),
  );

  fastify.get('/version', async () =>
    ok({
      version: apiVersion.version,
      prefix: apiVersion.prefix,
      supportedVersions: apiVersion.supportedVersions,
    }),
  );

  fastify.get('/modules', async () =>
    ok(modules.map(toSummary), { count: modules.length, apiVersion: apiVersion.version }),
  );

  fastify.get('/modules/:moduleId', async (request) => {
    const { moduleId } = validate(moduleIdSchema, request.params, 'module id');
    const module = modules.find((candidate) => candidate.id === moduleId);
    if (!module) {
      throw new NotFoundError({ message: `Unknown module '${moduleId}'.` });
    }
    return ok(toSummary(module), { apiVersion: apiVersion.version });
  });

  fastify.get('/observability', async (request) => {
    const { limit } = validate(observabilityQuerySchema, request.query, 'observability query');
    return ok(
      {
        uptimeSeconds: Math.max(0, (Date.now() - fastify.startedAt) / 1000),
        modules: modules.length,
        requestId: request.requestId,
        events: {
          recorded: eventBus.history.length,
          recent: eventBus.recent(limit),
        },
      },
      { apiVersion: apiVersion.version },
    );
  });
};

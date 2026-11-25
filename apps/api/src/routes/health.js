const { createHealthResponse } = require('@cropsy/api-contracts');

module.exports = async function healthRoutes(fastify) {
  fastify.get('/health', async () =>
    createHealthResponse({
      status: 'ok',
      service: fastify.cropsyEnv.SERVICE_NAME,
      startedAt: fastify.startedAt,
    }),
  );

  fastify.get('/health/ready', async () =>
    createHealthResponse({
      status: 'ready',
      service: fastify.cropsyEnv.SERVICE_NAME,
      startedAt: fastify.startedAt,
      checks: { process: 'ok' },
    }),
  );
};

const Fastify = require('fastify');
const cors = require('@fastify/cors');
const helmet = require('@fastify/helmet');
const { loadApiEnv } = require('@cropsy/config');

const { InProcessEventBus } = require('./shared/events/domain-event');
const { registerErrorHandling } = require('./shared/presentation/error-handler');
const observability = require('./shared/presentation/observability');
const { resolveApiVersion } = require('./shared/http/versioning');
const { createContainer, registerModules } = require('./modules');
const healthRoutes = require('./routes/health');
const platformRoutes = require('./routes/platform');

async function buildServer(options = {}) {
  const env = loadApiEnv(options.env || process.env);
  const logger = options.logger === undefined ? { level: env.LOG_LEVEL } : options.logger;
  const apiVersion = resolveApiVersion(env.API_PREFIX);

  const app = Fastify({ logger });

  const eventBusLogger =
    logger === false ? undefined : app.log.child({ component: 'domain-events' });
  const eventBus = new InProcessEventBus({ logger: eventBusLogger });
  const container = createContainer({
    env,
    logger: app.log,
    eventBus,
    apiVersion,
  });

  app.decorate('cropsyEnv', env);
  app.decorate('startedAt', Date.now());
  app.decorate('cropsyApiVersion', apiVersion);
  app.decorate('cropsyContainer', container);
  app.decorate('cropsyEventBus', eventBus);

  registerErrorHandling(app);
  observability(app, { apiVersion });

  await app.register(helmet);
  await app.register(cors, { origin: env.CORS_ORIGIN });

  await app.register(healthRoutes, { prefix: env.API_PREFIX });
  await app.register(platformRoutes, { prefix: env.API_PREFIX });
  await registerModules(app, { env });

  return app;
}

module.exports = buildServer;
module.exports.buildServer = buildServer;

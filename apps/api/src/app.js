const Fastify = require('fastify');
const cors = require('@fastify/cors');
const helmet = require('@fastify/helmet');
const { loadApiEnv } = require('@cropsy/config');

const { disconnectPrisma } = require('./shared/database/prisma');
const { InProcessEventBus } = require('./shared/events/domain-event');
const { registerErrorHandling } = require('./shared/presentation/error-handler');
const observability = require('./shared/presentation/observability');
const { resolveApiVersion } = require('./shared/http/versioning');
const { createContainer, registerModules } = require('./modules');
const {
  NotificationProvidersToken,
  NotificationQueueToken,
  NotificationRealtimeToken,
} = require('./shared/di/tokens');
const { AuthStoreToken } = require('./modules/iam/domain/auth.repository');
const { AnalyticsStoreToken } = require('./modules/analytics/domain/analytics.repository');
const { AiGatewayToken } = require('./modules/intelligence/domain/ai-gateway.entity');
const { OtpProvidersToken, RateLimiterToken } = require('./modules/iam/application/tokens');
const { registerHttpAuthorization } = require('./modules/iam/presentation/http-authorization');
const healthRoutes = require('./routes/health');
const platformRoutes = require('./routes/platform');

async function buildServer(options = {}) {
  const env = loadApiEnv(options.env || process.env);
  const logger = options.logger === undefined ? { level: env.LOG_LEVEL } : options.logger;
  const apiVersion = resolveApiVersion(env.API_PREFIX);

  // Do not trust client-supplied forwarding headers. Security-relevant rate limits
  // and audit metadata use the socket peer address unless an explicit trusted-proxy
  // adapter is configured by the deployment.
  const app = Fastify({ logger, trustProxy: false });

  // Contract tooling registers this hook before any plugin routes so it sees the
  // final registered URL, method, handler, and authorization config.
  if (typeof options.onRoute === 'function') {
    app.addHook('onRoute', options.onRoute);
  }

  const eventBusLogger =
    logger === false ? undefined : app.log.child({ component: 'domain-events' });
  const eventBus = new InProcessEventBus({ logger: eventBusLogger });
  const overrides = new Map();
  if (options.authStore) overrides.set(AuthStoreToken, () => options.authStore);
  if (options.otpProviders) overrides.set(OtpProvidersToken, () => options.otpProviders);
  if (options.rateLimiter) overrides.set(RateLimiterToken, () => options.rateLimiter);
  if (options.aiGateway) overrides.set(AiGatewayToken, () => options.aiGateway);
  if (options.analyticsStore) overrides.set(AnalyticsStoreToken, () => options.analyticsStore);
  if (options.notificationQueue) {
    overrides.set(NotificationQueueToken, () => options.notificationQueue);
  }
  if (options.notificationRealtime) {
    overrides.set(NotificationRealtimeToken, () => options.notificationRealtime);
  }
  if (options.notificationProviders) {
    overrides.set(NotificationProvidersToken, () => options.notificationProviders);
  }
  const container = createContainer({
    env,
    logger: app.log,
    eventBus,
    apiVersion,
    overrides,
  });

  if (container.has(NotificationRealtimeToken)) {
    const realtime = container.resolve(NotificationRealtimeToken);
    realtime.attach(app.server);
    app.addHook('onClose', async () => realtime.close());
  }
  if (container.has(NotificationQueueToken)) {
    const queue = container.resolve(NotificationQueueToken);
    app.addHook('onClose', async () => queue.close());
  }
  app.addHook('onClose', async () => disconnectPrisma());

  app.decorate('cropsyEnv', env);
  app.decorate('startedAt', Date.now());
  app.decorate('cropsyApiVersion', apiVersion);
  app.decorate('cropsyContainer', container);
  app.decorate('cropsyEventBus', eventBus);

  registerErrorHandling(app);
  observability(app, { apiVersion });
  registerHttpAuthorization(app);

  await app.register(helmet);
  await app.register(cors, { origin: env.CORS_ORIGIN });

  await app.register(healthRoutes, { prefix: env.API_PREFIX });
  await app.register(platformRoutes, { prefix: env.API_PREFIX });
  await registerModules(app, { env });

  return app;
}

module.exports = buildServer;
module.exports.buildServer = buildServer;

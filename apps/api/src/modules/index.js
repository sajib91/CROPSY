const { Container } = require('../shared/di/container');
const {
  ApiVersionToken,
  ConfigToken,
  EventBusToken,
  IdentityStoreToken,
  LoggerToken,
  NotificationAuthPortToken,
  NotificationPreferencesPortToken,
  PlatformAuthorizationToken,
  PlatformTokenManagerToken,
} = require('../shared/di/tokens');
const { AuthStoreToken } = require('./iam/domain/auth.repository');
const { AuthorizationServiceToken, TokenManagerToken } = require('./iam/application/tokens');
const { modules } = require('./registry');

function createContainer({ env, logger, eventBus, apiVersion, overrides }) {
  const container = new Container();

  container.register(ConfigToken, () => env);
  container.register(LoggerToken, () => logger);
  container.register(EventBusToken, () => eventBus);
  container.register(ApiVersionToken, () => apiVersion);

  if (overrides) {
    const entries = overrides instanceof Map ? overrides.entries() : Object.entries(overrides);
    for (const [token, factory] of entries) {
      if (!container.has(token)) container.register(token, factory);
    }
  }

  // Composition-root aliases: business modules consume these shared ports
  // without depending on the IAM module's source files. They are registered
  // before module subscriptions so notification handlers can resolve them.
  container.register(IdentityStoreToken, (resolver) => resolver.resolve(AuthStoreToken));
  container.register(PlatformAuthorizationToken, (resolver) =>
    resolver.resolve(AuthorizationServiceToken),
  );
  container.register(PlatformTokenManagerToken, (resolver) => resolver.resolve(TokenManagerToken));
  container.register(NotificationPreferencesPortToken, (resolver) =>
    resolver.resolve(IdentityStoreToken),
  );
  container.register(NotificationAuthPortToken, (resolver) =>
    resolver.resolve(AuthorizationServiceToken),
  );

  for (const module of modules) {
    module.register(container);
  }

  return container;
}

async function registerModules(app, { env }) {
  for (const module of modules) {
    await app.register(module.routes, { prefix: `${env.API_PREFIX}/${module.path}` });
  }
}

module.exports = { createContainer, registerModules };

const { Container } = require('../shared/di/container');
const { ApiVersionToken, ConfigToken, EventBusToken, LoggerToken } = require('../shared/di/tokens');
const { modules } = require('./registry');

function createContainer({ env, logger, eventBus, apiVersion }) {
  const container = new Container();

  container.register(ConfigToken, () => env);
  container.register(LoggerToken, () => logger);
  container.register(EventBusToken, () => eventBus);
  container.register(ApiVersionToken, () => apiVersion);

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

const { EventBusToken, LoggerToken } = require('../di/tokens');

function defineModule(spec) {
  const required = [
    'id',
    'name',
    'path',
    'description',
    'repositoryToken',
    'repository',
    'serviceToken',
    'service',
    'routes',
  ];

  for (const key of required) {
    if (spec[key] === undefined || spec[key] === null) {
      throw new TypeError(`Module definition requires '${key}'.`);
    }
  }

  const metadata = Object.freeze({
    id: spec.id,
    name: spec.name,
    path: spec.path,
    description: spec.description,
    dependsOn: Object.freeze([...(spec.dependsOn || [])]),
    publishes: Object.freeze([...(spec.publishes || [])]),
    subscribes: Object.freeze([...(spec.subscribes || [])]),
  });

  const definition = {
    ...spec,
    metadata,
    register(container) {
      if (!container.has(spec.repositoryToken)) {
        container.register(spec.repositoryToken, () => new spec.repository());
      }

      container.register(
        spec.serviceToken,
        (resolver) =>
          new spec.service({
            repository: resolver.resolve(spec.repositoryToken),
            eventBus: resolver.resolve(EventBusToken),
            logger: resolver.resolve(LoggerToken),
            metadata,
          }),
      );

      if (typeof spec.subscriptions === 'function') {
        spec.subscriptions({ container, definition });
      }
    },
  };

  return Object.freeze(definition);
}

module.exports = { defineModule };

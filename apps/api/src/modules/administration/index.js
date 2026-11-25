const { defineModule } = require('../../shared/module/define-module');
const { EventBusToken, LoggerToken } = require('../../shared/di/tokens');

const { MODULE_ID, MODULE_NAME } = require('./domain/administration.entity');
const { AdministrationRepositoryToken } = require('./domain/administration.repository');
const { AdministrationInMemoryRepository } = require('./infrastructure/administration.repository');
const {
  AdministrationService,
  AdministrationServiceToken,
} = require('./application/administration.service');
const administrationRoutes = require('./presentation/administration.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'administration',
  description: 'Platform administration, settings, moderation, and audit oversight.',
  dependsOn: ['iam', 'organizations'],
  publishes: ['administration.initialized', 'administration.audit.recorded'],
  subscribes: ['*'],
  repositoryToken: AdministrationRepositoryToken,
  repository: AdministrationInMemoryRepository,
  serviceToken: AdministrationServiceToken,
  service: AdministrationService,
  routes: administrationRoutes,
  subscriptions: ({ container }) => {
    const eventBus = container.resolve(EventBusToken);
    const logger = container.resolve(LoggerToken);
    eventBus.subscribe('*', (event) => {
      logger.debug({ moduleId: MODULE_ID, observedEvent: event.type }, 'Observed domain event');
    });
  },
});

module.exports = { definition, routes: administrationRoutes };

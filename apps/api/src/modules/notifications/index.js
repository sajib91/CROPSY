const { defineModule } = require('../../shared/module/define-module');
const { EventBusToken, LoggerToken } = require('../../shared/di/tokens');

const { MODULE_ID, MODULE_NAME } = require('./domain/notifications.entity');
const { NotificationsRepositoryToken } = require('./domain/notifications.repository');
const { NotificationsInMemoryRepository } = require('./infrastructure/notifications.repository');
const {
  NotificationsService,
  NotificationsServiceToken,
} = require('./application/notifications.service');
const notificationsRoutes = require('./presentation/notifications.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'notifications',
  description: 'Notification channels, templates, delivery records, and preferences.',
  dependsOn: ['users', 'iam'],
  publishes: ['notifications.initialized', 'notifications.queued'],
  subscribes: ['*'],
  repositoryToken: NotificationsRepositoryToken,
  repository: NotificationsInMemoryRepository,
  serviceToken: NotificationsServiceToken,
  service: NotificationsService,
  routes: notificationsRoutes,
  subscriptions: ({ container }) => {
    const eventBus = container.resolve(EventBusToken);
    const logger = container.resolve(LoggerToken);
    eventBus.subscribe('*', (event) => {
      logger.debug({ moduleId: MODULE_ID, observedEvent: event.type }, 'Observed domain event');
    });
  },
});

module.exports = { definition, routes: notificationsRoutes };

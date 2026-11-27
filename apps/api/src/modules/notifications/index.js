const { defineModule } = require('../../shared/module/define-module');
const {
  ConfigToken,
  EventBusToken,
  IdentityStoreToken,
  LoggerToken,
  NotificationAuthPortToken,
  NotificationPreferencesPortToken,
  NotificationProvidersToken,
  NotificationQueueToken,
  NotificationRealtimeToken,
} = require('../../shared/di/tokens');

const { MODULE_ID, MODULE_NAME, SUBSCRIBED_EVENT_TYPES } = require('./domain/notifications.entity');
const { NotificationsRepositoryToken } = require('./domain/notifications.repository');
const {
  NotificationsInMemoryRepository,
  NotificationProviderRegistry,
  createNotificationQueue,
  NotificationRealtimeGateway,
} = require('./infrastructure');
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
  publishes: [
    'notifications.initialized',
    'notifications.queued',
    'notifications.read',
    'notifications.delivery.succeeded',
    'notifications.delivery.retry-scheduled',
    'notifications.delivery.failed',
  ],
  subscribes: SUBSCRIBED_EVENT_TYPES,
  repositoryToken: NotificationsRepositoryToken,
  repository: NotificationsInMemoryRepository,
  serviceToken: NotificationsServiceToken,
  service: NotificationsService,
  serviceDependencies: {
    preferences: NotificationPreferencesPortToken,
    identity: IdentityStoreToken,
    authorization: NotificationAuthPortToken,
    realtime: NotificationRealtimeToken,
    queue: NotificationQueueToken,
    providers: NotificationProvidersToken,
    env: ConfigToken,
  },
  routes: notificationsRoutes,
  subscriptions: ({ container }) => {
    const env = container.resolve(ConfigToken);
    const logger = container.resolve(LoggerToken);
    const eventBus = container.resolve(EventBusToken);
    const authPort = container.resolve(NotificationAuthPortToken);

    if (!container.has(NotificationRealtimeToken)) {
      container.register(
        NotificationRealtimeToken,
        () => new NotificationRealtimeGateway({ env, logger, authPort }),
      );
    }
    if (!container.has(NotificationQueueToken)) {
      container.register(NotificationQueueToken, () => createNotificationQueue({ env, logger }));
    }
    if (!container.has(NotificationProvidersToken)) {
      const realtime = container.resolve(NotificationRealtimeToken);
      container.register(
        NotificationProvidersToken,
        () => new NotificationProviderRegistry({ env, realtime }),
      );
    }

    const service = container.resolve(NotificationsServiceToken);
    container.resolve(NotificationQueueToken).setHandler((job) => service.processDeliveryJob(job));

    for (const eventType of SUBSCRIBED_EVENT_TYPES) {
      eventBus.subscribe(eventType, (event) => {
        Promise.resolve(service.handleDomainEvent(event)).catch((error) => {
          logger.error(
            { err: error, eventType: event.type },
            'Failed to dispatch domain event notification',
          );
        });
      });
    }
  },
});

module.exports = { definition, routes: notificationsRoutes };

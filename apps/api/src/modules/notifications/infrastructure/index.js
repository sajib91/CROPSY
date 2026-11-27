const { NotificationsInMemoryRepository } = require('./notifications.repository');
const { NotificationProviderRegistry } = require('./notification-providers');
const { createNotificationQueue } = require('./notification-queue');
const { NotificationRealtimeGateway } = require('./notification-realtime.gateway');

module.exports = {
  NotificationsInMemoryRepository,
  NotificationProviderRegistry,
  createNotificationQueue,
  NotificationRealtimeGateway,
};

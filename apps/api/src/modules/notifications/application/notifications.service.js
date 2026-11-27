const { assertRepository } = require('../../../shared/domain/repository');
const { ForbiddenError, NotFoundError, ValidationError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const {
  CHANNELS,
  DeliveryAttemptRecord,
  DeviceTokenRecord,
  EVENT_CATALOG,
  MODULE_ID,
  NotificationsEntity,
  NotificationRecord,
  recipientsFromEvent,
} = require('../domain/notifications.entity');
const { NotificationsRepositoryToken } = require('../domain/notifications.repository');
const {
  createNotificationInputSchema,
  deliveryQuerySchema,
  deviceTokenSchema,
  failureQuerySchema,
  listNotificationsQuerySchema,
  moduleInfoSchema,
  toModuleInfoDto,
  toNotificationDto,
} = require('./notifications.dto');

const NotificationsServiceToken = Symbol.for('cropsy.service.notifications');

const DEFAULT_TITLES = Object.freeze({
  ORDER: 'Order update',
  SHIPMENT: 'Delivery update',
  MARKETPLACE: 'Marketplace activity',
  AI: 'AI processing complete',
  SECURITY: 'Security notice',
});

function truncate(value, max) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {});
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

class NotificationsService {
  constructor({
    repository,
    eventBus,
    logger,
    metadata,
    preferences,
    identity,
    authorization,
    realtime,
    queue,
    providers,
    env,
  }) {
    assertRepository(
      repository,
      [
        'get',
        'save',
        'list',
        'listForUser',
        'findNotification',
        'saveNotification',
        'updateNotification',
        'appendAttempt',
        'listAttempts',
        'listFailures',
        'listDeviceTokens',
        'saveDeviceToken',
        'deleteDeviceToken',
      ],
      NotificationsRepositoryToken,
    );
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('NotificationsService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('NotificationsService requires module metadata.');
    }
    if (!preferences || typeof preferences.listNotificationPreferences !== 'function') {
      throw new TypeError('NotificationsService requires a notification preference port.');
    }
    if (!identity || typeof identity.findUserById !== 'function') {
      throw new TypeError('NotificationsService requires an identity port.');
    }
    if (!realtime || typeof realtime.emitToUser !== 'function') {
      throw new TypeError('NotificationsService requires a realtime port.');
    }
    if (!queue || typeof queue.enqueue !== 'function') {
      throw new TypeError('NotificationsService requires a notification queue.');
    }
    if (!providers || typeof providers.send !== 'function') {
      throw new TypeError('NotificationsService requires notification providers.');
    }

    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.preferences = preferences;
    this.identity = identity;
    this.authorization = authorization;
    this.realtime = realtime;
    this.queue = queue;
    this.providers = providers;
    this.env = env || {};
    this.maxAttempts = this.env.NOTIFICATION_MAX_ATTEMPTS || 5;
    this.retryBaseMs = this.env.NOTIFICATION_RETRY_BASE_MS || 1000;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new NotificationsEntity();
      await this.repository.save(entity);
      this.eventBus.publish({
        type: `${MODULE_ID}.initialized`,
        moduleId: MODULE_ID,
        aggregateId: entity.id,
        payload: { name: entity.name },
      });
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    const dto = toModuleInfoDto(entity, this.metadata);
    return validate(moduleInfoSchema, dto, 'notifications module info');
  }

  assertManager(context) {
    if (context?.isSuperAdmin || context?.permissions?.includes('notifications.manage')) return;
    throw new ForbiddenError({
      message: "Missing required permission 'notifications.manage'.",
      details: { permission: 'notifications.manage' },
    });
  }

  async assertTargetAccess(context, userId) {
    if (context?.isSuperAdmin || context?.permissions?.includes('notifications.manage')) return;
    if (context?.user?.id === userId) return;
    if (this.authorization?.assertUserAccess) {
      await this.authorization.assertUserAccess(context, userId, ['notifications.read']);
      return;
    }
    throw new ForbiddenError({ message: 'Access to these notifications is denied.' });
  }

  async list({ context, query }) {
    const input = validate(listNotificationsQuerySchema, query || {}, 'notification query');
    const userId = input.userId || context.user.id;
    await this.assertTargetAccess(context, userId);
    const records = await this.repository.listForUser(userId, input);
    return records.map(toNotificationDto);
  }

  async markRead({ context, notificationId }) {
    const record = await this.repository.findNotification(notificationId);
    if (!record) throw new NotFoundError({ message: 'Notification was not found.' });
    await this.assertTargetAccess(context, record.user_id);
    if (record.status === 'READ') return toNotificationDto(record);
    const updated = await this.repository.updateNotification(notificationId, {
      status: 'READ',
      read_at: new Date(),
    });
    const dto = toNotificationDto(updated);
    this.realtime.emitToUser(record.user_id, 'notification.read', { id: record.id });
    this.eventBus.publish({
      type: `${MODULE_ID}.read`,
      moduleId: MODULE_ID,
      aggregateId: notificationId,
      payload: { userId: record.user_id },
    });
    return dto;
  }

  async markAllRead({ context }) {
    const records = await this.repository.listForUser(context.user.id, { limit: 100000 });
    let count = 0;
    for (const record of records) {
      if (record.status === 'READ') continue;
      await this.repository.updateNotification(record.id, {
        status: 'READ',
        read_at: new Date(),
      });
      count += 1;
    }
    this.realtime.emitToUser(context.user.id, 'notification.read-all', { count });
    return { updated: count };
  }

  async registerDeviceToken({ context, input }) {
    const value = validate(deviceTokenSchema, input || {}, 'device token');
    const record = DeviceTokenRecord({
      userId: context.user.id,
      token: value.token,
      platform: value.platform,
      deviceId: value.deviceId,
      organizationId: value.organizationId || context.organizationId || null,
    });
    await this.repository.saveDeviceToken(record);
    return {
      id: record.id,
      platform: record.platform,
      deviceId: record.device_id,
      createdAt: record.created_at.toISOString(),
    };
  }

  async revokeDeviceToken({ context, token }) {
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new ValidationError({ message: 'A device token is required.' });
    }
    const crypto = require('node:crypto');
    const hash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const removed = await this.repository.deleteDeviceToken(context.user.id, hash);
    return { removed };
  }

  async listDelivery({ context, notificationId }) {
    const { notificationId: id } = validate(
      deliveryQuerySchema,
      { notificationId },
      'delivery query',
    );
    const record = await this.repository.findNotification(id);
    if (!record) throw new NotFoundError({ message: 'Notification was not found.' });
    await this.assertTargetAccess(context, record.user_id);
    const attempts = await this.repository.listAttempts(id);
    return {
      notification: toNotificationDto(record),
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        channel: attempt.channel,
        provider: attempt.provider,
        state: attempt.state,
        error: attempt.error,
        attempt: attempt.attempt,
        occurredAt: attempt.occurred_at,
      })),
    };
  }

  async listFailures({ context, query }) {
    this.assertManager(context);
    const input = validate(failureQuerySchema, query || {}, 'failure query');
    const failures = await this.repository.listFailures(input);
    return failures.map((attempt) => ({
      id: attempt.id,
      notificationId: attempt.notification_id,
      channel: attempt.channel,
      provider: attempt.provider,
      error: attempt.error,
      attempt: attempt.attempt,
      occurredAt: attempt.occurred_at,
    }));
  }

  async retryFailed({ context, notificationId }) {
    this.assertManager(context);
    const record = await this.repository.findNotification(notificationId);
    if (!record) throw new NotFoundError({ message: 'Notification was not found.' });
    if (record.status !== 'FAILED') {
      throw new ValidationError({ message: 'Only failed notifications can be retried.' });
    }
    await this.repository.updateNotification(record.id, { status: 'PENDING' });
    await this.queue.enqueue(this.deliveryJob(record, 1));
    return { notification: toNotificationDto({ ...record, status: 'PENDING' }), retried: true };
  }

  async allowedChannels({ userId, type, category, channels }) {
    const preferences = await this.preferences.listNotificationPreferences(userId);
    return channels.filter((channel) => {
      if (!CHANNELS.includes(channel)) return false;
      const matches = preferences.filter(
        (preference) =>
          preference.channel === channel &&
          ['*', 'ALL', type, category].includes(preference.event_type),
      );
      if (matches.length === 0) return true;
      return matches.some((preference) => preference.enabled !== false);
    });
  }

  async buildRecipient(userId, record) {
    const user = await this.identity.findUserById(userId);
    const tokens = await this.repository.listDeviceTokens(userId);
    return {
      userId,
      email: user?.email || null,
      phone: user?.phone || null,
      deviceTokens: tokens.map((token) => token.token),
      organizationId: record.organization_id || null,
    };
  }

  deliveryJob(record, attempt = 1) {
    return {
      jobId: `notification:${record.id}:attempt:${attempt}`,
      notificationId: record.id,
      attempt,
      maxAttempts: this.maxAttempts,
      retryDelayMs: this.retryBaseMs,
    };
  }

  async publishNotification(input, { eventType, category } = {}) {
    const value = validate(createNotificationInputSchema, input, 'notification input');
    const channels = await this.allowedChannels({
      userId: value.userId,
      type: value.type,
      category: category || value.type,
      channels: value.channels,
    });
    const created = [];
    for (const channel of channels) {
      const record = NotificationRecord({
        organizationId: value.organizationId || null,
        userId: value.userId,
        channel,
        type: value.type,
        title: value.title,
        body: value.body,
        data: { ...value.data, ...(eventType ? { eventType } : {}) },
      });
      await this.repository.saveNotification(record);
      await this.queue.enqueue(this.deliveryJob(record, 1));
      created.push(toNotificationDto(record));
      this.eventBus.publish({
        type: `${MODULE_ID}.queued`,
        moduleId: MODULE_ID,
        aggregateId: record.id,
        payload: { userId: record.user_id, channel: record.channel, type: record.type },
      });
    }
    return created;
  }

  async handleDomainEvent(event) {
    const descriptor = EVENT_CATALOG[event.type];
    if (!descriptor) return [];
    const recipients = recipientsFromEvent(event);
    if (recipients.length === 0) return [];
    const payload = event.payload || {};
    const title = truncate(
      payload.title || DEFAULT_TITLES[descriptor.category] || descriptor.type,
      255,
    );
    const body = truncate(
      payload.message || payload.body || payload.reason || descriptor.type,
      4000,
    );
    const created = [];
    for (const userId of recipients) {
      const notifications = await this.publishNotification(
        {
          userId,
          organizationId: payload.organizationId || null,
          type: descriptor.type,
          title,
          body,
          data: {
            eventId: event.id,
            sourceEvent: event.type,
            aggregateId: event.aggregateId || null,
          },
          channels: [...descriptor.channels],
        },
        { eventType: event.type, category: descriptor.category },
      );
      created.push(...notifications);
    }
    return created;
  }

  async processDeliveryJob(job) {
    const data = job?.data || job || {};
    const notification = await this.repository.findNotification(data.notificationId);
    if (!notification) return { skipped: true, reason: 'notification_not_found' };
    if (notification.status === 'READ') return { skipped: true, reason: 'already_read' };

    const attempt = Number(data.attempt) || 1;
    const maxAttempts = Number(data.maxAttempts) || this.maxAttempts;
    const channel = notification.channel;
    if (!this.providers.isConfigured(channel)) {
      await this.repository.appendAttempt(
        DeliveryAttemptRecord({
          notificationId: notification.id,
          channel,
          provider: 'unconfigured',
          state: 'skipped',
          attempt,
        }),
      );
      return { skipped: true, reason: 'provider_unconfigured' };
    }

    const recipient = await this.buildRecipient(notification.user_id, notification);
    try {
      const result = await this.providers.send({ channel, recipient, notification });
      const status = result.state === 'delivered' ? 'DELIVERED' : 'SENT';
      await this.repository.updateNotification(notification.id, {
        status,
        sent_at: new Date(),
      });
      await this.repository.appendAttempt(
        DeliveryAttemptRecord({
          notificationId: notification.id,
          channel,
          provider: result.provider,
          state: result.state,
          attempt,
        }),
      );
      this.eventBus.publish({
        type: `${MODULE_ID}.delivery.succeeded`,
        moduleId: MODULE_ID,
        aggregateId: notification.id,
        payload: { userId: notification.user_id, channel, attempt },
      });
      return { status, provider: result.provider };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.appendAttempt(
        DeliveryAttemptRecord({
          notificationId: notification.id,
          channel,
          provider: this.providers.get(channel)?.name || channel,
          state: 'failed',
          error: message,
          attempt,
        }),
      );
      this.logger?.warn(
        { notificationId: notification.id, channel, attempt, err: error },
        'Notification delivery attempt failed',
      );

      if (attempt < maxAttempts) {
        const delayMs = (Number(data.retryDelayMs) || this.retryBaseMs) * 2 ** (attempt - 1);
        await this.repository.updateNotification(notification.id, { status: 'PENDING' });
        await this.queue.enqueue({ ...data, attempt: attempt + 1 }, { delayMs });
        this.eventBus.publish({
          type: `${MODULE_ID}.delivery.retry-scheduled`,
          moduleId: MODULE_ID,
          aggregateId: notification.id,
          payload: { userId: notification.user_id, channel, attempt: attempt + 1, delayMs },
        });
        return { retried: true, attempt: attempt + 1 };
      }

      await this.repository.updateNotification(notification.id, { status: 'FAILED' });
      this.eventBus.publish({
        type: `${MODULE_ID}.delivery.failed`,
        moduleId: MODULE_ID,
        aggregateId: notification.id,
        payload: { userId: notification.user_id, channel, attempt, error: message },
      });
      return { status: 'FAILED', error: message };
    }
  }
}

module.exports = { NotificationsService, NotificationsServiceToken };

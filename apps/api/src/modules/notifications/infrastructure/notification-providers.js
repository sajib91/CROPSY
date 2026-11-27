const { CHANNELS } = require('../domain/notifications.entity');

function normalizeUrl(value) {
  return typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
}

class HttpNotificationProvider {
  constructor({ channel, url, token, timeoutMs = 5000, fetchImpl }) {
    this.channel = channel;
    this.url = normalizeUrl(url);
    this.token = token || '';
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl || globalThis.fetch;
  }

  get configured() {
    return this.url.length > 0 && typeof this.fetchImpl === 'function';
  }

  get name() {
    return `http:${this.channel.toLowerCase()}`;
  }

  async send({ recipient, notification }) {
    if (!this.configured) {
      throw new Error(`${this.channel} provider is not configured.`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          channel: this.channel,
          to:
            this.channel === 'EMAIL'
              ? recipient.email
              : this.channel === 'SMS'
                ? recipient.phone
                : recipient.deviceTokens,
          subject: notification.title,
          text: notification.body,
          notificationId: notification.id,
          userId: recipient.userId,
          metadata: notification.data || {},
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Provider responded with status ${response.status}.`);
      }
      return { state: 'sent', provider: this.name };
    } finally {
      clearTimeout(timer);
    }
  }
}

class InAppNotificationProvider {
  constructor({ realtime }) {
    this.realtime = realtime;
  }

  get configured() {
    return true;
  }

  get name() {
    return 'in-app';
  }

  async send({ recipient, notification }) {
    this.realtime.emitToUser(recipient.userId, 'notification', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      createdAt: notification.created_at,
    });
    return { state: 'delivered', provider: this.name };
  }
}

class NotificationProviderRegistry {
  constructor({ env, realtime, fetchImpl }) {
    this.providers = new Map([['IN_APP', new InAppNotificationProvider({ realtime })]]);
    for (const channel of CHANNELS.filter((candidate) => candidate !== 'IN_APP')) {
      const modeKey = `NOTIFICATION_${channel}_PROVIDER_MODE`;
      const urlKey = `NOTIFICATION_${channel}_PROVIDER_URL`;
      const tokenKey = `NOTIFICATION_${channel}_PROVIDER_TOKEN`;
      const enabled = env[modeKey] === 'http';
      this.providers.set(
        channel,
        enabled
          ? new HttpNotificationProvider({
              channel,
              url: env[urlKey],
              token: env[tokenKey],
              timeoutMs: env.NOTIFICATION_PROVIDER_TIMEOUT_MS,
              fetchImpl,
            })
          : null,
      );
    }
  }

  get(channel) {
    return this.providers.get(channel) || null;
  }

  isConfigured(channel) {
    return Boolean(this.get(channel)?.configured);
  }

  async send({ channel, recipient, notification }) {
    const provider = this.get(channel);
    if (!provider) throw new Error(`No provider registered for channel ${channel}.`);
    return provider.send({ recipient, notification });
  }
}

module.exports = {
  HttpNotificationProvider,
  InAppNotificationProvider,
  NotificationProviderRegistry,
};

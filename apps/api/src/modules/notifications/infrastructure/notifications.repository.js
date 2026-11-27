const { InMemoryRepository } = require('../../../shared/infrastructure/repository');
const { newId } = require('../domain/notifications.entity');

function copy(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(copy);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, copy(entry)]));
  }
  return value;
}

class NotificationsInMemoryRepository extends InMemoryRepository {
  constructor() {
    super();
    this.notifications = new Map();
    this.attempts = [];
    this.deviceTokens = new Map();
  }

  async listForUser(userId, query = {}) {
    const records = [...this.notifications.values()]
      .filter((record) => record.user_id === userId)
      .filter((record) => (query.channel ? record.channel === query.channel : true))
      .filter((record) => (query.status ? record.status === query.status : true))
      .filter((record) => (query.type ? record.type === query.type : true))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    const offset = query.offset || 0;
    return copy(records.slice(offset, offset + (query.limit || 20)));
  }

  async findNotification(notificationId) {
    return copy(this.notifications.get(notificationId) || null);
  }

  async saveNotification(record) {
    this.notifications.set(record.id, copy(record));
    return copy(record);
  }

  async updateNotification(notificationId, patch) {
    const existing = this.notifications.get(notificationId);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updated_at: new Date() };
    this.notifications.set(notificationId, updated);
    return copy(updated);
  }

  async appendAttempt(record) {
    const entry = { ...record, id: record.id || newId() };
    this.attempts.push(copy(entry));
    return copy(entry);
  }

  async listAttempts(notificationId) {
    return copy(this.attempts.filter((attempt) => attempt.notification_id === notificationId));
  }

  async listFailures(query = {}) {
    const failures = this.attempts
      .filter((attempt) => attempt.state === 'failed')
      .filter((attempt) => (query.channel ? attempt.channel === query.channel : true))
      .sort((a, b) => b.occurred_at.getTime() - a.occurred_at.getTime());
    return copy(failures.slice(0, query.limit || 50));
  }

  async listDeviceTokens(userId) {
    return copy([...this.deviceTokens.values()].filter((token) => token.user_id === userId));
  }

  async saveDeviceToken(record) {
    this.deviceTokens.set(record.token_hash, copy(record));
    return copy(record);
  }

  async deleteDeviceToken(userId, tokenHash) {
    const existing = this.deviceTokens.get(tokenHash);
    if (!existing || existing.user_id !== userId) return false;
    return this.deviceTokens.delete(tokenHash);
  }
}

module.exports = { NotificationsInMemoryRepository };

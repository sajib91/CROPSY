const { defineRepositoryToken } = require('../../../shared/domain/repository');

const NotificationsRepositoryToken = defineRepositoryToken('notifications');

/**
 * Repository port for module metadata, notification records, delivery logs,
 * and device tokens. Implementations may be in-memory or Prisma-backed.
 * @typedef {object} NotificationsRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 * @property {(userId: string, query?: object) => Promise<object[]>} listForUser
 * @property {(notificationId: string) => Promise<object|null>} findNotification
 * @property {(record: object) => Promise<object>} saveNotification
 * @property {(notificationId: string, patch: object) => Promise<object|null>} updateNotification
 * @property {(record: object) => Promise<object>} appendAttempt
 * @property {(notificationId: string) => Promise<object[]>} listAttempts
 * @property {(query?: object) => Promise<object[]>} listFailures
 * @property {(userId: string) => Promise<object[]>} listDeviceTokens
 * @property {(record: object) => Promise<object>} saveDeviceToken
 * @property {(userId: string, tokenHash: string) => Promise<boolean>} deleteDeviceToken
 */

module.exports = { NotificationsRepositoryToken };

const { defineRepositoryToken } = require('../../../shared/domain/repository');

const NotificationsRepositoryToken = defineRepositoryToken('notifications');

/**
 * Repository port for Notifications.
 * @typedef {object} NotificationsRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { NotificationsRepositoryToken };

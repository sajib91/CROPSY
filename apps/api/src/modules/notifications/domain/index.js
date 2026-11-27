const domain = require('./notifications.entity');
const { NotificationsRepositoryToken } = require('./notifications.repository');

module.exports = {
  ...domain,
  NotificationsRepositoryToken,
};

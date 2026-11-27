const { NotificationsService, NotificationsServiceToken } = require('./notifications.service');
const dto = require('./notifications.dto');

module.exports = {
  NotificationsService,
  NotificationsServiceToken,
  ...dto,
};

const { NotificationsService, NotificationsServiceToken } = require('./notifications.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./notifications.dto');

module.exports = {
  NotificationsService,
  NotificationsServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};

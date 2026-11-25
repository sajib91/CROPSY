const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'notifications';
const MODULE_NAME = 'Notifications';

class NotificationsEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, NotificationsEntity };

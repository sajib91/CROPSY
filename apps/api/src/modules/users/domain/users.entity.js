const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'users';
const MODULE_NAME = 'User Management';

class UsersEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, UsersEntity };

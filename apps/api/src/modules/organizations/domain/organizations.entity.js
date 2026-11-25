const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'organizations';
const MODULE_NAME = 'Organization Management';

class OrganizationsEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, OrganizationsEntity };

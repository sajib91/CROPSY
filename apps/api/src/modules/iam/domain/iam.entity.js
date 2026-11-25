const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'iam';
const MODULE_NAME = 'Identity and Access Management';

class IamEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, IamEntity };

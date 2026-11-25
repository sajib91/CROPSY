const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'knowledge';
const MODULE_NAME = 'Knowledge Management';

class KnowledgeEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = { MODULE_ID, MODULE_NAME, KnowledgeEntity };

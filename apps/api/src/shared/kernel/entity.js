const { randomUUID } = require('node:crypto');

const DEFAULT_STATUS = 'ACTIVE';

class Entity {
  constructor({ id, moduleId, name, status = DEFAULT_STATUS, createdAt, updatedAt } = {}) {
    if (!moduleId) {
      throw new TypeError('Entity requires a moduleId.');
    }

    this.id = id || randomUUID();
    this.moduleId = moduleId;
    this.name = name || moduleId;
    this.status = status;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || this.createdAt;
  }

  rename(name) {
    this.name = name;
    this.touch();
    return this;
  }

  changeStatus(status) {
    this.status = status;
    this.touch();
    return this;
  }

  touch() {
    this.updatedAt = new Date();
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      moduleId: this.moduleId,
      name: this.name,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

module.exports = { Entity, DEFAULT_STATUS };

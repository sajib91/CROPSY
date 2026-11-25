class InMemoryRepository {
  constructor() {
    this.records = new Map();
  }

  async get(id) {
    return this.records.get(id) || null;
  }

  async save(entity) {
    if (!entity || typeof entity.id !== 'string') {
      throw new TypeError('InMemoryRepository requires an entity with a string id.');
    }
    this.records.set(entity.id, entity);
    return entity;
  }

  async list() {
    return [...this.records.values()];
  }

  async delete(id) {
    return this.records.delete(id);
  }
}

module.exports = { InMemoryRepository };

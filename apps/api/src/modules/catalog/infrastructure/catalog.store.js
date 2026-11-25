const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const { CATALOG_STORE_METHODS, CatalogStoreToken } = require('../domain/catalog.repository');

const COLLECTIONS = Object.freeze([
  'categories',
  'products',
  'varieties',
  'attributes',
  'attributeValues',
  'images',
  'units',
  'qualityGrades',
]);

function copy(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

/**
 * In-process catalog store. Records use snake_case columns and Date values,
 * matching the Prisma adapter.
 */
class CatalogInMemoryStore {
  constructor() {
    for (const name of COLLECTIONS) this[name] = new Map();
    assertRepository(this, CATALOG_STORE_METHODS, CatalogStoreToken);
  }

  _insert(collection, input) {
    const now = new Date();
    const record = {
      ...input,
      id: input.id || randomUUID(),
      created_at: input.created_at ? new Date(input.created_at) : now,
      updated_at: input.updated_at ? new Date(input.updated_at) : now,
    };
    this[collection].set(record.id, record);
    return copy(record);
  }

  _find(collection, id) {
    return copy(this[collection].get(id));
  }

  _update(collection, id, patch) {
    const record = this[collection].get(id);
    if (!record) return null;
    Object.assign(record, patch, { updated_at: new Date() });
    return copy(record);
  }

  _delete(collection, id) {
    return this[collection].delete(id);
  }

  _list(collection, filters = {}) {
    let rows = [...this[collection].values()];
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined) continue;
      rows = rows.filter((row) =>
        Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
      );
    }
    rows.sort((a, b) => {
      const left = a.created_at instanceof Date ? a.created_at.getTime() : Date.parse(a.created_at);
      const right =
        b.created_at instanceof Date ? b.created_at.getTime() : Date.parse(b.created_at);
      return right - left;
    });
    return rows.map(copy);
  }

  listCategories(filters) {
    return Promise.resolve(this._list('categories', filters));
  }

  findCategory(id) {
    return Promise.resolve(this._find('categories', id));
  }

  createCategory(input) {
    return Promise.resolve(this._insert('categories', input));
  }

  updateCategory(id, patch) {
    return Promise.resolve(this._update('categories', id, patch));
  }

  listProducts(filters) {
    return Promise.resolve(this._list('products', filters));
  }

  findProduct(id) {
    return Promise.resolve(this._find('products', id));
  }

  createProduct(input) {
    return Promise.resolve(this._insert('products', input));
  }

  updateProduct(id, patch) {
    return Promise.resolve(this._update('products', id, patch));
  }

  listVarieties(filters) {
    return Promise.resolve(this._list('varieties', filters));
  }

  findVariety(id) {
    return Promise.resolve(this._find('varieties', id));
  }

  createVariety(input) {
    return Promise.resolve(this._insert('varieties', input));
  }

  updateVariety(id, patch) {
    return Promise.resolve(this._update('varieties', id, patch));
  }

  listAttributes(filters) {
    return Promise.resolve(this._list('attributes', filters));
  }

  findAttribute(id) {
    return Promise.resolve(this._find('attributes', id));
  }

  createAttribute(input) {
    return Promise.resolve(this._insert('attributes', input));
  }

  updateAttribute(id, patch) {
    return Promise.resolve(this._update('attributes', id, patch));
  }

  listAttributeValues(filters) {
    return Promise.resolve(this._list('attributeValues', filters));
  }

  createAttributeValue(input) {
    return Promise.resolve(this._insert('attributeValues', input));
  }

  deleteAttributeValues(entityType, entityId) {
    let removed = 0;
    for (const [id, row] of this.attributeValues) {
      if (row.entity_type === entityType && row.entity_id === entityId) {
        this.attributeValues.delete(id);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }

  listImages(filters) {
    return Promise.resolve(this._list('images', filters));
  }

  findImage(id) {
    return Promise.resolve(this._find('images', id));
  }

  createImage(input) {
    return Promise.resolve(this._insert('images', input));
  }

  deleteImage(id) {
    return Promise.resolve(this._delete('images', id));
  }

  listUnits(filters) {
    return Promise.resolve(this._list('units', filters));
  }

  findUnit(id) {
    return Promise.resolve(this._find('units', id));
  }

  createUnit(input) {
    return Promise.resolve(this._insert('units', input));
  }

  updateUnit(id, patch) {
    return Promise.resolve(this._update('units', id, patch));
  }

  listQualityGrades(filters) {
    return Promise.resolve(this._list('qualityGrades', filters));
  }

  findQualityGrade(id) {
    return Promise.resolve(this._find('qualityGrades', id));
  }

  createQualityGrade(input) {
    return Promise.resolve(this._insert('qualityGrades', input));
  }

  updateQualityGrade(id, patch) {
    return Promise.resolve(this._update('qualityGrades', id, patch));
  }
}

module.exports = { CatalogInMemoryStore };

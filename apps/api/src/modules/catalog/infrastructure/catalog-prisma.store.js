const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { assertRepository } = require('../../../shared/domain/repository');
const { CATALOG_STORE_METHODS, CatalogStoreToken } = require('../domain/catalog.repository');

function translateError(error) {
  if (error instanceof ConflictError || error instanceof NotFoundError) return error;
  if (error?.code === 'P2002') {
    return new ConflictError({ message: 'A catalog code is already in use.' });
  }
  if (error?.code === 'P2025') {
    return new NotFoundError({ message: 'Catalog record was not found.' });
  }
  return error;
}

function normalize(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toNumber === 'function') return Number(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = normalize(item);
    return result;
  }
  return value;
}

function whereFrom(filters = {}) {
  const where = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    where[key] = Array.isArray(value) ? { in: value } : value;
  }
  return where;
}

/**
 * Prisma implementation of the catalog store. Decimal fields are normalized to
 * numbers so services behave identically with both adapters.
 */
class CatalogPrismaStore {
  constructor({ prisma }) {
    if (!prisma) throw new TypeError('CatalogPrismaStore requires a Prisma client.');
    this.prisma = prisma;
    assertRepository(this, CATALOG_STORE_METHODS, CatalogStoreToken);
  }

  async _find(delegate, id) {
    const record = await delegate.findUnique({ where: { id } });
    return record ? normalize(record) : null;
  }

  async _list(delegate, filters) {
    const records = await delegate.findMany({
      where: whereFrom(filters),
      orderBy: { created_at: 'desc' },
    });
    return records.map(normalize);
  }

  async _create(delegate, input) {
    try {
      return normalize(await delegate.create({ data: input }));
    } catch (error) {
      throw translateError(error);
    }
  }

  async _update(delegate, id, patch) {
    try {
      return normalize(await delegate.update({ where: { id }, data: patch }));
    } catch (error) {
      throw translateError(error);
    }
  }

  listCategories(filters) {
    return this._list(this.prisma.productCategory, filters);
  }

  findCategory(id) {
    return this._find(this.prisma.productCategory, id);
  }

  createCategory(input) {
    return this._create(this.prisma.productCategory, input);
  }

  updateCategory(id, patch) {
    return this._update(this.prisma.productCategory, id, patch);
  }

  listProducts(filters) {
    return this._list(this.prisma.product, filters);
  }

  findProduct(id) {
    return this._find(this.prisma.product, id);
  }

  createProduct(input) {
    return this._create(this.prisma.product, input);
  }

  updateProduct(id, patch) {
    return this._update(this.prisma.product, id, patch);
  }

  listVarieties(filters) {
    return this._list(this.prisma.productVariety, filters);
  }

  findVariety(id) {
    return this._find(this.prisma.productVariety, id);
  }

  createVariety(input) {
    return this._create(this.prisma.productVariety, input);
  }

  updateVariety(id, patch) {
    return this._update(this.prisma.productVariety, id, patch);
  }

  listAttributes(filters) {
    return this._list(this.prisma.productAttribute, filters);
  }

  findAttribute(id) {
    return this._find(this.prisma.productAttribute, id);
  }

  createAttribute(input) {
    return this._create(this.prisma.productAttribute, input);
  }

  updateAttribute(id, patch) {
    return this._update(this.prisma.productAttribute, id, patch);
  }

  listAttributeValues(filters) {
    return this._list(this.prisma.productAttributeValue, filters);
  }

  createAttributeValue(input) {
    return this._create(this.prisma.productAttributeValue, input);
  }

  deleteAttributeValues(entityType, entityId) {
    return this.prisma.productAttributeValue.deleteMany({
      where: { entity_type: entityType, entity_id: entityId },
    });
  }

  listImages(filters) {
    return this._list(this.prisma.productImage, filters);
  }

  findImage(id) {
    return this._find(this.prisma.productImage, id);
  }

  createImage(input) {
    return this._create(this.prisma.productImage, input);
  }

  async deleteImage(id) {
    try {
      await this.prisma.productImage.delete({ where: { id } });
      return true;
    } catch (error) {
      throw translateError(error);
    }
  }

  listUnits(filters) {
    return this._list(this.prisma.unitOfMeasure, filters);
  }

  findUnit(id) {
    return this._find(this.prisma.unitOfMeasure, id);
  }

  createUnit(input) {
    return this._create(this.prisma.unitOfMeasure, input);
  }

  updateUnit(id, patch) {
    return this._update(this.prisma.unitOfMeasure, id, patch);
  }

  listQualityGrades(filters) {
    return this._list(this.prisma.qualityGrade, filters);
  }

  findQualityGrade(id) {
    return this._find(this.prisma.qualityGrade, id);
  }

  createQualityGrade(input) {
    return this._create(this.prisma.qualityGrade, input);
  }

  updateQualityGrade(id, patch) {
    return this._update(this.prisma.qualityGrade, id, patch);
  }
}

module.exports = { CatalogPrismaStore };

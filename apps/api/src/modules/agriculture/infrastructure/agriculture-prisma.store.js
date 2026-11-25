const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { assertRepository } = require('../../../shared/domain/repository');
const {
  AGRICULTURE_STORE_METHODS,
  AgricultureStoreToken,
} = require('../domain/agriculture.repository');

function translateError(error) {
  if (error instanceof ConflictError || error instanceof NotFoundError) return error;
  if (error?.code === 'P2002') {
    return new ConflictError({ message: 'An agriculture record code is already in use.' });
  }
  if (error?.code === 'P2025') {
    return new NotFoundError({ message: 'Agriculture record was not found.' });
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
 * Prisma implementation of the agriculture store. It returns the same plain
 * snake_case records as the in-memory adapter, including numeric Decimal
 * fields, so business logic and reports are adapter-independent.
 */
class AgriculturePrismaStore {
  constructor({ prisma }) {
    if (!prisma) throw new TypeError('AgriculturePrismaStore requires a Prisma client.');
    this.prisma = prisma;
    assertRepository(this, AGRICULTURE_STORE_METHODS, AgricultureStoreToken);
  }

  async _find(delegate, id) {
    const record = await delegate.findUnique({ where: { id } });
    return record ? normalize(record) : null;
  }

  async _list(delegate, filters, orderBy = { created_at: 'desc' }) {
    const records = await delegate.findMany({ where: whereFrom(filters), orderBy });
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

  listCrops(filters) {
    return this._list(this.prisma.crop, filters);
  }

  findCrop(id) {
    return this._find(this.prisma.crop, id);
  }

  createCrop(input) {
    return this._create(this.prisma.crop, input);
  }

  updateCrop(id, patch) {
    return this._update(this.prisma.crop, id, patch);
  }

  listVarieties(filters) {
    return this._list(this.prisma.cropVariety, filters);
  }

  findVariety(id) {
    return this._find(this.prisma.cropVariety, id);
  }

  createVariety(input) {
    return this._create(this.prisma.cropVariety, input);
  }

  updateVariety(id, patch) {
    return this._update(this.prisma.cropVariety, id, patch);
  }

  listSeasons(filters) {
    return this._list(this.prisma.cropSeason, filters);
  }

  findSeason(id) {
    return this._find(this.prisma.cropSeason, id);
  }

  createSeason(input) {
    return this._create(this.prisma.cropSeason, input);
  }

  updateSeason(id, patch) {
    return this._update(this.prisma.cropSeason, id, patch);
  }

  listCalendars(filters) {
    return this._list(this.prisma.cropCalendar, filters);
  }

  findCalendar(id) {
    return this._find(this.prisma.cropCalendar, id);
  }

  createCalendar(input) {
    return this._create(this.prisma.cropCalendar, input);
  }

  updateCalendar(id, patch) {
    return this._update(this.prisma.cropCalendar, id, patch);
  }

  listRecommendations(filters) {
    return this._list(this.prisma.agronomicRecommendation, filters);
  }

  findRecommendation(id) {
    return this._find(this.prisma.agronomicRecommendation, id);
  }

  createRecommendation(input) {
    return this._create(this.prisma.agronomicRecommendation, input);
  }

  updateRecommendation(id, patch) {
    return this._update(this.prisma.agronomicRecommendation, id, patch);
  }

  listCultivations(filters) {
    return this._list(this.prisma.cultivation, filters);
  }

  findCultivation(id) {
    return this._find(this.prisma.cultivation, id);
  }

  createCultivation(input) {
    return this._create(this.prisma.cultivation, input);
  }

  updateCultivation(id, patch) {
    return this._update(this.prisma.cultivation, id, patch);
  }

  listActivities(filters) {
    return this._list(this.prisma.farmActivity, filters, { activity_date: 'desc' });
  }

  findActivity(id) {
    return this._find(this.prisma.farmActivity, id);
  }

  createActivity(input) {
    return this._create(this.prisma.farmActivity, input);
  }

  listHarvests(filters) {
    return this._list(this.prisma.harvest, filters, { harvested_at: 'desc' });
  }

  findHarvest(id) {
    return this._find(this.prisma.harvest, id);
  }

  createHarvest(input) {
    return this._create(this.prisma.harvest, input);
  }

  listExpenses(filters) {
    return this._list(this.prisma.farmExpense, filters, { expense_date: 'desc' });
  }

  findExpense(id) {
    return this._find(this.prisma.farmExpense, id);
  }

  createExpense(input) {
    return this._create(this.prisma.farmExpense, input);
  }

  updateExpense(id, patch) {
    return this._update(this.prisma.farmExpense, id, patch);
  }
}

module.exports = { AgriculturePrismaStore };

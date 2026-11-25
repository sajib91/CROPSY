const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const {
  AGRICULTURE_STORE_METHODS,
  AgricultureStoreToken,
} = require('../domain/agriculture.repository');

const COLLECTIONS = Object.freeze([
  'crops',
  'varieties',
  'seasons',
  'calendars',
  'recommendations',
  'cultivations',
  'activities',
  'harvests',
  'expenses',
]);

function copy(value) {
  return value ? { ...value } : null;
}

/**
 * In-process implementation of the agriculture store. Records are plain
 * snake_case objects with Date timestamps, matching the Prisma adapter.
 */
class AgricultureInMemoryStore {
  constructor() {
    for (const name of COLLECTIONS) this[name] = new Map();
    assertRepository(this, AGRICULTURE_STORE_METHODS, AgricultureStoreToken);
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

  listCrops(filters) {
    return Promise.resolve(this._list('crops', filters));
  }

  findCrop(id) {
    return Promise.resolve(this._find('crops', id));
  }

  createCrop(input) {
    return Promise.resolve(this._insert('crops', input));
  }

  updateCrop(id, patch) {
    return Promise.resolve(this._update('crops', id, patch));
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

  listSeasons(filters) {
    return Promise.resolve(this._list('seasons', filters));
  }

  findSeason(id) {
    return Promise.resolve(this._find('seasons', id));
  }

  createSeason(input) {
    return Promise.resolve(this._insert('seasons', input));
  }

  updateSeason(id, patch) {
    return Promise.resolve(this._update('seasons', id, patch));
  }

  listCalendars(filters) {
    return Promise.resolve(this._list('calendars', filters));
  }

  findCalendar(id) {
    return Promise.resolve(this._find('calendars', id));
  }

  createCalendar(input) {
    return Promise.resolve(this._insert('calendars', input));
  }

  updateCalendar(id, patch) {
    return Promise.resolve(this._update('calendars', id, patch));
  }

  listRecommendations(filters) {
    return Promise.resolve(this._list('recommendations', filters));
  }

  findRecommendation(id) {
    return Promise.resolve(this._find('recommendations', id));
  }

  createRecommendation(input) {
    return Promise.resolve(this._insert('recommendations', input));
  }

  updateRecommendation(id, patch) {
    return Promise.resolve(this._update('recommendations', id, patch));
  }

  listCultivations(filters) {
    return Promise.resolve(this._list('cultivations', filters));
  }

  findCultivation(id) {
    return Promise.resolve(this._find('cultivations', id));
  }

  createCultivation(input) {
    return Promise.resolve(this._insert('cultivations', input));
  }

  updateCultivation(id, patch) {
    return Promise.resolve(this._update('cultivations', id, patch));
  }

  listActivities(filters) {
    return Promise.resolve(this._list('activities', filters));
  }

  findActivity(id) {
    return Promise.resolve(this._find('activities', id));
  }

  createActivity(input) {
    return Promise.resolve(this._insert('activities', input));
  }

  listHarvests(filters) {
    return Promise.resolve(this._list('harvests', filters));
  }

  findHarvest(id) {
    return Promise.resolve(this._find('harvests', id));
  }

  createHarvest(input) {
    return Promise.resolve(this._insert('harvests', input));
  }

  listExpenses(filters) {
    return Promise.resolve(this._list('expenses', filters));
  }

  findExpense(id) {
    return Promise.resolve(this._find('expenses', id));
  }

  createExpense(input) {
    return Promise.resolve(this._insert('expenses', input));
  }

  updateExpense(id, patch) {
    return Promise.resolve(this._update('expenses', id, patch));
  }
}

module.exports = { AgricultureInMemoryStore };

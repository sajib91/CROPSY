const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { QUALITY_STORE_METHODS, QualityStoreToken } = require('../domain/quality.repository');

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function now() {
  return new Date();
}

function matches(record, filters) {
  return Object.entries(filters || {}).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'since') return record.created_at >= value;
    if (key === 'until') return record.created_at <= value;
    if (Array.isArray(value)) return value.includes(record[key]);
    return record[key] === value;
  });
}

/** In-process quality store mirroring the Prisma adapter's record shape. */
class QualityInMemoryStore {
  constructor() {
    this.inspections = new Map();
    this.evidence = new Map();
    this.audits = new Map();
    assertRepository(this, QUALITY_STORE_METHODS, QualityStoreToken);
  }

  _insert(collection, input) {
    const timestamp = now();
    const record = {
      ...input,
      id: input.id || randomUUID(),
      created_at: input.created_at ? new Date(input.created_at) : timestamp,
      updated_at: input.updated_at ? new Date(input.updated_at) : timestamp,
    };
    collection.set(record.id, clone(record));
    return clone(record);
  }

  _update(collection, id, patch) {
    const record = collection.get(id);
    if (!record) throw new NotFoundError({ message: 'Quality record was not found.' });
    const updated = { ...record, ...patch, updated_at: now() };
    collection.set(id, clone(updated));
    return clone(updated);
  }

  listInspections(filters) {
    return Promise.resolve(
      [...this.inspections.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  findInspection(id) {
    return Promise.resolve(clone(this.inspections.get(id) || null));
  }

  createInspection(input) {
    return Promise.resolve(this._insert(this.inspections, input));
  }

  updateInspection(id, patch) {
    return Promise.resolve(this._update(this.inspections, id, patch));
  }

  listEvidence(filters) {
    return Promise.resolve(
      [...this.evidence.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  findEvidence(id) {
    return Promise.resolve(clone(this.evidence.get(id) || null));
  }

  createEvidence(input) {
    return Promise.resolve(this._insert(this.evidence, input));
  }

  listAudits(filters) {
    return Promise.resolve(
      [...this.audits.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  createAudit(input) {
    return Promise.resolve(this._insert(this.audits, input));
  }
}

module.exports = { QualityInMemoryStore };

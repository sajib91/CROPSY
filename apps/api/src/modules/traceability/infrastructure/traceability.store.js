const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const {
  TRACEABILITY_STORE_METHODS,
  TraceabilityStoreToken,
} = require('../domain/traceability.repository');

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function now() {
  return new Date();
}

function recordedAt(record) {
  return record.occurred_at || record.created_at || new Date(0);
}

function matches(record, filters) {
  return Object.entries(filters || {}).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'since') return new Date(recordedAt(record)) >= new Date(value);
    if (key === 'until') return new Date(recordedAt(record)) <= new Date(value);
    if (Array.isArray(value)) return value.includes(record[key]);
    return record[key] === value;
  });
}

/** In-process traceability store mirroring the Prisma adapter's record shape. */
class TraceabilityInMemoryStore {
  constructor() {
    this.batches = new Map();
    this.events = new Map();
    this.audits = new Map();
    this.verificationTokens = new Set();
    assertRepository(this, TRACEABILITY_STORE_METHODS, TraceabilityStoreToken);
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
    if (!record) throw new NotFoundError({ message: 'Traceability batch was not found.' });
    const updated = { ...record, ...patch, updated_at: now() };
    collection.set(id, clone(updated));
    return clone(updated);
  }

  listBatches(filters) {
    return Promise.resolve(
      [...this.batches.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map(clone),
    );
  }

  findBatch(id) {
    return Promise.resolve(clone(this.batches.get(id) || null));
  }

  findBatchByToken(token) {
    const record = [...this.batches.values()].find((batch) => batch.verification_token === token);
    return Promise.resolve(clone(record || null));
  }

  createBatch(input) {
    if (this.verificationTokens.has(input.verification_token)) {
      throw new ConflictError({ message: 'Verification token is already in use.' });
    }
    const batch = this._insert(this.batches, input);
    this.verificationTokens.add(batch.verification_token);
    return Promise.resolve(batch);
  }

  updateBatch(id, patch) {
    return Promise.resolve(this._update(this.batches, id, patch));
  }

  listEvents(filters) {
    return Promise.resolve(
      [...this.events.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => new Date(recordedAt(a)).getTime() - new Date(recordedAt(b)).getTime())
        .map(clone),
    );
  }

  createEvent(input) {
    return Promise.resolve(this._insert(this.events, input));
  }

  listAudits(filters) {
    return Promise.resolve(
      [...this.audits.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map(clone),
    );
  }

  createAudit(input) {
    return Promise.resolve(this._insert(this.audits, input));
  }
}

module.exports = { TraceabilityInMemoryStore };

const { assertRepository } = require('../../../shared/domain/repository');
const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const {
  TRACEABILITY_STORE_METHODS,
  TraceabilityStoreToken,
} = require('../domain/traceability.repository');

function translateError(error) {
  if (error instanceof ConflictError || error instanceof NotFoundError) return error;
  if (error?.code === 'P2002') {
    return new ConflictError({ message: 'A traceability reference is already in use.' });
  }
  if (error?.code === 'P2025') {
    return new NotFoundError({ message: 'Traceability record was not found.' });
  }
  if (error?.code === 'P2010' || error?.code === 'P2014') {
    const databaseCode = String(error?.meta?.code || '');
    if (['23514', '23503', '22004', '22023'].includes(databaseCode)) {
      return new ConflictError({
        message: error?.meta?.message || error?.message || 'Traceability operation was rejected.',
      });
    }
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

function whereFrom(filters = {}, timeField = 'created_at') {
  const where = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (key === 'since') {
      where[timeField] = { ...(where[timeField] || {}), gte: value };
    } else if (key === 'until') {
      where[timeField] = { ...(where[timeField] || {}), lte: value };
    } else if (Array.isArray(value)) {
      where[key] = { in: value };
    } else {
      where[key] = value;
    }
  }
  return where;
}

/** Prisma adapter for traceability batches, timeline events, and audit records. */
class TraceabilityPrismaStore {
  constructor({ prisma }) {
    if (!prisma) throw new TypeError('TraceabilityPrismaStore requires a Prisma client.');
    this.prisma = prisma;
    assertRepository(this, TRACEABILITY_STORE_METHODS, TraceabilityStoreToken);
  }

  async _find(delegate, id) {
    const record = await delegate.findUnique({ where: { id } });
    return record ? normalize(record) : null;
  }

  async _list(delegate, filters, orderBy = { created_at: 'desc' }, timeField = 'created_at') {
    const records = await delegate.findMany({ where: whereFrom(filters, timeField), orderBy });
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

  listBatches(filters) {
    return this._list(this.prisma.traceabilityBatch, filters);
  }

  findBatch(id) {
    return this._find(this.prisma.traceabilityBatch, id);
  }

  async findBatchByToken(token) {
    const record = await this.prisma.traceabilityBatch.findUnique({
      where: { verification_token: token },
    });
    return record ? normalize(record) : null;
  }

  createBatch(input) {
    return this._create(this.prisma.traceabilityBatch, input);
  }

  updateBatch(id, patch) {
    return this._update(this.prisma.traceabilityBatch, id, patch);
  }

  listEvents(filters) {
    return this._list(
      this.prisma.traceabilityEvent,
      filters,
      { occurred_at: 'asc' },
      'occurred_at',
    );
  }

  createEvent(input) {
    return this._create(this.prisma.traceabilityEvent, input);
  }

  listAudits(filters) {
    return this._list(this.prisma.traceabilityAuditEvent, filters);
  }

  createAudit(input) {
    return this._create(this.prisma.traceabilityAuditEvent, input);
  }
}

module.exports = { TraceabilityPrismaStore };

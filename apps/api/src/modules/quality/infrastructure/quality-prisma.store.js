const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { assertRepository } = require('../../../shared/domain/repository');
const { QUALITY_STORE_METHODS, QualityStoreToken } = require('../domain/quality.repository');

function translateError(error) {
  if (error instanceof ConflictError || error instanceof NotFoundError) return error;
  if (error?.code === 'P2002') {
    return new ConflictError({ message: 'A quality reference is already in use.' });
  }
  if (error?.code === 'P2025') {
    return new NotFoundError({ message: 'Quality record was not found.' });
  }
  if (error?.code === 'P2010' || error?.code === 'P2014') {
    const databaseCode = String(error?.meta?.code || '');
    if (['23514', '23503', '22004', '22023'].includes(databaseCode)) {
      return new ConflictError({
        message: error?.meta?.message || error?.message || 'Quality operation was rejected.',
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

function whereFrom(filters = {}) {
  const where = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (key === 'since') {
      where.created_at = { ...(where.created_at || {}), gte: value };
    } else if (key === 'until') {
      where.created_at = { ...(where.created_at || {}), lte: value };
    } else if (Array.isArray(value)) {
      where[key] = { in: value };
    } else {
      where[key] = value;
    }
  }
  return where;
}

/** Prisma adapter for quality inspection, evidence, and audit records. */
class QualityPrismaStore {
  constructor({ prisma }) {
    if (!prisma) throw new TypeError('QualityPrismaStore requires a Prisma client.');
    this.prisma = prisma;
    assertRepository(this, QUALITY_STORE_METHODS, QualityStoreToken);
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

  listInspections(filters) {
    return this._list(this.prisma.qualityInspection, filters);
  }

  findInspection(id) {
    return this._find(this.prisma.qualityInspection, id);
  }

  createInspection(input) {
    return this._create(this.prisma.qualityInspection, input);
  }

  updateInspection(id, patch) {
    return this._update(this.prisma.qualityInspection, id, patch);
  }

  listEvidence(filters) {
    return this._list(this.prisma.inspectionEvidence, filters);
  }

  findEvidence(id) {
    return this._find(this.prisma.inspectionEvidence, id);
  }

  createEvidence(input) {
    return this._create(this.prisma.inspectionEvidence, input);
  }

  listAudits(filters) {
    return this._list(this.prisma.qualityAuditEvent, filters);
  }

  createAudit(input) {
    return this._create(this.prisma.qualityAuditEvent, input);
  }
}

module.exports = { QualityPrismaStore, normalize, translateError, whereFrom };

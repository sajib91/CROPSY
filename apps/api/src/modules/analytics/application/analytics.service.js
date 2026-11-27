const { assertRepository } = require('../../../shared/domain/repository');
const { requireOrganizationScope } = require('../../../shared/http/authorization');
const {
  ForbiddenError,
  InfrastructureError,
  UnauthorizedError,
  ValidationError,
  isAppError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const {
  ANALYTICS_EVENTS,
  AnalyticsEntity,
  DATA_CLASSIFICATIONS,
  MODULE_ID,
  REPORT_DEFINITIONS,
} = require('../domain/analytics.entity');
const { AnalyticsRepositoryToken, AnalyticsStoreToken } = require('../domain/analytics.repository');
const { analyticsQuerySchema } = require('./analytics.dto');

const AnalyticsServiceToken = Symbol.for('cropsy.service.analytics');

const CLASSIFICATION_TEXT = Object.freeze({
  historical:
    'Rows read from recorded CROPSY business events. No value is seeded, estimated, or interpolated.',
  calculated:
    'Deterministic aggregates computed in the application layer from the historical rows returned for this request.',
  predictive:
    'Explicit extrapolation from the historical series. It is a decision-support projection, not a calibrated model or a recorded fact.',
});

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Math.round((finiteNumber(value) + Number.EPSILON) * 100) / 100;
}

function normalizeScalar(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && typeof value.toNumber === 'function') return Number(value);
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(normalizeScalar);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeScalar(entry)]),
    );
  }
  return value;
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const normalized = normalizeScalar(row);
    const period = normalized.period_start || normalized.period || new Date(0).toISOString();
    return {
      ...normalized,
      period: period instanceof Date ? period.toISOString() : String(period),
      dimension: String(normalized.dimension || 'unclassified'),
      value: round(normalized.value),
    };
  });
}

function isoWeek(date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function bucketKey(period, grain) {
  const date = new Date(period);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  if (grain === 'month') return `${year}-${month}`;
  if (grain === 'week') return isoWeek(date);
  return `${year}-${month}-${day}`;
}

function nextBucket(key, grain) {
  if (grain === 'month') {
    const [year, month] = key.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 + 1, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (grain === 'week') {
    const match = /^(\d{4})-W(\d{2})$/.exec(key);
    if (match) {
      const date = new Date(Date.UTC(Number(match[1]), 0, 1 + (Number(match[2]) - 1) * 7));
      date.setUTCDate(date.getUTCDate() + 7);
      return isoWeek(date);
    }
  }
  const date = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return key;
  date.setUTCDate(date.getUTCDate() + 1);
  return bucketKey(date.toISOString(), 'day');
}

function buildSeries(rows, grain) {
  const groups = new Map();
  for (const row of rows) {
    const key = bucketKey(row.period, grain);
    if (!groups.has(key)) {
      groups.set(key, { period: key, total: 0, records: 0, breakdown: {} });
    }
    const entry = groups.get(key);
    entry.total += finiteNumber(row.value);
    entry.records += finiteNumber(row.records || 1);
    const dimension = row.dimension || 'unclassified';
    entry.breakdown[dimension] = round(
      finiteNumber(entry.breakdown[dimension]) + finiteNumber(row.value),
    );
  }
  return [...groups.values()]
    .sort((left, right) => left.period.localeCompare(right.period))
    .map((entry) => ({ ...entry, total: round(entry.total), records: Math.round(entry.records) }));
}

function buildBreakdown(rows) {
  const groups = new Map();
  for (const row of rows) {
    const dimension = row.dimension || 'unclassified';
    const entry = groups.get(dimension) || { dimension, value: 0, rows: 0 };
    entry.value += finiteNumber(row.value);
    entry.rows += 1;
    groups.set(dimension, entry);
  }
  return [...groups.values()]
    .map((entry) => ({ ...entry, value: round(entry.value) }))
    .sort(
      (left, right) => right.value - left.value || left.dimension.localeCompare(right.dimension),
    );
}

function buildMetrics(rows, series) {
  const values = rows.map((row) => finiteNumber(row.value));
  const total = round(values.reduce((sum, value) => sum + value, 0));
  const records = rows.reduce((sum, row) => sum + finiteNumber(row.records || 1), 0);
  const latest = series.length > 0 ? series[series.length - 1].total : 0;
  const previous = series.length > 1 ? series[series.length - 2].total : null;
  return {
    total,
    recordCount: rows.length,
    sourceRecordCount: Math.round(records),
    average: rows.length > 0 ? round(total / rows.length) : 0,
    latestBucketTotal: latest,
    previousBucketTotal: previous,
    changePercent:
      previous !== null && previous !== 0
        ? round(((latest - previous) / Math.abs(previous)) * 100)
        : null,
  };
}

function buildPrediction(series, grain) {
  const unavailable = {
    available: false,
    method: null,
    basisPoints: 0,
    nextPeriod: null,
    projectedValue: null,
    confidence: 'not_calibrated',
    caveat:
      'No projection was produced because at least three historical time buckets are required. No value was invented.',
  };
  if (series.length < 3) return unavailable;

  const points = series.slice(-6).map((entry) => entry.total);
  const count = points.length;
  const meanX = (count - 1) / 2;
  const meanY = points.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) {
    const deltaX = index - meanX;
    numerator += deltaX * (points[index] - meanY);
    denominator += deltaX * deltaX;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const projected = Math.max(0, round(points[count - 1] + slope));

  return {
    available: true,
    method: 'linear_trend_extrapolation',
    basisPoints: count,
    nextPeriod: nextBucket(series[series.length - 1].period, grain),
    projectedValue: projected,
    confidence: 'not_calibrated',
    caveat:
      'A deterministic least-squares trend extended one bucket from recorded history. It is not model-validated and must not be stored as a business fact.',
  };
}

class AnalyticsService {
  constructor({ repository, eventBus, logger, metadata, store } = {}) {
    assertRepository(repository, ['get', 'save'], AnalyticsRepositoryToken);
    assertRepository(store, ['readReport'], AnalyticsStoreToken);
    if (!metadata) throw new TypeError('AnalyticsService requires module metadata.');
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.store = store;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new AnalyticsEntity({ metadata: this.metadata });
      await this.repository.save(entity);
      this.eventBus?.publish({ type: ANALYTICS_EVENTS.INITIALIZED, moduleId: MODULE_ID });
    }
    return entity.toJSON();
  }

  async getReport({ context, report: reportCode, query: rawQuery } = {}) {
    const definition = REPORT_DEFINITIONS[reportCode];
    if (!definition) {
      throw new ValidationError({
        message: `Unknown analytics report '${reportCode}'.`,
        details: { code: 'unknown_analytics_report', report: reportCode },
      });
    }

    if (!context?.user) {
      throw new UnauthorizedError({ message: 'Authentication is required.' });
    }

    const query = validate(analyticsQuerySchema, rawQuery || {}, 'analytics query');
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 365 * 86400000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new ValidationError({
        message: 'The analytics period must have a valid from timestamp before its to timestamp.',
        details: { code: 'invalid_analytics_period' },
      });
    }

    let organizationId = null;
    if (definition.scope === 'platform') {
      if (!context.isSuperAdmin) {
        throw new ForbiddenError({
          message: 'Platform analytics requires platform-level authorization.',
          details: { code: 'platform_analytics_forbidden' },
        });
      }
    } else if (context.isSuperAdmin) {
      organizationId = query.organizationId || context.organizationId || null;
      if (!organizationId) {
        throw new ForbiddenError({
          message: 'An organization context is required for tenant analytics.',
          details: { code: 'organization_context_required' },
        });
      }
    } else {
      organizationId = requireOrganizationScope({ auth: context }, query.organizationId);
      if (!organizationId) {
        throw new ForbiddenError({
          message: 'An active organization context is required.',
          details: { code: 'organization_context_required' },
        });
      }
    }

    const isOrganizationAdmin = Boolean(
      context.isSuperAdmin || context.roles?.some((role) => role?.code === 'ORGANIZATION_ADMIN'),
    );
    const actorUserId =
      definition.scope === 'platform' || isOrganizationAdmin ? null : context.user.id;

    let rawRows;
    try {
      rawRows = await this.store.readReport({
        report: definition.code,
        organizationId,
        actorUserId,
        isOrganizationAdmin,
        query: { from, to, grain: query.grain, limit: query.limit },
      });
    } catch (error) {
      if (isAppError(error)) throw error;
      this.logger?.error?.(
        { err: error, report: definition.code },
        'Analytics report query failed',
      );
      throw new InfrastructureError({
        message: 'The analytics report could not be read.',
        details: { code: 'analytics_store_unavailable', report: definition.code },
      });
    }

    const rows = normalizeRows(rawRows);
    const series = buildSeries(rows, query.grain);
    const calculated = {
      basis: 'historical',
      valueUnit: definition.unit,
      valueLabel: definition.valueLabel,
      metrics: buildMetrics(rows, series),
      series,
      breakdown: buildBreakdown(rows),
    };
    const predictive = {
      classification: 'predictive',
      ...buildPrediction(series, query.grain),
    };

    this.eventBus?.publish({
      type: ANALYTICS_EVENTS.REPORT_REQUESTED,
      moduleId: MODULE_ID,
      payload: { report: definition.code, scope: definition.scope, organizationId },
    });

    return {
      report: definition.code,
      persona: definition.persona,
      scope: definition.scope,
      organizationId,
      classification: {
        historical: CLASSIFICATION_TEXT.historical,
        calculated: CLASSIFICATION_TEXT.calculated,
        predictive: CLASSIFICATION_TEXT.predictive,
        values: [...DATA_CLASSIFICATIONS],
      },
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        grain: query.grain,
        limit: query.limit,
      },
      generatedAt: new Date().toISOString(),
      historical: {
        sourceTables: definition.sourceTables,
        rowCount: rows.length,
        rows,
      },
      calculated,
      predictive,
    };
  }
}

module.exports = { AnalyticsService, AnalyticsServiceToken };

const { assertRepository } = require('../../../shared/domain/repository');
const { InfrastructureError, isAppError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const {
  EVIDENCE_CLASSES,
  MODULE_ID,
  MarketIntelligenceEntity,
} = require('../domain/market-intelligence.entity');
const { MarketIntelligenceRepositoryToken } = require('../domain/market-intelligence.repository');
const {
  analysisQuerySchema,
  forecastQuerySchema,
  moduleInfoSchema,
  observationQuerySchema,
  toModuleInfoDto,
  trendQuerySchema,
} = require('./market-intelligence.dto');

const MarketIntelligenceServiceToken = Symbol.for('cropsy.service.marketIntelligence');

const EVENTS = Object.freeze({
  INITIALIZED: 'market-intelligence.initialized',
  ANALYSIS_REQUESTED: 'market-intelligence.analysis.requested',
  FORECAST_REQUESTED: 'market-intelligence.forecast.requested',
});

const AI_METHODS = Object.freeze({
  forecast: Object.freeze(['forecastMarketAi', 'forecastMarket']),
  explain: Object.freeze(['explainMarketAi', 'explainMarket']),
  retrieve: Object.freeze(['retrieveAi', 'retrieve']),
});

function unavailableError(message, code = 'market_data_unavailable') {
  const error = new InfrastructureError({ code, message });
  error.status = 503;
  return error;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 4) {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function median(values) {
  const sorted = values
    .filter((value) => finite(value) !== null)
    .sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function summarize(values, currency) {
  const numbers = values.map(finite).filter((value) => value !== null);
  return {
    count: numbers.length,
    currency: currency || null,
    min: numbers.length ? round(Math.min(...numbers)) : null,
    max: numbers.length ? round(Math.max(...numbers)) : null,
    mean: numbers.length
      ? round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length)
      : null,
    median: round(median(numbers)),
  };
}

function groupBy(observations, keyOf) {
  const groups = new Map();
  for (const observation of observations) {
    const key = keyOf(observation) || 'Unspecified';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(observation);
  }
  return groups;
}

function observedMonth(observation) {
  const date = new Date(observation.observedAt);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toISOString().slice(0, 7);
}

function observedDay(observation) {
  const date = new Date(observation.observedAt);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toISOString().slice(0, 10);
}

function metadataFromRequest(request) {
  return {
    requestId: request?.requestId || null,
    organizationId: request?.organizationId || request?.auth?.organizationId || null,
    userId: request?.userId || request?.auth?.user?.id || null,
  };
}

class MarketIntelligenceService {
  constructor({
    repository,
    eventBus,
    logger,
    metadata,
    marketObservation,
    aiGateway,
    config,
  } = {}) {
    assertRepository(repository, ['get', 'save'], MarketIntelligenceRepositoryToken);
    if (!metadata) throw new TypeError('MarketIntelligenceService requires module metadata.');
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.marketObservation = marketObservation;
    this.aiGateway = aiGateway;
    this.config = config || {};
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new MarketIntelligenceEntity();
      await this.repository.save(entity);
      this.eventBus?.publish({
        type: EVENTS.INITIALIZED,
        moduleId: MODULE_ID,
        aggregateId: entity.id,
        payload: { name: entity.name },
      });
    }
    return validate(
      moduleInfoSchema,
      toModuleInfoDto(entity, this.metadata),
      'market intelligence info',
    );
  }

  async _callAi(operation, payload, request) {
    const gateway = this.aiGateway;
    const method = AI_METHODS[operation].find((name) => typeof gateway?.[name] === 'function');
    if (!method)
      throw unavailableError('The AI service gateway is not configured.', 'ai_service_unavailable');
    const metadata = metadataFromRequest(request);
    const call = { ...payload, metadata };
    try {
      return await gateway[method](call, metadata);
    } catch (error) {
      if (isAppError(error)) throw error;
      const wrapped = new InfrastructureError({
        code: 'ai_service_error',
        message: 'The AI service request failed.',
        cause: error,
      });
      wrapped.status = 502;
      throw wrapped;
    }
  }

  async _observations(query) {
    if (
      !this.marketObservation ||
      typeof this.marketObservation.listPriceObservations !== 'function'
    ) {
      throw unavailableError('Marketplace observation access is not configured.');
    }
    const filters = {
      productId: query.productId,
      region: query.region,
      status: query.status,
      from: query.from,
      to: query.to,
      limit: query.limit ?? 100,
    };
    const rows = await this.marketObservation.listPriceObservations(filters);
    return rows.filter((row) => finite(row.price) !== null && row.price > 0);
  }

  _sources(observations) {
    const sources = new Map();
    for (const observation of observations) {
      const key = `${observation.source}|${observation.collectionMethod}|${observation.evidenceClass}`;
      if (!sources.has(key)) {
        sources.set(key, {
          name: observation.source,
          reference: observation.sourceReference,
          sourceUrl: observation.sourceUrl || '',
          collectionMethod: observation.collectionMethod,
          evidenceClass: observation.evidenceClass,
        });
      }
    }
    return [...sources.values()];
  }

  async _externalEvidence(query) {
    try {
      const result = await this._callAi(
        'retrieve',
        {
          query:
            `${query.productId || 'agricultural product'} market intelligence ${query.region || ''}`.trim(),
          language: query.language || 'en',
          topK: 3,
          documentTypes: ['market_intelligence'],
          region: query.region || '',
        },
        query.request,
      );
      const evidence = Array.isArray(result?.evidence) ? result.evidence : [];
      return {
        available: true,
        citations: evidence.map((item) => item?.citation).filter(Boolean),
        evidenceClass: 'verified_external_evidence',
      };
    } catch (error) {
      return {
        available: false,
        citations: [],
        evidenceClass: 'verified_external_evidence',
        reason: error?.code || 'ai_service_unavailable',
      };
    }
  }

  async _base(query) {
    const observations = await this._observations(query);
    const currencies = [...new Set(observations.map((item) => item.currency).filter(Boolean))];
    const timestamps = observations
      .map((item) => Date.parse(item.observedAt))
      .filter(Number.isFinite);
    return {
      observations,
      context: {
        productId: query.productId || null,
        region: query.region || null,
        dataQuality: {
          observationCount: observations.length,
          currencies,
          latestObservedAt: timestamps.length
            ? new Date(Math.max(...timestamps)).toISOString()
            : null,
          singleCurrency: currencies.length === 1,
          noLiveQuoteClaim: true,
        },
        sources: this._sources(observations),
        evidenceClasses: [EVIDENCE_CLASSES[0]],
        advisory: true,
      },
    };
  }

  async priceHistory(args, source) {
    const request = source || args?.request || null;
    const query = validate(
      observationQuerySchema,
      args?.input ?? args ?? {},
      'price history query',
    );
    const { observations, context } = await this._base({ ...query, request });
    return {
      ...context,
      observations,
      summary: summarize(
        observations.map((item) => item.price),
        context.dataQuality.currencies[0],
      ),
      externalEvidence: await this._externalEvidence({ ...query, request }),
    };
  }

  async regionalComparison(args, source) {
    const request = source || args?.request || null;
    const query = validate(
      analysisQuerySchema,
      args?.input ?? args ?? {},
      'regional comparison query',
    );
    const { observations, context } = await this._base({ ...query, request });
    const byRegion = groupBy(observations, (item) => item.region);
    const regions = [...byRegion.entries()].map(([region, rows]) => ({
      region,
      summary: summarize(
        rows.map((item) => item.price),
        rows[0]?.currency,
      ),
      availableQuantity: round(
        rows.reduce((sum, item) => sum + (finite(item.quantityAvailable) || 0), 0),
      ),
      observationIds: rows.map((item) => item.observationId),
    }));
    return {
      ...context,
      regions,
      interpretation: 'Regional figures are aggregates of collected observations, not live quotes.',
      externalEvidence: await this._externalEvidence({ ...query, request }),
    };
  }

  async supplyDemand(args, source) {
    const request = source || args?.request || null;
    const query = validate(
      analysisQuerySchema,
      args?.input ?? args ?? {},
      'supply and demand query',
    );
    const { observations, context } = await this._base({ ...query, request });
    const byRegion = groupBy(observations, (item) => item.region);
    const regions = [...byRegion.entries()].map(([region, rows]) => ({
      region,
      supply: {
        activeListings: rows.filter((item) => item.status === 'ACTIVE').length,
        availableQuantity: round(
          rows.reduce((sum, item) => sum + (finite(item.quantityAvailable) || 0), 0),
        ),
      },
      demandSignals: {
        reservedListings: rows.filter((item) => item.demandSignal === 'RESERVED').length,
        listingFavorites: rows.reduce((sum, item) => sum + (Number(item.favoriteCount) || 0), 0),
        basis: 'collected listing reservations and favorites',
      },
    }));
    return {
      ...context,
      regions,
      limitations: [
        'Favorites and reservations are marketplace signals, not verified consumption demand.',
        'No demand volume is inferred without collected order or buyer demand records.',
      ],
      externalEvidence: await this._externalEvidence({ ...query, request }),
    };
  }

  async trendVisualization(args, source) {
    const request = source || args?.request || null;
    const query = validate(
      trendQuerySchema,
      args?.input ?? args ?? {},
      'trend visualization query',
    );
    const { observations, context } = await this._base({ ...query, request });
    const keyOf =
      query.granularity === 'month'
        ? observedMonth
        : query.granularity === 'day'
          ? observedDay
          : (item) => item.observedAt;
    const byBucket = groupBy(observations, keyOf);
    const series = [...byBucket.entries()]
      .map(([bucket, rows]) => ({
        x: bucket,
        y: round(median(rows.map((item) => item.price))),
        observationCount: rows.length,
        observationIds: rows.map((item) => item.observationId),
      }))
      .sort((left, right) => String(left.x).localeCompare(String(right.x)));
    return {
      ...context,
      chart: {
        type: 'line',
        xLabel: 'Observed period',
        yLabel: `Observed price (${context.dataQuality.currencies[0] || 'currency not supplied'})`,
        series,
      },
      externalEvidence: await this._externalEvidence({ ...query, request }),
    };
  }

  async seasonalPatterns(args, source) {
    const request = source || args?.request || null;
    const query = validate(
      analysisQuerySchema,
      args?.input ?? args ?? {},
      'seasonal pattern query',
    );
    const { observations, context } = await this._base({ ...query, request });
    const byMonth = groupBy(observations, observedMonth);
    const months = [...byMonth.entries()]
      .map(([month, rows]) => ({
        month,
        observationCount: rows.length,
        medianPrice: round(median(rows.map((item) => item.price))),
        reservedListings: rows.filter((item) => item.demandSignal === 'RESERVED').length,
        listingFavorites: rows.reduce((sum, item) => sum + (Number(item.favoriteCount) || 0), 0),
        availableQuantity: round(
          rows.reduce((sum, item) => sum + (finite(item.quantityAvailable) || 0), 0),
        ),
      }))
      .sort((left, right) => left.month.localeCompare(right.month));
    return {
      ...context,
      months,
      limitations: [
        'Patterns reflect collected observation months, not a verified seasonal forecast.',
      ],
      externalEvidence: await this._externalEvidence({ ...query, request }),
    };
  }

  async availability(args, source) {
    const request = source || args?.request || null;
    const query = validate(analysisQuerySchema, args?.input ?? args ?? {}, 'availability query');
    const { observations, context } = await this._base({ ...query, request });
    const byRegion = groupBy(observations, (item) => item.region);
    const regions = [...byRegion.entries()].map(([region, rows]) => ({
      region,
      listingCount: new Set(rows.map((item) => item.listingId).filter(Boolean)).size,
      activeListingCount: rows.filter((item) => item.status === 'ACTIVE').length,
      availableQuantity: round(
        rows.reduce((sum, item) => sum + (finite(item.quantityAvailable) || 0), 0),
      ),
      harvestDates: [...new Set(rows.map((item) => item.harvestDate).filter(Boolean))],
      latestObservedAt: rows.map((item) => Date.parse(item.observedAt)).filter(Number.isFinite)
        .length
        ? new Date(
            Math.max(...rows.map((item) => Date.parse(item.observedAt)).filter(Number.isFinite)),
          ).toISOString()
        : null,
    }));
    return { ...context, regions };
  }

  async opportunities(args, source) {
    const request = source || args?.request || null;
    const query = validate(analysisQuerySchema, args?.input ?? args ?? {}, 'opportunity query');
    const { observations, context } = await this._base({ ...query, request });
    const byRegion = groupBy(observations, (item) => item.region);
    const regions = [...byRegion.entries()]
      .map(([region, rows]) => {
        const summary = summarize(
          rows.map((item) => item.price),
          rows[0]?.currency,
        );
        return {
          region,
          summary,
          priceDispersionRatio:
            summary.median && summary.min !== null && summary.max !== null
              ? round((summary.max - summary.min) / summary.median)
              : null,
          favoriteCount: rows.reduce((sum, item) => sum + (Number(item.favoriteCount) || 0), 0),
          availableQuantity: round(
            rows.reduce((sum, item) => sum + (finite(item.quantityAvailable) || 0), 0),
          ),
          observationIds: rows.map((item) => item.observationId),
        };
      })
      .sort((left, right) => (right.priceDispersionRatio || 0) - (left.priceDispersionRatio || 0));
    return {
      ...context,
      opportunities: regions.map((item) => ({
        type: 'observed_price_dispersion',
        region: item.region,
        evidence: item.observationIds,
        priceDispersionRatio: item.priceDispersionRatio,
        advisory: true,
      })),
      regions,
      limitations: [
        'Opportunity signals rank collected observations only; they are not buy/sell instructions.',
      ],
      externalEvidence: await this._externalEvidence({ ...query, request }),
    };
  }

  async sellingInsights(args, source) {
    const request = source || args?.request || null;
    const query = validate(analysisQuerySchema, args?.input ?? args ?? {}, 'selling insight query');
    const { observations, context } = await this._base({ ...query, request });
    const sorted = [...observations].sort(
      (left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt),
    );
    const latest = sorted[0] || null;
    const comparison = await this.regionalComparison({ input: query }, request);
    const regions = [...comparison.regions].sort(
      (left, right) => (right.summary.median || 0) - (left.summary.median || 0),
    );
    return {
      ...context,
      latestObservation: latest,
      observedMedian: summarize(
        observations.map((item) => item.price),
        context.dataQuality.currencies[0],
      ).median,
      higherObservedPriceRegions: regions.slice(0, 3),
      advisory: true,
      limitations: [
        'Insights use seller-submitted listing observations and require local verification before sale decisions.',
      ],
      externalEvidence: comparison.externalEvidence,
    };
  }

  async forecast(args, source) {
    const request = source || args?.request || null;
    const query = validate(forecastQuerySchema, args?.input ?? args ?? {}, 'market forecast query');
    const observations = await this._observations(query);
    this.eventBus?.publish({
      type: EVENTS.FORECAST_REQUESTED,
      moduleId: MODULE_ID,
      aggregateId: query.productId,
      payload: { observationCount: observations.length, horizon: query.horizon },
    });
    if (observations.length === 0) {
      return {
        historicalObservations: [],
        statisticalEstimates: {},
        mlPredictions: [],
        llmExplanation: null,
        evaluation: { evaluated: false, reason: 'no_collected_observations' },
        evidenceClasses: EVIDENCE_CLASSES,
        advisory: true,
      };
    }
    return this._callAi(
      'forecast',
      {
        observations,
        productId: query.productId,
        region: query.region,
        horizon: query.horizon,
        model: query.model,
        seasonLength: query.seasonLength,
        language: query.language,
        includeExplanation: query.includeExplanation,
      },
      request,
    );
  }
}

module.exports = { EVENTS, MarketIntelligenceService, MarketIntelligenceServiceToken };

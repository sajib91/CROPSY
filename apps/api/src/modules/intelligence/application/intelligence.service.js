const { z } = require('@cropsy/validation');
const { assertRepository } = require('../../../shared/domain/repository');
const {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
  isAppError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, IntelligenceEntity } = require('../domain/intelligence.entity');
const { IntelligenceRepositoryToken } = require('../domain/intelligence.repository');
const {
  AI_GATEWAY_METHOD_ALIASES,
  AI_GATEWAY_METHODS,
  aiGatewayUnavailableError,
} = require('../domain/ai-gateway.entity');
const {
  aiAskSchema,
  aiChatSchema,
  aiConversationCreateSchema,
  aiFeedbackSchema,
  aiMarketExplanationSchema,
  aiMarketForecastSchema,
  aiRecommendSchema,
  aiRetrieveSchema,
  aiRetrievalEvaluationSchema,
  aiWeatherAdvisorySchema,
  aiWeatherLookupSchema,
  moduleInfoSchema,
  toModuleInfoDto,
} = require('./intelligence.dto');

const IntelligenceServiceToken = Symbol.for('cropsy.service.intelligence');
const nonEmptyString = z.string().trim().min(1);

const NULL_AI_GATEWAY = Object.freeze({
  askAi: () => {
    throw aiGatewayUnavailableError();
  },
  retrieveAi: () => {
    throw aiGatewayUnavailableError();
  },
  recommendAi: () => {
    throw aiGatewayUnavailableError();
  },
  submitAiFeedback: () => {
    throw aiGatewayUnavailableError();
  },
  describeAiCapabilities: () => {
    throw aiGatewayUnavailableError();
  },
  chatAi: () => {
    throw aiGatewayUnavailableError();
  },
  createAiConversation: () => {
    throw aiGatewayUnavailableError();
  },
  getAiConversation: () => {
    throw aiGatewayUnavailableError();
  },
  evaluateRetrievalAi: () => {
    throw aiGatewayUnavailableError();
  },
  forecastMarketAi: () => {
    throw aiGatewayUnavailableError();
  },
  explainMarketAi: () => {
    throw aiGatewayUnavailableError();
  },
  getWeatherObservationsAi: () => {
    throw aiGatewayUnavailableError();
  },
  getWeatherForecastsAi: () => {
    throw aiGatewayUnavailableError();
  },
  getWeatherAlertsAi: () => {
    throw aiGatewayUnavailableError();
  },
  getWeatherAdvisoryAi: () => {
    throw aiGatewayUnavailableError();
  },
});

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

/** Accepts both ({ input, request }) and (payload, request) call shapes. */
function resolveAiArgs(args, source) {
  const wrapped =
    args && typeof args === 'object' && (hasOwn(args, 'input') || hasOwn(args, 'body'));
  const input = wrapped ? (args.input ?? args.body) : args;
  const request =
    source ||
    (wrapped ? args.request : null) ||
    (args && typeof args === 'object' && (hasOwn(args, 'requestId') || hasOwn(args, 'auth'))
      ? args
      : null);
  return { input, request };
}

function metadataFromRequest(request) {
  return {
    requestId: request?.requestId || null,
    organizationId: request?.organizationId || request?.auth?.organizationId || null,
    userId: request?.userId || request?.auth?.user?.id || null,
  };
}

function authContextFromRequest(request) {
  const auth = request?.auth || null;
  return {
    userId: auth?.user?.id || null,
    organizationId: auth?.organizationId || request?.organizationId || null,
    organizationIds: auth?.organizationIds || [],
    permissions: auth?.permissions || [],
    isSuperAdmin: Boolean(auth?.isSuperAdmin),
  };
}

function gatewayFailure(cause) {
  const error = new InfrastructureError({
    code: 'ai_service_error',
    message: 'The AI service request failed.',
    cause,
  });
  error.status = 502;
  return error;
}

class IntelligenceService {
  constructor({
    repository,
    eventBus,
    logger,
    metadata,
    aiGateway,
    farmAccess,
    agricultureAccess,
  } = {}) {
    assertRepository(repository, ['get', 'save'], IntelligenceRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('IntelligenceService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('IntelligenceService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    // Optional for direct construction; the composition root normally injects
    // the configured adapter (or its unavailable default) through the DI port.
    this.aiGateway = aiGateway || NULL_AI_GATEWAY;
    this.farmAccess = farmAccess;
    this.agricultureAccess = agricultureAccess;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new IntelligenceEntity();
      await this.repository.save(entity);
      this.eventBus.publish({
        type: `${MODULE_ID}.initialized`,
        moduleId: MODULE_ID,
        aggregateId: entity.id,
        payload: { name: entity.name },
      });
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    const dto = toModuleInfoDto(entity, this.metadata);
    return validate(moduleInfoSchema, dto, 'intelligence module info');
  }

  async _callAi(operation, payload, request) {
    const metadata = metadataFromRequest(request);
    const gateway = this.aiGateway;
    const candidates = [AI_GATEWAY_METHODS[operation], ...AI_GATEWAY_METHOD_ALIASES[operation]];
    const methodName = candidates.find((name) => typeof gateway?.[name] === 'function');
    if (!methodName) throw aiGatewayUnavailableError();

    // Metadata travels both as a nested object (for port implementations) and
    // flattened (for narrow fake adapters). It is advisory only and never
    // changes business state.
    const call = { ...payload, ...metadata, metadata };
    try {
      return await gateway[methodName](call, metadata);
    } catch (error) {
      // Adapters that already declared 502/503 keep their status. A generic
      // infrastructure failure is normalized to a safe 502 at this boundary.
      if (error instanceof InfrastructureError && error.status === 500) {
        throw gatewayFailure(error);
      }
      if (isAppError(error)) throw error;
      throw gatewayFailure(error);
    }
  }

  async askAi(args, source) {
    const { input, request } = resolveAiArgs(args, source);
    const payload = validate(aiAskSchema, input, 'AI ask input');
    return this._callAi('ask', payload, request);
  }

  async retrieveAi(args, source) {
    const { input, request } = resolveAiArgs(args, source);
    const payload = validate(aiRetrieveSchema, input, 'AI retrieve input');
    return this._callAi('retrieve', payload, request);
  }

  async recommendAi(args, source) {
    const { input, request } = resolveAiArgs(args, source);
    const payload = validate(aiRecommendSchema, input, 'AI recommendation input');
    return this._callAi('recommend', payload, request);
  }

  async submitAiFeedback(args, source) {
    const { input, request } = resolveAiArgs(args, source);
    const payload = validate(aiFeedbackSchema, input, 'AI feedback input');
    return this._callAi('feedback', payload, request);
  }

  async describeAiCapabilities(args, source) {
    const { request } = resolveAiArgs(args || {}, source);
    return this._callAi('capabilities', {}, request);
  }

  async chatAi(args, source) {
    const { input, request } = resolveAiArgs(args, source);
    const payload = validate(aiChatSchema, input, 'AI chat input');
    return this._callAi('chat', payload, request);
  }

  async createAiConversation(args, source) {
    const { input, request } = resolveAiArgs(args || {}, source);
    const payload = validate(aiConversationCreateSchema, input || {}, 'AI conversation input');
    return this._callAi('createConversation', payload, request);
  }

  async getAiConversation(args, source) {
    const { input, request } = resolveAiArgs(args || {}, source);
    const raw = input || {};
    const conversationId = raw.conversationId ?? raw.id ?? raw.params?.conversationId;
    const payload = validate(
      z.object({ conversationId: nonEmptyString.max(128) }),
      { conversationId },
      'AI conversation id',
    );
    return this._callAi('getConversation', payload, request);
  }

  async evaluateRetrievalAi(args, source) {
    const { input, request } = resolveAiArgs(args || {}, source);
    const payload = validate(
      aiRetrievalEvaluationSchema,
      input || {},
      'AI retrieval evaluation input',
    );
    return this._callAi('evaluateRetrieval', payload, request);
  }

  async forecastMarketAi(args, source) {
    const { input, request } = resolveAiArgs(args || {}, source);
    const payload = validate(aiMarketForecastSchema, input, 'AI market forecast input');
    return this._callAi('forecastMarket', payload, request);
  }

  async explainMarketAi(args, source) {
    const { input, request } = resolveAiArgs(args || {}, source);
    const payload = validate(aiMarketExplanationSchema, input, 'AI market explanation input');
    return this._callAi('explainMarket', payload, request);
  }

  async _weatherContext(input, request) {
    if (!this.farmAccess || typeof this.farmAccess.findFarmById !== 'function') {
      const error = new InfrastructureError({
        code: 'farm_access_unavailable',
        message: 'Farm access is not configured for weather intelligence.',
      });
      error.status = 503;
      throw error;
    }
    const auth = authContextFromRequest(request);
    const farm = await this.farmAccess.findFarmById(input.farmId);
    if (!farm) throw new NotFoundError({ message: 'Farm was not found.' });

    const owned = farm.owner_user_id && farm.owner_user_id === auth.userId;
    const sameOrganization = Boolean(
      farm.organization_id &&
      auth.organizationId === farm.organization_id &&
      auth.organizationIds.includes(farm.organization_id) &&
      auth.permissions.includes('farms.read'),
    );
    if (!auth.isSuperAdmin && !owned && !sameOrganization) {
      throw new ForbiddenError({
        message: 'Access to this farm weather context is denied.',
        details: { code: 'farm_weather_access_denied' },
      });
    }

    const point = farm.location?.point;
    const coordinates =
      Array.isArray(point) && Number.isFinite(Number(point[1])) && Number.isFinite(Number(point[0]))
        ? { latitude: Number(point[1]), longitude: Number(point[0]) }
        : null;
    const region = [farm.location?.district?.name, farm.location?.upazila?.name]
      .filter(Boolean)
      .join(', ');
    if (!coordinates && !region) {
      throw new ValidationError({
        message: 'The farm has no usable location for weather lookup.',
      });
    }

    let crop = input.crop || '';
    let cropStage = input.cropStage || '';
    let cultivation = null;
    if (input.cultivationId) {
      if (!this.agricultureAccess || typeof this.agricultureAccess.findCultivation !== 'function') {
        const error = new InfrastructureError({
          code: 'agriculture_access_unavailable',
          message: 'Cultivation access is not configured for weather intelligence.',
        });
        error.status = 503;
        throw error;
      }
      cultivation = await this.agricultureAccess.findCultivation(input.cultivationId);
      if (!cultivation || cultivation.farm_id !== input.farmId) {
        throw new NotFoundError({ message: 'Cultivation was not found for this farm.' });
      }
      cropStage = cultivation.growth_stage || cropStage;
    }

    return {
      farm: {
        id: farm.id,
        name: farm.name,
        organizationId: farm.organization_id || null,
        coordinates,
        region,
      },
      crop: {
        name: crop,
        varietyId: cultivation?.crop_variety_id || null,
        cropId: cultivation?.crop_id || null,
        stage: cropStage,
        cultivationId: cultivation?.id || null,
        sownAt: cultivation?.sown_at || null,
        expectedHarvestAt: cultivation?.expected_harvest_at || null,
      },
      irrigation: (farm.irrigations || []).map((item) => ({
        id: item.id,
        source: item.source || null,
        method: item.method || null,
        status: item.status || null,
        frequencyPerWeek: item.frequency_per_week ?? null,
      })),
      coordinatesAccess: 'GRANTED',
    };
  }

  async getWeatherObservationsAi(args, source) {
    const { input, request } = resolveAiArgs(args || {}, source);
    const payload = validate(aiWeatherLookupSchema, input, 'AI weather observation input');
    const context = await this._weatherContext(payload, request);
    return this._callAi('getWeatherObservations', { ...payload, context }, request);
  }

  async getWeatherForecastsAi(args, source) {
    const { input, request } = resolveAiArgs(args || {}, source);
    const payload = validate(aiWeatherLookupSchema, input, 'AI weather forecast input');
    const context = await this._weatherContext(payload, request);
    return this._callAi('getWeatherForecasts', { ...payload, context }, request);
  }

  async getWeatherAlertsAi(args, source) {
    const { input, request } = resolveAiArgs(args || {}, source);
    const payload = validate(aiWeatherLookupSchema, input, 'AI weather alert input');
    const context = await this._weatherContext(payload, request);
    return this._callAi('getWeatherAlerts', { ...payload, context }, request);
  }

  async getWeatherAdvisoryAi(args, source) {
    const { input, request } = resolveAiArgs(args || {}, source);
    const payload = validate(aiWeatherAdvisorySchema, input, 'AI weather advisory input');
    const context = await this._weatherContext(payload, request);
    return this._callAi('getWeatherAdvisory', { ...payload, context }, request);
  }
}

module.exports = { IntelligenceService, IntelligenceServiceToken };

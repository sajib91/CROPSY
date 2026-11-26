const { createHash, createHmac, randomUUID } = require('node:crypto');

const { InfrastructureError } = require('../../../shared/kernel/errors');
const {
  AI_GATEWAY_METHODS,
  AI_OPERATIONS,
  aiGatewayUnavailableError,
  assertAiOperation,
} = require('../domain/ai-gateway.entity');

const INTERNAL_BASE_PATH = '/api/v1/internal';
const OPERATION_PATHS = Object.freeze({
  ask: '/ask',
  retrieve: '/retrieve',
  recommend: '/recommend',
  feedback: '/feedback',
  capabilities: '/capabilities',
  chat: '/assistant/chat',
  createConversation: '/conversations',
  evaluateRetrieval: '/evaluation/retrieval',
  forecastMarket: '/market/forecast',
  explainMarket: '/market/explain',
  getWeatherObservations: '/weather/observations',
  getWeatherForecasts: '/weather/forecasts',
  getWeatherAlerts: '/weather/alerts',
  getWeatherAdvisory: '/weather/advisory',
});
const OPERATION_METHODS = Object.freeze({
  ask: 'POST',
  retrieve: 'POST',
  recommend: 'POST',
  feedback: 'POST',
  capabilities: 'GET',
  chat: 'POST',
  createConversation: 'POST',
  getConversation: 'GET',
  evaluateRetrieval: 'POST',
  forecastMarket: 'POST',
  explainMarket: 'POST',
  getWeatherObservations: 'POST',
  getWeatherForecasts: 'POST',
  getWeatherAlerts: 'POST',
  getWeatherAdvisory: 'POST',
});

// The AI service validates these headers against a conservative identifier
// pattern. Values outside the pattern are reduced to safe placeholders rather
// than being allowed to break signing or leak into logs.
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

function headerValue(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return ID_PATTERN.test(text) ? text : fallback;
}

function operationPath(operation, payload) {
  if (operation === 'getConversation') {
    const conversationId = headerValue(payload?.conversationId, '');
    if (!conversationId) {
      throw gatewayError('A conversation id is required.', { reason: 'missing_conversation_id' });
    }
    return `/conversations/${encodeURIComponent(conversationId)}`;
  }
  return OPERATION_PATHS[operation];
}

function gatewayError(message, details, cause) {
  const error = new InfrastructureError({
    code: 'ai_service_error',
    message,
    details,
    cause,
  });
  error.status = 502;
  return error;
}

/** Exact canonical string covered by the internal HMAC signature. */
function buildSignatureBase({ method, path, timestamp, body }) {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return `${String(method).toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`;
}

/** Pure helper: the secret is used for signing only and is never returned. */
function buildGatewaySignature({ secret, method, path, timestamp, body }) {
  return createHmac('sha256', secret)
    .update(buildSignatureBase({ method, path, timestamp, body }))
    .digest('hex');
}

function buildGatewayRequest({
  baseUrl,
  serviceId,
  secret,
  operation,
  payload = {},
  metadata = {},
  timestamp,
}) {
  assertAiOperation(operation);
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${INTERNAL_BASE_PATH}${operationPath(operation, payload)}`;
  url.search = '';
  url.hash = '';

  const method = OPERATION_METHODS[operation];
  const body = method === 'GET' ? '' : JSON.stringify(payload);
  const effectiveTimestamp = String(timestamp ?? Math.floor(Date.now() / 1000));
  const path = url.pathname;

  return Object.freeze({
    url: url.toString(),
    path,
    method,
    body,
    headers: Object.freeze({
      'content-type': 'application/json',
      'x-cropsy-service-id': headerValue(serviceId, 'unknown'),
      'x-cropsy-timestamp': effectiveTimestamp,
      'x-cropsy-signature': buildGatewaySignature({
        secret,
        method,
        path,
        timestamp: effectiveTimestamp,
        body,
      }),
      'x-request-id': headerValue(metadata.requestId, randomUUID()),
      'x-organization-id': headerValue(metadata.organizationId, 'unknown'),
      'x-user-id': headerValue(metadata.userId, 'unknown'),
    }),
  });
}

function unwrapGatewayPayload(payload) {
  if (
    payload &&
    typeof payload === 'object' &&
    payload.success === true &&
    Object.prototype.hasOwnProperty.call(payload, 'data')
  ) {
    return payload.data;
  }
  return payload;
}

/**
 * HTTP adapter for the internal AI service. It holds the shared secret in
 * memory only, signs every request, and surfaces upstream failures as safe
 * centralized infrastructure errors without echoing bodies or headers.
 */
class HttpAiGateway {
  constructor({
    baseUrl,
    serviceId = 'cropsy-business-api',
    secret,
    timeoutMs = 10000,
    fetcher,
    timestamp,
  } = {}) {
    if (!baseUrl || !secret) {
      throw new TypeError('HttpAiGateway requires a base URL and a service secret.');
    }
    const fetchImpl = fetcher || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('HttpAiGateway requires a global fetch implementation.');
    }
    this.baseUrl = baseUrl;
    this.serviceId = serviceId;
    this.secret = secret;
    this.timeoutMs = timeoutMs;
    this.fetcher = fetchImpl;
    this.timestamp = timestamp;
  }

  async _call(operation, payload, metadata) {
    assertAiOperation(operation);
    const request = buildGatewayRequest({
      baseUrl: this.baseUrl,
      serviceId: this.serviceId,
      secret: this.secret,
      operation,
      payload,
      metadata,
      timestamp: this.timestamp,
    });

    let response;
    try {
      response = await this.fetcher(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw gatewayError('The AI service is unreachable.', { reason: 'network' }, error);
    }

    if (!response || !response.ok) {
      const upstreamStatus = response ? response.status : 502;
      throw gatewayError(`The AI service request failed with HTTP ${upstreamStatus}.`, {
        upstreamStatus,
      });
    }

    let payloadFromService;
    try {
      payloadFromService = await response.json();
    } catch {
      throw gatewayError('The AI service returned an invalid response.', {
        reason: 'invalid_json',
      });
    }
    return unwrapGatewayPayload(payloadFromService);
  }

  askAi(payload, metadata) {
    return this._call('ask', payload, metadata);
  }

  retrieveAi(payload, metadata) {
    return this._call('retrieve', payload, metadata);
  }

  recommendAi(payload, metadata) {
    return this._call('recommend', payload, metadata);
  }

  submitAiFeedback(payload, metadata) {
    return this._call('feedback', payload, metadata);
  }

  describeAiCapabilities(payload, metadata) {
    return this._call('capabilities', payload, metadata);
  }

  chatAi(payload, metadata) {
    return this._call('chat', payload, metadata);
  }

  createAiConversation(payload, metadata) {
    return this._call('createConversation', payload, metadata);
  }

  getAiConversation(payload, metadata) {
    return this._call('getConversation', payload, metadata);
  }

  evaluateRetrievalAi(payload, metadata) {
    return this._call('evaluateRetrieval', payload, metadata);
  }

  forecastMarketAi(payload, metadata) {
    return this._call('forecastMarket', payload, metadata);
  }

  explainMarketAi(payload, metadata) {
    return this._call('explainMarket', payload, metadata);
  }

  getWeatherObservationsAi(payload, metadata) {
    return this._call('getWeatherObservations', payload, metadata);
  }

  getWeatherForecastsAi(payload, metadata) {
    return this._call('getWeatherForecasts', payload, metadata);
  }

  getWeatherAlertsAi(payload, metadata) {
    return this._call('getWeatherAlerts', payload, metadata);
  }

  getWeatherAdvisoryAi(payload, metadata) {
    return this._call('getWeatherAdvisory', payload, metadata);
  }

  forecastMarket(payload, metadata) {
    return this.forecastMarketAi(payload, metadata);
  }

  explainMarket(payload, metadata) {
    return this.explainMarketAi(payload, metadata);
  }

  weatherObservations(payload, metadata) {
    return this.getWeatherObservationsAi(payload, metadata);
  }

  weatherForecasts(payload, metadata) {
    return this.getWeatherForecastsAi(payload, metadata);
  }

  weatherAlerts(payload, metadata) {
    return this.getWeatherAlertsAi(payload, metadata);
  }

  weatherAdvisory(payload, metadata) {
    return this.getWeatherAdvisoryAi(payload, metadata);
  }

  chat(payload, metadata) {
    return this.chatAi(payload, metadata);
  }

  createConversation(payload, metadata) {
    return this.createAiConversation(payload, metadata);
  }

  getConversation(payload, metadata) {
    return this.getAiConversation(payload, metadata);
  }

  evaluateRetrieval(payload, metadata) {
    return this.evaluateRetrievalAi(payload, metadata);
  }

  ask(payload, metadata) {
    return this.askAi(payload, metadata);
  }

  retrieve(payload, metadata) {
    return this.retrieveAi(payload, metadata);
  }

  recommend(payload, metadata) {
    return this.recommendAi(payload, metadata);
  }

  submitFeedback(payload, metadata) {
    return this.submitAiFeedback(payload, metadata);
  }

  feedback(payload, metadata) {
    return this.submitAiFeedback(payload, metadata);
  }

  capabilities(payload, metadata) {
    return this.describeAiCapabilities(payload, metadata);
  }

  describeCapabilities(payload, metadata) {
    return this.describeAiCapabilities(payload, metadata);
  }

  describe() {
    return {
      configured: true,
      serviceId: this.serviceId,
      operations: [...AI_OPERATIONS],
      methods: Object.values(AI_GATEWAY_METHODS),
    };
  }
}

/** Default adapter used whenever URL or shared secret configuration is absent. */
class UnavailableAiGateway {
  constructor() {
    this.available = false;
  }

  askAi() {
    throw aiGatewayUnavailableError();
  }

  retrieveAi() {
    throw aiGatewayUnavailableError();
  }

  recommendAi() {
    throw aiGatewayUnavailableError();
  }

  submitAiFeedback() {
    throw aiGatewayUnavailableError();
  }

  describeAiCapabilities() {
    throw aiGatewayUnavailableError();
  }

  chatAi() {
    throw aiGatewayUnavailableError();
  }

  createAiConversation() {
    throw aiGatewayUnavailableError();
  }

  getAiConversation() {
    throw aiGatewayUnavailableError();
  }

  evaluateRetrievalAi() {
    throw aiGatewayUnavailableError();
  }

  forecastMarketAi() {
    throw aiGatewayUnavailableError();
  }

  explainMarketAi() {
    throw aiGatewayUnavailableError();
  }

  getWeatherObservationsAi() {
    throw aiGatewayUnavailableError();
  }

  getWeatherForecastsAi() {
    throw aiGatewayUnavailableError();
  }

  getWeatherAlertsAi() {
    throw aiGatewayUnavailableError();
  }

  getWeatherAdvisoryAi() {
    throw aiGatewayUnavailableError();
  }

  forecastMarket() {
    throw aiGatewayUnavailableError();
  }

  explainMarket() {
    throw aiGatewayUnavailableError();
  }

  weatherObservations() {
    throw aiGatewayUnavailableError();
  }

  weatherForecasts() {
    throw aiGatewayUnavailableError();
  }

  weatherAlerts() {
    throw aiGatewayUnavailableError();
  }

  weatherAdvisory() {
    throw aiGatewayUnavailableError();
  }

  chat() {
    throw aiGatewayUnavailableError();
  }

  createConversation() {
    throw aiGatewayUnavailableError();
  }

  getConversation() {
    throw aiGatewayUnavailableError();
  }

  evaluateRetrieval() {
    throw aiGatewayUnavailableError();
  }

  ask() {
    throw aiGatewayUnavailableError();
  }

  retrieve() {
    throw aiGatewayUnavailableError();
  }

  recommend() {
    throw aiGatewayUnavailableError();
  }

  submitFeedback() {
    throw aiGatewayUnavailableError();
  }

  feedback() {
    throw aiGatewayUnavailableError();
  }

  capabilities() {
    throw aiGatewayUnavailableError();
  }

  describeCapabilities() {
    throw aiGatewayUnavailableError();
  }

  describe() {
    return {
      configured: false,
      operations: [],
      methods: [],
    };
  }
}

function createAiGateway(env = {}) {
  const baseUrl = typeof env.AI_SERVICE_URL === 'string' ? env.AI_SERVICE_URL.trim() : '';
  const secret = typeof env.AI_SERVICE_SECRET === 'string' ? env.AI_SERVICE_SECRET.trim() : '';
  if (!baseUrl || !secret) return new UnavailableAiGateway();

  return new HttpAiGateway({
    baseUrl,
    serviceId: env.AI_SERVICE_ID || 'cropsy-business-api',
    secret,
    timeoutMs: env.AI_SERVICE_TIMEOUT_MS || 10000,
  });
}

module.exports = {
  HttpAiGateway,
  UnavailableAiGateway,
  buildGatewayRequest,
  buildGatewaySignature,
  buildSignatureBase,
  createAiGateway,
};

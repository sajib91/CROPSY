const { AiGatewayToken } = require('../../../shared/di/tokens');
const { InfrastructureError } = require('../../../shared/kernel/errors');

/**
 * Vocabulary for the authenticated business-api -> AI-service bridge. The DI
 * token is owned by the shared kernel so other advisory modules can consume
 * the same port without importing this module. No transport or credentials
 * belong in the domain layer.
 */
const AI_OPERATIONS = Object.freeze([
  'ask',
  'retrieve',
  'recommend',
  'feedback',
  'capabilities',
  'chat',
  'createConversation',
  'getConversation',
  'evaluateRetrieval',
  'forecastMarket',
  'explainMarket',
  'getWeatherObservations',
  'getWeatherForecasts',
  'getWeatherAlerts',
  'getWeatherAdvisory',
]);

const AI_GATEWAY_METHODS = Object.freeze({
  ask: 'askAi',
  retrieve: 'retrieveAi',
  recommend: 'recommendAi',
  feedback: 'submitAiFeedback',
  capabilities: 'describeAiCapabilities',
  chat: 'chatAi',
  createConversation: 'createAiConversation',
  getConversation: 'getAiConversation',
  evaluateRetrieval: 'evaluateRetrievalAi',
  forecastMarket: 'forecastMarketAi',
  explainMarket: 'explainMarketAi',
  getWeatherObservations: 'getWeatherObservationsAi',
  getWeatherForecasts: 'getWeatherForecastsAi',
  getWeatherAlerts: 'getWeatherAlertsAi',
  getWeatherAdvisory: 'getWeatherAdvisoryAi',
});

// Aliases are accepted by the application service so a test or alternate
// adapter can expose either the full operation names or their short forms.
const AI_GATEWAY_METHOD_ALIASES = Object.freeze({
  ask: Object.freeze(['ask']),
  retrieve: Object.freeze(['retrieve']),
  recommend: Object.freeze(['recommend']),
  feedback: Object.freeze(['submitFeedback', 'feedback']),
  capabilities: Object.freeze(['capabilities', 'describeCapabilities']),
  chat: Object.freeze(['chat']),
  createConversation: Object.freeze(['createConversation']),
  getConversation: Object.freeze(['getConversation']),
  evaluateRetrieval: Object.freeze(['evaluateRetrieval']),
  forecastMarket: Object.freeze(['forecastMarket']),
  explainMarket: Object.freeze(['explainMarket']),
  getWeatherObservations: Object.freeze(['weatherObservations', 'observations']),
  getWeatherForecasts: Object.freeze(['weatherForecasts', 'forecasts']),
  getWeatherAlerts: Object.freeze(['weatherAlerts', 'alerts']),
  getWeatherAdvisory: Object.freeze(['weatherAdvisory', 'advisory']),
});

const AI_LANGUAGES = Object.freeze(['en', 'bn', 'both']);
const AI_RECOMMENDATION_TYPES = Object.freeze([
  'cultivation',
  'fertilizer',
  'pest',
  'disease',
  'soil',
  'irrigation',
  'market',
]);

const AI_DEFAULT_LANGUAGE = 'en';
const AI_TOP_K_MIN = 1;
const AI_TOP_K_MAX = 20;
const AI_DEFAULT_TOP_K = 5;

function isAiOperation(value) {
  return typeof value === 'string' && AI_OPERATIONS.includes(value);
}

function assertAiOperation(value) {
  if (!isAiOperation(value)) {
    throw new TypeError(`Unsupported AI gateway operation '${String(value)}'.`);
  }
  return value;
}

function aiGatewayUnavailableError() {
  const error = new InfrastructureError({
    code: 'ai_service_unavailable',
    message: 'The AI service gateway is not configured.',
  });
  error.status = 503;
  return error;
}

module.exports = {
  AI_DEFAULT_LANGUAGE,
  AI_DEFAULT_TOP_K,
  AI_GATEWAY_METHODS,
  AI_GATEWAY_METHOD_ALIASES,
  AI_LANGUAGES,
  AI_OPERATIONS,
  AI_RECOMMENDATION_TYPES,
  AI_TOP_K_MAX,
  AI_TOP_K_MIN,
  AiGatewayToken,
  aiGatewayUnavailableError,
  assertAiOperation,
  isAiOperation,
};

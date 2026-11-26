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
  'runAgentic',
  'approveAgentic',
  'graphExtract',
  'graphBuild',
  'graphRetrieve',
  'graphContext',
  'graphCapabilities',
  'ingestMultimodalAsset',
  'retrieveMultimodal',
  'runUnified',
  'unifiedCapabilities',
  'evaluateUnified',
  'analyzeImage',
  'imageAnalysisCapabilities',
  'submitImageFeedback',
  'requestExpertReview',
  'decideExpertReview',
  'getExpertReview',
  'evaluationFrameworkCapabilities',
  'runEvaluation',
  'getEvaluationRun',
  'submitEvaluationFeedback',
  'createRegressionBaseline',
  'listRegressionBaselines',
  'checkRegression',
  'compareEvaluations',
  'retrievalDiagnostics',
  'failureDashboard',
  'agentMonitoring',
  'promptVersions',
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
  runAgentic: 'runAgenticAi',
  approveAgentic: 'approveAgenticAi',
  graphExtract: 'graphExtractAi',
  graphBuild: 'graphBuildAi',
  graphRetrieve: 'graphRetrieveAi',
  graphContext: 'graphContextAi',
  graphCapabilities: 'graphCapabilitiesAi',
  ingestMultimodalAsset: 'ingestMultimodalAssetAi',
  retrieveMultimodal: 'retrieveMultimodalAi',
  runUnified: 'runUnifiedAi',
  unifiedCapabilities: 'unifiedCapabilitiesAi',
  evaluateUnified: 'evaluateUnifiedAi',
  analyzeImage: 'analyzeImageAi',
  imageAnalysisCapabilities: 'imageAnalysisCapabilitiesAi',
  submitImageFeedback: 'submitImageFeedbackAi',
  requestExpertReview: 'requestExpertReviewAi',
  decideExpertReview: 'decideExpertReviewAi',
  getExpertReview: 'getExpertReviewAi',
  evaluationFrameworkCapabilities: 'evaluationFrameworkCapabilitiesAi',
  runEvaluation: 'runEvaluationAi',
  getEvaluationRun: 'getEvaluationRunAi',
  submitEvaluationFeedback: 'submitEvaluationFeedbackAi',
  createRegressionBaseline: 'createRegressionBaselineAi',
  listRegressionBaselines: 'listRegressionBaselinesAi',
  checkRegression: 'checkRegressionAi',
  compareEvaluations: 'compareEvaluationsAi',
  retrievalDiagnostics: 'retrievalDiagnosticsAi',
  failureDashboard: 'failureDashboardAi',
  agentMonitoring: 'agentMonitoringAi',
  promptVersions: 'promptVersionsAi',
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
  runAgentic: Object.freeze(['runAgentic', 'agenticRun']),
  approveAgentic: Object.freeze(['approveAgentic', 'agenticApprove']),
  graphExtract: Object.freeze(['graphExtract', 'extractGraph']),
  graphBuild: Object.freeze(['graphBuild', 'buildGraph']),
  graphRetrieve: Object.freeze(['graphRetrieve', 'retrieveGraph']),
  graphContext: Object.freeze(['graphContext', 'graphCombinedContext']),
  graphCapabilities: Object.freeze(['graphCapabilities', 'describeGraphCapabilities']),
  ingestMultimodalAsset: Object.freeze(['ingestMultimodalAsset', 'multimodalIngest']),
  retrieveMultimodal: Object.freeze(['retrieveMultimodal', 'multimodalRetrieve']),
  runUnified: Object.freeze(['runUnified', 'unifiedRun']),
  unifiedCapabilities: Object.freeze(['unifiedCapabilities', 'describeUnifiedCapabilities']),
  evaluateUnified: Object.freeze(['evaluateUnified', 'unifiedEvaluation']),
  analyzeImage: Object.freeze(['analyzeImage', 'imageAnalysis']),
  imageAnalysisCapabilities: Object.freeze([
    'imageAnalysisCapabilities',
    'describeImageAnalysisCapabilities',
  ]),
  submitImageFeedback: Object.freeze(['submitImageFeedback', 'imageFeedback']),
  requestExpertReview: Object.freeze(['requestExpertReview', 'requestReview']),
  decideExpertReview: Object.freeze(['decideExpertReview', 'decideReview']),
  getExpertReview: Object.freeze(['getExpertReview', 'expertReview']),
  evaluationFrameworkCapabilities: Object.freeze([
    'evaluationFrameworkCapabilities',
    'describeEvaluationFrameworkCapabilities',
  ]),
  runEvaluation: Object.freeze(['runEvaluation', 'evaluationRun']),
  getEvaluationRun: Object.freeze(['getEvaluationRun', 'evaluationRunById']),
  submitEvaluationFeedback: Object.freeze(['submitEvaluationFeedback', 'evaluationFeedback']),
  createRegressionBaseline: Object.freeze(['createRegressionBaseline', 'setBaseline']),
  listRegressionBaselines: Object.freeze(['listRegressionBaselines', 'baselines']),
  checkRegression: Object.freeze(['checkRegression', 'regressionCheck']),
  compareEvaluations: Object.freeze(['compareEvaluations', 'evaluationComparison']),
  retrievalDiagnostics: Object.freeze(['retrievalDiagnostics', 'diagnostics']),
  failureDashboard: Object.freeze(['failureDashboard', 'failures']),
  agentMonitoring: Object.freeze(['agentMonitoring', 'monitoring']),
  promptVersions: Object.freeze(['promptVersions', 'evaluationPrompts']),
});

const AI_LANGUAGES = Object.freeze(['en', 'bn', 'both']);
const AI_DOCUMENT_TYPES = Object.freeze([
  'research_paper',
  'government_publication',
  'crop_cultivation_guideline',
  'fertilizer_recommendation',
  'pest_management',
  'disease_management',
  'agricultural_manual',
  'weather_guidance',
  'soil_management',
  'market_intelligence',
  'other',
]);
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

// GraphRAG vocabulary is owned by the AI service. The gateway mirrors the
// allowlist so malformed or attacker-controlled labels are rejected before a
// signed internal request is created.
const AI_GRAPH_ENTITY_TYPES = Object.freeze([
  'Crop',
  'CropVariety',
  'PlantDisease',
  'Pest',
  'SoilType',
  'Fertilizer',
  'Nutrient',
  'AgriculturalPractice',
  'WeatherCondition',
  'GeographicRegion',
  'AgriculturalResearch',
  'ExpertRecommendation',
]);

const AI_GRAPH_PREDICATES = Object.freeze([
  'AFFECTS',
  'CAUSES',
  'TREATS',
  'REQUIRES',
  'GROWS_IN',
  'ASSOCIATED_WITH',
  'RECOMMENDED_FOR',
  'HAS_EVIDENCE',
  'FOUND_IN',
]);

const AI_GRAPH_EVIDENCE_CLASSES = Object.freeze([
  'candidate_extraction',
  'validated_extraction',
  'verified_relationship',
  'verified_external_evidence',
]);

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
  AI_DOCUMENT_TYPES,
  AI_GRAPH_ENTITY_TYPES,
  AI_GRAPH_EVIDENCE_CLASSES,
  AI_GRAPH_PREDICATES,
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

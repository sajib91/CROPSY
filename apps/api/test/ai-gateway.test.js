const assert = require('node:assert/strict');
const { createHash, createHmac } = require('node:crypto');
const test = require('node:test');

const buildServer = require('../src/app');
const { AuthStoreToken } = require('../src/modules/iam/domain/auth.repository');
const {
  AI_GATEWAY_METHODS,
  AI_OPERATIONS,
} = require('../src/modules/intelligence/domain/ai-gateway.entity');
const {
  HttpAiGateway,
  UnavailableAiGateway,
  buildGatewayRequest,
  buildGatewaySignature,
} = require('../src/modules/intelligence/infrastructure/http-ai-gateway');
const { bearer, loginUser, register, verifyOtp } = require('./support/auth-fixtures');

const BASE = '/api/v1/intelligence/ai';
const REQUEST_ID = 'ai-gateway-test-request';
const AI_SECRET = 'test-ai-secret-at-least-32-characters-long';
const PASSWORD = 'StrongPass123!';

const BASE_ENV = {
  ...process.env,
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  API_PREFIX: '/api/v1',
  AUTH_STORE: 'memory',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long',
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: 1000,
  AUTH_OTP_PROVIDER_MODE: 'preview',
  AI_SERVICE_SECRET: AI_SECRET,
};

function createFakeGateway() {
  const calls = [];
  const handler = (operation) => async (input, metadata) => {
    calls.push({ operation, input, metadata });
    return { operation, advisory: true, answer: `${operation} result` };
  };

  return {
    calls,
    askAi: handler('ask'),
    retrieveAi: handler('retrieve'),
    recommendAi: handler('recommend'),
    submitAiFeedback: handler('feedback'),
    describeAiCapabilities: handler('capabilities'),
    chatAi: handler('chat'),
    createAiConversation: handler('createConversation'),
    getAiConversation: handler('getConversation'),
    listAiConversations: handler('listConversations'),
    evaluateRetrievalAi: handler('evaluateRetrieval'),
    runAgenticAi: handler('runAgentic'),
    approveAgenticAi: handler('approveAgentic'),
    graphExtractAi: handler('graphExtract'),
    graphBuildAi: handler('graphBuild'),
    graphRetrieveAi: handler('graphRetrieve'),
    graphContextAi: handler('graphContext'),
    graphCapabilitiesAi: handler('graphCapabilities'),
    ingestMultimodalAssetAi: handler('ingestMultimodalAsset'),
    retrieveMultimodalAi: handler('retrieveMultimodal'),
    runUnifiedAi: handler('runUnified'),
    unifiedCapabilitiesAi: handler('unifiedCapabilities'),
    evaluateUnifiedAi: handler('evaluateUnified'),
    analyzeImageAi: handler('analyzeImage'),
    imageAnalysisCapabilitiesAi: handler('imageAnalysisCapabilities'),
    submitImageFeedbackAi: handler('submitImageFeedback'),
    requestExpertReviewAi: handler('requestExpertReview'),
    decideExpertReviewAi: handler('decideExpertReview'),
    getExpertReviewAi: handler('getExpertReview'),
    evaluationFrameworkCapabilitiesAi: handler('evaluationFrameworkCapabilities'),
    runEvaluationAi: handler('runEvaluation'),
    getEvaluationRunAi: handler('getEvaluationRun'),
    submitEvaluationFeedbackAi: handler('submitEvaluationFeedback'),
    createRegressionBaselineAi: handler('createRegressionBaseline'),
    listRegressionBaselinesAi: handler('listRegressionBaselines'),
    checkRegressionAi: handler('checkRegression'),
    compareEvaluationsAi: handler('compareEvaluations'),
    retrievalDiagnosticsAi: handler('retrievalDiagnostics'),
    failureDashboardAi: handler('failureDashboard'),
    agentMonitoringAi: handler('agentMonitoring'),
    promptVersionsAi: handler('promptVersions'),
  };
}

async function createApp(t, aiGateway, envOverrides = {}) {
  const app = await buildServer({
    env: { ...BASE_ENV, ...envOverrides },
    logger: false,
    aiGateway,
  });
  t.after(() => app.close());
  return app;
}

async function createUser(app, email, role) {
  const registration = await register(app, { email, roles: [role] });
  assert.equal(registration.response.statusCode, 201, registration.response.body);

  const verification = await verifyOtp(app, {
    channel: 'email',
    purpose: 'EMAIL_VERIFICATION',
    destination: email,
    code: registration.code,
  });
  assert.equal(verification.response.statusCode, 200, verification.response.body);

  return registration.user;
}

async function login(app, email) {
  const result = await loginUser(app, email, PASSWORD);
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.tokens.accessToken;
}

function headers(token) {
  return { ...bearer(token), 'x-request-id': REQUEST_ID };
}

async function inject(app, method, path, token, payload) {
  return app.inject({
    method,
    url: `${BASE}${path}`,
    headers: headers(token),
    ...(payload === undefined ? {} : { payload }),
  });
}

test('AI gateway forwards validated advisory requests with request metadata', async (t) => {
  const fakeGateway = createFakeGateway();
  const app = await createApp(t, fakeGateway);
  const expert = await createUser(app, 'expert-ai@example.com', 'AGRICULTURAL_EXPERT');

  const store = app.cropsyContainer.resolve(AuthStoreToken);
  const organization = await store.createOrganization({
    name: 'AI advisory organization',
    ownerUserId: expert.id,
  });
  await store.addOrganizationMember({
    organizationId: organization.id,
    userId: expert.id,
    status: 'ACTIVE',
  });
  const token = await login(app, 'expert-ai@example.com');

  const capabilities = await inject(app, 'GET', '/capabilities', token);
  assert.equal(capabilities.statusCode, 200, capabilities.body);
  assert.equal(capabilities.json().data.operation, 'capabilities');
  assert.equal(fakeGateway.calls.at(-1).metadata.organizationId, organization.id);
  assert.equal(fakeGateway.calls.at(-1).metadata.userId, expert.id);
  assert.equal(capabilities.json().meta.requestId, REQUEST_ID);
  assert.equal(capabilities.json().meta.apiVersion, 'v1');

  const ask = await inject(app, 'POST', '/ask', token, {
    question: 'Which variety suits a wet season?',
    language: 'bn',
    topK: 3,
  });
  assert.equal(ask.statusCode, 200, ask.body);
  assert.equal(ask.json().data.answer, 'ask result');
  const askCall = fakeGateway.calls.at(-1);
  assert.equal(askCall.operation, 'ask');
  assert.equal(askCall.input.question, 'Which variety suits a wet season?');
  assert.equal(askCall.input.language, 'bn');
  assert.equal(askCall.input.topK, 3);
  assert.equal(askCall.metadata.requestId, REQUEST_ID);
  assert.equal(askCall.metadata.organizationId, organization.id);
  assert.equal(askCall.metadata.userId, expert.id);

  const recommend = await inject(app, 'POST', '/recommendations', token, {
    recommendationType: 'fertilizer',
    crop: 'rice',
    region: 'Sylhet',
  });
  assert.equal(recommend.statusCode, 200, recommend.body);
  assert.equal(recommend.json().data.operation, 'recommend');
  const recommendCall = fakeGateway.calls.at(-1);
  assert.equal(recommendCall.input.recommendationType, 'fertilizer');
  assert.equal(recommendCall.input.crop, 'rice');
  assert.equal(recommendCall.metadata.userId, expert.id);

  const feedback = await inject(app, 'POST', '/feedback', token, {
    traceId: 'trace-ai-1',
    rating: 5,
    comment: 'Useful advisory.',
  });
  assert.equal(feedback.statusCode, 200, feedback.body);
  assert.equal(feedback.json().data.operation, 'feedback');
  assert.equal(fakeGateway.calls.at(-1).input.traceId, 'trace-ai-1');

  // The gateway is advisory only; business module state is untouched.
  const info = await app.inject({ method: 'GET', url: '/api/v1/intelligence/info' });
  assert.equal(info.statusCode, 200);
  assert.equal(info.json().data.status, 'ACTIVE');
});

test('AI chat, conversation, and evaluation routes forward validated advisory requests', async (t) => {
  const fakeGateway = createFakeGateway();
  const app = await createApp(t, fakeGateway);
  const expert = await createUser(app, 'chat-ai@example.com', 'AGRICULTURAL_EXPERT');

  const store = app.cropsyContainer.resolve(AuthStoreToken);
  const organization = await store.createOrganization({
    name: 'AI chat organization',
    ownerUserId: expert.id,
  });
  await store.addOrganizationMember({
    organizationId: organization.id,
    userId: expert.id,
    status: 'ACTIVE',
  });
  const token = await login(app, 'chat-ai@example.com');

  const chat = await inject(app, 'POST', '/chat', token, {
    message: 'ধান সেচের পরামর্শ দিন',
    language: 'bn',
    region: 'Sylhet',
    topK: 4,
  });
  assert.equal(chat.statusCode, 200, chat.body);
  const chatCall = fakeGateway.calls.at(-1);
  assert.equal(chatCall.operation, 'chat');
  assert.equal(chatCall.input.language, 'bn');
  assert.equal(chatCall.input.region, 'Sylhet');
  assert.equal(chatCall.input.maxHistoryTurns, 8);
  assert.equal(chatCall.metadata.organizationId, organization.id);
  assert.equal(chatCall.metadata.userId, expert.id);

  const created = await inject(app, 'POST', '/conversations', token, { language: 'en' });
  assert.equal(created.statusCode, 200, created.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'createConversation');

  const conversationId = '11111111-1111-1111-1111-111111111111';
  const fetched = await inject(app, 'GET', `/conversations/${conversationId}`, token);
  assert.equal(fetched.statusCode, 200, fetched.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'getConversation');
  assert.equal(fakeGateway.calls.at(-1).input.conversationId, conversationId);

  const listed = await inject(app, 'GET', '/conversations', token);
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'listConversations');
  assert.equal(fakeGateway.calls.at(-1).metadata.organizationId, organization.id);
  assert.equal(fakeGateway.calls.at(-1).metadata.userId, expert.id);

  const evaluation = await inject(app, 'POST', '/evaluation/retrieval', token, { topK: 3 });
  assert.equal(evaluation.statusCode, 200, evaluation.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'evaluateRetrieval');
  assert.equal(fakeGateway.calls.at(-1).input.topK, 3);

  const hybrid = await inject(app, 'POST', '/retrieve', token, {
    query: 'rice irrigation',
    fusionMethod: 'rrf',
    vectorWeight: 0.5,
    keywordWeight: 0.5,
    region: 'Dhaka',
    maxQueryVariants: 4,
  });
  assert.equal(hybrid.statusCode, 200, hybrid.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'retrieve');
  assert.equal(fakeGateway.calls.at(-1).input.fusionMethod, 'rrf');
  assert.equal(fakeGateway.calls.at(-1).input.region, 'Dhaka');
  assert.equal(fakeGateway.calls.at(-1).input.maxQueryVariants, 4);
});

test('AI gateway inputs are validated before the adapter is called', async (t) => {
  const fakeGateway = createFakeGateway();
  const app = await createApp(t, fakeGateway);
  await createUser(app, 'validator-ai@example.com', 'AGRICULTURAL_EXPERT');
  const token = await login(app, 'validator-ai@example.com');

  const emptyQuestion = await inject(app, 'POST', '/ask', token, { question: '   ' });
  assert.equal(emptyQuestion.statusCode, 400);
  assert.equal(emptyQuestion.json().error, 'validation_error');

  const badLanguage = await inject(app, 'POST', '/retrieve', token, {
    query: 'soil health',
    language: 'fr',
  });
  assert.equal(badLanguage.statusCode, 400);
  assert.equal(badLanguage.json().error, 'validation_error');

  const badRating = await inject(app, 'POST', '/feedback', token, {
    traceId: 'trace-ai-2',
    rating: 9,
  });
  assert.equal(badRating.statusCode, 400);
  assert.equal(badRating.json().error, 'validation_error');

  const emptyChat = await inject(app, 'POST', '/chat', token, { message: '   ' });
  assert.equal(emptyChat.statusCode, 400);
  assert.equal(emptyChat.json().error, 'validation_error');

  assert.equal(fakeGateway.calls.length, 0);
});

test('feedback permission is default-denied for a buyer with read access', async (t) => {
  const fakeGateway = createFakeGateway();
  const app = await createApp(t, fakeGateway);
  await createUser(app, 'buyer-ai@example.com', 'BUYER');
  const token = await login(app, 'buyer-ai@example.com');

  const allowedRead = await inject(app, 'POST', '/ask', token, { question: 'Market outlook?' });
  assert.equal(allowedRead.statusCode, 200, allowedRead.body);
  assert.equal(fakeGateway.calls[0].input.language, 'en');
  assert.equal(fakeGateway.calls[0].input.topK, 5);

  const denied = await inject(app, 'POST', '/feedback', token, {
    traceId: 'trace-ai-3',
    rating: 4,
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().error, 'forbidden');
  assert.deepEqual(
    fakeGateway.calls.map((call) => call.operation),
    ['ask'],
  );
});

test('an unconfigured gateway reports 503 instead of fabricating AI output', async (t) => {
  const app = await createApp(t, undefined, { AI_SERVICE_SECRET: '' });
  await createUser(app, 'offline-ai@example.com', 'AGRICULTURAL_EXPERT');
  const token = await login(app, 'offline-ai@example.com');

  const response = await inject(app, 'POST', '/ask', token, { question: 'Any advice?' });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, 'ai_service_unavailable');

  const unavailable = new UnavailableAiGateway();
  assert.throws(
    () => unavailable.describeAiCapabilities(),
    (error) => error.status === 503 && error.code === 'ai_service_unavailable',
  );
});

test('HTTP gateway signing covers METHOD, PATH, TIMESTAMP, and SHA256(body)', () => {
  const secret = AI_SECRET;
  const path = '/api/v1/internal/ask';
  const body = JSON.stringify({ question: 'hello', language: 'en', topK: 5 });
  const timestamp = '1700000000';

  const expected = createHmac('sha256', secret)
    .update(`POST\n${path}\n${timestamp}\n${createHash('sha256').update(body).digest('hex')}`)
    .digest('hex');

  assert.equal(buildGatewaySignature({ secret, method: 'POST', path, timestamp, body }), expected);

  const request = buildGatewayRequest({
    baseUrl: 'http://127.0.0.1:4100/',
    serviceId: 'cropsy-business-api',
    secret,
    operation: 'ask',
    payload: { question: 'hello', language: 'en', topK: 5 },
    metadata: {
      requestId: REQUEST_ID,
      organizationId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
    },
    timestamp,
  });

  assert.equal(request.path, path);
  assert.equal(request.url, `http://127.0.0.1:4100${path}`);
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.headers['x-cropsy-service-id'], 'cropsy-business-api');
  assert.equal(request.headers['x-cropsy-timestamp'], timestamp);
  assert.equal(request.headers['x-cropsy-signature'], expected);
  assert.equal(request.headers['x-request-id'], REQUEST_ID);
  assert.equal(request.headers['x-organization-id'], '11111111-1111-1111-1111-111111111111');
  assert.equal(request.headers['x-user-id'], '22222222-2222-2222-2222-222222222222');
  assert.ok(!JSON.stringify(request).includes(secret));

  const capabilitiesRequest = buildGatewayRequest({
    baseUrl: 'http://127.0.0.1:4100',
    serviceId: 'cropsy-business-api',
    secret,
    operation: 'capabilities',
    timestamp,
  });
  assert.equal(capabilitiesRequest.method, 'GET');
  assert.equal(capabilitiesRequest.body, '');
  assert.equal(capabilitiesRequest.path, '/api/v1/internal/capabilities');

  const conversationId = '11111111-1111-1111-1111-111111111111';
  const conversationRequest = buildGatewayRequest({
    baseUrl: 'http://127.0.0.1:4100',
    serviceId: 'cropsy-business-api',
    secret,
    operation: 'getConversation',
    payload: { conversationId },
    timestamp,
  });
  assert.equal(conversationRequest.method, 'GET');
  assert.equal(conversationRequest.body, '');
  assert.equal(conversationRequest.path, `/api/v1/internal/conversations/${conversationId}`);
});

test('AI agentic and GraphRAG routes forward strict advisory requests with tenant metadata', async (t) => {
  const fakeGateway = createFakeGateway();
  const app = await createApp(t, fakeGateway);
  const expert = await createUser(app, 'agentic-ai@example.com', 'AGRICULTURAL_EXPERT');

  const store = app.cropsyContainer.resolve(AuthStoreToken);
  const organization = await store.createOrganization({
    name: 'Agentic advisory organization',
    ownerUserId: expert.id,
  });
  await store.addOrganizationMember({
    organizationId: organization.id,
    userId: expert.id,
    status: 'ACTIVE',
  });
  const token = await login(app, 'agentic-ai@example.com');

  const run = await inject(app, 'POST', '/agentic/run', token, {
    query: 'What does verified guidance say about rice blast?',
    language: 'en',
    topK: 3,
    useGraph: true,
    requireApproval: true,
  });
  assert.equal(run.statusCode, 200, run.body);
  const runCall = fakeGateway.calls.at(-1);
  assert.equal(runCall.operation, 'runAgentic');
  assert.equal(runCall.input.query, 'What does verified guidance say about rice blast?');
  assert.equal(runCall.input.topK, 3);
  assert.equal(runCall.input.useGraph, true);
  assert.equal(runCall.input.requireApproval, true);
  assert.equal(runCall.input.documentText, '');
  assert.deepEqual(runCall.input.marketObservations, []);
  assert.equal(runCall.metadata.organizationId, organization.id);
  assert.equal(runCall.metadata.userId, expert.id);
  assert.ok(!('organizationId' in runCall.input));
  assert.ok(!('farmId' in runCall.input));

  const approve = await inject(app, 'POST', '/agentic/approve', token, {
    traceId: 'trace-agentic-node',
    approval: {
      approvalId: 'approval-node-1',
      approvedBy: 'agronomist-node',
      decision: 'approved',
      scope: ['response_generation'],
    },
  });
  assert.equal(approve.statusCode, 200, approve.body);
  const approveCall = fakeGateway.calls.at(-1);
  assert.equal(approveCall.operation, 'approveAgentic');
  assert.equal(approveCall.input.traceId, 'trace-agentic-node');
  assert.equal(approveCall.input.approval.approvedBy, 'agronomist-node');
  assert.equal(approveCall.input.approval.decision, 'approved');
  assert.equal(approveCall.metadata.organizationId, organization.id);

  const extractionBody = {
    text: 'Rice blast affects rice. Agricultural research has evidence for rice blast.',
    source: 'Node gateway test note',
    sourceReference: 'node-graph-v1',
    documentStatus: 'verified',
    licenseVerified: true,
  };

  const extract = await inject(app, 'POST', '/graph/extract', token, extractionBody);
  assert.equal(extract.statusCode, 200, extract.body);
  const extractCall = fakeGateway.calls.at(-1);
  assert.equal(extractCall.operation, 'graphExtract');
  assert.equal(extractCall.input.sourceReference, 'node-graph-v1');
  assert.equal(extractCall.input.licenseVerified, true);
  assert.deepEqual(extractCall.input.entityTypes, []);
  assert.ok(!('organizationId' in extractCall.input));

  const build = await inject(app, 'POST', '/graph/build', token, {
    extraction: extractionBody,
  });
  assert.equal(build.statusCode, 200, build.body);
  const buildCall = fakeGateway.calls.at(-1);
  assert.equal(buildCall.operation, 'graphBuild');
  assert.equal(buildCall.input.extraction.sourceReference, 'node-graph-v1');
  assert.equal(buildCall.metadata.userId, expert.id);

  const retrieve = await inject(app, 'POST', '/graph/retrieve', token, {
    query: 'rice blast',
    includeGlobal: false,
    topK: 5,
    minConfidence: 0.6,
  });
  assert.equal(retrieve.statusCode, 200, retrieve.body);
  const retrieveCall = fakeGateway.calls.at(-1);
  assert.equal(retrieveCall.operation, 'graphRetrieve');
  assert.equal(retrieveCall.input.includeGlobal, false);
  assert.equal(retrieveCall.input.topK, 5);
  assert.equal(retrieveCall.input.minConfidence, 0.6);
  assert.ok(!('organizationIds' in retrieveCall.input));

  const context = await inject(app, 'POST', '/graph/context', token, {
    query: 'rice blast',
    graph: { query: 'rice blast', includeGlobal: false, topK: 5 },
    topK: 3,
  });
  assert.equal(context.statusCode, 200, context.body);
  const contextCall = fakeGateway.calls.at(-1);
  assert.equal(contextCall.operation, 'graphContext');
  assert.equal(contextCall.input.graph.topK, 5);
  assert.equal(contextCall.input.topK, 3);

  const capabilities = await inject(app, 'GET', '/graph/capabilities', token);
  assert.equal(capabilities.statusCode, 200, capabilities.body);
  const capabilitiesCall = fakeGateway.calls.at(-1);
  assert.equal(capabilitiesCall.operation, 'graphCapabilities');
  assert.deepEqual(capabilitiesCall.input, {});

  assert.deepEqual(
    fakeGateway.calls.map((call) => call.operation),
    [
      'runAgentic',
      'approveAgentic',
      'graphExtract',
      'graphBuild',
      'graphRetrieve',
      'graphContext',
      'graphCapabilities',
    ],
  );
});

test('AI multimodal and unified orchestration routes forward advisory requests without client tenant fields', async (t) => {
  const fakeGateway = createFakeGateway();
  const app = await createApp(t, fakeGateway);
  const expert = await createUser(app, 'multimodal-ai@example.com', 'AGRICULTURAL_EXPERT');

  const store = app.cropsyContainer.resolve(AuthStoreToken);
  const organization = await store.createOrganization({
    name: 'Multimodal advisory organization',
    ownerUserId: expert.id,
  });
  await store.addOrganizationMember({
    organizationId: organization.id,
    userId: expert.id,
    status: 'ACTIVE',
  });
  const token = await login(app, 'multimodal-ai@example.com');

  const asset = {
    assetId: 'asset-node-1',
    title: 'Verified rice irrigation note',
    mimeType: 'text/plain',
    documentType: 'research_paper',
    source: {
      name: 'Node research institute',
      url: 'https://example.test/node-rice-irrigation',
    },
    license: {
      code: 'CC-BY-4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
      verified: true,
    },
    text: 'Alternate wetting and drying was observed in a rice irrigation trial.',
    isPlantImage: false,
  };

  const ingest = await inject(app, 'POST', '/multimodal/assets', token, asset);
  assert.equal(ingest.statusCode, 200, ingest.body);
  const ingestCall = fakeGateway.calls.at(-1);
  assert.equal(ingestCall.operation, 'ingestMultimodalAsset');
  assert.equal(ingestCall.input.assetId, 'asset-node-1');
  assert.equal(ingestCall.input.language, 'en');
  assert.equal(ingestCall.input.isPlantImage, false);
  assert.equal(ingestCall.metadata.organizationId, organization.id);
  assert.equal(ingestCall.metadata.userId, expert.id);
  assert.ok(!('organizationId' in ingestCall.input));
  assert.ok(!('farmerId' in ingestCall.input));

  const retrieve = await inject(app, 'POST', '/multimodal/retrieve', token, {
    query: 'What does the rice irrigation note say?',
    topK: 3,
    assetIds: ['asset-node-1'],
  });
  assert.equal(retrieve.statusCode, 200, retrieve.body);
  const retrieveCall = fakeGateway.calls.at(-1);
  assert.equal(retrieveCall.operation, 'retrieveMultimodal');
  assert.equal(retrieveCall.input.topK, 3);
  assert.deepEqual(retrieveCall.input.assetIds, ['asset-node-1']);
  assert.ok(!('organizationId' in retrieveCall.input));
  assert.ok(!('farmerId' in retrieveCall.input));

  const run = await inject(app, 'POST', '/orchestration/run', token, {
    query: 'What does the uploaded document say about rice irrigation?',
    topK: 3,
    assetIds: ['asset-node-1'],
    documentText: 'Rice irrigation trial note',
    requireApproval: false,
  });
  assert.equal(run.statusCode, 200, run.body);
  const runCall = fakeGateway.calls.at(-1);
  assert.equal(runCall.operation, 'runUnified');
  assert.equal(runCall.input.query, 'What does the uploaded document say about rice irrigation?');
  assert.deepEqual(runCall.input.assetIds, ['asset-node-1']);
  assert.equal(runCall.input.documentText, 'Rice irrigation trial note');
  assert.equal(runCall.metadata.organizationId, organization.id);
  assert.ok(!('organizationId' in runCall.input));
  assert.ok(!('farmerId' in runCall.input));

  const capabilities = await inject(app, 'GET', '/orchestration/capabilities', token);
  assert.equal(capabilities.statusCode, 200, capabilities.body);
  const capabilitiesCall = fakeGateway.calls.at(-1);
  assert.equal(capabilitiesCall.operation, 'unifiedCapabilities');
  assert.deepEqual(capabilitiesCall.input, {});

  const evaluation = await inject(app, 'POST', '/orchestration/evaluation', token, {
    dataset: 'multimodal',
    topK: 3,
  });
  assert.equal(evaluation.statusCode, 200, evaluation.body);
  const evaluationCall = fakeGateway.calls.at(-1);
  assert.equal(evaluationCall.operation, 'evaluateUnified');
  assert.equal(evaluationCall.input.dataset, 'multimodal');
  assert.equal(evaluationCall.input.topK, 3);

  const badAsset = await inject(app, 'POST', '/multimodal/assets', token, {
    ...asset,
    organizationId: 'org-other',
  });
  assert.equal(badAsset.statusCode, 400);
  assert.equal(badAsset.json().error, 'validation_error');

  const badRun = await inject(app, 'POST', '/orchestration/run', token, {
    query: 'Rice irrigation?',
    farmerId: 'farmer-secret',
  });
  assert.equal(badRun.statusCode, 400);
  assert.equal(badRun.json().error, 'validation_error');

  assert.deepEqual(
    fakeGateway.calls.map((call) => call.operation),
    [
      'ingestMultimodalAsset',
      'retrieveMultimodal',
      'runUnified',
      'unifiedCapabilities',
      'evaluateUnified',
    ],
  );
});

test('image analysis and evaluation framework routes forward advisory-only requests', async (t) => {
  const fakeGateway = createFakeGateway();
  const app = await createApp(t, fakeGateway);
  const expert = await createUser(app, 'image-eval-ai@example.com', 'AGRICULTURAL_EXPERT');

  const store = app.cropsyContainer.resolve(AuthStoreToken);
  const organization = await store.createOrganization({
    name: 'Image evaluation organization',
    ownerUserId: expert.id,
  });
  await store.addOrganizationMember({
    organizationId: organization.id,
    userId: expert.id,
    status: 'ACTIVE',
  });
  const token = await login(app, 'image-eval-ai@example.com');

  const imageCapabilities = await inject(app, 'GET', '/image-analysis/capabilities', token);
  assert.equal(imageCapabilities.statusCode, 200, imageCapabilities.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'imageAnalysisCapabilities');

  const analyze = await inject(app, 'POST', '/image-analysis/analyze', token, {
    subjectType: 'leaf',
    analysisKind: 'disease',
    language: 'en',
    contentBase64: 'aW1hZ2UtYnl0ZXM=',
    mimeType: 'image/png',
    crop: 'rice',
    includeReferences: true,
  });
  assert.equal(analyze.statusCode, 200, analyze.body);
  const analyzeCall = fakeGateway.calls.at(-1);
  assert.equal(analyzeCall.operation, 'analyzeImage');
  assert.equal(analyzeCall.input.subjectType, 'leaf');
  assert.equal(analyzeCall.input.analysisKind, 'disease');
  assert.equal(analyzeCall.metadata.organizationId, organization.id);
  assert.ok(!('organizationId' in analyzeCall.input));
  assert.ok(!('farmerId' in analyzeCall.input));

  const analysisId = 'analysis-node-1';
  const imageFeedback = await inject(app, 'POST', '/image-analysis/feedback', token, {
    analysisId,
    rating: 4,
    labels: ['needs-review'],
  });
  assert.equal(imageFeedback.statusCode, 200, imageFeedback.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'submitImageFeedback');

  const review = await inject(app, 'POST', '/image-analysis/reviews', token, {
    analysisId,
    priority: 'urgent',
  });
  assert.equal(review.statusCode, 200, review.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'requestExpertReview');

  const reviewId = 'review-node-1';
  const decision = await inject(app, 'POST', '/image-analysis/reviews/decide', token, {
    reviewId,
    decision: 'needs_followup',
    reviewer: 'Expert User',
  });
  assert.equal(decision.statusCode, 200, decision.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'decideExpertReview');

  const getReview = await inject(app, 'GET', `/image-analysis/reviews/${reviewId}`, token);
  assert.equal(getReview.statusCode, 200, getReview.body);
  const getReviewCall = fakeGateway.calls.at(-1);
  assert.equal(getReviewCall.operation, 'getExpertReview');
  assert.equal(getReviewCall.input.reviewId, reviewId);

  const frameworkCapabilities = await inject(
    app,
    'GET',
    '/evaluation/framework/capabilities',
    token,
  );
  assert.equal(frameworkCapabilities.statusCode, 200, frameworkCapabilities.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'evaluationFrameworkCapabilities');

  const run = await inject(app, 'POST', '/evaluation/framework/runs', token, {
    suite: 'retrieval',
    modelVersions: { llm: 'model-v1' },
    promptVersions: { 'ask.en': '1.0.0' },
  });
  assert.equal(run.statusCode, 200, run.body);
  const runCall = fakeGateway.calls.at(-1);
  assert.equal(runCall.operation, 'runEvaluation');
  assert.equal(runCall.input.suite, 'retrieval');
  assert.ok(!('scores' in runCall.input));

  const runId = 'eval-node-1';
  const getRun = await inject(app, 'GET', `/evaluation/framework/runs/${runId}`, token);
  assert.equal(getRun.statusCode, 200, getRun.body);
  const getRunCall = fakeGateway.calls.at(-1);
  assert.equal(getRunCall.operation, 'getEvaluationRun');
  assert.equal(getRunCall.input.runId, runId);

  const evaluationFeedback = await inject(app, 'POST', '/evaluation/framework/feedback', token, {
    traceId: 'trace-eval-1',
    rating: 5,
    labels: ['grounded'],
    runId,
  });
  assert.equal(evaluationFeedback.statusCode, 200, evaluationFeedback.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'submitEvaluationFeedback');

  const baseline = await inject(app, 'POST', '/evaluation/framework/baselines', token, { runId });
  assert.equal(baseline.statusCode, 200, baseline.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'createRegressionBaseline');

  const baselines = await inject(app, 'GET', '/evaluation/framework/baselines', token);
  assert.equal(baselines.statusCode, 200, baselines.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'listRegressionBaselines');

  const regression = await inject(app, 'POST', '/evaluation/framework/regression', token, {
    runId,
    baselineId: 'baseline-node-1',
    tolerance: 0.01,
  });
  assert.equal(regression.statusCode, 200, regression.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'checkRegression');

  const comparison = await inject(app, 'POST', '/evaluation/framework/comparison', token, {
    runIds: [runId, 'eval-node-2'],
  });
  assert.equal(comparison.statusCode, 200, comparison.body);
  assert.equal(fakeGateway.calls.at(-1).operation, 'compareEvaluations');

  for (const [path, operation] of [
    ['/evaluation/framework/diagnostics', 'retrievalDiagnostics'],
    ['/evaluation/framework/dashboards/failures', 'failureDashboard'],
    ['/evaluation/framework/monitoring', 'agentMonitoring'],
    ['/evaluation/framework/prompts', 'promptVersions'],
  ]) {
    const response = await inject(app, 'GET', path, token);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(fakeGateway.calls.at(-1).operation, operation);
  }

  const badAnalysis = await inject(app, 'POST', '/image-analysis/analyze', token, {
    subjectType: 'leaf',
    contentBase64: 'aW1hZ2U=',
    organizationId: organization.id,
  });
  assert.equal(badAnalysis.statusCode, 400);
  assert.equal(badAnalysis.json().error, 'validation_error');

  const badRun = await inject(app, 'POST', '/evaluation/framework/runs', token, {
    suite: 'retrieval',
    scores: { passRate: 1 },
  });
  assert.equal(badRun.statusCode, 400);
  assert.equal(badRun.json().error, 'validation_error');
});

test('agentic approval and graph build require feedback permission', async (t) => {
  const fakeGateway = createFakeGateway();
  const app = await createApp(t, fakeGateway);
  await createUser(app, 'buyer-agentic-ai@example.com', 'BUYER');
  const token = await login(app, 'buyer-agentic-ai@example.com');

  const retrieval = await inject(app, 'POST', '/graph/retrieve', token, { query: 'rice blast' });
  assert.equal(retrieval.statusCode, 200, retrieval.body);

  const extraction = await inject(app, 'POST', '/graph/extract', token, {
    text: 'Rice blast affects rice.',
    source: 'Buyer read-only note',
    sourceReference: 'buyer-graph-v1',
  });
  assert.equal(extraction.statusCode, 200, extraction.body);

  const build = await inject(app, 'POST', '/graph/build', token, {
    extraction: {
      text: 'Rice blast affects rice.',
      source: 'Buyer read-only note',
      sourceReference: 'buyer-graph-v1',
    },
  });
  assert.equal(build.statusCode, 403);
  assert.equal(build.json().error, 'forbidden');

  const approve = await inject(app, 'POST', '/agentic/approve', token, {
    traceId: 'trace-buyer-approval',
    approval: {
      approvalId: 'approval-buyer',
      approvedBy: 'buyer',
      decision: 'approved',
    },
  });
  assert.equal(approve.statusCode, 403);
  assert.equal(approve.json().error, 'forbidden');

  assert.deepEqual(
    fakeGateway.calls.map((call) => call.operation),
    ['graphRetrieve', 'graphExtract'],
  );
});

test('agentic and graph inputs reject tenant and business record identifiers', async (t) => {
  const fakeGateway = createFakeGateway();
  const app = await createApp(t, fakeGateway);
  await createUser(app, 'validator-agentic-ai@example.com', 'AGRICULTURAL_EXPERT');
  const token = await login(app, 'validator-agentic-ai@example.com');

  const farmId = await inject(app, 'POST', '/agentic/run', token, {
    query: 'rice blast',
    farmId: 'farm-secret',
  });
  assert.equal(farmId.statusCode, 400);
  assert.equal(farmId.json().error, 'validation_error');

  const farmerId = await inject(app, 'POST', '/graph/retrieve', token, {
    query: 'rice blast',
    farmerId: 'farmer-secret',
  });
  assert.equal(farmerId.statusCode, 400);
  assert.equal(farmerId.json().error, 'validation_error');

  const organizationId = await inject(app, 'POST', '/graph/extract', token, {
    text: 'Rice blast affects rice.',
    source: 'Node validator note',
    sourceReference: 'node-validation-v1',
    organizationId: 'org-other',
  });
  assert.equal(organizationId.statusCode, 400);
  assert.equal(organizationId.json().error, 'validation_error');

  const missingApprover = await inject(app, 'POST', '/agentic/approve', token, {
    traceId: 'trace-invalid-approval',
    approval: { approvalId: 'approval-invalid', decision: 'approved' },
  });
  assert.equal(missingApprover.statusCode, 400);
  assert.equal(missingApprover.json().error, 'validation_error');

  assert.equal(fakeGateway.calls.length, 0);
});

test('HTTP gateway signs agentic and GraphRAG requests without trusting client tenant fields', () => {
  const timestamp = '1700000100';
  const cases = [
    {
      operation: 'runAgentic',
      payload: { query: 'rice irrigation', language: 'en' },
      path: '/api/v1/internal/agentic/run',
      method: 'POST',
    },
    {
      operation: 'graphRetrieve',
      payload: { query: 'rice blast', includeGlobal: false },
      path: '/api/v1/internal/graph/retrieve',
      method: 'POST',
    },
    {
      operation: 'graphCapabilities',
      payload: {},
      path: '/api/v1/internal/graph/capabilities',
      method: 'GET',
    },
    {
      operation: 'ingestMultimodalAsset',
      payload: { assetId: 'asset-1', title: 'Research note', source: { name: 'Institute' } },
      path: '/api/v1/internal/multimodal/assets',
      method: 'POST',
    },
    {
      operation: 'retrieveMultimodal',
      payload: { query: 'rice irrigation', topK: 3 },
      path: '/api/v1/internal/multimodal/retrieve',
      method: 'POST',
    },
    {
      operation: 'runUnified',
      payload: { query: 'rice irrigation', topK: 3 },
      path: '/api/v1/internal/orchestration/run',
      method: 'POST',
    },
    {
      operation: 'unifiedCapabilities',
      payload: {},
      path: '/api/v1/internal/orchestration/capabilities',
      method: 'GET',
    },
    {
      operation: 'evaluateUnified',
      payload: { dataset: 'image', topK: 3 },
      path: '/api/v1/internal/orchestration/evaluation',
      method: 'POST',
    },
  ];

  for (const testCase of cases) {
    const body = testCase.method === 'GET' ? '' : JSON.stringify(testCase.payload);
    const expected = createHmac('sha256', AI_SECRET)
      .update(
        `${testCase.method}\n${testCase.path}\n${timestamp}\n${createHash('sha256')
          .update(body)
          .digest('hex')}`,
      )
      .digest('hex');
    const request = buildGatewayRequest({
      baseUrl: 'http://127.0.0.1:4100',
      serviceId: 'cropsy-business-api',
      secret: AI_SECRET,
      operation: testCase.operation,
      payload: testCase.payload,
      metadata: {
        requestId: REQUEST_ID,
        organizationId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
      },
      timestamp,
    });
    assert.equal(request.method, testCase.method);
    assert.equal(request.path, testCase.path);
    assert.equal(request.body, body);
    assert.equal(request.headers['x-cropsy-signature'], expected);
    assert.equal(request.headers['x-organization-id'], '11111111-1111-1111-1111-111111111111');
    assert.ok(!JSON.stringify(request.body).includes('farmId'));
    assert.ok(!request.body.includes('11111111-1111-1111-1111-111111111111'));
  }

  assert.equal(AI_OPERATIONS.length, 46);
  for (const operation of [
    'listConversations',
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
  ]) {
    assert.ok(AI_OPERATIONS.includes(operation));
  }
  const configured = new HttpAiGateway({
    baseUrl: 'http://127.0.0.1:4100',
    secret: AI_SECRET,
  });
  assert.deepEqual(configured.describe().operations, [...AI_OPERATIONS]);
});

test('gateway GET calls do not pass a body to fetch', async () => {
  let captured;
  const gateway = new HttpAiGateway({
    baseUrl: 'http://127.0.0.1:4100',
    secret: AI_SECRET,
    timestamp: '1700000300',
    fetcher: async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { ok: true } }),
      };
    },
  });

  const result = await gateway.describeAiCapabilities(
    {},
    {
      requestId: REQUEST_ID,
      organizationId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(captured.init.method, 'GET');
  assert.ok(!Object.prototype.hasOwnProperty.call(captured.init, 'body'));
});

test('image and evaluation gateway operations sign dynamic paths and empty GET bodies', () => {
  const timestamp = '1700000200';
  const organizationId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const cases = [
    {
      operation: 'analyzeImage',
      payload: { subjectType: 'leaf', contentBase64: 'aW1hZ2U=', language: 'en' },
      path: '/api/v1/internal/image-analysis/analyze',
      method: 'POST',
    },
    {
      operation: 'imageAnalysisCapabilities',
      payload: {},
      path: '/api/v1/internal/image-analysis/capabilities',
      method: 'GET',
    },
    {
      operation: 'submitImageFeedback',
      payload: { analysisId: 'img-node-1', rating: 4 },
      path: '/api/v1/internal/image-analysis/feedback',
      method: 'POST',
    },
    {
      operation: 'requestExpertReview',
      payload: { analysisId: 'img-node-1', priority: 'urgent' },
      path: '/api/v1/internal/image-analysis/reviews',
      method: 'POST',
    },
    {
      operation: 'decideExpertReview',
      payload: { reviewId: 'review-node-1', decision: 'approved', reviewer: 'Expert' },
      path: '/api/v1/internal/image-analysis/reviews/decide',
      method: 'POST',
    },
    {
      operation: 'getExpertReview',
      payload: { reviewId: 'review:1' },
      path: '/api/v1/internal/image-analysis/reviews/review%3A1',
      method: 'GET',
    },
    {
      operation: 'evaluationFrameworkCapabilities',
      payload: {},
      path: '/api/v1/internal/evaluation/framework/capabilities',
      method: 'GET',
    },
    {
      operation: 'runEvaluation',
      payload: { suite: 'retrieval', modelVersions: { llm: 'model-v1' } },
      path: '/api/v1/internal/evaluation/framework/runs',
      method: 'POST',
    },
    {
      operation: 'getEvaluationRun',
      payload: { runId: 'eval:2' },
      path: '/api/v1/internal/evaluation/framework/runs/eval%3A2',
      method: 'GET',
    },
    {
      operation: 'submitEvaluationFeedback',
      payload: { traceId: 'trace-1', rating: 3, labels: ['needs-review'] },
      path: '/api/v1/internal/evaluation/framework/feedback',
      method: 'POST',
    },
    {
      operation: 'createRegressionBaseline',
      payload: { runId: 'eval-node-1' },
      path: '/api/v1/internal/evaluation/framework/baselines',
      method: 'POST',
    },
    {
      operation: 'listRegressionBaselines',
      payload: {},
      path: '/api/v1/internal/evaluation/framework/baselines',
      method: 'GET',
    },
    {
      operation: 'checkRegression',
      payload: { runId: 'eval-node-1', baselineId: 'baseline-node-1' },
      path: '/api/v1/internal/evaluation/framework/regression',
      method: 'POST',
    },
    {
      operation: 'compareEvaluations',
      payload: { runIds: ['eval-node-1', 'eval-node-2'] },
      path: '/api/v1/internal/evaluation/framework/comparison',
      method: 'POST',
    },
    {
      operation: 'retrievalDiagnostics',
      payload: {},
      path: '/api/v1/internal/evaluation/framework/diagnostics',
      method: 'GET',
    },
    {
      operation: 'failureDashboard',
      payload: {},
      path: '/api/v1/internal/evaluation/framework/dashboards/failures',
      method: 'GET',
    },
    {
      operation: 'agentMonitoring',
      payload: {},
      path: '/api/v1/internal/evaluation/framework/monitoring',
      method: 'GET',
    },
    {
      operation: 'promptVersions',
      payload: {},
      path: '/api/v1/internal/evaluation/framework/prompts',
      method: 'GET',
    },
  ];

  for (const testCase of cases) {
    const body = testCase.method === 'GET' ? '' : JSON.stringify(testCase.payload);
    const request = buildGatewayRequest({
      baseUrl: 'http://127.0.0.1:4100/',
      serviceId: 'cropsy-business-api',
      secret: AI_SECRET,
      operation: testCase.operation,
      payload: testCase.payload,
      metadata: { requestId: REQUEST_ID, organizationId, userId },
      timestamp,
    });
    const expected = createHmac('sha256', AI_SECRET)
      .update(
        `${testCase.method}\n${testCase.path}\n${timestamp}\n${createHash('sha256')
          .update(body)
          .digest('hex')}`,
      )
      .digest('hex');

    assert.equal(request.method, testCase.method);
    assert.equal(request.path, testCase.path);
    assert.equal(request.body, body);
    assert.equal(request.headers['x-cropsy-signature'], expected);
    assert.equal(request.headers['x-organization-id'], organizationId);
    assert.equal(request.headers['x-user-id'], userId);
    assert.ok(!request.body.includes(organizationId));
    assert.ok(!JSON.stringify(request.body).includes('farmerId'));
  }

  const missingIds = [
    ['getExpertReview', {}, /review id is required/],
    ['getEvaluationRun', {}, /evaluation run id is required/],
  ];
  for (const [operation, payload, pattern] of missingIds) {
    assert.throws(
      () =>
        buildGatewayRequest({
          baseUrl: 'http://127.0.0.1:4100',
          serviceId: 'cropsy-business-api',
          secret: AI_SECRET,
          operation,
          payload,
          metadata: { organizationId },
          timestamp,
        }),
      pattern,
    );
  }

  const unavailable = new UnavailableAiGateway();
  for (const method of Object.values(AI_GATEWAY_METHODS)) {
    assert.throws(
      () => unavailable[method]({}),
      (error) => error.code === 'ai_service_unavailable',
      `missing unavailable adapter method: ${method}`,
    );
  }
});

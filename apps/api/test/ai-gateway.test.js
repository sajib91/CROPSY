const assert = require('node:assert/strict');
const { createHash, createHmac } = require('node:crypto');
const test = require('node:test');

const buildServer = require('../src/app');
const { AuthStoreToken } = require('../src/modules/iam/domain/auth.repository');
const {
  buildGatewayRequest,
  buildGatewaySignature,
  UnavailableAiGateway,
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
    evaluateRetrievalAi: handler('evaluateRetrieval'),
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

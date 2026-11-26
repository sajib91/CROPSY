const assert = require('node:assert/strict');
const test = require('node:test');

const buildServer = require('../src/app');
const { AuthStoreToken } = require('../src/modules/iam/domain/auth.repository');
const { authTestEnv, bearer, loginUser, register, verifyOtp } = require('./support/auth-fixtures');

const CATALOG = '/api/v1/catalog';
const MARKETPLACE = '/api/v1/marketplace';
const MARKET = '/api/v1/market-intelligence';
const PASSWORD = 'StrongPass123!';
const AI_SECRET = 'test-ai-secret-at-least-32-characters-long';

function createFakeGateway() {
  const calls = [];
  const handler = (operation) => async (input, metadata) => {
    calls.push({ operation, input, metadata });
    return {
      operation,
      advisory: true,
      evidence: [{ citation: 'verified-doc:v1#chunk-1' }],
      mlPredictions: [],
    };
  };
  return {
    calls,
    retrieveAi: handler('retrieve'),
    forecastMarketAi: handler('forecastMarket'),
    explainMarketAi: handler('explainMarket'),
  };
}

async function createApp(t, aiGateway) {
  const app = await buildServer({
    env: authTestEnv({ AI_SERVICE_SECRET: AI_SECRET }),
    logger: false,
    aiGateway,
  });
  t.after(() => app.close());
  return app;
}

async function createFarmer(app) {
  const registration = await register(app, {
    email: 'market-expert@example.com',
    roles: ['FARMER'],
  });
  assert.equal(registration.response.statusCode, 201, registration.response.body);
  const verification = await verifyOtp(app, {
    channel: 'email',
    purpose: 'EMAIL_VERIFICATION',
    destination: 'market-expert@example.com',
    code: registration.code,
  });
  assert.equal(verification.response.statusCode, 200, verification.response.body);
  const store = app.cropsyContainer.resolve(AuthStoreToken);
  const organization = await store.createOrganization({
    name: 'Market intelligence tenant',
    ownerUserId: registration.user.id,
  });
  await store.addOrganizationMember({
    organizationId: organization.id,
    userId: registration.user.id,
    status: 'ACTIVE',
  });
  const login = await loginUser(app, 'market-expert@example.com', PASSWORD);
  assert.equal(login.response.statusCode, 200, login.response.body);
  return { user: registration.user, token: login.tokens.accessToken, organization };
}

async function request(app, method, url, token, payload) {
  const response = await app.inject({
    method,
    url,
    headers: token ? bearer(token) : {},
    ...(payload === undefined ? {} : { payload }),
  });
  return { response, body: response.json() };
}

async function success(app, method, url, token, payload, status = 200) {
  const result = await request(app, method, url, token, payload);
  assert.equal(result.response.statusCode, status, JSON.stringify(result.body));
  return result.body.data;
}

async function createListing(app, token) {
  const units = await success(app, 'GET', `${CATALOG}/units`, token);
  if (!units.units.some((unit) => unit.code === 'KG')) {
    await success(
      app,
      'POST',
      `${CATALOG}/units`,
      token,
      { code: 'KG', name: 'Kilogram', nameBn: 'কিলোগ্রাম' },
      201,
    );
  }
  const categories = await success(app, 'GET', `${CATALOG}/categories`, token);
  let category = categories.categories.find((item) => item.code === 'GRAINS');
  if (!category) {
    category = await success(
      app,
      'POST',
      `${CATALOG}/categories`,
      token,
      { code: 'GRAINS', name: 'Grains', nameBn: 'শস্য' },
      201,
    );
  }
  const grade = await success(
    app,
    'POST',
    `${CATALOG}/quality-grades`,
    token,
    { code: 'MARKET-GRADE-A', name: 'Grade A', nameBn: 'এ গ্রেড' },
    201,
  );
  const product = await success(
    app,
    'POST',
    `${CATALOG}/products`,
    token,
    {
      categoryId: category.id,
      sku: 'MARKET-RICE-INTEL-1',
      name: 'Aromatic rice',
      nameBn: 'সুগন্ধি চাল',
      unitCode: 'KG',
    },
    201,
  );
  const listing = await success(
    app,
    'POST',
    `${MARKETPLACE}/listings`,
    token,
    {
      productId: product.id,
      status: 'ACTIVE',
      title: 'Fresh aromatic rice',
      unitPrice: 120,
      currency: 'BDT',
      quantityAvailable: 500,
      minOrderQuantity: 5,
      qualityGradeId: grade.id,
      availableLocation: 'Dhaka',
      locations: [{ label: 'Dhaka wholesale market', latitude: 23.8103, longitude: 90.4125 }],
    },
    201,
  );
  return { product, listing };
}

test('market intelligence observes real listings with provenance and no live quote claim', async (t) => {
  const aiGateway = createFakeGateway();
  const app = await createApp(t, aiGateway);
  const { token } = await createFarmer(app);
  const { product, listing } = await createListing(app, token);

  const denied = await request(app, 'GET', `${MARKET}/observations?productId=${product.id}`, null);
  assert.equal(denied.response.statusCode, 401);

  const history = await success(
    app,
    'GET',
    `${MARKET}/prices/history?productId=${product.id}`,
    token,
  );
  assert.equal(history.observations.length, 1);
  const observation = history.observations[0];
  assert.equal(observation.listingId, listing.id);
  assert.equal(observation.price, 120);
  assert.equal(observation.currency, 'BDT');
  assert.equal(observation.evidenceClass, 'historical_observation');
  assert.equal(observation.collectionMethod, 'seller_submitted_listing');
  assert.equal(observation.sourceReference, `listing:${listing.id}`);
  assert.equal(history.dataQuality.noLiveQuoteClaim, true);
  assert.deepEqual(history.evidenceClasses, ['historical_observation']);
  assert.equal(history.summary.median, 120);
  assert.equal(history.externalEvidence.available, true);
  assert.deepEqual(history.externalEvidence.citations, ['verified-doc:v1#chunk-1']);

  const regions = await success(
    app,
    'GET',
    `${MARKET}/prices/regions?productId=${product.id}`,
    token,
  );
  assert.equal(regions.regions[0].region, 'Dhaka');
  assert.equal(regions.regions[0].summary.median, 120);

  const supply = await success(
    app,
    'GET',
    `${MARKET}/supply-demand?productId=${product.id}`,
    token,
  );
  assert.equal(supply.regions[0].supply.activeListings, 1);
  assert.equal(supply.regions[0].supply.availableQuantity, 500);
  assert.match(supply.limitations.join(' '), /not verified consumption demand/);

  const trends = await success(
    app,
    'GET',
    `${MARKET}/trends?productId=${product.id}&granularity=day`,
    token,
  );
  assert.equal(trends.chart.series.length, 1);
  assert.equal(trends.chart.series[0].y, 120);
});

test('market forecast forwards only collected observations and handles absent data explicitly', async (t) => {
  const aiGateway = createFakeGateway();
  const app = await createApp(t, aiGateway);
  const { token, user, organization } = await createFarmer(app);
  const { product, listing } = await createListing(app, token);

  const forecast = await success(app, 'POST', `${MARKET}/forecast`, token, {
    productId: product.id,
    region: 'Dhaka',
    horizon: 2,
    model: 'moving_average',
    language: 'bn',
  });
  assert.equal(forecast.operation, 'forecastMarket');
  const call = aiGateway.calls.find((item) => item.operation === 'forecastMarket');
  assert.equal(call.input.observations.length, 1);
  assert.equal(call.input.observations[0].listingId, listing.id);
  assert.equal(call.input.observations[0].evidenceClass, 'historical_observation');
  assert.equal(call.input.horizon, 2);
  assert.equal(call.input.language, 'bn');
  assert.equal(call.metadata.userId, user.id);
  assert.equal(call.metadata.organizationId, organization.id);

  const empty = await success(app, 'POST', `${MARKET}/forecast`, token, {
    productId: '00000000-0000-0000-0000-000000000000',
  });
  assert.deepEqual(empty.historicalObservations, []);
  assert.equal(empty.evaluation.evaluated, false);
  assert.equal(empty.evaluation.reason, 'no_collected_observations');
  assert.equal(aiGateway.calls.filter((item) => item.operation === 'forecastMarket').length, 1);

  const invalid = await request(app, 'POST', `${MARKET}/forecast`, token, {
    productId: product.id,
    horizon: 99,
  });
  assert.equal(invalid.response.statusCode, 400);
});

test('market intelligence module info stays public and validates its path parameter', async (t) => {
  const app = await createApp(t, createFakeGateway());
  const info = await request(app, 'GET', `${MARKET}/info`, null);
  assert.equal(info.response.statusCode, 200);
  assert.equal(info.body.data.moduleId, 'market-intelligence');

  const invalid = await request(app, 'GET', `${MARKET}/info/not-the-module`, null);
  assert.equal(invalid.response.statusCode, 404);
});

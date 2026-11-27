const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');

const { AnalyticsService } = require('../src/modules/analytics/application/analytics.service');
const {
  AnalyticsInMemoryRepository,
  AnalyticsInMemoryStore,
} = require('../src/modules/analytics/infrastructure');
const { bearer, createTenantFixture, loginUser, register } = require('./support/auth-fixtures');

const ANALYTICS = '/api/v1/analytics';
const FROM = '2026-01-01T00:00:00.000Z';
const TO = '2026-06-30T23:59:59.000Z';

const TENANT_REPORTS = Object.freeze([
  ['farmers/production', 'farmer.production'],
  ['farmers/crop-yield', 'farmer.crop-yield'],
  ['farmers/cultivation-expenses', 'farmer.cultivation-expenses'],
  ['farmers/profitability', 'farmer.profitability'],
  ['farmers/sales', 'farmer.sales'],
  ['buyers/purchase-history', 'buyer.purchase-history'],
  ['buyers/spending', 'buyer.spending'],
  ['buyers/supplier-performance', 'buyer.supplier-performance'],
  ['buyers/product-trends', 'buyer.product-trends'],
  ['sellers/sales-performance', 'seller.sales-performance'],
  ['sellers/inventory', 'seller.inventory'],
  ['sellers/order-fulfillment', 'seller.order-fulfillment'],
  ['sellers/revenue', 'seller.revenue'],
]);

const PLATFORM_REPORTS = Object.freeze([
  ['platform/user-growth', 'platform.user-growth'],
  ['platform/marketplace-activity', 'platform.marketplace-activity'],
  ['platform/order-volume', 'platform.order-volume'],
  ['platform/regional-activity', 'platform.regional-activity'],
  ['platform/product-demand', 'platform.product-demand'],
  ['platform/revenue', 'platform.revenue'],
  ['platform/ai-usage', 'platform.ai-usage'],
]);

function periodQuery(organizationId) {
  const params = new URLSearchParams({ from: FROM, to: TO });
  if (organizationId) params.set('organizationId', organizationId);
  return `?${params.toString()}`;
}

async function request(app, method, url, token, headers = {}) {
  const response = await app.inject({
    method,
    url,
    headers: { ...(token ? bearer(token) : {}), ...headers },
  });
  return { response, body: response.json() };
}

async function success(app, url, token, status = 200) {
  const result = await request(app, 'GET', url, token);
  assert.equal(result.response.statusCode, status, JSON.stringify(result.body));
  assert.equal(result.body.success, true);
  return result.body.data;
}

async function createAnalyticsFixture(t) {
  const store = new AnalyticsInMemoryStore();
  const fixture = await createTenantFixture(
    t,
    { ANALYTICS_STORE: 'memory' },
    { analyticsStore: store },
  );

  const peerLogin = await loginUser(fixture.app, 'peer@example.com');
  assert.equal(peerLogin.response.statusCode, 200, JSON.stringify(peerLogin.body));

  const root = await register(fixture.app, {
    email: `analytics-root-${randomUUID()}@example.com`,
    roles: ['FARMER'],
  });
  assert.equal(root.response.statusCode, 201, JSON.stringify(root.body));
  await fixture.store.addUserRole({
    userId: root.user.id,
    roleCode: 'CROPSY_SUPER_ADMIN',
    grantedBy: root.user.id,
  });
  const rootLogin = await loginUser(fixture.app, root.user.email);
  assert.equal(rootLogin.response.statusCode, 200, JSON.stringify(rootLogin.body));

  store.rowsByReport = {
    'farmer.production': [
      {
        organizationId: fixture.orgA.id,
        actorUserId: fixture.adminId,
        period_start: '2026-01-15T00:00:00.000Z',
        dimension: 'Rice',
        value: 10,
        records: 1,
      },
      {
        organizationId: fixture.orgA.id,
        actorUserId: fixture.peerId,
        period_start: '2026-02-15T00:00:00.000Z',
        dimension: 'Rice',
        value: 20,
        records: 2,
      },
      {
        organizationId: fixture.orgA.id,
        actorUserId: fixture.adminId,
        period_start: '2026-03-15T00:00:00.000Z',
        dimension: 'Wheat',
        value: 30,
        records: 3,
      },
      {
        organizationId: fixture.orgB.id,
        actorUserId: fixture.otherOrgUserId,
        period_start: '2026-04-15T00:00:00.000Z',
        dimension: 'Rice',
        value: 999,
        records: 1,
      },
    ],
    'farmer.sales': [
      {
        organizationId: fixture.orgA.id,
        actorUserId: fixture.adminId,
        period_start: '2026-01-15T00:00:00.000Z',
        dimension: 'PAID',
        value: 5,
        records: 1,
      },
      {
        organizationId: fixture.orgA.id,
        actorUserId: fixture.adminId,
        period_start: '2026-02-15T00:00:00.000Z',
        dimension: 'PAID',
        value: 7,
        records: 1,
      },
    ],
    'platform.user-growth': [
      {
        period_start: '2026-01-31T23:00:00.000Z',
        dimension: 'ACTIVE',
        value: 2,
        records: 2,
      },
    ],
  };

  return {
    ...fixture,
    store,
    peerToken: peerLogin.tokens.accessToken,
    rootToken: rootLogin.tokens.accessToken,
  };
}

test('analytics exposes all 20 reports behind authentication and permissions', async (t) => {
  const { app, adminToken, rootToken } = await createAnalyticsFixture(t);

  const info = await request(app, 'GET', `${ANALYTICS}/info`);
  assert.equal(info.response.statusCode, 200);
  assert.equal(info.body.data.moduleId, 'analytics');
  assert.equal(info.body.data.reports.length, 20);
  assert.deepEqual(info.body.data.dataClassifications, ['historical', 'calculated', 'predictive']);

  const unauthenticated = await request(
    app,
    'GET',
    `${ANALYTICS}/farmers/production${periodQuery()}`,
  );
  assert.equal(unauthenticated.response.statusCode, 401);

  const forbidden = await request(
    app,
    'GET',
    `${ANALYTICS}/platform/user-growth${periodQuery()}`,
    adminToken,
  );
  assert.equal(forbidden.response.statusCode, 403);
  assert.equal(forbidden.body.meta.details.permission, 'analytics.platform.read');

  for (const [path, report] of TENANT_REPORTS) {
    const data = await success(app, `${ANALYTICS}/${path}${periodQuery()}`, adminToken);
    assert.equal(data.report, report);
    assert.equal(data.scope, 'organization');
    assert.deepEqual(data.classification.values, ['historical', 'calculated', 'predictive']);
  }

  for (const [path, report] of PLATFORM_REPORTS) {
    const data = await success(app, `${ANALYTICS}/${path}${periodQuery()}`, rootToken);
    assert.equal(data.report, report);
    assert.equal(data.scope, 'platform');
  }
});

test('tenant analytics cannot cross organizations or expose other users rows', async (t) => {
  const { app, adminToken, peerToken, rootToken, orgA, orgB } = await createAnalyticsFixture(t);

  const adminRows = await success(
    app,
    `${ANALYTICS}/farmers/production${periodQuery()}`,
    adminToken,
  );
  assert.equal(adminRows.organizationId, orgA.id);
  assert.equal(adminRows.historical.rowCount, 3);
  assert.deepEqual(
    adminRows.historical.rows.map((row) => row.value),
    [10, 20, 30],
  );
  assert.ok(adminRows.historical.rows.every((row) => row.organizationId === orgA.id));

  const crossTenant = await request(
    app,
    'GET',
    `${ANALYTICS}/farmers/production${periodQuery(orgB.id)}`,
    adminToken,
  );
  assert.equal(crossTenant.response.statusCode, 403);
  assert.equal(crossTenant.body.meta.details.code, 'cross_organization_access_denied');

  const peerRows = await success(app, `${ANALYTICS}/farmers/production${periodQuery()}`, peerToken);
  assert.equal(peerRows.organizationId, orgA.id);
  assert.equal(peerRows.historical.rowCount, 1);
  assert.deepEqual(
    peerRows.historical.rows.map((row) => row.value),
    [20],
  );

  const rootRows = await success(
    app,
    `${ANALYTICS}/farmers/production${periodQuery(orgB.id)}`,
    rootToken,
  );
  assert.equal(rootRows.organizationId, orgB.id);
  assert.deepEqual(
    rootRows.historical.rows.map((row) => row.value),
    [999],
  );

  const rootWithoutTenant = await request(
    app,
    'GET',
    `${ANALYTICS}/farmers/production${periodQuery()}`,
    rootToken,
  );
  assert.equal(rootWithoutTenant.response.statusCode, 403);
  assert.equal(rootWithoutTenant.body.meta.details.code, 'organization_context_required');
});

test('historical calculated and predictive sections remain explicitly separated', async (t) => {
  const { app, adminToken } = await createAnalyticsFixture(t);

  const data = await success(app, `${ANALYTICS}/farmers/production${periodQuery()}`, adminToken);

  assert.deepEqual(data.classification.values, ['historical', 'calculated', 'predictive']);
  assert.match(data.classification.historical, /recorded CROPSY business events/);
  assert.match(data.classification.calculated, /computed in the application layer/);
  assert.match(data.classification.predictive, /decision-support projection/);

  assert.deepEqual(data.historical.sourceTables, ['harvests', 'cultivations', 'farms', 'crops']);
  assert.equal(data.historical.rowCount, 3);
  assert.deepEqual(
    data.historical.rows.map((row) => row.period),
    ['2026-01-15T00:00:00.000Z', '2026-02-15T00:00:00.000Z', '2026-03-15T00:00:00.000Z'],
  );

  assert.equal(data.calculated.basis, 'historical');
  assert.equal(data.calculated.valueUnit, 'kg');
  assert.deepEqual(data.calculated.metrics, {
    total: 60,
    recordCount: 3,
    sourceRecordCount: 6,
    average: 20,
    latestBucketTotal: 30,
    previousBucketTotal: 20,
    changePercent: 50,
  });
  assert.deepEqual(
    data.calculated.series.map((bucket) => bucket.period),
    ['2026-01', '2026-02', '2026-03'],
  );
  assert.deepEqual(
    data.calculated.breakdown.map((entry) => [entry.dimension, entry.value]),
    [
      ['Rice', 30],
      ['Wheat', 30],
    ],
  );

  assert.equal(data.predictive.classification, 'predictive');
  assert.equal(data.predictive.available, true);
  assert.equal(data.predictive.method, 'linear_trend_extrapolation');
  assert.equal(data.predictive.basisPoints, 3);
  assert.equal(data.predictive.nextPeriod, '2026-04');
  assert.equal(data.predictive.projectedValue, 40);
  assert.equal(data.predictive.confidence, 'not_calibrated');
});

test('analytics validates queries and withholds projections without enough history', async (t) => {
  const { app, adminToken, rootToken } = await createAnalyticsFixture(t);

  const insufficient = await success(app, `${ANALYTICS}/farmers/sales${periodQuery()}`, adminToken);
  assert.equal(insufficient.historical.rowCount, 2);
  assert.equal(insufficient.predictive.available, false);
  assert.equal(insufficient.predictive.basisPoints, 0);
  assert.equal(insufficient.predictive.nextPeriod, null);
  assert.equal(insufficient.predictive.projectedValue, null);
  assert.match(insufficient.predictive.caveat, /No value was invented/);

  for (const query of ['grain=year', 'limit=0', 'limit=501', 'grain=day&limit=100']) {
    const separator = periodQuery().includes('?') ? '&' : '?';
    const result = await request(
      app,
      'GET',
      `${ANALYTICS}/farmers/production${periodQuery()}${separator}${query}`,
      adminToken,
    );
    assert.equal(result.response.statusCode, query === 'grain=day&limit=100' ? 200 : 400);
  }

  const invalidPeriod = await request(
    app,
    'GET',
    `${ANALYTICS}/farmers/production?from=2026-06-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z`,
    adminToken,
  );
  assert.equal(invalidPeriod.response.statusCode, 400);
  assert.equal(invalidPeriod.body.meta.details.code, 'invalid_analytics_period');

  // The shared authentication boundary resolves organizationId before route
  // DTOs run, so a malformed tenant identifier is rejected as an invalid
  // organization context rather than reaching the analytics DTO.
  const invalidOrganization = await request(
    app,
    'GET',
    `${ANALYTICS}/platform/user-growth${periodQuery('not-a-uuid')}`,
    rootToken,
  );
  assert.equal(invalidOrganization.response.statusCode, 403);
  assert.equal(invalidOrganization.body.meta.details.code, 'invalid_organization_context');
});

test('analytics failures are explicit and never invent a platform projection', async () => {
  const context = {
    user: { id: '00000000-0000-0000-0000-000000000001' },
    organizationId: '00000000-0000-0000-0000-000000000002',
    roles: [],
  };
  const service = new AnalyticsService({
    repository: new AnalyticsInMemoryRepository(),
    store: {
      async readReport() {
        throw new Error('store unavailable');
      },
    },
    metadata: {
      id: 'analytics',
      name: 'Analytics',
      path: 'analytics',
      dependsOn: [],
      publishes: [],
      subscribes: [],
    },
  });

  await assert.rejects(
    () => service.getReport({ context, report: 'not.a.report', query: {} }),
    (error) => error.details?.code === 'unknown_analytics_report',
  );
  await assert.rejects(
    () => service.getReport({ context, report: 'platform.user-growth', query: {} }),
    (error) => error.details?.code === 'platform_analytics_forbidden',
  );
  await assert.rejects(
    () => service.getReport({ context, report: 'farmer.production', query: {} }),
    (error) => error.details?.code === 'analytics_store_unavailable',
  );
});

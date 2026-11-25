const assert = require('node:assert/strict');
const test = require('node:test');

const { IdentityStoreToken } = require('../src/shared/di/tokens');
const { bearer, createTenantFixture, loginUser, register } = require('./support/auth-fixtures');

const BASE = '/api/v1/agriculture';
const FARMS = '/api/v1/farmers/farms';

async function login(app, email) {
  const result = await loginUser(app, email);
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.tokens.accessToken;
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
  assert.equal(result.response.statusCode, status, result.response.body);
  return result.body.data;
}

async function createFarm(app, token, code, organizationId) {
  return success(
    app,
    'POST',
    FARMS,
    token,
    {
      name: `Farm ${code}`,
      code,
      areaValue: 1,
      ...(organizationId ? { organizationId } : {}),
    },
    201,
  );
}

async function createCrop(app, token, code) {
  return success(
    app,
    'POST',
    `${BASE}/crops`,
    token,
    { code, name: `Crop ${code}`, category: 'CEREAL' },
    201,
  );
}

async function createVariety(app, token, cropId, code) {
  return success(
    app,
    'POST',
    `${BASE}/crops/${cropId}/varieties`,
    token,
    { code, name: `Variety ${code}`, maturityDays: 120 },
    201,
  );
}

test('crop catalog calendars and recommendations are tenant configurable', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA, peerId, store } = fixture;
  const peerToken = await login(app, 'peer@example.com');

  const crop = await createCrop(app, adminToken, 'RICE-1');
  const variety = await createVariety(app, adminToken, crop.id, 'BRRI28');
  const updatedVariety = await success(
    app,
    'PATCH',
    `${BASE}/crops/${crop.id}/varieties/${variety.id}`,
    adminToken,
    { maturityDays: 125 },
  );
  assert.equal(updatedVariety.maturityDays, 125);
  const season = await success(
    app,
    'POST',
    `${BASE}/seasons`,
    adminToken,
    {
      organizationId: orgA.id,
      code: 'AMAN-2026',
      name: 'Aman 2026',
      startMonth: 6,
      endMonth: 11,
      year: 2026,
    },
    201,
  );
  const calendar = await success(
    app,
    'POST',
    `${BASE}/calendars`,
    adminToken,
    {
      organizationId: orgA.id,
      scope: 'ORGANIZATION',
      cropId: crop.id,
      cropVarietyId: variety.id,
      code: 'AMAN-CAL',
      name: 'Aman sowing calendar',
      sowingStartMonth: 6,
      sowingEndMonth: 8,
      harvestDaysMin: 100,
      harvestDaysMax: 130,
    },
    201,
  );
  const recommendation = await success(
    app,
    'POST',
    `${BASE}/recommendations`,
    adminToken,
    {
      organizationId: orgA.id,
      scope: 'ORGANIZATION',
      cropId: crop.id,
      cropVarietyId: variety.id,
      calendarId: calendar.id,
      code: 'AMAN-IRRIGATION',
      title: 'Irrigation guidance',
      body: 'Keep soil saturated during flowering.',
      source: 'CONFIGURED',
    },
    201,
  );

  assert.equal(season.organizationId, orgA.id);
  assert.equal(calendar.scopeKey, orgA.id);
  assert.equal(calendar.harvestDaysMax, 130);
  assert.equal(recommendation.source, 'CONFIGURED');
  assert.equal(recommendation.calendarId, calendar.id);

  const crops = await success(app, 'GET', `${BASE}/crops`, adminToken);
  assert.equal(crops.crops.length, 1);
  const varieties = await success(app, 'GET', `${BASE}/varieties?cropId=${crop.id}`, adminToken);
  assert.equal(varieties.varieties[0].cropId, crop.id);
  const calendars = await success(app, 'GET', `${BASE}/calendars?cropId=${crop.id}`, adminToken);
  assert.equal(calendars.calendars.length, 1);
  const recommendations = await success(
    app,
    'GET',
    `${BASE}/recommendations?cropId=${crop.id}`,
    adminToken,
  );
  assert.deepEqual(
    recommendations.recommendations.map((item) => item.code),
    ['AMAN-IRRIGATION'],
  );

  const updated = await success(app, 'PATCH', `${BASE}/calendars/${calendar.id}`, adminToken, {
    harvestDaysMax: 135,
    notes: 'Adjusted by tenant agronomist.',
  });
  assert.equal(updated.harvestDaysMax, 135);
  assert.equal(updated.notes, 'Adjusted by tenant agronomist.');

  const deniedRead = await request(app, 'GET', `${BASE}/crops`, peerToken);
  assert.equal(deniedRead.response.statusCode, 403);
  const deniedWrite = await request(app, 'POST', `${BASE}/crops`, peerToken, {
    code: 'DENIED',
    name: 'Denied',
  });
  assert.equal(deniedWrite.response.statusCode, 403);

  const deniedPlatform = await request(app, 'POST', `${BASE}/calendars`, adminToken, {
    scope: 'GLOBAL',
    cropId: crop.id,
    code: 'GLOBAL-CAL',
    name: 'Global calendar',
    sowingStartMonth: 1,
    sowingEndMonth: 2,
  });
  assert.equal(deniedPlatform.response.statusCode, 403);
  assert.equal(deniedPlatform.body.meta.details.code, 'platform_scope_required');

  const audit = app.cropsyContainer.resolve(IdentityStoreToken);
  for (const action of [
    'agriculture.crop.created',
    'agriculture.variety.created',
    'agriculture.variety.updated',
  ]) {
    assert.ok((await audit.listAudit({ action })).length > 0, `missing audit for ${action}`);
  }
  for (const action of [
    'agriculture.season.created',
    'agriculture.calendar.created',
    'agriculture.recommendation.created',
    'agriculture.calendar.updated',
  ]) {
    assert.ok(
      (await audit.listAudit({ action, organizationId: orgA.id })).length > 0,
      `missing audit for ${action}`,
    );
  }
  assert.equal(peerId.length > 0, true);
  assert.ok(store);
});

test('cultivation activity harvest expenses and profitability are recorded separately from AI estimates', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA, orgB, adminId, store } = fixture;
  const farmerToken = await login(app, 'same-org@example.com');
  const peerToken = await login(app, 'peer@example.com');

  const nonAiAdmin = await register(app, {
    email: 'ops-admin@example.com',
    roles: ['BUYER'],
  });
  assert.equal(nonAiAdmin.response.statusCode, 201, nonAiAdmin.response.body);
  await store.addOrganizationMember({
    organizationId: orgA.id,
    userId: nonAiAdmin.user.id,
    status: 'ACTIVE',
  });
  await store.addUserRole({
    userId: nonAiAdmin.user.id,
    roleCode: 'ORGANIZATION_ADMIN',
    organizationId: orgA.id,
    grantedBy: adminId,
  });
  const opsToken = await login(app, 'ops-admin@example.com');

  const tenantBFarmer = await register(app, {
    email: 'tenant-b-farmer@example.com',
    roles: ['FARMER'],
  });
  assert.equal(tenantBFarmer.response.statusCode, 201, tenantBFarmer.response.body);
  await store.addOrganizationMember({
    organizationId: orgB.id,
    userId: tenantBFarmer.user.id,
    status: 'ACTIVE',
  });
  const tenantBToken = await login(app, 'tenant-b-farmer@example.com');

  const rice = await createCrop(app, adminToken, 'RICE-2');
  const wheat = await createCrop(app, adminToken, 'WHEAT-1');
  const riceVariety = await createVariety(app, adminToken, rice.id, 'RICE-V2');
  const wheatVariety = await createVariety(app, adminToken, wheat.id, 'WHEAT-V1');
  const season = await success(
    app,
    'POST',
    `${BASE}/seasons`,
    adminToken,
    {
      organizationId: orgA.id,
      code: 'RABI-2026',
      name: 'Rabi 2026',
      startMonth: 10,
      endMonth: 3,
      year: 2026,
    },
    201,
  );

  const farmA = await createFarm(app, adminToken, 'AGRI-A', orgA.id);
  const farmB = await createFarm(app, adminToken, 'AGRI-B', orgA.id);

  const cultivationA = await success(
    app,
    'POST',
    `${BASE}/cultivations`,
    adminToken,
    {
      farmId: farmA.id,
      organizationId: orgA.id,
      cropVarietyId: riceVariety.id,
      cropSeasonId: season.id,
      code: 'RICE-PLOT-A',
      status: 'ACTIVE',
      sownAt: '2026-01-01T00:00:00.000Z',
      plantedAt: '2026-01-05T00:00:00.000Z',
      expectedHarvestAt: '2026-04-15T00:00:00.000Z',
      areaHectares: 1.5,
      expectedYieldKg: 1100,
      growthStage: 'VEGETATIVE',
    },
    201,
  );
  const cultivationB = await success(
    app,
    'POST',
    `${BASE}/cultivations`,
    farmerToken,
    {
      farmId: farmB.id,
      cropVarietyId: wheatVariety.id,
      code: 'WHEAT-PLOT-B',
      status: 'PLANNED',
      areaHectares: 0.8,
    },
    201,
  );

  assert.equal(cultivationA.cropId, rice.id);
  assert.equal(cultivationA.organizationId, orgA.id);
  assert.equal(cultivationB.cropId, wheat.id);
  assert.equal(cultivationB.growthStage, 'NOT_SET');

  const byFarm = await success(app, 'GET', `${BASE}/cultivations?farmId=${farmB.id}`, adminToken);
  assert.deepEqual(
    byFarm.cultivations.map((item) => item.code),
    ['WHEAT-PLOT-B'],
  );
  const bySeason = await success(
    app,
    'GET',
    `${BASE}/cultivations?cropSeasonId=${season.id}`,
    adminToken,
  );
  assert.equal(bySeason.cultivations.length, 1);
  const fetched = await success(app, 'GET', `${BASE}/cultivations/${cultivationA.id}`, adminToken);
  assert.equal(fetched.id, cultivationA.id);

  const updated = await success(
    app,
    'PATCH',
    `${BASE}/cultivations/${cultivationA.id}`,
    farmerToken,
    {
      status: 'HARVESTED',
      growthStage: 'HARVEST_READY',
      harvestedAt: '2026-04-20T00:00:00.000Z',
    },
  );
  assert.equal(updated.status, 'HARVESTED');
  assert.equal(updated.harvestedAt, '2026-04-20T00:00:00.000Z');

  const invalidHarvestDate = await request(
    app,
    'PATCH',
    `${BASE}/cultivations/${cultivationA.id}`,
    farmerToken,
    { harvestedAt: '2025-12-01T00:00:00.000Z' },
  );
  assert.equal(invalidHarvestDate.response.statusCode, 400);

  await success(
    app,
    'POST',
    `${BASE}/farms/${farmA.id}/activities`,
    farmerToken,
    {
      cultivationId: cultivationA.id,
      activityType: 'SOWING',
      activityDate: '2026-01-02T00:00:00.000Z',
      notes: 'Line sowing completed.',
    },
    201,
  );
  await success(
    app,
    'POST',
    `${BASE}/cultivations/${cultivationA.id}/activities`,
    farmerToken,
    {
      activityType: 'GROWTH_STAGE',
      activityDate: '2026-02-10T00:00:00.000Z',
      growthStage: 'FLOWERING',
    },
    201,
  );
  await success(
    app,
    'POST',
    `${BASE}/cultivations/${cultivationA.id}/activities`,
    farmerToken,
    {
      activityType: 'DISEASE_OBSERVATION',
      activityDate: '2026-03-01T00:00:00.000Z',
      observationSeverity: 'HIGH',
      notes: 'Leaf blast observed.',
    },
    201,
  );
  const stageActivities = await success(
    app,
    'GET',
    `${BASE}/cultivations/${cultivationA.id}/activities?activityType=GROWTH_STAGE`,
    adminToken,
  );
  assert.equal(stageActivities.activities.length, 1);
  assert.equal(stageActivities.activities[0].growthStage, 'FLOWERING');
  const observations = await success(
    app,
    'GET',
    `${BASE}/farms/${farmA.id}/activities?activityType=DISEASE_OBSERVATION`,
    adminToken,
  );
  assert.equal(observations.activities[0].observationSeverity, 'HIGH');

  const harvest = await success(
    app,
    'POST',
    `${BASE}/cultivations/${cultivationA.id}/harvests`,
    farmerToken,
    {
      harvestedAt: '2026-04-20T00:00:00.000Z',
      quantityKg: 1200,
      qualityGrade: 'A',
      status: 'CONFIRMED',
    },
    201,
  );
  assert.equal(harvest.quantityKg, 1200);
  const farmHarvests = await success(
    app,
    'GET',
    `${BASE}/farms/${farmA.id}/harvests?status=CONFIRMED`,
    adminToken,
  );
  assert.equal(farmHarvests.harvests.length, 1);
  const cultivationHarvests = await success(
    app,
    'GET',
    `${BASE}/cultivations/${cultivationA.id}/harvests`,
    adminToken,
  );
  assert.equal(cultivationHarvests.harvests.length, 1);

  const seeds = await success(
    app,
    'POST',
    `${BASE}/expenses`,
    farmerToken,
    {
      farmId: farmA.id,
      cultivationId: cultivationA.id,
      category: 'SEEDS',
      expenseDate: '2026-01-03T00:00:00.000Z',
      amount: 12000,
      description: 'Certified seed purchase',
      receiptUrl: 'https://receipts.example.com/seeds-1',
      receiptNote: 'Invoice SEED-10',
    },
    201,
  );
  assert.equal(seeds.source, 'RECORDED');
  assert.equal(seeds.receiptUrl, 'https://receipts.example.com/seeds-1');

  await success(
    app,
    'POST',
    `${BASE}/expenses`,
    farmerToken,
    {
      farmId: farmA.id,
      category: 'LABOR',
      expenseDate: '2026-02-01T00:00:00.000Z',
      amount: 3000,
      description: 'Field labor',
    },
    201,
  );

  const deniedAiWithoutGrant = await request(app, 'POST', `${BASE}/expenses`, opsToken, {
    farmId: farmA.id,
    category: 'PESTICIDE',
    source: 'AI_ESTIMATED',
    estimateRuleKey: 'PESTICIDE_ESTIMATE_V1',
    confidence: 0.7,
    expenseDate: '2026-03-02T00:00:00.000Z',
    amount: 1500,
  });
  assert.equal(deniedAiWithoutGrant.response.statusCode, 403);
  assert.equal(deniedAiWithoutGrant.body.meta.details.permission, 'ai.feedback');

  const estimate = await success(
    app,
    'POST',
    `${BASE}/expenses`,
    farmerToken,
    {
      farmId: farmA.id,
      cultivationId: cultivationA.id,
      category: 'PESTICIDE',
      source: 'AI_ESTIMATED',
      estimateRuleKey: 'PESTICIDE_ESTIMATE_V1',
      confidence: 0.7,
      expenseDate: '2026-03-02T00:00:00.000Z',
      amount: 1500,
      description: 'Estimated spray cost',
    },
    201,
  );
  assert.equal(estimate.source, 'AI_ESTIMATED');
  assert.equal(estimate.estimateRuleKey, 'PESTICIDE_ESTIMATE_V1');

  const invalidEstimate = await request(app, 'POST', `${BASE}/expenses`, farmerToken, {
    farmId: farmA.id,
    category: 'PESTICIDE',
    source: 'AI_ESTIMATED',
    expenseDate: '2026-03-02T00:00:00.000Z',
    amount: 500,
  });
  assert.equal(invalidEstimate.response.statusCode, 400);

  const report = await success(
    app,
    'GET',
    `${BASE}/farms/${farmA.id}/reports/expenses`,
    adminToken,
  );
  assert.equal(report.recordedCost, 15000);
  assert.equal(report.aiEstimatedCost, 1500);
  assert.equal(report.recordedExpenseCount, 2);
  assert.equal(report.aiEstimatedExpenseCount, 1);
  assert.deepEqual(
    report.categoryBreakdown.find((item) => item.category === 'SEEDS'),
    { category: 'SEEDS', recordedCost: 12000, aiEstimatedCost: 0 },
  );
  assert.ok(report.sourcePolicy.includes('Recorded expenses'));

  const production = await success(
    app,
    'GET',
    `${BASE}/farms/${farmA.id}/reports/production-cost`,
    adminToken,
  );
  assert.equal(production.recordedCost, 15000);
  assert.equal(production.totalYieldKg, 1200);
  assert.equal(production.unallocatedFarmCost.recordedCost, 3000);
  const cultivationCost = production.cultivations.find(
    (item) => item.cultivationId === cultivationA.id,
  );
  assert.equal(cultivationCost.recordedCost, 12000);
  assert.equal(cultivationCost.aiEstimatedCost, 1500);
  assert.equal(cultivationCost.costPerKg, 10);

  const comparison = await success(
    app,
    'GET',
    `${BASE}/farms/${farmA.id}/reports/yield-cost`,
    adminToken,
  );
  const comparisonRow = comparison.rows.find((item) => item.cultivationId === cultivationA.id);
  assert.equal(comparisonRow.expectedYieldKg, 1100);
  assert.equal(comparisonRow.actualYieldKg, 1200);
  assert.equal(comparisonRow.yieldVarianceKg, 100);

  const profitability = await success(
    app,
    'GET',
    `${BASE}/farms/${farmA.id}/reports/profitability?pricePerKg=20`,
    adminToken,
  );
  assert.equal(profitability.rows.length, 1);
  const profit = profitability.rows[0];
  assert.equal(profit.recordedCost, 12000);
  assert.equal(profit.revenue, 24000);
  assert.equal(profit.profit, 12000);
  assert.equal(profit.costPerKg, 10);
  assert.equal(profit.aiEstimatedCost, 1500);

  const noPrice = await success(
    app,
    'GET',
    `${BASE}/farms/${farmA.id}/reports/profitability`,
    adminToken,
  );
  assert.equal(noPrice.rows[0].revenue, null);
  assert.equal(noPrice.rows[0].profit, null);

  const cultivationCostDetail = await success(
    app,
    'GET',
    `${BASE}/cultivations/${cultivationA.id}/cost`,
    adminToken,
  );
  assert.equal(cultivationCostDetail.recordedCost, 12000);
  assert.equal(cultivationCostDetail.aiEstimatedCost, 1500);

  const deniedExpenseRead = await request(app, 'GET', `${BASE}/expenses`, peerToken);
  assert.equal(deniedExpenseRead.response.statusCode, 403);
  const deniedExpenseWrite = await request(app, 'POST', `${BASE}/expenses`, peerToken, {
    farmId: farmA.id,
    category: 'OTHER',
    expenseDate: '2026-01-01T00:00:00.000Z',
    amount: 1,
  });
  assert.equal(deniedExpenseWrite.response.statusCode, 403);

  const crossTenantRead = await request(
    app,
    'GET',
    `${BASE}/cultivations/${cultivationA.id}`,
    tenantBToken,
  );
  assert.equal(crossTenantRead.response.statusCode, 403);
  assert.equal(crossTenantRead.body.meta.details.code, 'cross_organization_access_denied');
  const crossTenantExpense = await request(app, 'POST', `${BASE}/expenses`, tenantBToken, {
    farmId: farmA.id,
    category: 'OTHER',
    expenseDate: '2026-01-01T00:00:00.000Z',
    amount: 100,
  });
  assert.equal(crossTenantExpense.response.statusCode, 403);

  const audit = app.cropsyContainer.resolve(IdentityStoreToken);
  for (const action of [
    'agriculture.cultivation.created',
    'agriculture.activity.recorded',
    'agriculture.harvest.recorded',
    'agriculture.expense.recorded',
    'agriculture.expense.estimated',
  ]) {
    assert.ok(
      (await audit.listAudit({ action, organizationId: orgA.id })).length > 0,
      `missing audit for ${action}`,
    );
  }
});

test('all agriculture routes except module info are authenticated by default', async (t) => {
  const { app } = await createTenantFixture(t);
  const info = await app.inject({ method: 'GET', url: `${BASE}/info` });
  assert.equal(info.statusCode, 200);
  const protectedRoute = await app.inject({ method: 'GET', url: `${BASE}/crops` });
  assert.equal(protectedRoute.statusCode, 401);
});

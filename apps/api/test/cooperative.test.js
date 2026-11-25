const assert = require('node:assert/strict');
const test = require('node:test');

const { bearer, createTenantFixture, loginUser } = require('./support/auth-fixtures');

const CATALOG = '/api/v1/catalog';
const FARMERS = '/api/v1/farmers';

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
  assert.equal(result.response.statusCode, status, JSON.stringify(result.body));
  return result.body.data;
}

async function createCampaignProduct(app, token, organizationId) {
  const units = await success(app, 'GET', `${CATALOG}/units`, token);
  if (!units.units.some((unit) => unit.code === 'KG')) {
    await success(
      app,
      'POST',
      `${CATALOG}/units`,
      token,
      {
        code: 'KG',
        name: 'Kilogram',
        nameBn: 'কিলোগ্রাম',
      },
      201,
    );
  }
  let category = (await success(app, 'GET', `${CATALOG}/categories`, token)).categories.find(
    (item) => item.code === 'COOP-GRAINS',
  );
  if (!category) {
    category = await success(
      app,
      'POST',
      `${CATALOG}/categories`,
      token,
      { organizationId, code: 'COOP-GRAINS', name: 'Cooperative grains', nameBn: 'সমবায় শস্য' },
      201,
    );
  }
  await success(
    app,
    'POST',
    `${CATALOG}/quality-grades`,
    token,
    {
      code: 'COOP-GRADE-A',
      name: 'Grade A',
      nameBn: 'এ গ্রেড',
    },
    201,
  );
  return success(
    app,
    'POST',
    `${CATALOG}/products`,
    token,
    {
      categoryId: category.id,
      sku: 'COOP-RICE-1',
      name: 'Cooperative rice',
      nameBn: 'সমবায় চাল',
      unitCode: 'KG',
    },
    201,
  );
}

async function createGroupAndCampaign(app, adminToken, orgA, product, overrides = {}) {
  const group = await success(
    app,
    'POST',
    `${FARMERS}/groups`,
    adminToken,
    { organizationId: orgA.id, code: `COOP-${overrides.suffix || 'A'}`, name: 'Rice growers' },
    201,
  );
  const campaign = await success(
    app,
    'POST',
    `${FARMERS}/groups/${group.id}/campaigns`,
    adminToken,
    {
      organizationId: orgA.id,
      code: `CMP-${overrides.suffix || 'A'}`,
      name: 'Shared harvest sale',
      productId: product.id,
      unitCode: 'KG',
      ...(overrides.allocationPolicyCode
        ? { allocationPolicyCode: overrides.allocationPolicyCode }
        : {}),
      ...(overrides.allocationPolicyConfig
        ? { allocationPolicyConfig: overrides.allocationPolicyConfig }
        : {}),
    },
    201,
  );
  await success(app, 'PATCH', `${FARMERS}/campaigns/${campaign.id}`, adminToken, {
    status: 'OPEN',
  });
  return { group, campaign };
}

test('collective selling allocates sales transparently and records individual earnings', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA, adminId, sameOrgUserId } = fixture;
  const peerToken = await login(app, 'peer@example.com');
  const otherOrgToken = await login(app, 'other-org@example.com');
  const memberToken = await login(app, 'same-org@example.com');
  const product = await createCampaignProduct(app, adminToken, orgA.id);
  const { group, campaign } = await createGroupAndCampaign(app, adminToken, orgA, product, {
    suffix: 'PROP',
  });

  const membership = await success(
    app,
    'POST',
    `${FARMERS}/groups/${group.id}/members`,
    memberToken,
    {},
    201,
  );
  assert.equal(membership.status, 'PENDING');
  const accepted = await success(
    app,
    'PATCH',
    `${FARMERS}/groups/${group.id}/members/${sameOrgUserId}`,
    adminToken,
    { decision: 'ACCEPT' },
  );
  assert.equal(accepted.status, 'ACTIVE');

  const leaderDenied = await request(
    app,
    'PATCH',
    `${FARMERS}/campaigns/${campaign.id}`,
    memberToken,
    { name: 'Renamed by member' },
  );
  assert.equal(leaderDenied.response.statusCode, 403, leaderDenied.response.body);

  const memberContribution = await success(
    app,
    'POST',
    `${FARMERS}/campaigns/${campaign.id}/contributions`,
    memberToken,
    {
      productId: product.id,
      quantity: 30,
      qualityGradeCode: 'COOP-GRADE-A',
      referenceKey: 'member-contribution-1',
    },
    201,
  );
  const ownerContribution = await success(
    app,
    'POST',
    `${FARMERS}/campaigns/${campaign.id}/contributions`,
    adminToken,
    {
      productId: product.id,
      quantity: 70,
      qualityGradeCode: 'COOP-GRADE-A',
      referenceKey: 'owner-contribution-1',
    },
    201,
  );

  const foreignEdit = await request(
    app,
    'PATCH',
    `${FARMERS}/contributions/${ownerContribution.id}`,
    memberToken,
    { quantity: 999 },
  );
  assert.equal(foreignEdit.response.statusCode, 403, foreignEdit.response.body);

  await success(
    app,
    'POST',
    `${FARMERS}/contributions/${memberContribution.id}/confirm`,
    adminToken,
    {},
  );
  await success(
    app,
    'POST',
    `${FARMERS}/contributions/${ownerContribution.id}/confirm`,
    adminToken,
    {},
  );

  const purchaseRequest = await success(
    app,
    'POST',
    `${FARMERS}/campaigns/${campaign.id}/purchase-requests`,
    peerToken,
    { quantity: 50, salesAmount: 500, currency: 'BDT', referenceKey: 'buyer-order-1' },
    201,
  );
  const replayedRequest = await success(
    app,
    'POST',
    `${FARMERS}/campaigns/${campaign.id}/purchase-requests`,
    peerToken,
    { quantity: 50, salesAmount: 500, currency: 'BDT', referenceKey: 'buyer-order-1' },
    201,
  );
  assert.equal(replayedRequest.id, purchaseRequest.id);

  await success(app, 'PATCH', `${FARMERS}/purchase-requests/${purchaseRequest.id}`, adminToken, {
    decision: 'ACCEPT',
  });
  const allocations = await success(
    app,
    'POST',
    `${FARMERS}/purchase-requests/${purchaseRequest.id}/allocations`,
    adminToken,
    {},
  );
  assert.equal(allocations.allocations.length, 2);
  const byContributor = new Map(
    allocations.allocations.map((item) => [item.contributorUserId, item.allocatedQuantity]),
  );
  assert.equal(byContributor.get(sameOrgUserId), 15);
  assert.equal(byContributor.get(adminId), 35);
  assert.equal(
    allocations.allocations.reduce((sum, item) => sum + item.allocatedQuantity, 0),
    50,
  );
  for (const allocation of allocations.allocations) {
    assert.equal(allocation.policyCode, 'PROPORTIONAL');
    assert.ok(allocation.policySnapshot);
  }

  const earnings = await success(
    app,
    'POST',
    `${FARMERS}/purchase-requests/${purchaseRequest.id}/finalize`,
    adminToken,
    {},
  );
  assert.equal(earnings.earnings.length, 2);
  assert.equal(
    earnings.earnings.reduce((sum, item) => sum + item.amount, 0),
    500,
  );
  assert.ok(
    earnings.earnings.every((item) => item.currency === 'BDT' && item.status === 'ACCRUED'),
  );
  assert.ok(
    earnings.earnings.every((item) => item.metadata.purchaseRequestId === purchaseRequest.id),
  );

  const myEarnings = await success(app, 'GET', `${FARMERS}/earnings/me`, memberToken);
  assert.equal(myEarnings.earnings.length, 1);
  assert.equal(myEarnings.earnings[0].amount, 150);
  assert.equal(myEarnings.earnings[0].contributorUserId, sameOrgUserId);

  const finalizedRequest = await success(
    app,
    'GET',
    `${FARMERS}/purchase-requests/${purchaseRequest.id}`,
    peerToken,
  );
  assert.equal(finalizedRequest.status, 'FULFILLED');

  const crossTenant = await request(app, 'GET', `${FARMERS}/groups/${group.id}`, otherOrgToken);
  assert.equal(crossTenant.response.statusCode, 403);
  const buyerReadFarm = await request(app, 'GET', `${FARMERS}/groups`, peerToken);
  assert.equal(buyerReadFarm.response.statusCode, 403);
  const anonymous = await request(app, 'GET', `${FARMERS}/groups`);
  assert.equal(anonymous.response.statusCode, 401);
});

test('quality-weighted allocation uses caller-supplied weights and stays configurable', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA, adminId, sameOrgUserId } = fixture;
  const peerToken = await login(app, 'peer@example.com');
  const memberToken = await login(app, 'same-org@example.com');
  const product = await createCampaignProduct(app, adminToken, orgA.id);
  const { campaign } = await createGroupAndCampaign(app, adminToken, orgA, product, {
    suffix: 'WEIGHTED',
    allocationPolicyCode: 'QUALITY_WEIGHTED',
    allocationPolicyConfig: { weights: { [sameOrgUserId]: 2, [adminId]: 1 } },
  });

  await success(app, 'POST', `${FARMERS}/groups/${campaign.groupId}/members`, memberToken, {}, 201);
  await success(
    app,
    'PATCH',
    `${FARMERS}/groups/${campaign.groupId}/members/${sameOrgUserId}`,
    adminToken,
    { decision: 'ACCEPT' },
  );

  const memberContribution = await success(
    app,
    'POST',
    `${FARMERS}/campaigns/${campaign.id}/contributions`,
    memberToken,
    { productId: product.id, quantity: 10, qualityGradeCode: 'COOP-GRADE-A' },
    201,
  );
  const ownerContribution = await success(
    app,
    'POST',
    `${FARMERS}/campaigns/${campaign.id}/contributions`,
    adminToken,
    { productId: product.id, quantity: 10, qualityGradeCode: 'COOP-GRADE-A' },
    201,
  );
  await success(
    app,
    'POST',
    `${FARMERS}/contributions/${memberContribution.id}/confirm`,
    adminToken,
    {},
  );
  await success(
    app,
    'POST',
    `${FARMERS}/contributions/${ownerContribution.id}/confirm`,
    adminToken,
    {},
  );

  const purchaseRequest = await success(
    app,
    'POST',
    `${FARMERS}/campaigns/${campaign.id}/purchase-requests`,
    peerToken,
    { quantity: 30, salesAmount: 300, currency: 'BDT' },
    201,
  );
  await success(app, 'PATCH', `${FARMERS}/purchase-requests/${purchaseRequest.id}`, adminToken, {
    decision: 'ACCEPT',
  });
  const allocations = await success(
    app,
    'POST',
    `${FARMERS}/purchase-requests/${purchaseRequest.id}/allocations`,
    adminToken,
    {},
  );
  const byContributor = new Map(
    allocations.allocations.map((item) => [item.contributorUserId, item.allocatedQuantity]),
  );
  assert.equal(byContributor.get(sameOrgUserId), 20);
  assert.equal(byContributor.get(adminId), 10);
  assert.equal(allocations.allocations[0].policyCode, 'QUALITY_WEIGHTED');

  const earnings = await success(
    app,
    'POST',
    `${FARMERS}/purchase-requests/${purchaseRequest.id}/finalize`,
    adminToken,
    {},
  );
  assert.deepEqual(
    earnings.earnings.map((item) => item.amount).sort((a, b) => a - b),
    [100, 200],
  );
});

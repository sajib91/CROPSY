const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');

const { bearer, createTenantFixture, loginUser, register } = require('./support/auth-fixtures');

const BILLING = '/api/v1/billing';

function billingEnv() {
  return {
    BILLING_STORE: 'memory',
    PAYMENT_PROVIDER_MODE: 'mock',
    PAYMENT_PROVIDERS_JSON: JSON.stringify([
      { code: 'SANDBOX_MOCK', methods: ['CARD'], webhookSecret: 'billing-test-webhook-secret' },
    ]),
  };
}

async function request(app, method, url, token, payload, headers = {}) {
  const response = await app.inject({
    method,
    url,
    headers: { ...(token ? bearer(token) : {}), ...headers },
    ...(payload === undefined ? {} : { payload }),
  });
  return { response, body: response.json() };
}

async function success(app, method, url, token, payload, status = 200, headers = {}) {
  const result = await request(app, method, url, token, payload, headers);
  assert.equal(result.response.statusCode, status, JSON.stringify(result.body));
  assert.equal(result.body.success, true);
  return result.body.data;
}

async function createSuperAdminFixture(t) {
  const fixture = await createTenantFixture(t, billingEnv());
  const root = await register(fixture.app, {
    email: `billing-root-${randomUUID()}@example.com`,
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
  return { ...fixture, rootToken: rootLogin.tokens.accessToken };
}

function planInput(overrides = {}) {
  return {
    code: `PLAN_${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`,
    name: 'Configured tenant plan',
    billingInterval: 'MONTHLY',
    currency: 'BDT',
    priceAmount: 1200,
    trialDays: 0,
    segmentCodes: ['INDIVIDUAL_FARMER'],
    entitlements: { 'ai.advanced': true },
    usageLimits: { reports: 2 },
    providerCode: 'SANDBOX_MOCK',
    metadata: { configuredBy: 'test' },
    ...overrides,
  };
}

async function createPlan(app, rootToken, overrides = {}) {
  return success(app, 'POST', `${BILLING}/plans`, rootToken, planInput(overrides), 201);
}

test('billing plans are configurable and never seeded with prices', async (t) => {
  const { app, rootToken, adminToken } = await createSuperAdminFixture(t);

  const initial = await success(app, 'GET', `${BILLING}/plans?limit=100`, adminToken);
  assert.equal(initial.plans.length, 0);

  const created = await createPlan(app, rootToken, { priceAmount: 775.5 });
  assert.equal(created.plan.priceAmount, 775.5);
  assert.equal(created.plan.currency, 'BDT');
  assert.deepEqual(created.plan.segmentCodes, ['INDIVIDUAL_FARMER']);
  assert.equal(created.plan.entitlements['ai.advanced'], true);
  assert.equal(created.plan.usageLimits.reports, 2);

  const filtered = await success(
    app,
    'GET',
    `${BILLING}/plans?segmentCode=INDIVIDUAL_FARMER&sort=price`,
    adminToken,
  );
  assert.equal(filtered.plans.length, 1);
  assert.equal(filtered.plans[0].code, created.plan.code);

  const denied = await request(app, 'POST', `${BILLING}/plans`, adminToken, planInput());
  assert.equal(denied.response.statusCode, 403);
  assert.equal(denied.body.meta.details.permission, 'plans.manage');

  const badProvider = await request(
    app,
    'POST',
    `${BILLING}/plans`,
    rootToken,
    planInput({ code: 'PLAN_BAD_PROVIDER', providerCode: 'UNCONFIGURED' }),
  );
  assert.equal(badProvider.response.statusCode, 400);
  assert.match(JSON.stringify(badProvider.body), /not configured/);
});

test('subscription lifecycle uses plan prices, invoices, and tenant isolation', async (t) => {
  const { app, rootToken, adminToken, orgA, orgB } = await createSuperAdminFixture(t);
  const basic = await createPlan(app, rootToken, { priceAmount: 1000 });
  const premium = await createPlan(app, rootToken, {
    code: `PLAN_${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`,
    name: 'Premium tenant plan',
    priceAmount: 2500,
    entitlements: { 'ai.advanced': true, 'warehouse.multi': true },
    usageLimits: { reports: 10 },
  });

  const created = await success(
    app,
    'POST',
    `${BILLING}/subscriptions`,
    adminToken,
    { planCode: basic.plan.code },
    201,
  );
  assert.equal(created.subscription.organizationId, orgA.id);
  assert.equal(created.subscription.status, 'ACTIVE');
  assert.equal(created.subscription.planCode, basic.plan.code);
  assert.equal(created.invoice.amount, 1000);
  assert.equal(created.invoice.status, 'OPEN');
  assert.equal(created.invoice.providerCode, 'SANDBOX_MOCK');

  const duplicate = await request(app, 'POST', `${BILLING}/subscriptions`, adminToken, {
    planCode: premium.plan.code,
  });
  assert.equal(duplicate.response.statusCode, 409);
  assert.equal(duplicate.body.meta.details.code, 'subscription_already_active');

  const crossTenant = await request(
    app,
    'GET',
    `${BILLING}/subscriptions/current?organizationId=${orgB.id}`,
    adminToken,
  );
  assert.equal(crossTenant.response.statusCode, 403);
  assert.equal(crossTenant.body.meta.details.code, 'cross_organization_access_denied');

  const paid = await success(
    app,
    'POST',
    `${BILLING}/invoices/${created.invoice.id}/status`,
    adminToken,
    { status: 'PAID' },
  );
  assert.equal(paid.invoice.status, 'PAID');
  assert.ok(paid.invoice.paidAt);

  const renewed = await success(
    app,
    'POST',
    `${BILLING}/subscriptions/${created.subscription.id}/renew`,
    adminToken,
  );
  assert.equal(renewed.subscription.status, 'ACTIVE');
  assert.equal(renewed.invoice.amount, 1000);

  const upgraded = await success(
    app,
    'POST',
    `${BILLING}/subscriptions/${created.subscription.id}/change-plan`,
    adminToken,
    { planCode: premium.plan.code },
  );
  assert.equal(upgraded.direction, 'upgrade');
  assert.equal(upgraded.plan.code, premium.plan.code);
  assert.equal(upgraded.invoice.amount, 2500);

  const downgraded = await success(
    app,
    'POST',
    `${BILLING}/subscriptions/${created.subscription.id}/change-plan`,
    adminToken,
    { planCode: basic.plan.code },
  );
  assert.equal(downgraded.direction, 'downgrade');
  assert.equal(downgraded.invoice.amount, 1000);

  const pendingCancel = await success(
    app,
    'POST',
    `${BILLING}/subscriptions/${created.subscription.id}/cancel`,
    adminToken,
    { atPeriodEnd: true, reason: 'switching providers' },
  );
  assert.equal(pendingCancel.subscription.status, 'ACTIVE');
  assert.ok(pendingCancel.subscription.cancelledAt);

  const cancelled = await success(
    app,
    'POST',
    `${BILLING}/subscriptions/${created.subscription.id}/cancel`,
    adminToken,
    { atPeriodEnd: false },
  );
  assert.equal(cancelled.subscription.status, 'CANCELLED');

  const renewCancelled = await request(
    app,
    'POST',
    `${BILLING}/subscriptions/${created.subscription.id}/renew`,
    adminToken,
  );
  assert.equal(renewCancelled.response.statusCode, 409);
  assert.equal(renewCancelled.body.meta.details.code, 'subscription_cancelled');
});

test('entitlement checks enforce limits without gating unrelated roles', async (t) => {
  const { app, rootToken, adminToken, orgA, orgB } = await createSuperAdminFixture(t);
  const plan = await createPlan(app, rootToken, {
    entitlements: { 'ai.advanced': true },
    usageLimits: { reports: 2 },
  });

  const peerLogin = await loginUser(app, 'peer@example.com');
  assert.equal(peerLogin.response.statusCode, 200, JSON.stringify(peerLogin.body));
  const peerResult = await success(app, 'GET', '/api/v1/iam/auth/me', peerLogin.tokens.accessToken);
  assert.ok(peerResult.user.id);

  const before = await success(app, 'POST', `${BILLING}/entitlements/check`, adminToken, {
    featureCode: 'ai.advanced',
  });
  assert.equal(before.allowed, false);
  assert.equal(before.reason, 'no_active_subscription');

  const subscription = await success(
    app,
    'POST',
    `${BILLING}/subscriptions`,
    adminToken,
    { planCode: plan.plan.code },
    201,
  );

  const allowed = await success(app, 'POST', `${BILLING}/entitlements/check`, adminToken, {
    featureCode: 'ai.advanced',
    metricCode: 'reports',
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.planCode, plan.plan.code);
  assert.equal(allowed.usage.limit, 2);
  assert.equal(allowed.usage.remaining, 2);

  const deniedFeature = await success(app, 'POST', `${BILLING}/entitlements/check`, adminToken, {
    featureCode: 'warehouse.multi',
  });
  assert.equal(deniedFeature.allowed, false);
  assert.equal(deniedFeature.reason, 'feature_not_entitled');

  const noSubscription = await success(app, 'POST', `${BILLING}/entitlements/check`, rootToken, {
    featureCode: 'ai.advanced',
    organizationId: orgB.id,
  });
  assert.equal(noSubscription.allowed, false);
  assert.equal(noSubscription.reason, 'no_active_subscription');

  const firstUsage = await success(
    app,
    'POST',
    `${BILLING}/usage`,
    adminToken,
    {
      metricCode: 'reports',
      quantity: 2,
      idempotencyKey: 'FIRST_REPORT_BATCH',
    },
    201,
  );
  assert.equal(firstUsage.usageInPeriod, 2);
  assert.equal(firstUsage.limit, 2);

  const duplicate = await success(
    app,
    'POST',
    `${BILLING}/usage`,
    adminToken,
    {
      metricCode: 'reports',
      quantity: 2,
      idempotencyKey: 'FIRST_REPORT_BATCH',
    },
    201,
  );
  assert.equal(duplicate.duplicate, true);

  const overLimit = await request(app, 'POST', `${BILLING}/usage`, adminToken, {
    metricCode: 'reports',
    quantity: 1,
  });
  assert.equal(overLimit.response.statusCode, 403);
  assert.equal(overLimit.body.meta.details.code, 'usage_limit_exceeded');

  const overage = await success(
    app,
    'POST',
    `${BILLING}/usage`,
    adminToken,
    { metricCode: 'reports', quantity: 1, allowOverage: true },
    201,
  );
  assert.equal(overage.usageInPeriod, 3);

  const exhausted = await success(app, 'POST', `${BILLING}/entitlements/check`, adminToken, {
    featureCode: 'ai.advanced',
    metricCode: 'reports',
  });
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.reason, 'usage_limit_exceeded');

  const usageList = await success(app, 'GET', `${BILLING}/usage?metricCode=reports`, adminToken);
  assert.ok(usageList.usage.length >= 2);
  assert.equal(subscription.subscription.organizationId, orgA.id);
});

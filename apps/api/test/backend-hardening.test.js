const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
const test = require('node:test');

const {
  bearer,
  createApp,
  createTenantFixture,
  loginUser,
  register,
} = require('./support/auth-fixtures');
const { moduleIds } = require('../src/modules/registry');

const WEBHOOK_SECRET = 'hardening-webhook-secret';
const MOCK_PROVIDERS = Object.freeze([
  {
    code: 'SANDBOX_MOCK',
    methods: ['CARD', 'MOBILE_BANKING', 'BANK_TRANSFER', 'CASH'],
    webhookSecret: WEBHOOK_SECRET,
  },
]);

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
  return result.body.data;
}

async function createSuperAdminFixture(t, envOverrides = {}) {
  const fixture = await createTenantFixture(t, envOverrides);
  const root = await register(fixture.app, {
    email: `root-${randomUUID()}@example.com`,
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

function paymentInitiation(overrides = {}) {
  return {
    orderId: randomUUID(),
    providerCode: 'SANDBOX_MOCK',
    method: 'CARD',
    amount: 100,
    currency: 'BDT',
    idempotencyKey: randomUUID(),
    allocation: {
      sellerUserId: randomUUID(),
      sellerNetAmount: 90,
      commissionAmount: 10,
    },
    commissionRule: {
      ruleKey: 'HARDENING_TEST_RULE',
      snapshot: { source: 'backend-hardening-test' },
    },
    providerOptions: {},
    ...overrides,
  };
}

async function capturePayment(app, token) {
  const initiated = await success(
    app,
    'POST',
    '/api/v1/payments/payments',
    token,
    paymentInitiation(),
    201,
  );
  return success(app, 'POST', `/api/v1/payments/payments/${initiated.id}/verify`, token, {});
}

function refundBody(payment, amount, idempotencyKey) {
  return {
    paymentId: payment.id,
    amount,
    reason: 'QUALITY_ISSUE',
    idempotencyKey,
    allocation: {
      sellerUserId: payment.allocation_snapshot.sellerUserId,
      sellerNetAmount: Math.round(amount * 0.9 * 100) / 100,
      commissionReversalAmount: Math.round(amount * 0.1 * 100) / 100,
    },
    providerOptions: {},
  };
}

function signedWebhook(body, rawBody, secret = WEBHOOK_SECRET) {
  const digest = createHmac('sha256', secret).update(`${body.eventId}.${rawBody}`).digest('hex');
  return { 'x-webhook-signature': `sha256=${digest}` };
}

async function createWarehouseProduct(app, token, organizationId) {
  const units = await success(app, 'GET', '/api/v1/catalog/units', token);
  if (!units.units.some((unit) => unit.code === 'KG')) {
    await success(
      app,
      'POST',
      '/api/v1/catalog/units',
      token,
      { code: 'KG', name: 'Kilogram' },
      201,
    );
  }
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const category = await success(
    app,
    'POST',
    '/api/v1/catalog/categories',
    token,
    { organizationId, code: `HARDEN-${suffix}`, name: 'Hardening category' },
    201,
  );
  return success(
    app,
    'POST',
    '/api/v1/catalog/products',
    token,
    {
      categoryId: category.id,
      sku: `HARDEN-${suffix}`,
      name: `Hardening product ${suffix}`,
      unitCode: 'KG',
    },
    201,
  );
}

function settlementBody(overrides = {}) {
  const sellerUserId = randomUUID();
  return {
    idempotencyKey: `settlement-${randomUUID()}`,
    sellerUserId,
    ruleKey: 'HARDENING_SETTLEMENT_RULE',
    periodStart: '2026-11-01T00:00:00.000Z',
    periodEnd: '2026-11-30T00:00:00.000Z',
    grossAmount: 90,
    deductionsAmount: 0,
    netAmount: 90,
    currency: 'BDT',
    allocationSnapshot: { source: 'backend-hardening-test' },
    journal: {
      idempotencyKey: `settlement-journal-${randomUUID()}`,
      referenceType: 'SETTLEMENT',
      lines: [
        {
          accountCode: 'CROPSY_SELLER_PAYABLE',
          direction: 'DEBIT',
          bucket: 'PENDING',
          amount: 90,
          ownerUserId: sellerUserId,
        },
        {
          accountCode: 'CROPSY_SETTLEMENT_CLEARING',
          direction: 'CREDIT',
          bucket: 'SETTLED',
          amount: 90,
        },
      ],
    },
    ...overrides,
  };
}

test('every registered module exposes a public info envelope and rejects foreign module ids', async (t) => {
  const { app } = await createApp(t);

  assert.equal(moduleIds.length, 22);
  for (const moduleId of moduleIds) {
    const info = await app.inject({ method: 'GET', url: `/api/v1/${moduleId}/info` });
    assert.equal(info.statusCode, 200, `${moduleId}: ${info.body}`);
    assert.equal(info.json().success, true);
    assert.equal(info.json().data.moduleId, moduleId);
    assert.equal(info.json().data.status, 'ACTIVE');
    assert.ok(info.json().meta.apiVersion);

    const mismatch = await app.inject({
      method: 'GET',
      url: `/api/v1/${moduleId}/info/not-${moduleId}`,
    });
    assert.equal(mismatch.statusCode, 404, `${moduleId}: ${mismatch.body}`);
    assert.equal(mismatch.json().success, false);
    assert.equal(mismatch.json().error, 'not_found');
  }
});

test('centralized error handling returns stable envelopes for 400, 401, 403, and 404', async (t) => {
  const { app, adminToken } = await createTenantFixture(t);

  const invalid = await request(app, 'GET', '/api/v1/observability?limit=0');
  assert.equal(invalid.response.statusCode, 400);
  assert.equal(invalid.body.success, false);
  assert.equal(invalid.body.error, 'validation_error');
  assert.equal(invalid.body.meta.requestId, invalid.response.headers['x-request-id']);
  assert.ok(invalid.body.meta.details);
  assert.equal(Object.hasOwn(invalid.body, 'data'), false);

  const unauthenticated = await request(app, 'GET', '/api/v1/ledger/balances');
  assert.equal(unauthenticated.response.statusCode, 401);
  assert.equal(unauthenticated.body.success, false);
  assert.equal(unauthenticated.body.error, 'unauthorized');
  assert.equal(unauthenticated.body.meta.path, '/api/v1/ledger/balances');

  const forbidden = await request(app, 'GET', '/api/v1/ledger/balances', adminToken);
  assert.equal(forbidden.response.statusCode, 403);
  assert.equal(forbidden.body.success, false);
  assert.equal(forbidden.body.error, 'forbidden');

  const notFound = await request(app, 'GET', '/api/v1/not-a-module/info');
  assert.equal(notFound.response.statusCode, 404);
  assert.equal(notFound.body.success, false);
  assert.equal(notFound.body.error, 'not_found');
  assert.equal(notFound.body.meta.method, 'GET');
  assert.equal(notFound.body.meta.path, '/api/v1/not-a-module/info');
});

test('refund idempotency keys cannot be reused for another payment or amount', async (t) => {
  const fixture = await createSuperAdminFixture(t, {
    PAYMENT_PROVIDER_MODE: 'mock',
    PAYMENT_PROVIDERS_JSON: JSON.stringify(MOCK_PROVIDERS),
  });
  const { app, rootToken } = fixture;
  const paymentA = await capturePayment(app, rootToken);
  const paymentB = await capturePayment(app, rootToken);
  const sharedKey = `shared-refund-${randomUUID()}`;

  const first = await success(
    app,
    'POST',
    '/api/v1/payments/refunds',
    rootToken,
    refundBody(paymentA, 30, sharedKey),
    201,
  );
  assert.equal(first.payment_id, paymentA.id);
  assert.equal(first.amount, 30);

  const otherPayment = await request(
    app,
    'POST',
    '/api/v1/payments/refunds',
    rootToken,
    refundBody(paymentB, 30, sharedKey),
  );
  assert.equal(otherPayment.response.statusCode, 409, JSON.stringify(otherPayment.body));
  assert.equal(otherPayment.body.error, 'conflict');

  const otherAmount = await request(
    app,
    'POST',
    '/api/v1/payments/refunds',
    rootToken,
    refundBody(paymentA, 40, sharedKey),
  );
  assert.equal(otherAmount.response.statusCode, 409);
  assert.equal(otherAmount.body.error, 'conflict');

  const refunds = await success(app, 'GET', '/api/v1/payments/refunds', rootToken);
  assert.equal(refunds.refunds.length, 1);
  assert.equal(refunds.refunds[0].id, first.id);

  const unchangedA = await success(
    app,
    'GET',
    `/api/v1/payments/payments/${paymentA.id}`,
    rootToken,
  );
  const unchangedB = await success(
    app,
    'GET',
    `/api/v1/payments/payments/${paymentB.id}`,
    rootToken,
  );
  assert.equal(unchangedA.refunded_amount, 30);
  assert.equal(unchangedB.refunded_amount, 0);
});

test('payment idempotency keys are bound to the full request before provider calls', async (t) => {
  const fixture = await createSuperAdminFixture(t, {
    PAYMENT_PROVIDER_MODE: 'mock',
    PAYMENT_PROVIDERS_JSON: JSON.stringify(MOCK_PROVIDERS),
  });
  const { app, rootToken } = fixture;
  const key = `provider-call-claim-${randomUUID()}`;

  // The first call fails at the provider. A replay must observe the persisted
  // FAILED row instead of invoking the provider a second time.
  const failed = await success(
    app,
    'POST',
    '/api/v1/payments/payments',
    rootToken,
    paymentInitiation({ idempotencyKey: key, providerOptions: { forceFailure: true } }),
    201,
  );
  assert.equal(failed.status, 'FAILED');

  const replay = await success(
    app,
    'POST',
    '/api/v1/payments/payments',
    rootToken,
    paymentInitiation({ idempotencyKey: key }),
    201,
  );
  assert.equal(replay.id, failed.id);
  assert.equal(replay.status, 'FAILED');

  const poisoned = await request(
    app,
    'POST',
    '/api/v1/payments/payments',
    rootToken,
    paymentInitiation({
      idempotencyKey: key,
      amount: 250,
      allocation: {
        sellerUserId: randomUUID(),
        sellerNetAmount: 225,
        commissionAmount: 25,
      },
    }),
  );
  assert.equal(poisoned.response.statusCode, 409, JSON.stringify(poisoned.body));
  assert.equal(poisoned.body.error, 'conflict');

  const payments = await success(app, 'GET', '/api/v1/payments/payments', rootToken);
  assert.equal(payments.payments.length, 1);
});

test('concurrent refunds with different keys cannot double-spend a captured payment', async (t) => {
  const fixture = await createSuperAdminFixture(t, {
    PAYMENT_PROVIDER_MODE: 'mock',
    PAYMENT_PROVIDERS_JSON: JSON.stringify(MOCK_PROVIDERS),
  });
  const { app, rootToken } = fixture;
  const payment = await capturePayment(app, rootToken);

  const attempts = await Promise.all([
    request(
      app,
      'POST',
      '/api/v1/payments/refunds',
      rootToken,
      refundBody(payment, 80, `race-refund-a-${randomUUID()}`),
    ),
    request(
      app,
      'POST',
      '/api/v1/payments/refunds',
      rootToken,
      refundBody(payment, 80, `race-refund-b-${randomUUID()}`),
    ),
  ]);
  const statuses = attempts.map((attempt) => attempt.response.statusCode).sort();
  assert.deepEqual(statuses, [201, 409], JSON.stringify(attempts.map((a) => a.body)));

  const updated = await success(app, 'GET', `/api/v1/payments/payments/${payment.id}`, rootToken);
  assert.equal(updated.refunded_amount, 80);
});

test('webhooks authenticate exact raw bytes and reject malformed or mismatched callbacks', async (t) => {
  const fixture = await createSuperAdminFixture(t, {
    PAYMENT_PROVIDER_MODE: 'mock',
    PAYMENT_PROVIDERS_JSON: JSON.stringify(MOCK_PROVIDERS),
  });
  const { app, rootToken } = fixture;
  const payment = await success(
    app,
    'POST',
    '/api/v1/payments/payments',
    rootToken,
    paymentInitiation({ currency: 'USD', providerOptions: { initialStatus: 'INITIATED' } }),
    201,
  );
  const body = {
    eventId: randomUUID(),
    paymentReference: payment.provider_reference,
    status: 'CAPTURED',
    amount: 100,
    currency: 'BDT',
  };
  const rawBody = JSON.stringify(body, null, 2);
  const headers = { 'content-type': 'application/json', ...signedWebhook(body, rawBody) };

  const canonicalSignature = await request(
    app,
    'POST',
    '/api/v1/payments/webhooks/SANDBOX_MOCK',
    rootToken,
    rawBody,
    {
      'content-type': 'application/json',
      'x-webhook-signature': signedWebhook(body, JSON.stringify(body))['x-webhook-signature'],
    },
  );
  assert.equal(canonicalSignature.response.statusCode, 401);

  const malformed = await request(
    app,
    'POST',
    '/api/v1/payments/webhooks/SANDBOX_MOCK',
    rootToken,
    rawBody,
    {
      'content-type': 'application/json',
      'x-webhook-signature': `sha256=${'é'.repeat(64)}`,
    },
  );
  assert.equal(malformed.response.statusCode, 401);

  const currencyMismatch = await request(
    app,
    'POST',
    '/api/v1/payments/webhooks/SANDBOX_MOCK',
    rootToken,
    rawBody,
    headers,
  );
  assert.equal(currencyMismatch.response.statusCode, 409, JSON.stringify(currencyMismatch.body));
  assert.match(currencyMismatch.body.meta.message, /currency/i);

  const stillInitiated = await success(
    app,
    'GET',
    `/api/v1/payments/payments/${payment.id}`,
    rootToken,
  );
  assert.equal(stillInitiated.status, 'INITIATED');
});

test('settlement journal failure rolls back the settlement row and allows a corrected retry', async (t) => {
  const { app, rootToken } = await createSuperAdminFixture(t);
  const valid = settlementBody();
  const unbalanced = settlementBody({
    idempotencyKey: 'settlement-rollback-idem',
    journal: {
      ...valid.journal,
      lines: [
        {
          accountCode: 'CROPSY_SELLER_PAYABLE',
          direction: 'DEBIT',
          bucket: 'PENDING',
          amount: 90,
          ownerUserId: valid.sellerUserId,
        },
        {
          accountCode: 'CROPSY_SETTLEMENT_CLEARING',
          direction: 'CREDIT',
          bucket: 'SETTLED',
          amount: 85,
        },
      ],
    },
  });

  const rejected = await request(app, 'POST', '/api/v1/ledger/settlements', rootToken, unbalanced);
  assert.equal(rejected.response.statusCode, 400, JSON.stringify(rejected.body));
  assert.equal(rejected.body.error, 'unbalanced_journal');

  const afterFailure = await success(app, 'GET', '/api/v1/ledger/settlements', rootToken);
  assert.equal(
    afterFailure.settlements.filter((entry) => entry.idempotency_key === 'settlement-rollback-idem')
      .length,
    0,
  );
  const journalsAfterFailure = await success(app, 'GET', '/api/v1/ledger/journals', rootToken);
  assert.equal(
    journalsAfterFailure.journals.filter(
      (entry) => entry.idempotency_key === 'settlement:settlement-rollback-idem',
    ).length,
    0,
  );

  const corrected = await success(
    app,
    'POST',
    '/api/v1/ledger/settlements',
    rootToken,
    { ...unbalanced, journal: valid.journal },
    201,
  );
  assert.equal(corrected.idempotency_key, 'settlement-rollback-idem');
  assert.ok(corrected.journal_id);

  const afterRetry = await success(app, 'GET', '/api/v1/ledger/settlements', rootToken);
  assert.equal(
    afterRetry.settlements.filter((entry) => entry.idempotency_key === 'settlement-rollback-idem')
      .length,
    1,
  );
  const journalsAfterRetry = await success(app, 'GET', '/api/v1/ledger/journals', rootToken);
  assert.equal(
    journalsAfterRetry.journals.filter(
      (entry) => entry.idempotency_key === 'settlement:settlement-rollback-idem',
    ).length,
    1,
  );
});

test('concurrent stock reservations cannot oversell the same inventory', async (t) => {
  const { app, adminToken, orgA } = await createTenantFixture(t);
  const product = await createWarehouseProduct(app, adminToken, orgA.id);
  const warehouse = await success(
    app,
    'POST',
    '/api/v1/warehouse/warehouses',
    adminToken,
    {
      organizationId: orgA.id,
      code: `WH-${randomUUID().slice(0, 8)}`,
      name: 'Concurrent reservations warehouse',
    },
    201,
  );
  const inventory = await success(
    app,
    'POST',
    '/api/v1/warehouse/inventories',
    adminToken,
    {
      organizationId: orgA.id,
      warehouseId: warehouse.id,
      productId: product.id,
      batchCode: `BATCH-${randomUUID().slice(0, 8)}`,
      quantity: 10,
      unitCode: 'KG',
      lowStockThreshold: 0,
    },
    201,
  );

  const attempts = await Promise.all(
    [1, 2, 3, 4].map((index) =>
      request(
        app,
        'POST',
        `/api/v1/warehouse/inventories/${inventory.id}/reservations`,
        adminToken,
        {
          quantity: 4,
          referenceKey: `concurrent-order-${index}`,
          reason: `Concurrent reservation ${index}`,
        },
      ),
    ),
  );
  const accepted = attempts.filter((attempt) => attempt.response.statusCode === 201);
  const rejected = attempts.filter((attempt) => attempt.response.statusCode !== 201);
  assert.equal(accepted.length, 2, JSON.stringify(attempts.map((item) => item.body)));
  assert.equal(rejected.length, 2);
  assert.ok(rejected.every((attempt) => attempt.response.statusCode === 409));

  const after = await success(
    app,
    'GET',
    `/api/v1/warehouse/inventories/${inventory.id}`,
    adminToken,
  );
  assert.equal(after.quantityReserved, 8);
  assert.equal(after.availableQuantity, 2);
});

test('client-supplied tenant fields and headers cannot widen payment scope', async (t) => {
  const fixture = await createSuperAdminFixture(t, {
    PAYMENT_PROVIDER_MODE: 'mock',
    PAYMENT_PROVIDERS_JSON: JSON.stringify(MOCK_PROVIDERS),
  });
  const { app, rootToken, orgA, orgB } = fixture;
  const peerLogin = await loginUser(app, 'peer@example.com');
  assert.equal(peerLogin.response.statusCode, 200);
  const peerToken = peerLogin.tokens.accessToken;

  const clientTenantField = await request(app, 'POST', '/api/v1/payments/payments', rootToken, {
    ...paymentInitiation(),
    organizationId: orgB.id,
  });
  assert.equal(clientTenantField.response.statusCode, 400);
  assert.equal(clientTenantField.body.error, 'validation_error');

  await capturePayment(app, rootToken);

  const crossTenantHeader = await request(
    app,
    'GET',
    '/api/v1/payments/payments',
    peerToken,
    undefined,
    { 'x-organization-id': orgB.id },
  );
  assert.equal(crossTenantHeader.response.statusCode, 403);
  assert.equal(crossTenantHeader.body.error, 'forbidden');

  const ownTenant = await success(
    app,
    'GET',
    '/api/v1/payments/payments',
    peerToken,
    undefined,
    200,
    { 'x-organization-id': orgA.id },
  );
  assert.deepEqual(ownTenant.payments, []);
});

test('public observability does not expose domain-event payloads', async (t) => {
  const { app, adminToken, orgA } = await createTenantFixture(t);
  const email = 'observability-leak-victim@example.com';

  const invitation = await request(
    app,
    'POST',
    `/api/v1/organizations/${orgA.id}/invitations`,
    adminToken,
    { email, roleCode: 'ORGANIZATION_MEMBER' },
    { 'x-organization-id': orgA.id },
  );
  assert.equal(invitation.response.statusCode, 201, JSON.stringify(invitation.body));

  const observability = await request(app, 'GET', '/api/v1/observability?limit=100');
  assert.equal(observability.response.statusCode, 200);
  assert.equal(observability.body.data.events.recent, undefined);
  assert.equal(observability.response.body.includes(email), false);
});

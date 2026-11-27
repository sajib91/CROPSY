const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
const test = require('node:test');

const { bearer, createTenantFixture, loginUser, register } = require('./support/auth-fixtures');

const PAYMENTS = '/api/v1/payments';
const WEBHOOK_SECRET = 'test-webhook-secret';
const MOCK_PROVIDERS = Object.freeze([
  {
    code: 'SANDBOX_MOCK',
    methods: ['CARD', 'MOBILE_BANKING', 'BANK_TRANSFER', 'CASH'],
    webhookSecret: WEBHOOK_SECRET,
  },
]);

async function createFixture(t) {
  const fixture = await createTenantFixture(t, {
    PAYMENT_PROVIDER_MODE: 'mock',
    PAYMENT_PROVIDERS_JSON: JSON.stringify(MOCK_PROVIDERS),
  });
  const root = await register(fixture.app, {
    email: 'root-payments@example.com',
    roles: ['FARMER'],
  });
  await fixture.store.addUserRole({
    userId: root.user.id,
    roleCode: 'CROPSY_SUPER_ADMIN',
    grantedBy: root.user.id,
  });
  const rootLogin = await loginUser(fixture.app, 'root-payments@example.com');
  assert.equal(rootLogin.response.statusCode, 200, rootLogin.response.body);
  const buyerLogin = await loginUser(fixture.app, 'peer@example.com');
  assert.equal(buyerLogin.response.statusCode, 200, buyerLogin.response.body);

  return {
    ...fixture,
    rootToken: rootLogin.tokens.accessToken,
    buyerToken: buyerLogin.tokens.accessToken,
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
  return result.body.data;
}

function initiation(overrides = {}) {
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
      ruleKey: 'CALLER_SUPPLIED_TEST_RULE',
      snapshot: { source: 'api-test' },
    },
    providerOptions: {},
    ...overrides,
  };
}

function webhookBody(paymentReference, overrides = {}) {
  return {
    eventId: randomUUID(),
    paymentReference,
    status: 'CAPTURED',
    amount: 100,
    currency: 'BDT',
    ...overrides,
  };
}

function webhookHeaders(body, secret = WEBHOOK_SECRET) {
  const digest = createHmac('sha256', secret)
    .update(`${body.eventId}.${JSON.stringify(body)}`)
    .digest('hex');
  return { 'x-webhook-signature': `sha256=${digest}` };
}

test('payment routes are default-deny and provider metadata hides secrets', async (t) => {
  const { app, rootToken, adminToken } = await createFixture(t);

  const anonymous = await request(app, 'GET', `${PAYMENTS}/providers`);
  assert.equal(anonymous.response.statusCode, 401);

  const forbidden = await request(app, 'POST', `${PAYMENTS}/payments`, adminToken, initiation());
  assert.equal(forbidden.response.statusCode, 403);

  const providers = await success(app, 'GET', `${PAYMENTS}/providers`, rootToken);
  assert.equal(providers.providers.length, 1);
  assert.equal(providers.providers[0].code, 'SANDBOX_MOCK');
  assert.deepEqual(providers.providers[0].methods, MOCK_PROVIDERS[0].methods);
  assert.equal(JSON.stringify(providers).includes(WEBHOOK_SECRET), false);
});

test('initiation is idempotent and verification posts one capture journal', async (t) => {
  const { app, rootToken } = await createFixture(t);
  const body = initiation({ idempotencyKey: 'payment-init-idem-001' });
  delete body.idempotencyKey;

  const initiated = await success(app, 'POST', `${PAYMENTS}/payments`, rootToken, body, 201, {
    'Idempotency-Key': 'payment-init-idem-001',
  });
  assert.equal(initiated.status, 'AUTHORIZED');
  assert.equal(initiated.idempotency_key, 'payment-init-idem-001');

  const duplicate = await success(app, 'POST', `${PAYMENTS}/payments`, rootToken, body, 201, {
    'Idempotency-Key': 'payment-init-idem-001',
  });
  assert.equal(duplicate.id, initiated.id);

  const mismatch = await request(
    app,
    'POST',
    `${PAYMENTS}/payments`,
    rootToken,
    { ...body, idempotencyKey: 'payment-init-idem-001' },
    { 'Idempotency-Key': 'different-key' },
  );
  assert.equal(mismatch.response.statusCode, 400);

  const badAllocation = await request(
    app,
    'POST',
    `${PAYMENTS}/payments`,
    rootToken,
    initiation({
      allocation: { sellerUserId: randomUUID(), sellerNetAmount: 40, commissionAmount: 10 },
    }),
  );
  assert.equal(badAllocation.response.statusCode, 400);

  const verified = await success(
    app,
    'POST',
    `${PAYMENTS}/payments/${initiated.id}/verify`,
    rootToken,
    {},
  );
  assert.equal(verified.status, 'CAPTURED');
  assert.equal(verified.captured_amount, 100);

  const history = await success(
    app,
    'GET',
    `${PAYMENTS}/payments/${initiated.id}/history`,
    rootToken,
  );
  // INITIATED is the durable claim written before the provider call; it
  // prevents a second request from creating another provider payment.
  assert.deepEqual(history.history.map((entry) => entry.to_status).sort(), [
    'AUTHORIZED',
    'CAPTURED',
    'INITIATED',
  ]);
});

test('webhooks require authenticity, deduplicate callbacks, and reject unknown references', async (t) => {
  const { app, rootToken } = await createFixture(t);
  const payment = await success(
    app,
    'POST',
    `${PAYMENTS}/payments`,
    rootToken,
    initiation({ providerOptions: { initialStatus: 'INITIATED' } }),
    201,
  );

  const body = webhookBody(payment.provider_reference);
  const badSignature = await request(
    app,
    'POST',
    `${PAYMENTS}/webhooks/SANDBOX_MOCK`,
    rootToken,
    body,
    { 'x-webhook-signature': 'sha256=invalid' },
  );
  assert.equal(badSignature.response.statusCode, 401);

  const processed = await success(
    app,
    'POST',
    `${PAYMENTS}/webhooks/SANDBOX_MOCK`,
    rootToken,
    body,
    200,
    webhookHeaders(body),
  );
  assert.equal(processed.duplicate, false);
  assert.equal(processed.payment.status, 'CAPTURED');

  const repeated = await success(
    app,
    'POST',
    `${PAYMENTS}/webhooks/SANDBOX_MOCK`,
    rootToken,
    body,
    200,
    webhookHeaders(body),
  );
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.payment.status, 'CAPTURED');

  const history = await success(
    app,
    'GET',
    `${PAYMENTS}/payments/${payment.id}/history`,
    rootToken,
  );
  assert.equal(history.history.length, 2);
  assert.equal(
    history.history.filter((entry) => entry.provider_event_id === body.eventId).length,
    1,
  );

  const unknown = webhookBody('unknown-provider-reference');
  const notFound = await request(
    app,
    'POST',
    `${PAYMENTS}/webhooks/SANDBOX_MOCK`,
    rootToken,
    unknown,
    webhookHeaders(unknown),
  );
  assert.equal(notFound.response.statusCode, 404);
});

test('refunds run through the adapter, post reversals, and are idempotent', async (t) => {
  const { app, rootToken } = await createFixture(t);
  const payment = await success(app, 'POST', `${PAYMENTS}/payments`, rootToken, initiation(), 201);
  await success(app, 'POST', `${PAYMENTS}/payments/${payment.id}/verify`, rootToken, {});

  const refundBody = {
    paymentId: payment.id,
    amount: 30,
    reason: 'QUALITY_ISSUE',
    idempotencyKey: 'refund-idem-001',
    allocation: {
      sellerUserId: payment.allocation_snapshot.sellerUserId,
      sellerNetAmount: 27,
      commissionReversalAmount: 3,
    },
    providerOptions: {},
  };

  const refund = await success(app, 'POST', `${PAYMENTS}/refunds`, rootToken, refundBody, 201);
  assert.equal(refund.status, 'PROCESSED');
  assert.ok(refund.provider_reference.startsWith('mock-refund-'));

  const repeated = await success(app, 'POST', `${PAYMENTS}/refunds`, rootToken, refundBody, 201);
  assert.equal(repeated.id, refund.id);

  const updated = await success(app, 'GET', `${PAYMENTS}/payments/${payment.id}`, rootToken);
  assert.equal(updated.status, 'PARTIALLY_REFUNDED');
  assert.equal(updated.refunded_amount, 30);

  const overRefund = await request(app, 'POST', `${PAYMENTS}/refunds`, rootToken, {
    ...refundBody,
    amount: 200,
    idempotencyKey: 'refund-idem-over',
    allocation: { sellerUserId: randomUUID(), sellerNetAmount: 180, commissionReversalAmount: 20 },
  });
  assert.equal(overRefund.response.statusCode, 409);

  const failedPayment = await success(
    app,
    'POST',
    `${PAYMENTS}/payments`,
    rootToken,
    initiation(),
    201,
  );
  await success(app, 'POST', `${PAYMENTS}/payments/${failedPayment.id}/verify`, rootToken, {});
  const failedRefund = await success(
    app,
    'POST',
    `${PAYMENTS}/refunds`,
    rootToken,
    {
      paymentId: failedPayment.id,
      amount: 10,
      reason: 'OTHER',
      idempotencyKey: 'refund-idem-failed',
      allocation: {
        sellerUserId: failedPayment.allocation_snapshot.sellerUserId,
        sellerNetAmount: 9,
        commissionReversalAmount: 1,
      },
      providerOptions: { forceFailure: true },
    },
    201,
  );
  assert.equal(failedRefund.status, 'FAILED');
  const unchanged = await success(
    app,
    'GET',
    `${PAYMENTS}/payments/${failedPayment.id}`,
    rootToken,
  );
  assert.equal(unchanged.status, 'CAPTURED');
  assert.equal(unchanged.refunded_amount, 0);
});

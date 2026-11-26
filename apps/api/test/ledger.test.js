const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');

const { bearer, createTenantFixture, loginUser, register } = require('./support/auth-fixtures');

const LEDGER = '/api/v1/ledger';

async function createFixture(t) {
  const fixture = await createTenantFixture(t);
  const root = await register(fixture.app, {
    email: 'root-ledger@example.com',
    roles: ['FARMER'],
  });
  await fixture.store.addUserRole({
    userId: root.user.id,
    roleCode: 'CROPSY_SUPER_ADMIN',
    grantedBy: root.user.id,
  });
  const rootLogin = await loginUser(fixture.app, 'root-ledger@example.com');
  assert.equal(rootLogin.response.statusCode, 200, rootLogin.response.body);

  return { ...fixture, rootToken: rootLogin.tokens.accessToken };
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

function captureJournal(idempotencyKey = randomUUID(), expectationKey) {
  return {
    idempotencyKey,
    referenceType: 'PAYMENT_CAPTURE',
    referenceId: randomUUID(),
    description: 'Configured platform commission capture',
    ...(expectationKey ? { expectationKey } : {}),
    lines: [
      {
        accountCode: 'CROPSY_BUYER_CLEARING',
        direction: 'DEBIT',
        bucket: 'PENDING',
        amount: 100,
      },
      {
        accountCode: 'CROPSY_SELLER_PAYABLE',
        direction: 'CREDIT',
        bucket: 'PENDING',
        amount: 90,
        ownerUserId: randomUUID(),
      },
      {
        accountCode: 'CROPSY_PLATFORM_REVENUE',
        direction: 'CREDIT',
        bucket: 'AVAILABLE',
        amount: 10,
      },
    ],
  };
}

test('ledger routes are default-deny except module info', async (t) => {
  const { app, rootToken, adminToken } = await createFixture(t);

  const anonymous = await request(app, 'GET', `${LEDGER}/balances`);
  assert.equal(anonymous.response.statusCode, 401);

  const forbidden = await request(app, 'GET', `${LEDGER}/balances`, adminToken);
  assert.equal(forbidden.response.statusCode, 403);

  const info = await request(app, 'GET', `${LEDGER}/info`);
  assert.equal(info.response.statusCode, 200);

  const accounts = await success(app, 'GET', `${LEDGER}/accounts`, rootToken);
  const codes = accounts.accounts.map((account) => account.code);
  assert.ok(codes.includes('CROPSY_BUYER_CLEARING'));
  assert.ok(codes.includes('CROPSY_SELLER_PAYABLE'));
  assert.ok(codes.includes('CROPSY_PLATFORM_REVENUE'));
});

test('balanced journals post once, move bucket balances, and reject imbalance', async (t) => {
  const { app, rootToken } = await createFixture(t);
  const body = captureJournal('ledger-capture-idem-001');

  const journal = await success(app, 'POST', `${LEDGER}/journals`, rootToken, body, 201);
  assert.equal(journal.status, 'POSTED');
  assert.equal(journal.lines.length, 3);

  const duplicate = await success(app, 'POST', `${LEDGER}/journals`, rootToken, body, 201);
  assert.equal(duplicate.id, journal.id);

  const journals = await success(app, 'GET', `${LEDGER}/journals`, rootToken);
  assert.equal(journals.journals.filter((entry) => entry.id === journal.id).length, 1);

  const detail = await success(app, 'GET', `${LEDGER}/journals/${journal.id}`, rootToken);
  assert.equal(detail.lines.length, 3);

  const bad = await request(app, 'POST', `${LEDGER}/journals`, rootToken, {
    ...captureJournal('ledger-unbalanced-idem'),
    lines: captureJournal()
      .lines.slice(0, 2)
      .map((line, index) => ({
        ...line,
        amount: index === 0 ? 100 : 95,
      })),
  });
  assert.equal(bad.response.statusCode, 400);

  const balances = await success(app, 'GET', `${LEDGER}/balances`, rootToken);
  const buyerPending = balances.balances.find(
    (entry) => entry.account_code === 'CROPSY_BUYER_CLEARING' && entry.bucket === 'PENDING',
  );
  const sellerPending = balances.balances.find(
    (entry) => entry.account_code === 'CROPSY_SELLER_PAYABLE' && entry.bucket === 'PENDING',
  );
  const revenueAvailable = balances.balances.find(
    (entry) => entry.account_code === 'CROPSY_PLATFORM_REVENUE' && entry.bucket === 'AVAILABLE',
  );
  assert.equal(buyerPending.balance, 100);
  assert.equal(sellerPending.balance, 90);
  assert.equal(revenueAvailable.balance, 10);

  const audit = await success(app, 'GET', `${LEDGER}/audit`, rootToken);
  assert.ok(audit.events.some((event) => event.entity_id === journal.id));

  const immutable = await app.inject({
    method: 'DELETE',
    url: `${LEDGER}/journals/${journal.id}`,
    headers: bearer(rootToken),
  });
  assert.equal(immutable.statusCode, 404);
});

test('reconciliation matches expectations and settlement uses caller-supplied rules', async (t) => {
  const { app, rootToken } = await createFixture(t);
  const sellerUserId = randomUUID();
  const expectationKey = `payment:${randomUUID()}`;
  const expectation = await success(
    app,
    'POST',
    `${LEDGER}/expectations`,
    rootToken,
    {
      expectationKey,
      referenceType: 'PAYMENT',
      amount: 100,
      currency: 'BDT',
    },
    201,
  );
  assert.equal(expectation.status, 'EXPECTED');

  const journal = await success(
    app,
    'POST',
    `${LEDGER}/journals`,
    rootToken,
    captureJournal('ledger-reconcile-idem', expectationKey),
    201,
  );

  const reconciled = await success(app, 'GET', `${LEDGER}/reconciliation`, rootToken);
  assert.equal(reconciled.reconciliation.balanced, true);
  assert.equal(reconciled.reconciliation.matched.length, 1);
  assert.equal(reconciled.reconciliation.matched[0].journal_id, journal.id);

  const settlementBody = {
    idempotencyKey: 'settlement-idem-001',
    sellerUserId,
    ruleKey: 'CALLER_SUPPLIED_SETTLEMENT_RULE',
    periodStart: '2026-11-01T00:00:00.000Z',
    periodEnd: '2026-11-30T00:00:00.000Z',
    grossAmount: 90,
    deductionsAmount: 0,
    netAmount: 90,
    currency: 'BDT',
    allocationSnapshot: { source: 'ledger-test', period: '2026-11' },
    journal: {
      idempotencyKey: 'settlement-journal-idem-001',
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
  };

  const settlement = await success(
    app,
    'POST',
    `${LEDGER}/settlements`,
    rootToken,
    settlementBody,
    201,
  );
  assert.equal(settlement.status, 'PAID');
  assert.equal(settlement.net_amount, 90);
  assert.ok(settlement.journal_id);

  const settlements = await success(app, 'GET', `${LEDGER}/settlements`, rootToken);
  assert.equal(settlements.settlements.filter((entry) => entry.id === settlement.id).length, 1);

  const balances = await success(app, 'GET', `${LEDGER}/balances`, rootToken);
  assert.ok(
    balances.balances.some(
      (entry) => entry.account_code === 'CROPSY_SETTLEMENT_CLEARING' && entry.bucket === 'SETTLED',
    ),
  );

  const invalidSettlement = await request(app, 'POST', `${LEDGER}/settlements`, rootToken, {
    ...settlementBody,
    idempotencyKey: 'settlement-idem-invalid',
    netAmount: 80,
  });
  assert.equal(invalidSettlement.response.statusCode, 400);
});

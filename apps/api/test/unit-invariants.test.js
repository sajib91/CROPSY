const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const test = require('node:test');

const { z } = require('@cropsy/validation');
const { HTTP_STATUS, fail, ok } = require('@cropsy/shared');

const {
  InfrastructureError,
  NotFoundError,
  ValidationError,
  isAppError,
} = require('../src/shared/kernel/errors');
const { normalizeError } = require('../src/shared/presentation/error-handler');
const { validate } = require('../src/shared/validation/validate');
const { assertRepository } = require('../src/shared/domain/repository');
const {
  createDefaultPolicy,
  normalizeRoleCode,
  validatePolicy,
} = require('../src/modules/iam/domain/auth-policy');
const {
  CHANNELS,
  EVENT_CATALOG,
  DeviceTokenRecord,
  recipientsFromEvent,
} = require('../src/modules/notifications/domain/notifications.entity');
const { deviceTokenSchema } = require('../src/modules/notifications/application/notifications.dto');
const {
  InProcessNotificationQueue,
  createNotificationQueue,
} = require('../src/modules/notifications/infrastructure/notification-queue');
const { LedgerInMemoryStore } = require('../src/modules/ledger/infrastructure/ledger.store');

test('response envelopes and centralized error normalization preserve stable contracts', () => {
  assert.deepEqual(ok({ id: '1' }, { requestId: 'req-1' }), {
    success: true,
    data: { id: '1' },
    meta: { requestId: 'req-1' },
  });
  assert.deepEqual(fail('bad_input', { message: 'Invalid input' }), {
    success: false,
    error: 'bad_input',
    meta: { message: 'Invalid input' },
  });
  assert.equal(HTTP_STATUS.CONFLICT, 409);

  const validationError = new ValidationError({
    message: 'Invalid input',
    details: { fieldErrors: { amount: ['Required'] } },
  });
  assert.equal(normalizeError(validationError), validationError);
  assert.equal(isAppError(validationError), true);

  const fastifyValidation = {
    statusCode: 400,
    validation: [{ instancePath: '/amount', message: 'must be positive' }],
  };
  const normalizedValidation = normalizeError(fastifyValidation);
  assert.ok(normalizedValidation instanceof ValidationError);
  assert.deepEqual(normalizedValidation.details, fastifyValidation.validation);

  const normalizedNotFound = normalizeError({ statusCode: 404, message: 'missing' });
  assert.ok(normalizedNotFound instanceof NotFoundError);
  assert.equal(normalizedNotFound.message, 'Route not found');

  const normalizedClientError = normalizeError({ statusCode: 422, message: 'Unprocessable' });
  assert.ok(normalizedClientError instanceof ValidationError);
  assert.equal(normalizedClientError.status, 400);

  const original = new Error('database password=hunter2');
  const normalizedServerError = normalizeError(original);
  assert.ok(normalizedServerError instanceof InfrastructureError);
  assert.equal(normalizedServerError.message, 'Internal server error');
  assert.equal(normalizedServerError.cause, original);
  assert.equal(JSON.stringify(normalizedServerError.toJSON()).includes('hunter2'), false);
});

test('input validation rejects invalid and unknown fields with typed details', () => {
  const schema = z
    .object({
      amount: z.number().positive(),
      currency: z.string().length(3).default('BDT'),
    })
    .strict();

  assert.deepEqual(validate(schema, { amount: 10 }, 'payment input'), {
    amount: 10,
    currency: 'BDT',
  });

  assert.throws(
    () => validate(schema, { amount: -1 }, 'payment input'),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.message, 'Invalid payment input');
      assert.ok(error.details.fieldErrors.amount);
      return true;
    },
  );

  assert.throws(
    () => validate(schema, { amount: 10, organizationId: randomUUID() }, 'payment input'),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.details.formErrors.some((message) => message.includes('organizationId')));
      return true;
    },
  );
});

test('RBAC policy defaults are internally consistent and legacy roles normalize', () => {
  const policy = createDefaultPolicy();
  assert.equal(validatePolicy(policy), policy);
  assert.ok(policy.permissions.some((permission) => permission.code === 'notifications.read'));
  assert.ok(policy.permissions.some((permission) => permission.code === 'notifications.manage'));
  assert.ok(policy.rolePermissions.ORGANIZATION_ADMIN.includes('notifications.manage'));
  assert.ok(policy.rolePermissions.ORGANIZATION_MEMBER.includes('notifications.read'));

  assert.equal(normalizeRoleCode('  organization admin '), 'ORGANIZATION_ADMIN');
  assert.equal(normalizeRoleCode('warehouse-manager'), 'WAREHOUSE_MANAGER');
  assert.equal(normalizeRoleCode(null), null);

  const malformed = createDefaultPolicy();
  malformed.rolePermissions.ORGANIZATION_ADMIN = ['notifications.manage', 'unknown.permission'];
  assert.throws(() => validatePolicy(malformed), /unknown permission/);
});

test('repository contracts reject incomplete adapters before use', () => {
  const token = Symbol.for('cropsy.repository.invariant-test');
  const adapter = { get() {}, save() {} };
  assert.equal(assertRepository(adapter, ['get', 'save'], token), adapter);
  assert.throws(
    () => assertRepository({ get() {} }, ['get', 'save'], token),
    /missing required method\(s\): save/,
  );
  assert.throws(() => assertRepository(null, ['get'], token), /must be an object/);
});

test('notification catalog and recipient extraction stay backend-owned', () => {
  for (const [eventType, definition] of Object.entries(EVENT_CATALOG)) {
    assert.ok(eventType.includes('.'), `${eventType} must use a namespaced domain event name`);
    assert.ok(definition.type);
    assert.ok(definition.category);
    assert.ok(definition.channels.length > 0);
    assert.ok(definition.channels.every((channel) => CHANNELS.includes(channel)));
  }

  const recipient = randomUUID();
  const seller = randomUUID();
  const event = {
    payload: {
      recipientUserId: recipient,
      sellerUserId: seller,
      duplicateUserId: recipient,
      actorUserId: 'not-a-uuid',
      userIds: [seller, recipient],
    },
  };
  assert.deepEqual(new Set(recipientsFromEvent(event)), new Set([recipient, seller]));
  assert.deepEqual(recipientsFromEvent({}), []);

  const token = 'device-token-abcdefgh';
  const record = DeviceTokenRecord({
    userId: recipient,
    token,
    platform: 'ANDROID',
  });
  assert.equal(record.token_hash, createHash('sha256').update(token).digest('hex'));
  assert.equal(
    validate(deviceTokenSchema, { token, platform: record.platform }, 'device token').platform,
    'ANDROID',
  );
});

test('notification queue defaults to in-process delivery and invokes its configured handler', async () => {
  const queue = createNotificationQueue({ env: {} });
  assert.ok(queue instanceof InProcessNotificationQueue);
  assert.throws(() => queue.setHandler(null), /handler is required/);

  const handled = new Promise((resolve) => {
    queue.setHandler(async (job) => resolve(job));
  });
  const jobId = await queue.enqueue({ jobId: 'notification-job-1' }, { delayMs: 1 });
  assert.equal(jobId, 'notification-job-1');

  const job = await handled;
  assert.equal(job.id, 'notification-job-1');
  assert.equal(job.data.jobId, 'notification-job-1');
  await queue.close();
});

test('ledger idempotency keys cannot be reused for a different journal', async () => {
  const store = new LedgerInMemoryStore();
  await store.ensureAccounts([
    { code: 'TEST_DEBIT', name: 'Test debit', accountType: 'ASSET', normalBalance: 'DEBIT' },
    { code: 'TEST_CREDIT', name: 'Test credit', accountType: 'LIABILITY', normalBalance: 'CREDIT' },
  ]);
  const input = (referenceId) => ({
    idempotency_key: 'ledger-idempotency-conflict',
    reference_type: 'PAYMENT_CAPTURE',
    reference_id: referenceId,
    currency: 'BDT',
    lines: [
      { account_code: 'TEST_DEBIT', direction: 'DEBIT', bucket: 'PENDING', amount: 10 },
      { account_code: 'TEST_CREDIT', direction: 'CREDIT', bucket: 'PENDING', amount: 10 },
    ],
  });

  const posted = await store.postJournal(input('payment-1'));
  const replay = await store.postJournal(input('payment-1'));
  assert.equal(replay.id, posted.id);

  await assert.rejects(
    async () => store.postJournal(input('payment-2')),
    /idempotency key is already in use/i,
  );

  await assert.rejects(
    async () =>
      store.postJournal({
        ...input('payment-3'),
        idempotency_key: 'ledger-currency-conflict',
        currency: 'USD',
      }),
    /currency does not match/i,
  );
});

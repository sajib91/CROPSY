const assert = require('node:assert/strict');
const test = require('node:test');

const buildServer = require('../src/app');
const { authTestEnv, bearer, loginUser, register, verifyOtp } = require('./support/auth-fixtures');
const { AuthStoreToken } = require('../src/modules/iam/domain/auth.repository');
const { InMemoryRateLimiter } = require('../src/shared/security/rate-limit');
const {
  NotificationsServiceToken,
} = require('../src/modules/notifications/application/notifications.service');

const BASE = '/api/v1/notifications';

class FakeQueue {
  constructor() {
    this.jobs = [];
    this.handler = null;
  }

  setHandler(handler) {
    this.handler = handler;
  }

  async enqueue(payload) {
    this.jobs.push(payload);
    return payload.jobId;
  }

  async drain(limit = Number.POSITIVE_INFINITY) {
    let processed = 0;
    while (this.jobs.length > 0 && processed < limit) {
      const job = this.jobs.shift();
      await this.handler({ data: job, id: job.jobId });
      processed += 1;
    }
    return processed;
  }

  async close() {}
}

function fakeRealtime() {
  const events = [];
  return {
    events,
    attach() {},
    emitToUser(userId, event, payload) {
      events.push({ userId, event, payload });
    },
    async close() {},
  };
}

function fakeProviders(failures = {}, realtime = null) {
  const attempts = {};
  return {
    attempts,
    isConfigured() {
      return true;
    },
    get() {
      return { name: 'fake' };
    },
    async send({ channel, notification }) {
      attempts[channel] = (attempts[channel] || 0) + 1;
      if (attempts[channel] <= (failures[channel] || 0)) {
        throw new Error(`${channel} provider unavailable`);
      }
      if (channel === 'IN_APP') {
        realtime?.emitToUser(notification.user_id, 'notification', {
          id: notification.id,
          title: notification.title,
        });
      }
      return {
        state: channel === 'IN_APP' ? 'delivered' : 'sent',
        provider: 'fake',
        notificationId: notification.id,
      };
    },
  };
}

async function createHarness(t, { providers, queue, realtime } = {}) {
  const rateLimiter = new InMemoryRateLimiter({ maxAttempts: 1000, windowSeconds: 60 });
  const app = await buildServer({
    env: authTestEnv({
      NOTIFICATION_MAX_ATTEMPTS: 3,
      NOTIFICATION_RETRY_BASE_MS: 100,
    }),
    logger: false,
    rateLimiter,
    notificationProviders: providers || fakeProviders(),
    notificationQueue: queue || new FakeQueue(),
    notificationRealtime: realtime || fakeRealtime(),
  });
  t.after(() => app.close());
  return {
    app,
    queue:
      queue ||
      app.cropsyContainer.resolve(require('../src/shared/di/tokens').NotificationQueueToken),
  };
}

async function makeUser(app, email, roles) {
  const registration = await register(app, { email, roles });
  assert.equal(registration.response.statusCode, 201, registration.response.body);
  const verified = await verifyOtp(app, {
    channel: 'email',
    purpose: 'EMAIL_VERIFICATION',
    destination: email,
    code: registration.code,
  });
  assert.equal(verified.response.statusCode, 200, verified.response.body);
  const login = await loginUser(app, email);
  assert.equal(login.response.statusCode, 200, login.response.body);
  return { id: registration.user.id, token: login.tokens.accessToken };
}

async function makeManager(app, email) {
  const user = await makeUser(app, email, ['FARMER']);
  const store = app.cropsyContainer.resolve(AuthStoreToken);
  await store.addUserRole({
    userId: user.id,
    roleCode: 'CROPSY_SUPER_ADMIN',
    grantedBy: user.id,
  });
  const login = await loginUser(app, email);
  assert.equal(login.response.statusCode, 200, login.response.body);
  return { id: user.id, token: login.tokens.accessToken };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for notification dispatch.');
}

test('notification feed is authorization-scoped and supports marking notifications read', async (t) => {
  const { app } = await createHarness(t);
  const farmer = await makeUser(app, 'notifications-farmer@example.com', ['FARMER']);
  const buyer = await makeUser(app, 'notifications-buyer@example.com', ['BUYER']);

  const unauthenticated = await app.inject({ method: 'GET', url: BASE });
  assert.equal(unauthenticated.statusCode, 401);

  const service = app.cropsyContainer.resolve(NotificationsServiceToken);
  await service.publishNotification({
    userId: buyer.id,
    type: 'ORDER_PLACED',
    title: 'Order placed',
    body: 'Your order was placed.',
    channels: ['IN_APP'],
  });

  const feed = await app.inject({ method: 'GET', url: BASE, headers: bearer(buyer.token) });
  assert.equal(feed.statusCode, 200, feed.body);
  assert.equal(feed.json().data.notifications.length, 1);

  const crossUser = await app.inject({
    method: 'GET',
    url: `${BASE}?userId=${farmer.id}`,
    headers: bearer(buyer.token),
  });
  assert.equal(crossUser.statusCode, 403);

  const notificationId = feed.json().data.notifications[0].id;
  const marked = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${notificationId}/read`,
    headers: bearer(buyer.token),
  });
  assert.equal(marked.statusCode, 200, marked.body);
  assert.equal(marked.json().data.status, 'READ');
  assert.ok(marked.json().data.readAt);

  const otherUserMark = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${notificationId}/read`,
    headers: bearer(farmer.token),
  });
  assert.equal(otherUserMark.statusCode, 403);

  const device = await app.inject({
    method: 'POST',
    url: `${BASE}/device-tokens`,
    headers: bearer(buyer.token),
    payload: { token: 'device-token-abcdefgh', platform: 'ANDROID' },
  });
  assert.equal(device.statusCode, 200, device.body);
  assert.equal(device.json().data.platform, 'ANDROID');
});

test('domain events respect preferences, deliver through configured channels, and emit realtime updates', async (t) => {
  const queue = new FakeQueue();
  const realtime = fakeRealtime();
  const providers = fakeProviders({}, realtime);
  const { app } = await createHarness(t, { queue, realtime, providers });
  const buyer = await makeUser(app, 'notifications-preferences@example.com', ['BUYER']);

  const preferences = await app.inject({
    method: 'PUT',
    url: '/api/v1/users/me/preferences',
    headers: bearer(buyer.token),
    payload: [{ channel: 'EMAIL', eventType: 'ORDER_PLACED', enabled: false }],
  });
  assert.equal(preferences.statusCode, 200, preferences.body);

  app.cropsyEventBus.publish({
    type: 'orders.order.placed',
    moduleId: 'orders',
    aggregateId: 'order-123',
    payload: { buyerUserId: buyer.id, title: 'Order confirmed', organizationId: null },
  });

  await waitFor(() => queue.jobs.length >= 2);
  const feed = await app.inject({ method: 'GET', url: BASE, headers: bearer(buyer.token) });
  assert.equal(feed.statusCode, 200, feed.body);
  const notifications = feed.json().data.notifications;
  assert.equal(notifications.length, 2);
  assert.deepEqual(notifications.map((notification) => notification.channel).sort(), [
    'IN_APP',
    'PUSH',
  ]);
  assert.equal(
    notifications.some((notification) => notification.channel === 'EMAIL'),
    false,
  );
  assert.equal(notifications[0].data.sourceEvent, 'orders.order.placed');

  const processed = await queue.drain();
  assert.equal(processed, 2);
  assert.ok(realtime.events.some((event) => event.event === 'notification'));
  assert.ok(providers.attempts.IN_APP >= 1);
  assert.ok(providers.attempts.PUSH >= 1);

  const first = notifications.find((notification) => notification.channel === 'IN_APP');
  const delivery = await app.inject({
    method: 'GET',
    url: `${BASE}/${first.id}/delivery`,
    headers: bearer(buyer.token),
  });
  assert.equal(delivery.statusCode, 200, delivery.body);
  assert.equal(delivery.json().data.notification.status, 'DELIVERED');
  assert.equal(delivery.json().data.attempts[0].state, 'delivered');
});

test('failed deliveries are logged, retried with backoff, and only managers can inspect them', async (t) => {
  const queue = new FakeQueue();
  const providers = fakeProviders({ PUSH: 1 });
  const { app } = await createHarness(t, { queue, providers });
  const buyer = await makeUser(app, 'notifications-retry@example.com', ['BUYER']);

  const service = app.cropsyContainer.resolve(NotificationsServiceToken);
  const [notification] = await service.publishNotification({
    userId: buyer.id,
    type: 'SHIPMENT_STATUS_CHANGED',
    title: 'Shipment delayed',
    body: 'Your shipment was delayed.',
    channels: ['PUSH'],
  });

  await queue.drain(1);
  assert.equal(providers.attempts.PUSH, 1);
  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.jobs[0].attempt, 2);

  await queue.drain(1);
  assert.equal(providers.attempts.PUSH, 2);

  const delivery = await app.inject({
    method: 'GET',
    url: `${BASE}/${notification.id}/delivery`,
    headers: bearer(buyer.token),
  });
  assert.equal(delivery.statusCode, 200, delivery.body);
  assert.equal(delivery.json().data.attempts.length, 2);
  assert.equal(delivery.json().data.attempts[0].state, 'failed');
  assert.equal(delivery.json().data.attempts[1].state, 'sent');

  const denied = await app.inject({
    method: 'GET',
    url: `${BASE}/admin/failures`,
    headers: bearer(buyer.token),
  });
  assert.equal(denied.statusCode, 403);

  const managerContext = {
    user: { id: buyer.id },
    permissions: ['notifications.manage'],
    isSuperAdmin: false,
  };
  const failures = await service.listFailures({ context: managerContext, query: {} });
  assert.equal(failures.length, 1);
  assert.match(failures[0].error, /unavailable/);

  const repository = app.cropsyContainer.resolve(
    require('../src/modules/notifications/domain/notifications.repository')
      .NotificationsRepositoryToken,
  );
  await repository.updateNotification(notification.id, { status: 'FAILED' });
  const retry = await service.retryFailed({
    context: managerContext,
    notificationId: notification.id,
  });
  assert.equal(retry.retried, true);
  assert.equal(retry.notification.status, 'PENDING');
  assert.equal(queue.jobs.length, 1);
});

test('read-all, device revocation, and admin retry are enforced over HTTP', async (t) => {
  const queue = new FakeQueue();
  const providers = fakeProviders({ PUSH: 99 });
  const { app } = await createHarness(t, { queue, providers });
  const buyer = await makeUser(app, 'notifications-http-buyer@example.com', ['BUYER']);
  const manager = await makeManager(app, 'notifications-http-manager@example.com');
  const service = app.cropsyContainer.resolve(NotificationsServiceToken);

  await service.publishNotification({
    userId: buyer.id,
    type: 'ORDER_PLACED',
    title: 'First order',
    body: 'First order body',
    channels: ['IN_APP'],
  });
  await service.publishNotification({
    userId: buyer.id,
    type: 'ORDER_STATUS_CHANGED',
    title: 'Second order',
    body: 'Second order body',
    channels: ['IN_APP'],
  });

  const beforeReadAll = await app.inject({
    method: 'GET',
    url: BASE,
    headers: bearer(buyer.token),
  });
  assert.equal(beforeReadAll.statusCode, 200, beforeReadAll.body);
  assert.equal(beforeReadAll.json().data.notifications.length, 2);

  const readAll = await app.inject({
    method: 'POST',
    url: `${BASE}/read-all`,
    headers: bearer(buyer.token),
  });
  assert.equal(readAll.statusCode, 200, readAll.body);
  assert.equal(readAll.json().data.updated, 2);

  const afterReadAll = await app.inject({
    method: 'GET',
    url: BASE,
    headers: bearer(buyer.token),
  });
  assert.equal(afterReadAll.statusCode, 200);
  assert.ok(afterReadAll.json().data.notifications.every((entry) => entry.status === 'READ'));
  assert.ok(afterReadAll.json().data.notifications.every((entry) => entry.readAt));

  const secondReadAll = await app.inject({
    method: 'POST',
    url: `${BASE}/read-all`,
    headers: bearer(buyer.token),
  });
  assert.equal(secondReadAll.statusCode, 200);
  assert.equal(secondReadAll.json().data.updated, 0);

  while (queue.jobs.length > 0) await queue.drain(1);

  const device = await app.inject({
    method: 'POST',
    url: `${BASE}/device-tokens`,
    headers: bearer(buyer.token),
    payload: { token: 'http-device-token-abcdefgh', platform: 'IOS' },
  });
  assert.equal(device.statusCode, 200, device.body);
  assert.equal(device.json().data.platform, 'IOS');

  const revoke = await app.inject({
    method: 'POST',
    url: `${BASE}/device-tokens/revoke`,
    headers: bearer(buyer.token),
    payload: { token: 'http-device-token-abcdefgh' },
  });
  assert.equal(revoke.statusCode, 200, revoke.body);
  assert.equal(revoke.json().data.removed, true);

  const revokeAgain = await app.inject({
    method: 'POST',
    url: `${BASE}/device-tokens/revoke`,
    headers: bearer(buyer.token),
    payload: { token: 'http-device-token-abcdefgh' },
  });
  assert.equal(revokeAgain.statusCode, 200);
  assert.equal(revokeAgain.json().data.removed, false);

  const [failed] = await service.publishNotification({
    userId: buyer.id,
    type: 'SHIPMENT_STATUS_CHANGED',
    title: 'Shipment delayed',
    body: 'Shipment delayed body',
    channels: ['PUSH'],
  });
  let drained = 0;
  while (queue.jobs.length > 0 && drained < 10) {
    await queue.drain(1);
    drained += 1;
  }
  assert.ok(drained >= 3);
  assert.equal(queue.jobs.length, 0);

  const failedDelivery = await app.inject({
    method: 'GET',
    url: `${BASE}/${failed.id}/delivery`,
    headers: bearer(buyer.token),
  });
  assert.equal(failedDelivery.statusCode, 200, failedDelivery.body);
  assert.equal(failedDelivery.json().data.notification.status, 'FAILED');
  assert.ok(failedDelivery.json().data.attempts.length >= 3);

  const managerFailures = await app.inject({
    method: 'GET',
    url: `${BASE}/admin/failures`,
    headers: bearer(manager.token),
  });
  assert.equal(managerFailures.statusCode, 200, managerFailures.body);
  assert.ok(managerFailures.json().data.length >= 3);

  const retry = await app.inject({
    method: 'POST',
    url: `${BASE}/admin/${failed.id}/retry`,
    headers: bearer(manager.token),
  });
  assert.equal(retry.statusCode, 200, retry.body);
  assert.equal(retry.json().data.retried, true);
  assert.equal(retry.json().data.notification.status, 'PENDING');
  assert.equal(queue.jobs.length, 1);

  const buyerRetry = await app.inject({
    method: 'POST',
    url: `${BASE}/admin/${failed.id}/retry`,
    headers: bearer(buyer.token),
  });
  assert.equal(buyerRetry.statusCode, 403);
  assert.equal(buyerRetry.json().error, 'forbidden');
});

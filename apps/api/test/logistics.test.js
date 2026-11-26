const assert = require('node:assert/strict');
const test = require('node:test');

const { OrdersStoreToken } = require('../src/modules/orders/domain/orders.repository');
const { bearer, createTenantFixture, loginUser, register } = require('./support/auth-fixtures');

const LOGISTICS = '/api/v1/logistics';

function uuid(number) {
  return `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
}

async function login(app, email) {
  const result = await loginUser(app, email);
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.tokens.accessToken;
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

async function success(app, method, url, token, payload, status = 200) {
  const result = await request(app, method, url, token, payload);
  assert.equal(result.response.statusCode, status, JSON.stringify(result.body));
  return result.body.data;
}

async function createLogisticsFixture(t) {
  const fixture = await createTenantFixture(t, { LOGISTICS_STORE: 'memory' });
  const { app, store, orgA, adminId, peerId } = fixture;
  const buyerToken = await login(app, 'peer@example.com');
  const otherBuyerToken = await login(app, 'other-org@example.com');

  const providerRegistration = await register(app, {
    email: 'provider@example.com',
    roles: ['LOGISTICS_PROVIDER'],
  });
  assert.equal(providerRegistration.response.statusCode, 201, providerRegistration.response.body);
  await store.addOrganizationMember({
    organizationId: orgA.id,
    userId: providerRegistration.user.id,
    status: 'ACTIVE',
  });
  const providerToken = await login(app, 'provider@example.com');

  const orderId = uuid(9401);
  const ordersStore = app.cropsyContainer.resolve(OrdersStoreToken);
  ordersStore.orders.set(orderId, {
    id: orderId,
    organization_id: orgA.id,
    purchase_group_id: uuid(9402),
    cart_id: uuid(9403),
    buyer_user_id: peerId,
    seller_user_id: adminId,
    status: 'CONFIRMED',
    currency: 'BDT',
    subtotal_amount: 100,
    discount_amount: 0,
    delivery_fee_amount: 10,
    tax_amount: 0,
    total_amount: 110,
    pricing_snapshot: {},
    placed_at: new Date('2026-11-20T00:00:00Z'),
    confirmed_at: new Date('2026-11-20T01:00:00Z'),
    created_at: new Date('2026-11-20T00:00:00Z'),
    updated_at: new Date('2026-11-20T01:00:00Z'),
  });

  const provider = await success(
    app,
    'POST',
    `${LOGISTICS}/providers`,
    fixture.adminToken,
    {
      organizationId: orgA.id,
      ownerUserId: providerRegistration.user.id,
      code: 'DBTEST-COURIER',
      name: 'DB Test Courier',
      longitude: 90.4125,
      latitude: 23.8103,
      serviceRadiusKm: 50,
      serviceTypes: ['STANDARD', 'EXPRESS'],
    },
    201,
  );

  const service = await success(
    app,
    'POST',
    `${LOGISTICS}/services`,
    fixture.adminToken,
    {
      providerId: provider.id,
      code: 'DBTEST-STANDARD',
      name: 'DB Test Standard',
      serviceType: 'STANDARD',
      estimatedHours: 24,
    },
    201,
  );

  return {
    ...fixture,
    buyerToken,
    otherBuyerToken,
    providerToken,
    providerUserId: providerRegistration.user.id,
    orderId,
    provider,
    service,
  };
}

test('logistics routes are default-deny except module info', async (t) => {
  const { app } = await createTenantFixture(t, { LOGISTICS_STORE: 'memory' });

  const info = await app.inject({ method: 'GET', url: `${LOGISTICS}/info` });
  assert.equal(info.statusCode, 200);

  for (const url of [`${LOGISTICS}/providers`, `${LOGISTICS}/shipments`, `${LOGISTICS}/audits`]) {
    const response = await app.inject({ method: 'GET', url });
    assert.equal(response.statusCode, 401, url);
  }

  const write = await app.inject({
    method: 'POST',
    url: `${LOGISTICS}/shipments`,
    payload: { referenceKey: 'denied' },
  });
  assert.equal(write.statusCode, 401);
});

test('nearby provider discovery uses supplied coordinates and rejects partial pairs', async (t) => {
  const { app, adminToken, provider } = await createLogisticsFixture(t);

  const nearby = await success(
    app,
    'GET',
    `${LOGISTICS}/providers/nearby?longitude=90.4125&latitude=23.8103&radiusKm=1&serviceType=STANDARD`,
    adminToken,
  );
  assert.equal(nearby.length, 1);
  assert.equal(nearby[0].id, provider.id);
  assert.equal(nearby[0].distanceKm, 0);

  const far = await success(
    app,
    'GET',
    `${LOGISTICS}/providers/nearby?longitude=91.7832&latitude=22.3569&radiusKm=1`,
    adminToken,
  );
  assert.equal(far.length, 0);

  const invalid = await request(
    app,
    'GET',
    `${LOGISTICS}/providers/nearby?longitude=90.4125&radiusKm=1`,
    adminToken,
  );
  assert.equal(invalid.response.statusCode, 400);
});

test('shipment lifecycle records proof, buyer confirmation, audits, and dashboards', async (t) => {
  const { app, adminToken, buyerToken, providerToken, provider, service, orderId, providerUserId } =
    await createLogisticsFixture(t);

  const invalid = await request(app, 'POST', `${LOGISTICS}/shipments`, adminToken, {
    orderId,
    referenceKey: 'DBTEST-SHIPMENT-INVALID',
    pickupLongitude: 90.4125,
  });
  assert.equal(invalid.response.statusCode, 400);

  const shipment = await success(
    app,
    'POST',
    `${LOGISTICS}/shipments`,
    adminToken,
    {
      orderId,
      referenceKey: 'DBTEST-SHIPMENT-001',
      providerId: provider.id,
      serviceId: service.id,
      pickupLongitude: 90.4125,
      pickupLatitude: 23.8103,
      destinationLongitude: 90.4126,
      destinationLatitude: 23.8104,
      notes: 'Caller-supplied coordinates only.',
    },
    201,
  );
  assert.equal(shipment.status, 'PENDING');
  assert.equal(shipment.providerId, provider.id);
  assert.ok(shipment.plannedDistanceKm > 0);

  const duplicate = await request(app, 'POST', `${LOGISTICS}/shipments`, adminToken, {
    orderId,
    referenceKey: 'DBTEST-SHIPMENT-001',
  });
  assert.equal(duplicate.response.statusCode, 409);

  const buyerCannotManage = await request(
    app,
    'POST',
    `${LOGISTICS}/shipments/${shipment.id}/status`,
    buyerToken,
    { status: 'IN_TRANSIT' },
  );
  assert.equal(buyerCannotManage.response.statusCode, 403);

  const pickup = await success(
    app,
    'POST',
    `${LOGISTICS}/shipments/${shipment.id}/pickup`,
    adminToken,
    { scheduledAt: '2026-11-27T09:00:00Z' },
    201,
  );
  assert.equal(pickup.phase, 'PICKUP');
  assert.equal(pickup.status, 'SCHEDULED');

  const assigned = await success(
    app,
    'POST',
    `${LOGISTICS}/shipments/${shipment.id}/assignment`,
    adminToken,
    {
      providerId: provider.id,
      serviceId: service.id,
      assigneeUserId: providerUserId,
      note: 'Assigned to registered provider owner.',
    },
  );
  assert.equal(assigned.providerId, provider.id);
  assert.equal(assigned.assignedUserId, providerUserId);

  const inTransit = await success(
    app,
    'POST',
    `${LOGISTICS}/shipments/${shipment.id}/status`,
    providerToken,
    { status: 'IN_TRANSIT', note: 'Caller-reported checkpoint.' },
  );
  assert.equal(inTransit.status, 'IN_TRANSIT');
  assert.ok(inTransit.shippedAt);

  const tracking = await success(
    app,
    'GET',
    `${LOGISTICS}/shipments/${shipment.id}/tracking`,
    buyerToken,
  );
  assert.equal(tracking.liveLocation, null);
  assert.match(tracking.locationPolicy, /no live GPS feed is simulated/i);
  assert.ok(tracking.events.length >= 3);
  assert.equal(tracking.route.source, 'SUPPLIED_COORDINATES');

  const proof = await success(
    app,
    'POST',
    `${LOGISTICS}/deliveries/${pickup.id}/proof`,
    providerToken,
    {
      proofUrl: 'https://example.com/logistics/dbtest-proof.jpg',
      proofHash: 'dbtest-proof-hash',
      recipientName: 'Test Buyer',
      capturedAt: '2026-11-27T12:00:00Z',
    },
  );
  assert.equal(proof.status, 'DELIVERED');
  assert.equal(proof.proofUrl, 'https://example.com/logistics/dbtest-proof.jpg');

  const delivered = await success(app, 'GET', `${LOGISTICS}/shipments/${shipment.id}`, buyerToken);
  assert.equal(delivered.status, 'DELIVERED');

  const confirmed = await success(
    app,
    'POST',
    `${LOGISTICS}/deliveries/${pickup.id}/confirm`,
    buyerToken,
    { note: 'Received in good condition.' },
  );
  assert.ok(confirmed.confirmedAt);

  const history = await success(
    app,
    'GET',
    `${LOGISTICS}/shipments/${shipment.id}/history`,
    buyerToken,
  );
  assert.ok(history.events.some((event) => event.status === 'BUYER_CONFIRMED'));
  assert.ok(history.audits.some((audit) => audit.action === 'logistics.delivery.confirmed'));

  const audits = await success(app, 'GET', `${LOGISTICS}/audits`, adminToken);
  assert.ok(audits.some((audit) => audit.shipmentId === shipment.id));

  const buyerDashboard = await success(app, 'GET', `${LOGISTICS}/dashboard/buyer`, buyerToken);
  assert.equal(buyerDashboard.total, 1);
  assert.equal(buyerDashboard.shipments[0].id, shipment.id);

  const sellerDashboard = await success(app, 'GET', `${LOGISTICS}/dashboard/seller`, adminToken);
  assert.equal(sellerDashboard.total, 1);

  const providerDashboard = await success(
    app,
    'GET',
    `${LOGISTICS}/dashboard/provider`,
    providerToken,
  );
  assert.equal(providerDashboard.total, 1);
});

test('failed delivery attempts remain in shipment history', async (t) => {
  const { app, adminToken, orderId } = await createLogisticsFixture(t);
  const shipment = await success(
    app,
    'POST',
    `${LOGISTICS}/shipments`,
    adminToken,
    {
      orderId,
      referenceKey: 'DBTEST-SHIPMENT-FAILED',
    },
    201,
  );
  const pickup = await success(
    app,
    'POST',
    `${LOGISTICS}/shipments/${shipment.id}/pickup`,
    adminToken,
    { scheduledAt: '2026-11-28T09:00:00Z' },
    201,
  );

  const failed = await success(
    app,
    'POST',
    `${LOGISTICS}/deliveries/${pickup.id}/failure`,
    adminToken,
    {
      reasonCode: 'RECIPIENT_UNAVAILABLE',
      note: 'No recipient at the door.',
      retryAt: '2026-11-28T15:00:00Z',
    },
  );
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.reasonCode, 'RECIPIENT_UNAVAILABLE');

  const updated = await success(app, 'GET', `${LOGISTICS}/shipments/${shipment.id}`, adminToken);
  assert.equal(updated.status, 'FAILED');

  const history = await success(
    app,
    'GET',
    `${LOGISTICS}/shipments/${shipment.id}/history`,
    adminToken,
  );
  assert.ok(history.deliveries.some((delivery) => delivery.status === 'FAILED'));
});

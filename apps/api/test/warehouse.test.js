const assert = require('node:assert/strict');
const test = require('node:test');

const { bearer, createTenantFixture, loginUser } = require('./support/auth-fixtures');

const CATALOG = '/api/v1/catalog';
const WAREHOUSE = '/api/v1/warehouse';

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

async function createProduct(app, token, organizationId) {
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
    (item) => item.code === 'WH-GRAINS',
  );
  if (!category) {
    category = await success(
      app,
      'POST',
      `${CATALOG}/categories`,
      token,
      { organizationId, code: 'WH-GRAINS', name: 'Warehouse grains', nameBn: 'গোদাম শস্য' },
      201,
    );
  }
  return success(
    app,
    'POST',
    `${CATALOG}/products`,
    token,
    {
      categoryId: category.id,
      sku: 'WH-RICE-1',
      name: 'Warehouse rice',
      nameBn: 'গোদাম চাল',
      unitCode: 'KG',
    },
    201,
  );
}

test('warehouse stock reservations are idempotent and prevent overselling', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;
  const product = await createProduct(app, adminToken, orgA.id);

  const warehouse = await success(
    app,
    'POST',
    `${WAREHOUSE}/warehouses`,
    adminToken,
    { organizationId: orgA.id, code: 'WH-MAIN', name: 'Main warehouse' },
    201,
  );
  assert.equal(warehouse.organizationId, orgA.id);

  const inventory = await success(
    app,
    'POST',
    `${WAREHOUSE}/inventories`,
    adminToken,
    {
      organizationId: orgA.id,
      warehouseId: warehouse.id,
      productId: product.id,
      batchCode: 'BATCH-1',
      quantity: 100,
      unitCode: 'KG',
      lowStockThreshold: 20,
      referenceKey: 'stock-register-1',
    },
    201,
  );
  assert.equal(inventory.quantityOnHand, 100);
  assert.equal(inventory.availableQuantity, 100);

  const first = await success(
    app,
    'POST',
    `${WAREHOUSE}/inventories/${inventory.id}/reservations`,
    adminToken,
    { quantity: 60, referenceKey: 'order-1', reason: 'First buyer order' },
    201,
  );
  assert.equal(first.status, 'ACTIVE');
  const afterFirst = await success(
    app,
    'GET',
    `${WAREHOUSE}/inventories/${inventory.id}`,
    adminToken,
  );
  assert.equal(afterFirst.quantityReserved, 60);
  assert.equal(afterFirst.availableQuantity, 40);

  const replay = await success(
    app,
    'POST',
    `${WAREHOUSE}/inventories/${inventory.id}/reservations`,
    adminToken,
    { quantity: 60, referenceKey: 'order-1' },
    201,
  );
  assert.equal(replay.id, first.id);
  const afterReplay = await success(
    app,
    'GET',
    `${WAREHOUSE}/inventories/${inventory.id}`,
    adminToken,
  );
  assert.equal(afterReplay.availableQuantity, 40);

  const oversell = await request(
    app,
    'POST',
    `${WAREHOUSE}/inventories/${inventory.id}/reservations`,
    adminToken,
    { quantity: 50, referenceKey: 'order-2' },
  );
  assert.equal(oversell.response.statusCode, 409, oversell.response.body);

  const deducted = await success(
    app,
    'POST',
    `${WAREHOUSE}/reservations/${first.id}/deduct`,
    adminToken,
    { quantity: 25, reason: 'Order dispatched' },
  );
  assert.equal(deducted.status, 'ACTIVE');
  assert.equal(deducted.settledQuantity, 25);

  const released = await success(
    app,
    'POST',
    `${WAREHOUSE}/reservations/${first.id}/release`,
    adminToken,
    { quantity: 35, reason: 'Order cancelled' },
  );
  assert.equal(released.status, 'RELEASED');
  const afterSettlement = await success(
    app,
    'GET',
    `${WAREHOUSE}/inventories/${inventory.id}`,
    adminToken,
  );
  assert.equal(afterSettlement.quantityOnHand, 75);
  assert.equal(afterSettlement.quantityReserved, 0);
  assert.equal(afterSettlement.availableQuantity, 75);

  const movements = await success(
    app,
    'GET',
    `${WAREHOUSE}/movements?inventoryId=${inventory.id}`,
    adminToken,
  );
  assert.deepEqual(movements.movements.map((item) => item.movementType).sort(), [
    'DEDUCT',
    'REGISTER',
    'RELEASE',
    'RESERVE',
  ]);
  for (const movement of movements.movements) {
    assert.ok(movement.quantityBefore >= 0);
    assert.ok(movement.quantityAfter >= 0);
  }
});

test('warehouse adjustments, damaged and expired stock, and low-stock alerts are audited', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;
  const product = await createProduct(app, adminToken, orgA.id);
  const warehouse = await success(
    app,
    'POST',
    `${WAREHOUSE}/warehouses`,
    adminToken,
    { organizationId: orgA.id, code: 'WH-COLD', name: 'Cold storage' },
    201,
  );
  const inventory = await success(
    app,
    'POST',
    `${WAREHOUSE}/inventories`,
    adminToken,
    {
      organizationId: orgA.id,
      warehouseId: warehouse.id,
      productId: product.id,
      batchCode: 'BATCH-LOW',
      quantity: 8,
      unitCode: 'KG',
      lowStockThreshold: 10,
    },
    201,
  );

  const alerts = await success(
    app,
    'GET',
    `${WAREHOUSE}/alerts?inventoryId=${inventory.id}`,
    adminToken,
  );
  assert.equal(alerts.alerts.length, 1);
  assert.equal(alerts.alerts[0].status, 'OPEN');

  const acknowledged = await success(
    app,
    'POST',
    `${WAREHOUSE}/alerts/${alerts.alerts[0].id}/acknowledge`,
    adminToken,
    {},
  );
  assert.equal(acknowledged.status, 'ACKNOWLEDGED');
  const resolved = await success(
    app,
    'POST',
    `${WAREHOUSE}/alerts/${alerts.alerts[0].id}/resolve`,
    adminToken,
    {},
  );
  assert.equal(resolved.status, 'RESOLVED');

  const adjusted = await success(
    app,
    'POST',
    `${WAREHOUSE}/inventories/${inventory.id}/adjustments`,
    adminToken,
    { deltaQuantity: 40, reason: 'Cycle count correction' },
  );
  assert.equal(adjusted.availableQuantity, 48);

  const damaged = await success(
    app,
    'POST',
    `${WAREHOUSE}/inventories/${inventory.id}/damaged`,
    adminToken,
    { quantity: 3, reason: 'Water damage' },
  );
  assert.equal(damaged.availableQuantity, 45);

  const expired = await success(
    app,
    'POST',
    `${WAREHOUSE}/inventories/${inventory.id}/expired`,
    adminToken,
    { quantity: 2, reason: 'Shelf life expired' },
  );
  assert.equal(expired.availableQuantity, 43);

  const final = await success(app, 'GET', `${WAREHOUSE}/inventories/${inventory.id}`, adminToken);
  assert.equal(final.quantityOnHand, 43);
  assert.equal(final.availableQuantity, 43);
});

test('warehouse routes deny unauthenticated, unprivileged, and cross-tenant access', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;
  const buyerToken = await login(app, 'peer@example.com');
  const otherOrgToken = await login(app, 'other-org@example.com');
  const warehouse = await success(
    app,
    'POST',
    `${WAREHOUSE}/warehouses`,
    adminToken,
    { organizationId: orgA.id, code: 'WH-PRIVATE', name: 'Private warehouse' },
    201,
  );

  const anonymous = await request(app, 'GET', `${WAREHOUSE}/warehouses`);
  assert.equal(anonymous.response.statusCode, 401);
  const buyer = await request(app, 'GET', `${WAREHOUSE}/warehouses`, buyerToken);
  assert.equal(buyer.response.statusCode, 403);
  const crossTenant = await request(
    app,
    'GET',
    `${WAREHOUSE}/warehouses/${warehouse.id}`,
    otherOrgToken,
  );
  assert.equal(crossTenant.response.statusCode, 403);
  const publicInfo = await success(app, 'GET', `${WAREHOUSE}/info`);
  assert.equal(publicInfo.moduleId, 'warehouse');
});

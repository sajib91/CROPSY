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

async function createProduct(app, token, organizationId, sku) {
  const units = await success(app, 'GET', `${CATALOG}/units`, token);
  if (!units.units.some((unit) => unit.code === 'KG')) {
    await success(app, 'POST', `${CATALOG}/units`, token, { code: 'KG', name: 'Kilogram' }, 201);
  }
  let category = (await success(app, 'GET', `${CATALOG}/categories`, token)).categories.find(
    (item) => item.code === 'WH-OPS',
  );
  if (!category) {
    category = await success(
      app,
      'POST',
      `${CATALOG}/categories`,
      token,
      { organizationId, code: 'WH-OPS', name: 'Warehouse operations' },
      201,
    );
  }
  return success(
    app,
    'POST',
    `${CATALOG}/products`,
    token,
    { categoryId: category.id, sku, name: sku, unitCode: 'KG' },
    201,
  );
}

test('warehouse locations, receipts, transfers, dispatch, conditions, reconciliation, and staff are recorded', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA, peerId } = fixture;
  const peerToken = await login(app, 'peer@example.com');
  const product = await createProduct(app, adminToken, orgA.id, 'WH-OPS-RICE');

  const source = await success(
    app,
    'POST',
    `${WAREHOUSE}/warehouses`,
    adminToken,
    {
      organizationId: orgA.id,
      code: 'WH-OPS-SOURCE',
      name: 'Operations source',
      capacityCubicMeters: 500,
    },
    201,
  );
  const destination = await success(
    app,
    'POST',
    `${WAREHOUSE}/warehouses`,
    adminToken,
    { organizationId: orgA.id, code: 'WH-OPS-DEST', name: 'Operations destination' },
    201,
  );
  const inventory = await success(
    app,
    'POST',
    `${WAREHOUSE}/inventories`,
    adminToken,
    {
      organizationId: orgA.id,
      warehouseId: source.id,
      productId: product.id,
      batchCode: 'OPS-BATCH',
      quantity: 100,
      unitCode: 'KG',
      lowStockThreshold: 10,
    },
    201,
  );

  const location = await success(
    app,
    'POST',
    `${WAREHOUSE}/locations`,
    adminToken,
    {
      warehouseId: source.id,
      code: 'A-01',
      name: 'Rack A',
      zone: 'A',
      capacityUnits: 200,
    },
    201,
  );
  assert.equal(location.warehouseId, source.id);

  const receipt = await success(
    app,
    'POST',
    `${WAREHOUSE}/receipts`,
    adminToken,
    {
      warehouseId: source.id,
      productId: product.id,
      batchCode: 'OPS-BATCH',
      quantity: 20,
      unitCode: 'KG',
      referenceKey: 'ops-receipt-1',
      locationId: location.id,
    },
    201,
  );
  assert.equal(receipt.quantityOnHand, 120);
  assert.equal(receipt.movement.movementType, 'RECEIPT');
  const receiptReplay = await success(
    app,
    'POST',
    `${WAREHOUSE}/receipts`,
    adminToken,
    {
      warehouseId: source.id,
      productId: product.id,
      batchCode: 'OPS-BATCH',
      quantity: 20,
      unitCode: 'KG',
      referenceKey: 'ops-receipt-1',
    },
    201,
  );
  assert.equal(receiptReplay.replayed, true);
  assert.equal(receiptReplay.quantityOnHand, 120);

  const transfer = await success(
    app,
    'POST',
    `${WAREHOUSE}/transfers`,
    adminToken,
    {
      fromWarehouseId: source.id,
      toWarehouseId: destination.id,
      productId: product.id,
      batchCode: 'OPS-BATCH',
      quantity: 30,
      unitCode: 'KG',
      referenceKey: 'ops-transfer-1',
    },
    201,
  );
  assert.equal(transfer.from.quantityOnHand, 90);
  assert.equal(transfer.to.quantityOnHand, 30);
  assert.deepEqual(transfer.movements.map((movement) => movement.movementType).sort(), [
    'TRANSFER_IN',
    'TRANSFER_OUT',
  ]);

  const dispatch = await success(
    app,
    'POST',
    `${WAREHOUSE}/dispatches`,
    adminToken,
    {
      warehouseId: destination.id,
      productId: product.id,
      batchCode: 'OPS-BATCH',
      quantity: 10,
      unitCode: 'KG',
      referenceKey: 'ops-dispatch-1',
    },
    201,
  );
  assert.equal(dispatch.quantityOnHand, 20);
  assert.equal(dispatch.movement.movementType, 'DISPATCH');

  const condition = await success(
    app,
    'POST',
    `${WAREHOUSE}/conditions`,
    adminToken,
    {
      warehouseId: destination.id,
      warehouseInventoryId: transfer.to.id,
      temperatureC: 4,
      humidityPercent: 55,
      conditionStatus: 'NORMAL',
      notes: 'Cold chain within range.',
    },
    201,
  );
  assert.equal(condition.conditionStatus, 'NORMAL');
  const conditions = await success(
    app,
    'GET',
    `${WAREHOUSE}/conditions?warehouseId=${destination.id}`,
    adminToken,
  );
  assert.equal(conditions.conditions.length, 1);

  const reconciliation = await success(
    app,
    'POST',
    `${WAREHOUSE}/reconciliations`,
    adminToken,
    {
      warehouseId: source.id,
      warehouseInventoryId: inventory.id,
      countedQuantity: 85,
      referenceKey: 'ops-reconciliation-1',
      notes: 'Two units lost to handling.',
    },
    201,
  );
  assert.equal(reconciliation.systemQuantity, 90);
  assert.equal(reconciliation.differenceQuantity, -5);
  const approved = await success(
    app,
    'POST',
    `${WAREHOUSE}/reconciliations/${reconciliation.id}/approve`,
    adminToken,
    { notes: 'Adjustment approved.' },
  );
  assert.equal(approved.status, 'APPROVED');
  const afterApproval = await success(
    app,
    'GET',
    `${WAREHOUSE}/inventories/${inventory.id}`,
    adminToken,
  );
  assert.equal(afterApproval.quantityOnHand, 85);
  const approvalReplay = await success(
    app,
    'POST',
    `${WAREHOUSE}/reconciliations/${reconciliation.id}/approve`,
    adminToken,
    {},
  );
  assert.equal(approvalReplay.status, 'APPROVED');

  const staff = await success(
    app,
    'POST',
    `${WAREHOUSE}/staff`,
    adminToken,
    { warehouseId: source.id, userId: peerId, roleCode: 'PICKER' },
    201,
  );
  assert.equal(staff.userId, peerId);
  const staffList = await success(
    app,
    'GET',
    `${WAREHOUSE}/staff?warehouseId=${source.id}`,
    adminToken,
  );
  assert.equal(staffList.staff.length, 1);
  const staffUpdated = await success(app, 'PATCH', `${WAREHOUSE}/staff/${staff.id}`, adminToken, {
    roleCode: 'SUPERVISOR',
  });
  assert.equal(staffUpdated.roleCode, 'SUPERVISOR');

  const capacity = await success(
    app,
    'GET',
    `${WAREHOUSE}/warehouses/${source.id}/capacity`,
    adminToken,
  );
  assert.equal(capacity.usedCapacity, 85);
  assert.equal(capacity.utilizationPercentage, 17);
  assert.equal(capacity.locations.length, 1);

  const report = await success(app, 'GET', `${WAREHOUSE}/report`, adminToken);
  assert.equal(report.totals.warehouses, 2);
  assert.equal(report.totals.onHand, 105);
  assert.ok(report.totals.movements.RECEIPT >= 1);
  assert.ok(report.totals.movements.TRANSFER_OUT >= 1);

  const unauthenticated = await request(app, 'GET', `${WAREHOUSE}/locations`);
  assert.equal(unauthenticated.response.statusCode, 401);
  const unprivileged = await request(app, 'GET', `${WAREHOUSE}/locations`, peerToken);
  assert.equal(unprivileged.response.statusCode, 403);
});

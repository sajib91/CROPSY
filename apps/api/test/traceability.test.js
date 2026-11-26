const assert = require('node:assert/strict');
const test = require('node:test');

const { AuthStoreToken } = require('../src/modules/iam/domain/auth.repository');
const { bearer, createTenantFixture, loginUser, register } = require('./support/auth-fixtures');

const CATALOG = '/api/v1/catalog';
const QUALITY = '/api/v1/quality';
const TRACEABILITY = '/api/v1/traceability';
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

async function createInspector(app, email, organizationId) {
  const registration = await register(app, { email, roles: ['QUALITY_INSPECTOR'] });
  assert.equal(registration.response.statusCode, 201, registration.response.body);
  await app.cropsyContainer.resolve(AuthStoreToken).addOrganizationMember({
    organizationId,
    userId: registration.user.id,
    status: 'ACTIVE',
  });
  return { user: registration.user, token: await login(app, email) };
}

async function createProduct(app, token, organizationId, sku) {
  const units = await success(app, 'GET', `${CATALOG}/units`, token);
  if (!units.units.some((unit) => unit.code === 'KG')) {
    await success(app, 'POST', `${CATALOG}/units`, token, { code: 'KG', name: 'Kilogram' }, 201);
  }
  let category = (await success(app, 'GET', `${CATALOG}/categories`, token)).categories.find(
    (item) => item.code === 'TRACEABILITY-GRAINS',
  );
  if (!category) {
    category = await success(
      app,
      'POST',
      `${CATALOG}/categories`,
      token,
      { organizationId, code: 'TRACEABILITY-GRAINS', name: 'Traceability grains' },
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

async function createWarehouseInventory(app, token, organizationId, productId, batchCode) {
  const warehouse = await success(
    app,
    'POST',
    `${WAREHOUSE}/warehouses`,
    token,
    {
      organizationId,
      code: `WH-${batchCode}`,
      name: `Warehouse for ${batchCode}`,
    },
    201,
  );
  const inventory = await success(
    app,
    'POST',
    `${WAREHOUSE}/inventories`,
    token,
    {
      organizationId,
      warehouseId: warehouse.id,
      productId,
      batchCode,
      quantity: 50,
      unitCode: 'KG',
      lowStockThreshold: 5,
    },
    201,
  );
  return { warehouse, inventory };
}

async function publicVerify(app, token) {
  const response = await app.inject({
    method: 'GET',
    url: `${TRACEABILITY}/verify/${token}`,
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data;
}

test('traceability routes are default-deny and public verification stays conservative', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;
  const peerToken = await login(app, 'peer@example.com');
  const product = await createProduct(app, adminToken, orgA.id, 'TRACE-DENY-RICE');

  const info = await app.inject({ method: 'GET', url: `${TRACEABILITY}/info` });
  assert.equal(info.statusCode, 200);
  const unauthenticated = await request(app, 'GET', `${TRACEABILITY}/batches`);
  assert.equal(unauthenticated.response.statusCode, 401);
  const unprivileged = await request(app, 'GET', `${TRACEABILITY}/batches`, peerToken);
  assert.equal(unprivileged.response.statusCode, 403);
  const unprivilegedAudits = await request(app, 'GET', `${TRACEABILITY}/audits`, peerToken);
  assert.equal(unprivilegedAudits.response.statusCode, 403);

  const unknown = await publicVerify(app, 'not-a-real-token');
  assert.equal(unknown.batchCode, null);
  assert.equal(unknown.verificationStatus, 'UNVERIFIED');
  assert.deepEqual(unknown.facts, []);
  assert.match(unknown.notice, /No verified public facts/i);
  assert.match(unknown.disclaimer, /Unverified claims/i);

  const privateBatch = await success(
    app,
    'POST',
    `${TRACEABILITY}/batches`,
    adminToken,
    {
      organizationId: orgA.id,
      productId: product.id,
      batchCode: 'TRACE-PRIVATE-BATCH',
      publicDisclosure: false,
    },
    201,
  );
  await success(
    app,
    'POST',
    `${TRACEABILITY}/batches/${privateBatch.id}/events`,
    adminToken,
    {
      eventType: 'DELIVERED',
      title: 'Public event on private batch',
      verificationStatus: 'VERIFIED',
      publicDisclosure: true,
    },
    201,
  );
  await success(app, 'POST', `${TRACEABILITY}/batches/${privateBatch.id}/verify`, adminToken, {
    note: 'Verified internally.',
  });
  const privateResult = await publicVerify(app, privateBatch.verificationToken);
  assert.equal(privateResult.batchCode, null);
  assert.deepEqual(privateResult.facts, []);

  const rejectedBatch = await success(
    app,
    'POST',
    `${TRACEABILITY}/batches`,
    adminToken,
    {
      organizationId: orgA.id,
      productId: product.id,
      batchCode: 'TRACE-REJECTED-BATCH',
      publicDisclosure: true,
    },
    201,
  );
  await success(app, 'POST', `${TRACEABILITY}/batches/${rejectedBatch.id}/reject`, adminToken, {
    note: 'Claim rejected after review.',
  });
  const rejectedResult = await publicVerify(app, rejectedBatch.verificationToken);
  assert.equal(rejectedResult.batchCode, null);
  assert.deepEqual(rejectedResult.facts, []);
});

test('traceability lifecycle records QR, audits, enriched timeline, and verified-only public facts', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, adminId, orgA } = fixture;
  const inspector = await createInspector(app, 'trace-inspector@example.com', orgA.id);
  const product = await createProduct(app, adminToken, orgA.id, 'TRACE-LIFECYCLE-RICE');

  const inspection = await success(
    app,
    'POST',
    `${QUALITY}/inspections`,
    inspector.token,
    {
      organizationId: orgA.id,
      productId: product.id,
      batchCode: 'TRACE-LIFECYCLE-BATCH',
      result: 'PENDING',
      inspectorUserId: inspector.user.id,
    },
    201,
  );
  await success(
    app,
    'POST',
    `${QUALITY}/inspections/${inspection.id}/evidence`,
    inspector.token,
    {
      evidenceType: 'DOCUMENT',
      uri: 'https://example.com/trace/private-inspection.pdf',
      publicDisclosure: false,
    },
    201,
  );
  await success(app, 'POST', `${QUALITY}/inspections/${inspection.id}/grade`, inspector.token, {
    gradeCode: 'A',
    gradeSource: 'INSPECTOR',
  });
  await success(app, 'PATCH', `${QUALITY}/inspections/${inspection.id}`, inspector.token, {
    result: 'PASSED',
  });
  await success(app, 'POST', `${QUALITY}/inspections/${inspection.id}/verify`, inspector.token, {
    note: 'Inspection verified.',
  });

  const { warehouse } = await createWarehouseInventory(
    app,
    adminToken,
    orgA.id,
    product.id,
    'TRACE-LIFECYCLE-BATCH',
  );

  const batch = await success(
    app,
    'POST',
    `${TRACEABILITY}/batches`,
    adminToken,
    {
      organizationId: orgA.id,
      productId: product.id,
      batchCode: 'TRACE-LIFECYCLE-BATCH',
      publicDisclosure: true,
      inspectionId: inspection.id,
    },
    201,
  );

  const prematureVerification = await request(
    app,
    'POST',
    `${TRACEABILITY}/batches/${batch.id}/verify`,
    adminToken,
    {},
  );
  assert.equal(prematureVerification.response.statusCode, 409);

  await success(
    app,
    'POST',
    `${TRACEABILITY}/batches/${batch.id}/events`,
    adminToken,
    {
      eventType: 'HARVESTED',
      title: 'Unverified harvest claim',
      description: 'This claim must never be certified.',
      locationDescription: 'Private field',
      verificationStatus: 'UNVERIFIED',
      publicDisclosure: true,
      longitude: 90.5,
      latitude: 23.7,
      actorUserId: adminId,
    },
    201,
  );
  await success(
    app,
    'POST',
    `${TRACEABILITY}/batches/${batch.id}/events`,
    adminToken,
    {
      eventType: 'STORED',
      title: 'Private verified storage record',
      description: 'Internal storage note.',
      verificationStatus: 'VERIFIED',
      publicDisclosure: false,
    },
    201,
  );
  const inspectedEvent = await success(
    app,
    'POST',
    `${TRACEABILITY}/batches/${batch.id}/events`,
    adminToken,
    {
      eventType: 'INSPECTED',
      title: 'Verified quality inspection',
      verificationStatus: 'VERIFIED',
      publicDisclosure: true,
      sourceModule: 'quality',
      sourceRecordId: inspection.id,
    },
    201,
  );
  assert.equal(inspectedEvent.metadata.qualityFacts.verificationStatus, 'VERIFIED');
  assert.equal(inspectedEvent.metadata.qualityFacts.batchCode, inspection.batchCode);
  assert.deepEqual(inspectedEvent.metadata.qualityFacts.publicEvidence, []);

  const storedEvent = await success(
    app,
    'POST',
    `${TRACEABILITY}/batches/${batch.id}/events`,
    adminToken,
    {
      eventType: 'WAREHOUSE_ENTRY',
      title: 'Verified warehouse entry',
      verificationStatus: 'VERIFIED',
      publicDisclosure: true,
      sourceModule: 'warehouse',
      warehouseId: warehouse.id,
    },
    201,
  );
  assert.equal(storedEvent.metadata.warehouseFacts.warehouse.id, warehouse.id);
  assert.equal(storedEvent.metadata.warehouseFacts.inventories[0].batchCode, batch.batchCode);

  await success(
    app,
    'POST',
    `${TRACEABILITY}/batches/${batch.id}/events`,
    adminToken,
    {
      eventType: 'DELIVERED',
      title: 'Certified delivery',
      description: 'Delivery completed and verified.',
      locationDescription: 'Dhaka delivery hub',
      verificationStatus: 'VERIFIED',
      publicDisclosure: true,
      longitude: 90.4,
      latitude: 23.8,
      actorUserId: adminId,
    },
    201,
  );

  const verifiedBatch = await success(
    app,
    'POST',
    `${TRACEABILITY}/batches/${batch.id}/verify`,
    adminToken,
    { note: 'All disclosed facts verified.' },
  );
  assert.equal(verifiedBatch.verificationStatus, 'VERIFIED');
  assert.ok(verifiedBatch.verifiedAt);

  const publicResult = await publicVerify(app, batch.verificationToken);
  assert.equal(publicResult.batchCode, batch.batchCode);
  assert.equal(publicResult.productId, product.id);
  assert.equal(publicResult.verificationStatus, 'VERIFIED');
  assert.equal(publicResult.publicDisclosure, true);
  assert.equal(publicResult.facts.length, 3);
  assert.deepEqual(
    publicResult.facts.map((fact) => fact.title),
    ['Verified quality inspection', 'Verified warehouse entry', 'Certified delivery'],
  );
  const serialized = JSON.stringify(publicResult);
  for (const forbidden of [
    'Unverified harvest claim',
    'Private verified storage record',
    'https://example.com/trace/private-inspection.pdf',
    adminId,
    '90.5',
    '23.7',
  ]) {
    assert.ok(!serialized.includes(forbidden), `public verification leaked ${forbidden}`);
  }

  const baseUrl = (
    process.env.WEB_PUBLIC_URL ||
    app.cropsyEnv.WEB_PUBLIC_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
  const qr = await success(app, 'POST', `${TRACEABILITY}/batches/${batch.id}/qr`, adminToken);
  assert.equal(qr.token, batch.verificationToken);
  assert.equal(qr.url, `${baseUrl}/verify/${batch.verificationToken}`);
  assert.ok(typeof qr.qr === 'string' && qr.qr.length > 0);

  const timeline = await success(
    app,
    'GET',
    `${TRACEABILITY}/batches/${batch.id}/timeline`,
    adminToken,
  );
  assert.equal(timeline.batch.id, batch.id);
  assert.equal(timeline.events.length, 5);
  assert.ok(timeline.events.some((event) => event.title === 'Unverified harvest claim'));
  assert.ok(timeline.events.some((event) => event.title === 'Private verified storage record'));
  assert.equal(timeline.linkedFacts.batch.id, batch.id);
  assert.equal(timeline.linkedFacts.events.length, 5);

  const audits = await success(
    app,
    'GET',
    `${TRACEABILITY}/audits?batchId=${batch.id}`,
    adminToken,
  );
  const actions = audits.map((audit) => audit.action);
  for (const action of [
    'traceability.batch.created',
    'traceability.event.created',
    'traceability.batch.verified',
    'traceability.batch.qr_generated',
  ]) {
    assert.ok(actions.includes(action), action);
  }
});

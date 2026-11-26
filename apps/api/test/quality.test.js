const assert = require('node:assert/strict');
const test = require('node:test');

const { QualityAccessPortToken } = require('../src/shared/di/tokens');
const { bearer, createTenantFixture, loginUser, register } = require('./support/auth-fixtures');

const CATALOG = '/api/v1/catalog';
const QUALITY = '/api/v1/quality';

function uuid(number) {
  return `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
}

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
  await app.cropsyContainer
    .resolve(require('../src/modules/iam/domain/auth.repository').AuthStoreToken)
    .addOrganizationMember({
      organizationId,
      userId: registration.user.id,
      status: 'ACTIVE',
    });
  return { user: registration.user, token: await login(app, email) };
}

async function createProduct(app, token, organizationId) {
  const units = await success(app, 'GET', `${CATALOG}/units`, token);
  if (!units.units.some((unit) => unit.code === 'KG')) {
    await success(app, 'POST', `${CATALOG}/units`, token, { code: 'KG', name: 'Kilogram' }, 201);
  }
  let category = (await success(app, 'GET', `${CATALOG}/categories`, token)).categories.find(
    (item) => item.code === 'QUALITY-GRAINS',
  );
  if (!category) {
    category = await success(
      app,
      'POST',
      `${CATALOG}/categories`,
      token,
      { organizationId, code: 'QUALITY-GRAINS', name: 'Quality grains' },
      201,
    );
  }
  return success(
    app,
    'POST',
    `${CATALOG}/products`,
    token,
    { categoryId: category.id, sku: 'QUALITY-RICE', name: 'Quality rice', unitCode: 'KG' },
    201,
  );
}

test('quality routes are default-deny and tenant scoped', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, store, adminToken, orgB, otherOrgUserId } = fixture;
  const peerToken = await login(app, 'peer@example.com');
  const inspectorB = await createInspector(app, 'inspector-b@example.com', orgB.id);
  await store.addUserRole({
    userId: otherOrgUserId,
    roleCode: 'ORGANIZATION_ADMIN',
    organizationId: orgB.id,
    grantedBy: otherOrgUserId,
  });
  const orgBAdminToken = await login(app, 'other-org@example.com');
  const product = await createProduct(app, orgBAdminToken, orgB.id);

  const info = await app.inject({ method: 'GET', url: `${QUALITY}/info` });
  assert.equal(info.statusCode, 200);
  const unauthenticated = await request(app, 'GET', `${QUALITY}/inspections`);
  assert.equal(unauthenticated.response.statusCode, 401);
  const unprivileged = await request(app, 'GET', `${QUALITY}/inspections`, peerToken);
  assert.equal(unprivileged.response.statusCode, 403);

  const inspection = await success(
    app,
    'POST',
    `${QUALITY}/inspections`,
    inspectorB.token,
    {
      organizationId: orgB.id,
      productId: product.id,
      batchCode: 'CROSS-TENANT-BATCH',
    },
    201,
  );

  const crossTenant = await request(
    app,
    'GET',
    `${QUALITY}/inspections/${inspection.id}`,
    adminToken,
  );
  assert.equal(crossTenant.response.statusCode, 403);
  const ownList = await success(app, 'GET', `${QUALITY}/inspections`, adminToken);
  assert.equal(ownList.length, 0);
});

test('quality evidence, grading, verification, and audits preserve conservative facts', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;
  const inspector = await createInspector(app, 'inspector-a@example.com', orgA.id);
  const product = await createProduct(app, adminToken, orgA.id);

  const inspection = await success(
    app,
    'POST',
    `${QUALITY}/inspections`,
    inspector.token,
    {
      organizationId: orgA.id,
      productId: product.id,
      batchCode: 'QUALITY-BATCH-1',
      result: 'PENDING',
      inspectorUserId: inspector.user.id,
    },
    201,
  );
  assert.equal(inspection.verificationStatus, 'UNVERIFIED');
  assert.equal(inspection.gradeSource, 'INSPECTOR');

  const privateEvidence = await success(
    app,
    'POST',
    `${QUALITY}/inspections/${inspection.id}/evidence`,
    inspector.token,
    {
      evidenceType: 'DOCUMENT',
      uri: 'https://example.com/quality/private.pdf',
      publicDisclosure: false,
    },
    201,
  );
  assert.equal(privateEvidence.publicDisclosure, false);

  const image = await success(
    app,
    'POST',
    `${QUALITY}/inspections/${inspection.id}/images`,
    inspector.token,
    {
      uri: 'https://example.com/quality/public.jpg',
      mimeType: 'image/jpeg',
      publicDisclosure: true,
    },
    201,
  );
  assert.equal(image.evidenceType, 'IMAGE');
  assert.equal(image.publicDisclosure, true);

  const publicEvidence = await success(
    app,
    'GET',
    `${QUALITY}/inspections/${inspection.id}/evidence?publicDisclosure=true`,
    adminToken,
  );
  assert.deepEqual(
    publicEvidence.map((item) => item.uri),
    ['https://example.com/quality/public.jpg'],
  );

  const prematureVerification = await request(
    app,
    'POST',
    `${QUALITY}/inspections/${inspection.id}/verify`,
    inspector.token,
    {},
  );
  assert.equal(prematureVerification.response.statusCode, 409);

  const graded = await success(
    app,
    'POST',
    `${QUALITY}/inspections/${inspection.id}/grade`,
    inspector.token,
    { gradeCode: 'A', gradeSource: 'INSPECTOR' },
  );
  assert.equal(graded.gradeCode, 'A');

  const passed = await success(
    app,
    'PATCH',
    `${QUALITY}/inspections/${inspection.id}`,
    inspector.token,
    { result: 'PASSED' },
  );
  assert.equal(passed.result, 'PASSED');
  assert.equal(passed.verificationStatus, 'UNVERIFIED');

  const verified = await success(
    app,
    'POST',
    `${QUALITY}/inspections/${inspection.id}/verify`,
    inspector.token,
    { note: 'Verified by inspection.' },
  );
  assert.equal(verified.verificationStatus, 'VERIFIED');
  assert.ok(verified.verifiedAt);

  const duplicateVerification = await request(
    app,
    'POST',
    `${QUALITY}/inspections/${inspection.id}/verify`,
    inspector.token,
    {},
  );
  assert.equal(duplicateVerification.response.statusCode, 409);

  const facts = await app.cropsyContainer
    .resolve(QualityAccessPortToken)
    .getInspectionFacts(inspection.id);
  assert.equal(facts.verificationStatus, 'VERIFIED');
  assert.equal(facts.publicEvidence.length, 1);
  assert.equal(facts.publicEvidence[0].uri, 'https://example.com/quality/public.jpg');
  assert.ok(
    !JSON.stringify(facts).includes('https://example.com/quality/private.pdf'),
    'private evidence must not be published through the quality port',
  );

  const audits = await success(app, 'GET', `${QUALITY}/audits`, adminToken);
  const actions = audits.map((audit) => audit.action);
  for (const action of [
    'quality.inspection.created',
    'quality.inspection.graded',
    'quality.inspection.verified',
    'quality.evidence.added',
    'quality.evidence.image_attached',
  ]) {
    assert.ok(actions.includes(action), action);
  }

  const unrelatedInspectionId = uuid(9701);
  const unknown = await request(
    app,
    'GET',
    `${QUALITY}/inspections/${unrelatedInspectionId}`,
    adminToken,
  );
  assert.equal(unknown.response.statusCode, 404);
});

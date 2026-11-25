const assert = require('node:assert/strict');
const test = require('node:test');

const { bearer, createTenantFixture, loginUser } = require('./support/auth-fixtures');

const BASE = '/api/v1/catalog';

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

async function createProductFixture(
  app,
  token,
  { sku = 'CATALOG-RICE', categoryCode = 'GRAINS', organizationId } = {},
) {
  const units = await success(
    app,
    'GET',
    `${BASE}/units?search=${encodeURIComponent('Kilogram')}`,
    token,
  );
  let unit = units.units.find((item) => item.code === 'KG');
  if (!unit) {
    unit = await success(
      app,
      'POST',
      `${BASE}/units`,
      token,
      { code: 'KG', name: 'Kilogram', nameBn: 'কিলোগ্রাম', dimension: 'mass' },
      201,
    );
  }

  const categories = await success(app, 'GET', `${BASE}/categories`, token);
  let category = categories.categories.find((item) => item.code === categoryCode);
  if (!category) {
    category = await success(
      app,
      'POST',
      `${BASE}/categories`,
      token,
      {
        ...(organizationId ? { organizationId } : {}),
        code: categoryCode,
        name: categoryCode === 'GRAINS' ? 'Grains' : categoryCode,
        nameBn: categoryCode === 'GRAINS' ? 'শস্য' : null,
      },
      201,
    );
  }

  const attribute = await success(
    app,
    'POST',
    `${BASE}/attributes`,
    token,
    {
      categoryId: category.id,
      code: `GRADE-${sku}`,
      name: 'Grade band',
      nameBn: 'গ্রেড',
      valueType: 'ENUM',
      allowedValues: ['A', 'B'],
      isRequired: true,
    },
    201,
  );

  const product = await success(
    app,
    'POST',
    `${BASE}/products`,
    token,
    {
      categoryId: category.id,
      sku,
      name: 'Aromatic rice',
      nameBn: 'সুগন্ধি চাল',
      unitCode: 'KG',
      description: 'Cleaned and graded grain.',
      descriptionBn: 'পরিচ্ছন্ন ও গ্রেডকৃত শস্য।',
      values: [{ attributeId: attribute.id, value: 'A' }],
      images: [{ url: 'https://example.com/rice.jpg', altText: 'Rice bag', sortOrder: 0 }],
    },
    201,
  );

  return { attribute, category, unit, product };
}

test('catalog stores bilingual taxonomy, typed attributes, varieties, and images', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;

  const category = await success(
    app,
    'POST',
    `${BASE}/categories`,
    adminToken,
    {
      organizationId: orgA.id,
      parentId: null,
      code: 'CATALOG-SPECIAL',
      name: 'Special grains',
      nameBn: 'বিশেষ শস্য',
      description: 'Tenant-specific classification.',
      descriptionBn: 'ভাড়াটে-নির্দিষ্ট শ্রেণীবিভাগ।',
    },
    201,
  );
  assert.equal(category.organizationId, orgA.id);
  assert.equal(category.nameBn, 'বিশেষ শস্য');

  const grade = await success(
    app,
    'POST',
    `${BASE}/quality-grades`,
    adminToken,
    { code: 'CATALOG-GRADE-A', name: 'Grade A', nameBn: 'এ গ্রেড', minScore: 80 },
    201,
  );
  assert.equal(grade.minScore, 80);

  const created = await createProductFixture(app, adminToken, {
    sku: 'CATALOG-RICE-1',
    organizationId: orgA.id,
  });
  const product = await success(app, 'GET', `${BASE}/products/${created.product.id}`, adminToken);
  assert.equal(product.nameBn, 'সুগন্ধি চাল');
  assert.equal(product.categoryCode, 'GRAINS');
  assert.equal(product.images.length, 1);
  assert.equal(product.images[0].altText, 'Rice bag');
  assert.equal(product.attributes.length, 1);
  assert.equal(product.attributes[0].valueType, 'ENUM');
  assert.equal(product.attributes[0].value, 'A');

  const variety = await success(
    app,
    'POST',
    `${BASE}/products/${created.product.id}/varieties`,
    adminToken,
    {
      code: 'AROMATIC-28',
      name: 'Aromatic 28',
      nameBn: 'সুগন্ধি ২৮',
      values: [{ attributeId: created.attribute.id, value: 'A' }],
    },
    201,
  );
  assert.equal(variety.productId, created.product.id);

  const updatedVariety = await success(
    app,
    'PATCH',
    `${BASE}/products/${created.product.id}/varieties/${variety.id}`,
    adminToken,
    { isActive: false },
  );
  assert.equal(updatedVariety.isActive, false);

  const search = await success(
    app,
    'GET',
    `${BASE}/products?search=${encodeURIComponent('সুগন্ধি')}&categoryCode=GRAINS&isAvailable=true`,
    adminToken,
  );
  assert.equal(search.products.length, 1);
  assert.equal(search.products[0].id, created.product.id);

  const byAttribute = await success(
    app,
    'GET',
    `${BASE}/products?attributeCode=${created.attribute.code}&attributeValue=A`,
    adminToken,
  );
  assert.equal(byAttribute.products.length, 1);

  const invalid = await request(app, 'POST', `${BASE}/products`, adminToken, {
    categoryId: created.category.id,
    sku: 'CATALOG-RICE-INVALID',
    name: 'Missing grade',
    unitCode: 'KG',
  });
  assert.equal(invalid.response.statusCode, 400);

  assert.equal(grade.isActive, true);
  assert.equal(category.isActive, true);
});

test('catalog permissions, tenant isolation, and default-deny protect catalog data', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;
  const peerToken = await login(app, 'peer@example.com');
  const otherOrgToken = await login(app, 'other-org@example.com');

  const info = await request(app, 'GET', `${BASE}/info`);
  assert.equal(info.response.statusCode, 200);

  const anonymous = await request(app, 'GET', `${BASE}/products`);
  assert.equal(anonymous.response.statusCode, 401);

  const deniedCreate = await request(app, 'POST', `${BASE}/categories`, peerToken, {
    code: 'BUYER-CATEGORY',
    name: 'Denied',
  });
  assert.equal(deniedCreate.response.statusCode, 403);

  const created = await createProductFixture(app, adminToken, {
    sku: 'CATALOG-RICE-PRIVATE',
    organizationId: orgA.id,
  });
  const crossTenant = await request(
    app,
    'GET',
    `${BASE}/products/${created.product.id}`,
    otherOrgToken,
  );
  assert.equal(crossTenant.response.statusCode, 403);

  const peerRead = await request(app, 'GET', `${BASE}/products`, peerToken);
  assert.equal(peerRead.response.statusCode, 200);

  const anonymousWrite = await request(app, 'POST', `${BASE}/products`, undefined, {
    categoryId: created.category.id,
    sku: 'ANON-PRODUCT',
    name: 'Denied',
    unitCode: 'KG',
  });
  assert.equal(anonymousWrite.response.statusCode, 401);
});

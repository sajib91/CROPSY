const assert = require('node:assert/strict');
const test = require('node:test');

const { bearer, createTenantFixture, loginUser } = require('./support/auth-fixtures');

const CATALOG = '/api/v1/catalog';
const MARKETPLACE = '/api/v1/marketplace';

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

async function createSellableProduct(app, token, organizationId) {
  const units = await success(app, 'GET', `${CATALOG}/units`, token);
  if (!units.units.some((unit) => unit.code === 'KG')) {
    await success(
      app,
      'POST',
      `${CATALOG}/units`,
      token,
      { code: 'KG', name: 'Kilogram', nameBn: 'কিলোগ্রাম' },
      201,
    );
  }
  const categories = await success(app, 'GET', `${CATALOG}/categories`, token);
  let category = categories.categories.find((item) => item.code === 'GRAINS');
  if (!category) {
    category = await success(
      app,
      'POST',
      `${CATALOG}/categories`,
      token,
      {
        ...(organizationId ? { organizationId } : {}),
        code: 'GRAINS',
        name: 'Grains',
        nameBn: 'শস্য',
      },
      201,
    );
  }

  const grade = await success(
    app,
    'POST',
    `${CATALOG}/quality-grades`,
    token,
    { code: 'MARKET-GRADE-A', name: 'Grade A', nameBn: 'এ গ্রেড' },
    201,
  );
  const product = await success(
    app,
    'POST',
    `${CATALOG}/products`,
    token,
    {
      categoryId: category.id,
      sku: 'MARKET-RICE-1',
      name: 'Aromatic rice',
      nameBn: 'সুগন্ধি চাল',
      unitCode: 'KG',
      description: 'Freshly milled rice.',
    },
    201,
  );
  return { category, grade, product };
}

function listingInput(product, grade, overrides = {}) {
  return {
    productId: product.id,
    status: 'ACTIVE',
    title: 'Fresh aromatic rice',
    description: 'Available at the Dhaka wholesale market.',
    unitPrice: 120,
    currency: 'BDT',
    quantityAvailable: 500,
    minOrderQuantity: 5,
    qualityGradeId: grade.id,
    harvestDate: '2026-11-20',
    availableLocation: 'Dhaka',
    locations: [
      {
        label: 'Dhaka wholesale market',
        latitude: 23.8103,
        longitude: 90.4125,
        radiusMeters: 5000,
      },
    ],
    images: [{ url: 'https://example.com/listing-rice.jpg', altText: 'Rice sacks', sortOrder: 0 }],
    ...overrides,
  };
}

test('sellers create listings and buyers discover them with filters and geospatial search', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;
  const buyerToken = await login(app, 'peer@example.com');
  const otherOrgToken = await login(app, 'other-org@example.com');

  const initial = await success(app, 'GET', `${MARKETPLACE}/listings`, buyerToken);
  assert.deepEqual(initial.listings, []);

  const { grade, product } = await createSellableProduct(app, adminToken, orgA.id);
  const listing = await success(
    app,
    'POST',
    `${MARKETPLACE}/listings`,
    adminToken,
    listingInput(product, grade),
    201,
  );

  assert.equal(listing.status, 'ACTIVE');
  assert.equal(listing.product.categoryCode, 'GRAINS');
  assert.equal(listing.qualityGrade.code, 'MARKET-GRADE-A');
  assert.equal(listing.locations.length, 1);
  assert.equal(listing.images.length, 1);
  assert.equal(listing.harvestDate, '2026-11-20');
  assert.ok(listing.seller.displayName);

  const search = await success(
    app,
    'GET',
    `${MARKETPLACE}/listings?search=${encodeURIComponent('aromatic')}` +
      '&categoryCode=GRAINS&minPrice=100&maxPrice=200&location=Dhaka' +
      '&latitude=23.811&longitude=90.413&radiusMeters=10000&sort=distance',
    buyerToken,
  );
  assert.equal(search.listings.length, 1);
  assert.equal(search.listings[0].id, listing.id);
  assert.ok(search.listings[0].distanceMeters >= 0);

  const outsideRadius = await success(
    app,
    'GET',
    `${MARKETPLACE}/listings?latitude=23.9&longitude=90.9&radiusMeters=1000`,
    buyerToken,
  );
  assert.equal(outsideRadius.listings.length, 0);

  const crossTenantBuyer = await success(app, 'GET', `${MARKETPLACE}/listings`, otherOrgToken);
  assert.equal(crossTenantBuyer.listings.length, 1);

  const serialized = JSON.stringify(listing);
  for (const privateField of ['latitude', 'longitude', 'passwordHash', 'admin@example.com']) {
    assert.ok(!serialized.includes(privateField), `listing leaked ${privateField}`);
  }
});

test('listing writes, favorites, reports, and platform messages enforce ownership and privacy', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;
  const buyerToken = await login(app, 'peer@example.com');
  const otherOrgToken = await login(app, 'other-org@example.com');
  const { grade, product } = await createSellableProduct(app, adminToken, orgA.id);

  const listing = await success(
    app,
    'POST',
    `${MARKETPLACE}/listings`,
    adminToken,
    listingInput(product, grade),
    201,
  );

  const buyerWrite = await request(
    app,
    'PATCH',
    `${MARKETPLACE}/listings/${listing.id}`,
    buyerToken,
    { unitPrice: 10 },
  );
  assert.equal(buyerWrite.response.statusCode, 403);

  const invalidListing = await request(
    app,
    'POST',
    `${MARKETPLACE}/listings`,
    adminToken,
    listingInput(product, grade, { availableLocation: null, harvestDate: null }),
  );
  assert.equal(invalidListing.response.statusCode, 400);

  const draft = await success(
    app,
    'POST',
    `${MARKETPLACE}/listings`,
    adminToken,
    listingInput(product, grade, { title: 'Draft rice', status: 'DRAFT' }),
    201,
  );
  const buyerDraft = await request(app, 'GET', `${MARKETPLACE}/listings/${draft.id}`, buyerToken);
  assert.equal(buyerDraft.response.statusCode, 404);
  const otherDraft = await request(
    app,
    'GET',
    `${MARKETPLACE}/listings/${draft.id}`,
    otherOrgToken,
  );
  assert.equal(otherDraft.response.statusCode, 404);
  const sellerDraft = await success(app, 'GET', `${MARKETPLACE}/listings/${draft.id}`, adminToken);
  assert.equal(sellerDraft.status, 'DRAFT');

  const deactivated = await success(
    app,
    'POST',
    `${MARKETPLACE}/listings/${draft.id}/deactivate`,
    adminToken,
  );
  assert.equal(deactivated.status, 'INACTIVE');

  await success(app, 'POST', `${MARKETPLACE}/favorites/${listing.id}`, buyerToken);
  const favorites = await success(app, 'GET', `${MARKETPLACE}/favorites`, buyerToken);
  assert.equal(favorites.favorites.length, 1);
  assert.equal(favorites.favorites[0].id, listing.id);

  const sellerProfile = await success(
    app,
    'GET',
    `${MARKETPLACE}/sellers/${listing.seller.id}`,
    buyerToken,
  );
  assert.equal(sellerProfile.id, listing.seller.id);
  assert.ok(!JSON.stringify(sellerProfile).includes('admin@example.com'));

  const report = await success(
    app,
    'POST',
    `${MARKETPLACE}/listings/${listing.id}/reports`,
    buyerToken,
    { reason: 'MISLEADING', details: 'Quantity looks incorrect.' },
    201,
  );
  assert.equal(report.status, 'PENDING');
  const duplicate = await request(
    app,
    'POST',
    `${MARKETPLACE}/listings/${listing.id}/reports`,
    buyerToken,
    { reason: 'FRAUD' },
  );
  assert.equal(duplicate.response.statusCode, 409);
  const reviewed = await success(
    app,
    'PATCH',
    `${MARKETPLACE}/reports/${report.id}/review`,
    adminToken,
    { status: 'RESOLVED' },
  );
  assert.equal(reviewed.status, 'RESOLVED');
  assert.ok(reviewed.reviewedAt);

  const message = await success(
    app,
    'POST',
    `${MARKETPLACE}/listings/${listing.id}/messages`,
    buyerToken,
    { body: 'Is this price still available?' },
    201,
  );
  assert.equal(message.recipientUserId, listing.seller.id);
  const sellerMessages = await success(app, 'GET', `${MARKETPLACE}/messages`, adminToken);
  assert.equal(sellerMessages.messages.length, 1);
  const read = await success(
    app,
    'PATCH',
    `${MARKETPLACE}/messages/${message.id}/read`,
    adminToken,
  );
  assert.ok(read.readAt);

  const selfMessage = await request(
    app,
    'POST',
    `${MARKETPLACE}/listings/${listing.id}/messages`,
    adminToken,
    { body: 'Cannot message myself.' },
  );
  assert.equal(selfMessage.response.statusCode, 400);

  const blankMessage = await request(
    app,
    'POST',
    `${MARKETPLACE}/listings/${listing.id}/messages`,
    buyerToken,
    { body: '   ' },
  );
  assert.equal(blankMessage.response.statusCode, 400);
});

test('marketplace routes are public only for module info and denied by default', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app } = fixture;

  const info = await request(app, 'GET', `${MARKETPLACE}/info`);
  assert.equal(info.response.statusCode, 200);

  for (const [method, url] of [
    ['GET', `${MARKETPLACE}/listings`],
    ['GET', `${MARKETPLACE}/favorites`],
    ['GET', `${MARKETPLACE}/messages`],
    ['POST', `${MARKETPLACE}/listings`],
  ]) {
    const denied = await request(app, method, url, undefined, method === 'POST' ? {} : undefined);
    assert.equal(denied.response.statusCode, 401, `${method} ${url}`);
  }
});

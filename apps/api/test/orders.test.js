const assert = require('node:assert/strict');
const test = require('node:test');

const { bearer, createTenantFixture, loginUser } = require('./support/auth-fixtures');

const CATALOG = '/api/v1/catalog';
const MARKETPLACE = '/api/v1/marketplace';
const ORDERS = '/api/v1/orders';

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

async function success(app, method, url, token, payload, status = 200, headers = {}) {
  const result = await request(app, method, url, token, payload, headers);
  assert.equal(result.response.statusCode, status, JSON.stringify(result.body));
  return result.body.data;
}

async function createMarketplaceFixture(t) {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;
  const sellerToken = await login(app, 'same-org@example.com');
  const buyerToken = await login(app, 'peer@example.com');
  const otherBuyerToken = await login(app, 'other-org@example.com');

  const units = await success(app, 'GET', `${CATALOG}/units`, adminToken);
  if (!units.units.some((unit) => unit.code === 'KG')) {
    await success(
      app,
      'POST',
      `${CATALOG}/units`,
      adminToken,
      { code: 'KG', name: 'Kilogram', nameBn: 'কিলোগ্রাম' },
      201,
    );
  }
  const categories = await success(app, 'GET', `${CATALOG}/categories`, adminToken);
  let category = categories.categories.find((item) => item.code === 'GRAINS');
  if (!category) {
    category = await success(
      app,
      'POST',
      `${CATALOG}/categories`,
      adminToken,
      { organizationId: orgA.id, code: 'GRAINS', name: 'Grains', nameBn: 'শস্য' },
      201,
    );
  }
  const grade = await success(
    app,
    'POST',
    `${CATALOG}/quality-grades`,
    adminToken,
    { code: 'ORDER-GRADE-A', name: 'Order Grade A', nameBn: 'অর্ডার গ্রেড এ' },
    201,
  );

  async function product(sku, name) {
    return success(
      app,
      'POST',
      `${CATALOG}/products`,
      adminToken,
      {
        organizationId: orgA.id,
        categoryId: category.id,
        sku,
        name,
        unitCode: 'KG',
        description: `${name} for order tests.`,
      },
      201,
    );
  }

  const productA = await product('ORDERS-RICE-A', 'Seller A rice');
  const productB = await product('ORDERS-RICE-B', 'Seller B rice');

  async function listing(token, sellerProduct, overrides) {
    return success(
      app,
      'POST',
      `${MARKETPLACE}/listings`,
      token,
      {
        productId: sellerProduct.id,
        status: 'ACTIVE',
        title: overrides.title,
        description: 'Freshly milled rice.',
        unitPrice: overrides.unitPrice,
        currency: 'BDT',
        quantityAvailable: overrides.quantityAvailable,
        minOrderQuantity: 1,
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
        images: [{ url: 'https://example.com/orders-rice.jpg', altText: 'Rice', sortOrder: 0 }],
      },
      201,
    );
  }

  const listingA = await listing(adminToken, productA, {
    title: 'Seller A aromatic rice',
    unitPrice: 100,
    quantityAvailable: 10,
  });
  const listingB = await listing(sellerToken, productB, {
    title: 'Seller B aromatic rice',
    unitPrice: 50,
    quantityAvailable: 8,
  });

  return {
    ...fixture,
    buyerToken,
    otherBuyerToken,
    sellerToken,
    sellerUserId: fixture.sameOrgUserId,
    listingA,
    listingB,
  };
}

test('orders routes are default-deny except module info', async (t) => {
  const { app } = await createTenantFixture(t);

  const info = await app.inject({ method: 'GET', url: `${ORDERS}/info` });
  assert.equal(info.statusCode, 200);

  for (const url of [`${ORDERS}/cart`, `${ORDERS}/checkouts`, `${ORDERS}/orders`]) {
    const response = await app.inject({ method: 'GET', url });
    assert.equal(response.statusCode, 401, url);
  }
  const write = await app.inject({
    method: 'POST',
    url: `${ORDERS}/cart/items`,
    payload: { listingId: '00000000-0000-0000-0000-000000000001', quantity: 1 },
  });
  assert.equal(write.statusCode, 401);
});

test('cart mutations validate availability, stock, seller tenant, and prices', async (t) => {
  const { app, buyerToken, otherBuyerToken, sellerToken, orgB, listingA, listingB } =
    await createMarketplaceFixture(t);

  const empty = await success(app, 'GET', `${ORDERS}/cart`, buyerToken);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.subtotalAmount, 0);

  const added = await success(
    app,
    'POST',
    `${ORDERS}/cart/items`,
    buyerToken,
    { listingId: listingA.id, quantity: 2 },
    201,
  );
  assert.equal(added.items.length, 1);
  assert.equal(added.items[0].unitPriceSnapshot, 100);
  assert.equal(added.subtotalAmount, 200);

  const updated = await success(app, 'PATCH', `${ORDERS}/cart/items/${listingA.id}`, buyerToken, {
    quantity: 3,
  });
  assert.equal(updated.subtotalAmount, 300);

  const belowMinimum = await request(app, 'POST', `${ORDERS}/cart/items`, buyerToken, {
    listingId: listingA.id,
    quantity: 0.5,
  });
  assert.equal(belowMinimum.response.statusCode, 400);

  const aboveStock = await request(app, 'POST', `${ORDERS}/cart/items`, buyerToken, {
    listingId: listingA.id,
    quantity: 999,
  });
  assert.equal(aboveStock.response.statusCode, 409);

  const crossTenant = await request(app, 'POST', `${ORDERS}/cart/items`, otherBuyerToken, {
    organizationId: orgB.id,
    listingId: listingA.id,
    quantity: 1,
  });
  assert.equal(crossTenant.response.statusCode, 403);

  const withSecondSeller = await success(
    app,
    'POST',
    `${ORDERS}/cart/items`,
    buyerToken,
    { listingId: listingB.id, quantity: 4 },
    201,
  );
  assert.equal(withSecondSeller.items.length, 2);
  assert.equal(withSecondSeller.subtotalAmount, 500);

  const removed = await success(app, 'DELETE', `${ORDERS}/cart/items/${listingA.id}`, buyerToken);
  assert.equal(removed.items.length, 1);
  assert.equal(removed.subtotalAmount, 200);

  const missing = await request(app, 'DELETE', `${ORDERS}/cart/items/${listingA.id}`, buyerToken);
  assert.equal(missing.response.statusCode, 404);

  const inactive = await success(
    app,
    'PATCH',
    `${MARKETPLACE}/listings/${listingB.id}`,
    sellerToken,
    { status: 'INACTIVE' },
  );
  assert.equal(inactive.status, 'INACTIVE');
  const inactiveAdd = await request(app, 'POST', `${ORDERS}/cart/items`, buyerToken, {
    listingId: listingB.id,
    quantity: 1,
  });
  assert.equal(inactiveAdd.response.statusCode, 409);
});

test('cart rejects listings whose seller account is unavailable', async (t) => {
  const fixture = await createMarketplaceFixture(t);
  const { app, store, buyerToken, listingB, sellerUserId } = fixture;

  const seller = await store.findUserById(sellerUserId);
  assert.ok(seller);
  await store.updateUser(sellerUserId, { account_status: 'DEACTIVATED' });

  const response = await request(app, 'POST', `${ORDERS}/cart/items`, buyerToken, {
    listingId: listingB.id,
    quantity: 1,
  });
  assert.equal(response.response.statusCode, 409);
  assert.match(response.body.meta.message, /Seller/);
});

test('checkout splits sellers, ignores client totals, and is idempotent', async (t) => {
  const fixture = await createMarketplaceFixture(t);
  const {
    app,
    buyerToken,
    otherBuyerToken,
    sellerToken,
    adminId,
    sellerUserId,
    listingA,
    listingB,
  } = fixture;

  await success(
    app,
    'POST',
    `${ORDERS}/cart/items`,
    buyerToken,
    {
      listingId: listingA.id,
      quantity: 2,
    },
    201,
  );
  await success(
    app,
    'POST',
    `${ORDERS}/cart/items`,
    buyerToken,
    {
      listingId: listingB.id,
      quantity: 3,
    },
    201,
  );

  const payload = {
    // Amount fields are deliberately supplied by an untrusted client and must
    // be ignored in favour of server-recalculated values.
    subtotalAmount: 1,
    discountAmount: 0,
    deliveryFeeAmount: 0,
    totalAmount: 1,
    currency: 'USD',
    pricingRules: [
      {
        ruleKey: 'seller-a-delivery',
        type: 'DELIVERY',
        mode: 'FLAT',
        amount: 10,
        sellerUserId: adminId,
      },
      { ruleKey: 'order-discount', type: 'DISCOUNT', mode: 'PERCENTAGE', percentage: 0.1 },
    ],
  };
  const headers = { 'Idempotency-Key': 'checkout-orders-001' };
  const checkout = await success(
    app,
    'POST',
    `${ORDERS}/checkout`,
    buyerToken,
    payload,
    201,
    headers,
  );

  assert.equal(checkout.referenceKey, 'checkout-orders-001');
  assert.equal(checkout.currency, 'BDT');
  assert.equal(checkout.orders.length, 2);
  assert.equal(checkout.subtotalAmount, 350);
  assert.equal(checkout.discountAmount, 0);
  assert.equal(checkout.deliveryFeeAmount, 0);
  assert.equal(checkout.totalAmount, 350);
  assert.deepEqual(checkout.pricing.rules, []);
  assert.equal(checkout.pricing.derivedFrom, 'server-calculated-cart-lines');

  const ordersBySeller = new Map(checkout.orders.map((order) => [order.sellerUserId, order]));
  const orderA = ordersBySeller.get(adminId);
  const orderB = ordersBySeller.get(sellerUserId);
  assert.ok(orderA);
  assert.ok(orderB);
  assert.equal(orderA.subtotalAmount, 200);
  assert.equal(orderA.discountAmount, 0);
  assert.equal(orderA.deliveryFeeAmount, 0);
  assert.equal(orderA.totalAmount, 200);
  assert.equal(orderB.subtotalAmount, 150);
  assert.equal(orderB.discountAmount, 0);
  assert.equal(orderB.deliveryFeeAmount, 0);
  assert.equal(orderB.totalAmount, 150);

  const duplicate = await success(
    app,
    'POST',
    `${ORDERS}/checkout`,
    buyerToken,
    payload,
    201,
    headers,
  );
  assert.equal(duplicate.id, checkout.id);
  assert.equal(duplicate.orders.length, 2);

  const listingAAfter = await success(
    app,
    'GET',
    `${MARKETPLACE}/listings/${listingA.id}`,
    buyerToken,
  );
  const listingBAfter = await success(
    app,
    'GET',
    `${MARKETPLACE}/listings/${listingB.id}`,
    buyerToken,
  );
  assert.equal(listingAAfter.quantityAvailable, 8);
  assert.equal(listingBAfter.quantityAvailable, 5);

  const checkouts = await success(app, 'GET', `${ORDERS}/checkouts`, buyerToken);
  assert.equal(checkouts.checkouts.length, 1);
  const checkoutById = await success(app, 'GET', `${ORDERS}/checkouts/${checkout.id}`, buyerToken);
  assert.equal(checkoutById.id, checkout.id);

  const orders = await success(app, 'GET', `${ORDERS}/orders`, buyerToken);
  assert.equal(orders.orders.length, 2);

  const sellerOrder = await success(app, 'GET', `${ORDERS}/orders/${orderB.id}`, sellerToken);
  assert.equal(sellerOrder.sellerUserId, sellerUserId);
  const sellerCheckoutDenied = await request(
    app,
    'GET',
    `${ORDERS}/checkouts/${checkout.id}`,
    sellerToken,
  );
  assert.equal(sellerCheckoutDenied.response.statusCode, 403);
  const sellerReceiptDenied = await request(
    app,
    'GET',
    `${ORDERS}/orders/${orderB.id}/receipt`,
    sellerToken,
  );
  assert.equal(sellerReceiptDenied.response.statusCode, 403);
  const otherTenantDenied = await request(
    app,
    'GET',
    `${ORDERS}/orders/${orderA.id}`,
    otherBuyerToken,
  );
  assert.equal(otherTenantDenied.response.statusCode, 404);

  const initialHistory = await success(
    app,
    'GET',
    `${ORDERS}/orders/${orderA.id}/history`,
    buyerToken,
  );
  assert.equal(initialHistory.history.length, 1);
  assert.equal(initialHistory.history[0].toStatus, 'PENDING');

  const cancelled = await success(app, 'POST', `${ORDERS}/orders/${orderA.id}/cancel`, buyerToken, {
    reason: 'test cancellation',
  });
  assert.equal(cancelled.status, 'CANCELLED');
  const listingAAfterCancel = await success(
    app,
    'GET',
    `${MARKETPLACE}/listings/${listingA.id}`,
    buyerToken,
  );
  assert.equal(listingAAfterCancel.quantityAvailable, 10);

  const historyAfter = await success(
    app,
    'GET',
    `${ORDERS}/orders/${orderA.id}/history`,
    buyerToken,
  );
  assert.equal(historyAfter.history.length, 2);
  assert.equal(historyAfter.history[0].fromStatus, 'PENDING');
  assert.equal(historyAfter.history[0].toStatus, 'CANCELLED');

  const cancelAgain = await request(
    app,
    'POST',
    `${ORDERS}/orders/${orderA.id}/cancel`,
    buyerToken,
  );
  assert.equal(cancelAgain.response.statusCode, 409);

  const confirmed = await success(
    app,
    'POST',
    `${ORDERS}/orders/${orderB.id}/transitions`,
    buyerToken,
    { toStatus: 'CONFIRMED' },
  );
  assert.equal(confirmed.status, 'CONFIRMED');
  const invalidTransition = await request(
    app,
    'POST',
    `${ORDERS}/orders/${orderB.id}/transitions`,
    buyerToken,
    { toStatus: 'COMPLETED' },
  );
  assert.equal(invalidTransition.response.statusCode, 409);

  const receipt = await success(app, 'GET', `${ORDERS}/orders/${orderB.id}/receipt`, buyerToken);
  assert.equal(receipt.referenceKey, 'checkout-orders-001');
  assert.equal(receipt.checkout.id, checkout.id);
  assert.equal(receipt.checkout.totalAmount, 350);
  assert.equal(receipt.order.totalAmount, 150);
  assert.equal(receipt.items.length, 1);

  const mismatch = await request(
    app,
    'POST',
    `${ORDERS}/checkout`,
    buyerToken,
    { referenceKey: 'another-ref-0001' },
    { 'Idempotency-Key': 'different-key-0001' },
  );
  assert.equal(mismatch.response.statusCode, 400);
});

test('checkout revalidates current listing prices and stock', async (t) => {
  const priceFixture = await createMarketplaceFixture(t);
  const { app, adminToken, buyerToken, listingA } = priceFixture;
  await success(
    app,
    'POST',
    `${ORDERS}/cart/items`,
    buyerToken,
    {
      listingId: listingA.id,
      quantity: 2,
    },
    201,
  );
  await success(app, 'PATCH', `${MARKETPLACE}/listings/${listingA.id}`, adminToken, {
    unitPrice: 125,
  });

  const repriced = await success(
    app,
    'POST',
    `${ORDERS}/checkout`,
    buyerToken,
    {
      referenceKey: 'repriced-checkout-01',
    },
    201,
  );
  assert.equal(repriced.subtotalAmount, 250);
  assert.equal(repriced.totalAmount, 250);
  assert.equal(repriced.orders[0].items[0].unitPrice, 125);

  const stockFixture = await createMarketplaceFixture(t);
  const { app: stockApp, sellerToken, buyerToken: stockBuyer, listingB } = stockFixture;
  await success(
    stockApp,
    'POST',
    `${ORDERS}/cart/items`,
    stockBuyer,
    {
      listingId: listingB.id,
      quantity: 5,
    },
    201,
  );
  await success(stockApp, 'PATCH', `${MARKETPLACE}/listings/${listingB.id}`, sellerToken, {
    quantityAvailable: 1,
  });

  const insufficient = await request(stockApp, 'POST', `${ORDERS}/checkout`, stockBuyer, {
    referenceKey: 'insufficient-stock-01',
  });
  assert.equal(insufficient.response.statusCode, 409);

  const stockAfterFailure = await success(
    stockApp,
    'GET',
    `${MARKETPLACE}/listings/${listingB.id}`,
    stockBuyer,
  );
  assert.equal(stockAfterFailure.quantityAvailable, 1);
});

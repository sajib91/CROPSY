const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? test.describe : test.describe.skip;
const prisma = new PrismaClient();

function uuid(number) {
  return `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
}

const ID = {
  userA: uuid(8001),
  userB: uuid(8002),
  orgA: uuid(8011),
  orgB: uuid(8012),
  categoryA: uuid(8021),
  productA: uuid(8031),
  inventory: uuid(8041),
  listing: uuid(8051),
  cartA: uuid(8061),
  groupA: uuid(8071),
  orderA: uuid(8081),
  statusChangeA: uuid(8091),
};

function sqlState(error) {
  return error?.meta?.code || error?.code;
}

async function expectSqlState(expected, operation) {
  const accepted = Array.isArray(expected) ? expected : [expected];
  try {
    await operation();
  } catch (error) {
    assert.ok(
      accepted.includes(sqlState(error)),
      `Expected ${accepted.join(' or ')}, received ${sqlState(error)}: ${error.message}`,
    );
    return;
  }
  assert.fail(`Expected ${accepted.join(' or ')}, but the operation succeeded`);
}

async function listingQuantity() {
  const rows = await prisma.$queryRaw`
    SELECT "quantity_available"::text AS "quantity"
    FROM "product_listings"
    WHERE "id" = ${ID.listing}::uuid
  `;
  return Number(rows[0].quantity);
}

async function seedFixtures() {
  await prisma.$executeRaw`
    INSERT INTO users (id, email, password_hash, created_at, updated_at)
    VALUES (${ID.userA}::uuid, 'dbtest-orders-a@example.com', 'test-hash', NOW(), NOW()),
           (${ID.userB}::uuid, 'dbtest-orders-b@example.com', 'test-hash', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO organizations (id, name, slug, owner_user_id, created_at, updated_at)
    VALUES (${ID.orgA}::uuid, 'DB Test Orders Org A', 'dbtest-orders-org-a', ${ID.userA}::uuid, NOW(), NOW()),
           (${ID.orgB}::uuid, 'DB Test Orders Org B', 'dbtest-orders-org-b', ${ID.userB}::uuid, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO product_categories (id, organization_id, code, name, created_at, updated_at)
    VALUES (${ID.categoryA}::uuid, ${ID.orgA}::uuid, 'DBTEST-ORDERS-CAT', 'DB Test Orders Category', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO products (id, organization_id, category_id, sku, name, unit_code, created_at, updated_at)
    VALUES (${ID.productA}::uuid, ${ID.orgA}::uuid, ${ID.categoryA}::uuid,
            'DBTEST-ORDERS-SKU', 'DB Test Orders Product', 'KG', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO product_inventories (
      id, organization_id, product_id, scope_key,
      quantity_on_hand, quantity_reserved, available_quantity, created_at, updated_at
    )
    VALUES (${ID.inventory}::uuid, ${ID.orgA}::uuid, ${ID.productA}::uuid,
            'UNALLOCATED', 20, 0, 20, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO product_listings (
      id, organization_id, product_id, seller_user_id, inventory_id, status,
      title, unit_price, currency, quantity_available, min_order_quantity,
      available_location, created_at, updated_at
    )
    VALUES (${ID.listing}::uuid, ${ID.orgA}::uuid, ${ID.productA}::uuid,
            ${ID.userB}::uuid, ${ID.inventory}::uuid, 'ACTIVE',
            'DB Test Orders Listing', 100, 'BDT', 10, 1, 'Dhaka', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO carts (id, organization_id, user_id, status, created_at, updated_at)
    VALUES (${ID.cartA}::uuid, ${ID.orgA}::uuid, ${ID.userA}::uuid, 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO purchase_groups (
      id, organization_id, buyer_user_id, cart_id, reference_key, status,
      currency, subtotal_amount, discount_amount, delivery_fee_amount, tax_amount,
      total_amount, pricing_snapshot, created_at, updated_at
    )
    VALUES (${ID.groupA}::uuid, ${ID.orgA}::uuid, ${ID.userA}::uuid, ${ID.cartA}::uuid,
            'DBTEST-ORDER-REF-1', 'PENDING', 'BDT', 200, 20, 10, 0, 190,
            '{"computed":{"totalAmount":190}}'::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO orders (
      id, organization_id, purchase_group_id, cart_id, buyer_user_id, seller_user_id,
      status, currency, subtotal_amount, discount_amount, delivery_fee_amount,
      tax_amount, total_amount, pricing_snapshot, created_at, updated_at
    )
    VALUES (${ID.orderA}::uuid, ${ID.orgA}::uuid, ${ID.groupA}::uuid, ${ID.cartA}::uuid,
            ${ID.userA}::uuid, ${ID.userB}::uuid, 'PENDING', 'BDT',
            200, 20, 10, 0, 190, '{"computed":{"totalAmount":190}}'::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO order_status_changes (
      id, organization_id, purchase_group_id, order_id, from_status, to_status,
      reason, actor_user_id, created_at
    )
    VALUES (${ID.statusChangeA}::uuid, ${ID.orgA}::uuid, ${ID.groupA}::uuid,
            ${ID.orderA}::uuid, NULL, 'PENDING', 'checkout', ${ID.userA}::uuid, NOW())
    ON CONFLICT (id) DO NOTHING
  `;
}

describeDatabase('cart and order database invariants', () => {
  test.before(async () => {
    await seedFixtures();
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('checkout totals and reference keys are enforced by the database', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO purchase_groups (
          id, organization_id, buyer_user_id, cart_id, reference_key,
          subtotal_amount, discount_amount, delivery_fee_amount, tax_amount, total_amount,
          created_at, updated_at
        )
        VALUES (${uuid(8101)}::uuid, ${ID.orgA}::uuid, ${ID.userA}::uuid, ${ID.cartA}::uuid,
                'DBTEST-BAD-TOTAL-1', 200, 20, 10, 0, 999, NOW(), NOW())
      `;
    });

    await expectSqlState('23505', async () => {
      await prisma.$executeRaw`
        INSERT INTO purchase_groups (
          id, organization_id, buyer_user_id, cart_id, reference_key,
          subtotal_amount, discount_amount, delivery_fee_amount, tax_amount, total_amount,
          created_at, updated_at
        )
        VALUES (${uuid(8102)}::uuid, ${ID.orgA}::uuid, ${ID.userA}::uuid, ${ID.cartA}::uuid,
                'DBTEST-ORDER-REF-1', 100, 0, 0, 0, 100, NOW(), NOW())
      `;
    });
  });

  test('status history is append-only', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE order_status_changes
        SET reason = 'tampered'
        WHERE id = ${ID.statusChangeA}::uuid
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        DELETE FROM order_status_changes
        WHERE id = ${ID.statusChangeA}::uuid
      `;
    });
  });

  test('checkout, fulfillment, and status history reject cross-tenant references', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO purchase_groups (
          id, organization_id, buyer_user_id, cart_id, reference_key,
          subtotal_amount, total_amount, created_at, updated_at
        )
        VALUES (${uuid(8201)}::uuid, ${ID.orgB}::uuid, ${ID.userB}::uuid, ${ID.cartA}::uuid,
                'DBTEST-CROSS-GROUP-1', 100, 100, NOW(), NOW())
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO orders (
          id, organization_id, purchase_group_id, cart_id, buyer_user_id, seller_user_id,
          subtotal_amount, total_amount, created_at, updated_at
        )
        VALUES (${uuid(8202)}::uuid, ${ID.orgB}::uuid, ${ID.groupA}::uuid, ${ID.cartA}::uuid,
                ${ID.userB}::uuid, ${ID.userB}::uuid, 100, 100, NOW(), NOW())
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO order_status_changes (
          id, organization_id, purchase_group_id, order_id, to_status, created_at
        )
        VALUES (${uuid(8203)}::uuid, ${ID.orgB}::uuid, ${ID.groupA}::uuid,
                ${ID.orderA}::uuid, 'CONFIRMED', NOW())
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE purchase_groups
        SET organization_id = ${ID.orgB}::uuid
        WHERE id = ${ID.groupA}::uuid
      `;
    });
  });

  test('listing availability decrement and restore are atomic and bounded', async () => {
    await prisma.$executeRaw`
      UPDATE product_listings
      SET quantity_available = 10, updated_at = NOW()
      WHERE id = ${ID.listing}::uuid
    `;

    await prisma.$executeRaw`
      SELECT "cropsy_decrement_listing_availability"(${ID.listing}::uuid, 3::numeric)
    `;
    assert.equal(await listingQuantity(), 7);

    await prisma.$executeRaw`
      SELECT "cropsy_restore_listing_availability"(${ID.listing}::uuid, 3::numeric)
    `;
    assert.equal(await listingQuantity(), 10);

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        SELECT "cropsy_decrement_listing_availability"(${ID.listing}::uuid, 11::numeric)
      `;
    });
    assert.equal(await listingQuantity(), 10);

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        SELECT "cropsy_decrement_listing_availability"(${ID.listing}::uuid, 0::numeric)
      `;
    });
  });
});

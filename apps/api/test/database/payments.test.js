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
  buyer: uuid(9001),
  seller: uuid(9002),
  otherUser: uuid(9003),
  orgA: uuid(9011),
  orgB: uuid(9012),
  category: uuid(9021),
  product: uuid(9031),
  inventory: uuid(9041),
  listing: uuid(9051),
  cart: uuid(9061),
  group: uuid(9071),
  order: uuid(9081),
  payment: uuid(9091),
  statusChange: uuid(9092),
  webhook: uuid(9093),
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

async function seedFixtures() {
  await prisma.$executeRaw`
    INSERT INTO users (id, email, password_hash, created_at, updated_at)
    VALUES (${ID.buyer}::uuid, 'dbtest-payments-buyer@example.com', 'test-hash', NOW(), NOW()),
           (${ID.seller}::uuid, 'dbtest-payments-seller@example.com', 'test-hash', NOW(), NOW()),
           (${ID.otherUser}::uuid, 'dbtest-payments-other@example.com', 'test-hash', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO organizations (id, name, slug, owner_user_id, created_at, updated_at)
    VALUES (${ID.orgA}::uuid, 'DB Test Payments Org A', 'dbtest-payments-org-a', ${ID.buyer}::uuid, NOW(), NOW()),
           (${ID.orgB}::uuid, 'DB Test Payments Org B', 'dbtest-payments-org-b', ${ID.otherUser}::uuid, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO product_categories (id, organization_id, code, name, created_at, updated_at)
    VALUES (${ID.category}::uuid, ${ID.orgA}::uuid, 'DBTEST-PAY-CAT', 'DB Test Payments Category', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO products (id, organization_id, category_id, sku, name, unit_code, created_at, updated_at)
    VALUES (${ID.product}::uuid, ${ID.orgA}::uuid, ${ID.category}::uuid,
            'DBTEST-PAY-SKU', 'DB Test Payments Product', 'KG', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO product_inventories (
      id, organization_id, product_id, scope_key,
      quantity_on_hand, quantity_reserved, available_quantity, created_at, updated_at
    )
    VALUES (${ID.inventory}::uuid, ${ID.orgA}::uuid, ${ID.product}::uuid,
            'UNALLOCATED', 20, 0, 20, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO product_listings (
      id, organization_id, product_id, seller_user_id, inventory_id, status,
      title, unit_price, currency, quantity_available, min_order_quantity,
      available_location, created_at, updated_at
    )
    VALUES (${ID.listing}::uuid, ${ID.orgA}::uuid, ${ID.product}::uuid,
            ${ID.seller}::uuid, ${ID.inventory}::uuid, 'ACTIVE',
            'DB Test Payments Listing', 100, 'BDT', 10, 1, 'Dhaka', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO carts (id, organization_id, user_id, status, created_at, updated_at)
    VALUES (${ID.cart}::uuid, ${ID.orgA}::uuid, ${ID.buyer}::uuid, 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO purchase_groups (
      id, organization_id, buyer_user_id, cart_id, reference_key, status,
      currency, subtotal_amount, discount_amount, delivery_fee_amount, tax_amount,
      total_amount, pricing_snapshot, created_at, updated_at
    )
    VALUES (${ID.group}::uuid, ${ID.orgA}::uuid, ${ID.buyer}::uuid, ${ID.cart}::uuid,
            'DBTEST-PAY-REF-1', 'PENDING', 'BDT', 100, 0, 0, 0, 100,
            '{"computed":{"totalAmount":100}}'::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO orders (
      id, organization_id, purchase_group_id, cart_id, buyer_user_id, seller_user_id,
      status, currency, subtotal_amount, discount_amount, delivery_fee_amount,
      tax_amount, total_amount, pricing_snapshot, created_at, updated_at
    )
    VALUES (${ID.order}::uuid, ${ID.orgA}::uuid, ${ID.group}::uuid, ${ID.cart}::uuid,
            ${ID.buyer}::uuid, ${ID.seller}::uuid, 'PENDING', 'BDT',
            100, 0, 0, 0, 100, '{"computed":{"totalAmount":100}}'::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO payments (
      id, organization_id, order_id, purchase_group_id, user_id, provider_code,
      provider_reference, idempotency_key, method, status, amount, captured_amount,
      refunded_amount, currency, captured_at, allocation_snapshot,
      commission_rule_snapshot, created_at, updated_at
    )
    VALUES (${ID.payment}::uuid, ${ID.orgA}::uuid, ${ID.order}::uuid, ${ID.group}::uuid,
            ${ID.buyer}::uuid, 'DBTEST_PROVIDER', 'dbtest-payment-ref-1',
            'DBTEST-PAYMENT-IDEM-1', 'CARD', 'CAPTURED', 100, 100, 0, 'BDT', NOW(),
            '{"sellerNetAmount":90,"commissionAmount":10}'::jsonb,
            '{"ruleKey":"DBTEST_RULE"}'::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO payment_status_changes (
      id, organization_id, payment_id, from_status, to_status, reason, created_at
    )
    VALUES (${ID.statusChange}::uuid, ${ID.orgA}::uuid, ${ID.payment}::uuid,
            'AUTHORIZED', 'CAPTURED', 'dbtest', NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO payment_webhook_events (
      id, organization_id, provider_code, provider_event_id, payment_id, payload,
      signature, status, received_at, created_at, updated_at
    )
    VALUES (${ID.webhook}::uuid, ${ID.orgA}::uuid, 'DBTEST_PROVIDER', 'dbtest-event-1',
            ${ID.payment}::uuid, '{"eventId":"dbtest-event-1"}'::jsonb,
            'sha256=test', 'PROCESSED', NOW(), NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
}

describeDatabase('payment database invariants', () => {
  test.before(async () => {
    await seedFixtures();
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('payment amounts, references, and idempotency keys are enforced', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE payments SET captured_amount = 101 WHERE id = ${ID.payment}::uuid
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE payments SET refunded_amount = 101 WHERE id = ${ID.payment}::uuid
      `;
    });

    await expectSqlState('23505', async () => {
      await prisma.$executeRaw`
        INSERT INTO payments (
          id, organization_id, order_id, user_id, provider_code, idempotency_key,
          amount, created_at, updated_at
        )
        VALUES (${uuid(9101)}::uuid, ${ID.orgA}::uuid, ${ID.order}::uuid, ${ID.buyer}::uuid,
                'DBTEST_PROVIDER', 'DBTEST-PAYMENT-IDEM-1', 100, NOW(), NOW())
      `;
    });

    await expectSqlState('23505', async () => {
      await prisma.$executeRaw`
        INSERT INTO payments (
          id, organization_id, order_id, user_id, provider_code, provider_reference,
          idempotency_key, amount, created_at, updated_at
        )
        VALUES (${uuid(9102)}::uuid, ${ID.orgA}::uuid, ${ID.order}::uuid, ${ID.buyer}::uuid,
                'DBTEST_PROVIDER', 'dbtest-payment-ref-1', 'DBTEST-PAYMENT-IDEM-2', 100, NOW(), NOW())
      `;
    });
  });

  test('payment status history is append-only', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE payment_status_changes SET reason = 'tampered' WHERE id = ${ID.statusChange}::uuid
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        DELETE FROM payment_status_changes WHERE id = ${ID.statusChange}::uuid
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`TRUNCATE payment_status_changes`;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO payment_status_changes (
          id, organization_id, payment_id, from_status, to_status, created_at
        )
        VALUES (${uuid(9103)}::uuid, ${ID.orgA}::uuid, ${ID.payment}::uuid,
                'CAPTURED', 'CAPTURED', NOW())
      `;
    });
  });

  test('webhook callbacks are unique and tenant consistent', async () => {
    await expectSqlState('23505', async () => {
      await prisma.$executeRaw`
        INSERT INTO payment_webhook_events (
          id, organization_id, provider_code, provider_event_id, payment_id, payload, created_at, updated_at
        )
        VALUES (${uuid(9104)}::uuid, ${ID.orgA}::uuid, 'DBTEST_PROVIDER', 'dbtest-event-1',
                ${ID.payment}::uuid, '{}'::jsonb, NOW(), NOW())
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO payment_webhook_events (
          id, organization_id, provider_code, provider_event_id, payment_id, payload, created_at, updated_at
        )
        VALUES (${uuid(9105)}::uuid, ${ID.orgB}::uuid, 'DBTEST_PROVIDER', 'dbtest-event-other-org',
                ${ID.payment}::uuid, '{}'::jsonb, NOW(), NOW())
      `;
    });
  });
});

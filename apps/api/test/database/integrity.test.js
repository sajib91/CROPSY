const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? test.describe : test.describe.skip;
const prisma = new PrismaClient();

const ID = {
  userA: '00000000-0000-0000-0000-000000000001',
  userB: '00000000-0000-0000-0000-000000000002',
  orgA: '00000000-0000-0000-0000-000000000010',
  orgB: '00000000-0000-0000-0000-000000000011',
  role: '00000000-0000-0000-0000-000000000020',
  categoryA: '00000000-0000-0000-0000-000000000030',
  productA: '00000000-0000-0000-0000-000000000040',
  productNeg: '00000000-0000-0000-0000-000000000041',
  inventory: '00000000-0000-0000-0000-000000000050',
  cartA: '00000000-0000-0000-0000-000000000060',
  orderA: '00000000-0000-0000-0000-000000000070',
  paymentA: '00000000-0000-0000-0000-000000000080',
  accountA: '00000000-0000-0000-0000-000000000090',
  audit: '00000000-0000-0000-0000-0000000000a0',
};

function uuid(number) {
  return `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
}

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

async function expectMessage(pattern, operation) {
  try {
    await operation();
  } catch (error) {
    const message = `${error.message} ${error?.meta?.message || ''}`;
    assert.match(message, pattern, `Unexpected rejection: ${message}`);
    return;
  }
  assert.fail(`Expected a rejection matching ${pattern}, but the operation succeeded`);
}

async function seedFixtures() {
  await prisma.$executeRaw`
    INSERT INTO roles (id, code, name, scope, created_at, updated_at)
    VALUES (${ID.role}::uuid, 'DBTEST_ROLE', 'Database test role', 'PLATFORM', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO users (id, email, password_hash, created_at, updated_at)
    VALUES (${ID.userA}::uuid, 'dbtest-a@example.com', 'test-hash', NOW(), NOW()),
           (${ID.userB}::uuid, 'dbtest-b@example.com', 'test-hash', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO organizations (id, name, slug, owner_user_id, created_at, updated_at)
    VALUES (${ID.orgA}::uuid, 'DB Test Org A', 'dbtest-org-a', ${ID.userA}::uuid, NOW(), NOW()),
           (${ID.orgB}::uuid, 'DB Test Org B', 'dbtest-org-b', ${ID.userB}::uuid, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO product_categories (id, organization_id, code, name, created_at, updated_at)
    VALUES (${ID.categoryA}::uuid, ${ID.orgA}::uuid, 'DBTEST-CAT-A', 'DB Test Category A', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO products (id, organization_id, category_id, sku, name, unit_code, created_at, updated_at)
    VALUES (${ID.productA}::uuid, ${ID.orgA}::uuid, ${ID.categoryA}::uuid, 'DBTEST-SKU-A', 'DB Test Product A', 'KG', NOW(), NOW()),
           (${ID.productNeg}::uuid, ${ID.orgA}::uuid, ${ID.categoryA}::uuid, 'DBTEST-SKU-NEG', 'DB Test Product Negative', 'KG', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO product_inventories (
      id, organization_id, product_id, scope_key,
      quantity_on_hand, quantity_reserved, available_quantity, created_at, updated_at
    )
    VALUES (${ID.inventory}::uuid, ${ID.orgA}::uuid, ${ID.productA}::uuid,
            'UNALLOCATED', 10, 0, 10, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO carts (id, organization_id, user_id, status, created_at, updated_at)
    VALUES (${ID.cartA}::uuid, ${ID.orgA}::uuid, ${ID.userA}::uuid, 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO orders (
      id, organization_id, cart_id, buyer_user_id, seller_user_id, status,
      subtotal_amount, total_amount, created_at, updated_at
    )
    VALUES (${ID.orderA}::uuid, ${ID.orgA}::uuid, ${ID.cartA}::uuid,
            ${ID.userA}::uuid, ${ID.userB}::uuid, 'CONFIRMED', 100, 100, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO payments (
      id, organization_id, order_id, user_id, idempotency_key, status,
      amount, captured_amount, captured_at, created_at, updated_at
    )
    VALUES (${ID.paymentA}::uuid, ${ID.orgA}::uuid, ${ID.orderA}::uuid,
            ${ID.userA}::uuid, 'DBTEST-PAYMENT-A', 'CAPTURED', 100, 100, NOW(), NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO ledger_accounts (
      id, organization_id, code, name, account_type, normal_balance, created_at, updated_at
    )
    VALUES (${ID.accountA}::uuid, ${ID.orgA}::uuid, 'DBTEST-CASH', 'DB Test Cash',
            'ASSET', 'DEBIT', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, created_at)
    VALUES (${ID.audit}::uuid, ${ID.orgA}::uuid, ${ID.userA}::uuid,
            'DBTEST_SETUP', 'Organization', ${ID.orgA}, NOW())
    ON CONFLICT (id) DO NOTHING
  `;
}

describeDatabase('database integrity and concurrency', () => {
  test.before(async () => {
    await seedFixtures();
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('rejects duplicate natural keys', async () => {
    await expectSqlState('23505', async () => {
      await prisma.$executeRaw`
        INSERT INTO roles (id, code, name, scope, created_at, updated_at)
        VALUES (${uuid(1001)}::uuid, 'DBTEST_ROLE', 'Duplicate', 'PLATFORM', NOW(), NOW())
      `;
    });

    await expectSqlState('23505', async () => {
      await prisma.$executeRaw`
        INSERT INTO payments (
          id, organization_id, order_id, user_id, idempotency_key, amount, created_at, updated_at
        )
        VALUES (${uuid(1002)}::uuid, ${ID.orgA}::uuid, ${ID.orderA}::uuid,
                ${ID.userA}::uuid, 'DBTEST-PAYMENT-A', 50, NOW(), NOW())
      `;
    });
  });

  test('rejects invalid foreign keys', async () => {
    await expectSqlState('23503', async () => {
      await prisma.$executeRaw`
        INSERT INTO payments (
          id, organization_id, order_id, user_id, idempotency_key, amount, created_at, updated_at
        )
        VALUES (${uuid(2001)}::uuid, ${ID.orgA}::uuid, ${uuid(9991)}::uuid,
                ${ID.userA}::uuid, 'DBTEST-BAD-FK-1', 50, NOW(), NOW())
      `;
    });

    await expectSqlState('23503', async () => {
      await prisma.$executeRaw`
        INSERT INTO ledger_entries (
          id, organization_id, account_id, direction, amount, entry_date, created_at, updated_at
        )
        VALUES (${uuid(2002)}::uuid, ${ID.orgA}::uuid, ${uuid(9992)}::uuid,
                'DEBIT', 10, CURRENT_DATE, NOW(), NOW())
      `;
    });
  });

  test('rejects cross-tenant parent references and tenant reassignment', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE product_inventories
        SET organization_id = ${ID.orgB}::uuid
        WHERE id = ${ID.inventory}::uuid
      `;
    });

    // Deferred constraint-trigger failures are reported by Prisma as connector
    // errors without a SQLSTATE, so assert on the invariant message.
    await expectMessage(
      /Cannot change carts organization_id while orders rows still reference it/,
      async () => {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
          UPDATE carts SET organization_id = ${ID.orgB}::uuid WHERE id = ${ID.cartA}::uuid
        `;
        });
      },
    );
  });

  test('rejects negative and over-reserved inventory', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO product_inventories (
          id, organization_id, product_id, scope_key,
          quantity_on_hand, quantity_reserved, available_quantity, created_at, updated_at
        )
        VALUES (${uuid(3001)}::uuid, ${ID.orgA}::uuid, ${ID.productNeg}::uuid,
                'UNALLOCATED', -1, 0, -1, NOW(), NOW())
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        SELECT "id" FROM reserve_product_inventory(${ID.inventory}::uuid, 20::numeric(14,3))
      `;
    });
  });

  test('rejects invalid financial states and unbalanced ledgers', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO payments (
          id, organization_id, order_id, user_id, idempotency_key, status,
          amount, captured_amount, captured_at, created_at, updated_at
        )
        VALUES (${uuid(4001)}::uuid, ${ID.orgA}::uuid, ${ID.orderA}::uuid,
                ${ID.userA}::uuid, 'DBTEST-BAD-STATUS', 'CAPTURED', 100, 0, NULL, NOW(), NOW())
      `;
    });

    // The baseline refund-cap trigger raises P0001; other state guards use 23514.
    await expectSqlState(['23514', 'P0001'], async () => {
      await prisma.$executeRaw`
        INSERT INTO refunds (
          id, organization_id, payment_id, order_id, amount, status, processed_at, created_at, updated_at
        )
        VALUES (${uuid(4002)}::uuid, ${ID.orgA}::uuid, ${ID.paymentA}::uuid,
                ${ID.orderA}::uuid, 150, 'PROCESSED', NOW(), NOW(), NOW())
      `;
    });

    // A balanced posted ledger must commit successfully.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO transactions (
          id, organization_id, transaction_type, direction, amount, status, posted_at, created_at, updated_at
        )
        VALUES (${uuid(4003)}::uuid, ${ID.orgA}::uuid, 'PAYMENT_CAPTURE', 'DEBIT',
                20, 'POSTED', NOW(), NOW(), NOW())
      `;
      await tx.$executeRaw`
        INSERT INTO ledger_entries (
          id, organization_id, transaction_id, account_id, direction, amount,
          entry_date, posted_at, created_at, updated_at
        )
        VALUES (${uuid(4004)}::uuid, ${ID.orgA}::uuid, ${uuid(4003)}::uuid,
                ${ID.accountA}::uuid, 'DEBIT', 10, CURRENT_DATE, NOW(), NOW(), NOW()),
               (${uuid(4005)}::uuid, ${ID.orgA}::uuid, ${uuid(4003)}::uuid,
                ${ID.accountA}::uuid, 'CREDIT', 10, CURRENT_DATE, NOW(), NOW(), NOW())
      `;
    });

    // An unbalanced posted ledger must fail at COMMIT.
    await expectMessage(/are unbalanced/, async () => {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO transactions (
            id, organization_id, transaction_type, direction, amount, status, posted_at, created_at, updated_at
          )
          VALUES (${uuid(4006)}::uuid, ${ID.orgA}::uuid, 'PAYMENT_CAPTURE', 'DEBIT',
                  20, 'POSTED', NOW(), NOW(), NOW())
        `;
        await tx.$executeRaw`
          INSERT INTO ledger_entries (
            id, organization_id, transaction_id, account_id, direction, amount,
            entry_date, posted_at, created_at, updated_at
          )
          VALUES (${uuid(4007)}::uuid, ${ID.orgA}::uuid, ${uuid(4006)}::uuid,
                  ${ID.accountA}::uuid, 'DEBIT', 10, CURRENT_DATE, NOW(), NOW(), NOW()),
                 (${uuid(4008)}::uuid, ${ID.orgA}::uuid, ${uuid(4006)}::uuid,
                  ${ID.accountA}::uuid, 'DEBIT', 5, CURRENT_DATE, NOW(), NOW(), NOW())
        `;
      });
    });
  });

  test('keeps audit logs append-only', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE audit_logs SET action = 'DBTEST_MUTATION' WHERE id = ${ID.audit}::uuid
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        DELETE FROM audit_logs WHERE id = ${ID.audit}::uuid
      `;
    });
  });

  test('serializes concurrent inventory reservations without overselling', async () => {
    await prisma.$executeRaw`
      UPDATE product_inventories
      SET quantity_on_hand = 10, quantity_reserved = 0, available_quantity = 10
      WHERE id = ${ID.inventory}::uuid
    `;

    const attempts = await Promise.allSettled([
      prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT "id" FROM reserve_product_inventory(${ID.inventory}::uuid, 7::numeric(14,3))
          `;
        },
        { timeout: 15000 },
      ),
      prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT "id" FROM reserve_product_inventory(${ID.inventory}::uuid, 7::numeric(14,3))
          `;
        },
        { timeout: 15000 },
      ),
    ]);

    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
    assert.equal(rejected.length, 1, 'exactly one concurrent reservation must fail');
    assert.equal(sqlState(rejected[0].reason), '23514');

    const rows = await prisma.$queryRaw`
      SELECT "quantity_on_hand"::text AS "onHand",
             "quantity_reserved"::text AS "reserved",
             "available_quantity"::text AS "available"
      FROM "product_inventories"
      WHERE "id" = ${ID.inventory}::uuid
    `;
    assert.equal(Number(rows[0].onHand), 10);
    assert.equal(Number(rows[0].reserved), 7);
    assert.equal(Number(rows[0].available), 3);
  });
});

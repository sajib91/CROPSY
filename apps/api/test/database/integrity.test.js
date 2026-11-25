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

const PROFILE_IDS = {
  preference: uuid(5001),
  preferenceDuplicate: uuid(5002),
  roleExtension: uuid(5003),
  roleExtensionDuplicate: uuid(5004),
  organizationDocument: uuid(5005),
  userAddress: uuid(5006),
  userAddressDuplicate: uuid(5007),
  organizationAddress: uuid(5008),
  organizationAddressDuplicate: uuid(5009),
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

  test('seed installs organization/profile RBAC counts and reference data', async () => {
    const rows = await prisma.$queryRaw`
      SELECT
        (SELECT COUNT(*)::int FROM roles WHERE is_system = true) AS "roles",
        (SELECT COUNT(*)::int FROM permissions) AS "permissions",
        (SELECT COUNT(*)::int FROM role_permissions) AS "assignments",
        (SELECT COUNT(*)::int FROM countries) AS "countries",
        (SELECT COUNT(*)::int FROM divisions) AS "divisions",
        (SELECT COUNT(*)::int FROM districts) AS "districts",
        (SELECT COUNT(*)::int FROM upazilas) AS "upazilas",
        (SELECT COUNT(*)::int FROM unions) AS "unions",
        (SELECT COUNT(*)::int FROM product_categories WHERE code NOT LIKE 'DBTEST-%') AS "categories",
        (SELECT COUNT(*)::int FROM ledger_accounts WHERE code NOT LIKE 'DBTEST-%') AS "accounts",
        (SELECT COUNT(*)::int FROM platform_settings) AS "settings"
    `;
    const counts = rows[0];
    assert.equal(Number(counts.roles), 22);
    assert.equal(Number(counts.permissions), 50);
    assert.equal(Number(counts.assignments), 479);
    assert.equal(Number(counts.countries), 1);
    assert.equal(Number(counts.divisions), 8);
    assert.equal(Number(counts.districts), 64);
    assert.equal(Number(counts.upazilas), 64);
    assert.equal(Number(counts.unions), 64);
    assert.equal(Number(counts.categories), 10);
    assert.equal(Number(counts.accounts), 10);
    assert.equal(Number(counts.settings), 2);

    const roleRows = await prisma.$queryRaw`
      SELECT code FROM roles WHERE is_system = true
    `;
    const roleCodes = roleRows.map((row) => row.code);
    assert.ok(roleCodes.includes('ORGANIZATION_MEMBER'));
    assert.ok(roleCodes.includes('ORGANIZATION_ADMIN'));

    const permissionRows = await prisma.$queryRaw`
      SELECT code FROM permissions WHERE code IN (
        'organizations.create', 'organizations.verify', 'members.read',
        'members.manage', 'invitations.manage', 'documents.manage',
        'crops.read', 'crops.manage', 'expenses.read', 'expenses.manage'
      )
    `;
    const permissionCodes = permissionRows.map((row) => row.code);
    assert.equal(permissionCodes.length, 10);
  });

  test('organization/profile and farm migrations are applied without drift', async () => {
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
    `;
    const names = migrations.map((migration) => migration.migration_name);
    for (const name of [
      '20261125000000_init',
      '20261125120000_review_hardening',
      '20261125130000_auth_identity',
      '20261125140000_organization_profile_management',
      '20261125150000_farm_management',
      '20261125160000_crop_cultivation_expense_management',
    ]) {
      assert.ok(names.includes(name), `missing applied migration ${name}`);
    }
    assert.ok(
      migrations.every((migration) => migration.finished_at && !migration.rolled_back_at),
      'every recorded migration must be applied and not rolled back',
    );

    const columns = await prisma.$queryRaw`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'organizations' AND column_name IN (
            'organization_type', 'verification_status', 'verification_note',
            'verified_at', 'verified_by_user_id', 'contact_email', 'contact_phone',
            'description', 'website'
          ))
          OR (table_name = 'organization_documents' AND column_name IN (
            'id', 'organization_id', 'uploaded_by_user_id', 'document_type',
            'file_name', 'file_url', 'verification_status'
          ))
          OR (table_name = 'notification_preferences' AND column_name IN (
            'id', 'user_id', 'channel', 'event_type', 'enabled'
          ))
          OR (table_name = 'role_profile_extensions' AND column_name IN (
            'id', 'user_id', 'role_code', 'organization_id', 'scope_key', 'data'
          ))
        )
    `;
    const actualColumns = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
    for (const column of [
      'organizations.organization_type',
      'organizations.verification_status',
      'organization_documents.file_url',
      'notification_preferences.event_type',
      'role_profile_extensions.scope_key',
      'role_profile_extensions.data',
    ]) {
      assert.ok(actualColumns.has(column), `missing column ${column}`);
    }

    const constraints = await prisma.$queryRaw`
      SELECT conname FROM pg_constraint
      WHERE conname = 'role_profile_extensions_scope_key_check'
    `;
    assert.equal(constraints.length, 1);

    const indexes = await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN (
        'organizations_organization_type_idx',
        'organizations_verification_status_idx',
        'organization_documents_organization_id_document_type_idx',
        'notification_preferences_user_id_channel_event_type_key',
        'role_profile_extensions_user_id_role_code_scope_key_key'
      )
    `;
    assert.equal(indexes.length, 5);
  });

  test('enforces organization document, preference, and profile extension invariants', async () => {
    await expectSqlState('23503', async () => {
      await prisma.$executeRaw`
        INSERT INTO organization_documents (
          id, organization_id, uploaded_by_user_id, document_type, file_name,
          file_url, created_at, updated_at
        )
        VALUES (${PROFILE_IDS.organizationDocument}::uuid, ${uuid(9998)}::uuid,
                ${ID.userA}::uuid, 'TRADE_LICENSE', 'bad-org.pdf',
                'https://storage.example.com/bad-org.pdf', NOW(), NOW())
      `;
    });

    await expectSqlState('23503', async () => {
      await prisma.$executeRaw`
        INSERT INTO organization_documents (
          id, organization_id, uploaded_by_user_id, document_type, file_name,
          file_url, created_at, updated_at
        )
        VALUES (${PROFILE_IDS.organizationDocument}::uuid, ${ID.orgA}::uuid,
                ${uuid(9999)}::uuid, 'TRADE_LICENSE', 'bad-user.pdf',
                'https://storage.example.com/bad-user.pdf', NOW(), NOW())
      `;
    });

    await prisma.$executeRaw`
      INSERT INTO organization_documents (
        id, organization_id, uploaded_by_user_id, document_type, file_name,
        file_url, mime_type, size_bytes, created_at, updated_at
      )
      VALUES (${PROFILE_IDS.organizationDocument}::uuid, ${ID.orgA}::uuid,
              ${ID.userA}::uuid, 'TRADE_LICENSE', 'trade-license.pdf',
              'https://storage.example.com/trade-license.pdf', 'application/pdf',
              2048, NOW(), NOW())
    `;
    const documents = await prisma.$queryRaw`
      SELECT verification_status FROM organization_documents
      WHERE id = ${PROFILE_IDS.organizationDocument}::uuid
    `;
    assert.equal(documents[0].verification_status, 'PENDING');

    await prisma.$executeRaw`
      INSERT INTO notification_preferences (
        id, user_id, channel, event_type, enabled, created_at, updated_at
      )
      VALUES (${PROFILE_IDS.preference}::uuid, ${ID.userA}::uuid, 'IN_APP',
              'DBTEST_EVENT', true, NOW(), NOW())
    `;
    await expectSqlState('23505', async () => {
      await prisma.$executeRaw`
        INSERT INTO notification_preferences (
          id, user_id, channel, event_type, enabled, created_at, updated_at
        )
        VALUES (${PROFILE_IDS.preferenceDuplicate}::uuid, ${ID.userA}::uuid, 'IN_APP',
                'DBTEST_EVENT', false, NOW(), NOW())
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO role_profile_extensions (
          id, user_id, role_code, organization_id, scope_key, data, created_at, updated_at
        )
        VALUES (${PROFILE_IDS.roleExtension}::uuid, ${ID.userA}::uuid, 'DBTEST_ROLE',
                NULL, ${ID.orgA}::text, '{}'::jsonb, NOW(), NOW())
      `;
    });
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO role_profile_extensions (
          id, user_id, role_code, organization_id, scope_key, data, created_at, updated_at
        )
        VALUES (${PROFILE_IDS.roleExtension}::uuid, ${ID.userA}::uuid, 'DBTEST_ROLE',
                ${ID.orgA}::uuid, 'PLATFORM', '{}'::jsonb, NOW(), NOW())
      `;
    });
    await prisma.$executeRaw`
      INSERT INTO role_profile_extensions (
        id, user_id, role_code, organization_id, scope_key, data, created_at, updated_at
      )
      VALUES (${PROFILE_IDS.roleExtension}::uuid, ${ID.userA}::uuid, 'DBTEST_ROLE',
              ${ID.orgA}::uuid, ${ID.orgA}::text,
              '{"preferredContactMethod":"EMAIL"}'::jsonb, NOW(), NOW())
    `;
    await expectSqlState('23505', async () => {
      await prisma.$executeRaw`
        INSERT INTO role_profile_extensions (
          id, user_id, role_code, organization_id, scope_key, data, created_at, updated_at
        )
        VALUES (${PROFILE_IDS.roleExtensionDuplicate}::uuid, ${ID.userA}::uuid, 'DBTEST_ROLE',
                ${ID.orgA}::uuid, ${ID.orgA}::text, '{}'::jsonb, NOW(), NOW())
      `;
    });

    await prisma.$executeRaw`
      INSERT INTO user_addresses (
        id, user_id, label, address_line_1, is_primary, created_at, updated_at
      )
      VALUES (${PROFILE_IDS.userAddress}::uuid, ${ID.userA}::uuid,
              'DBTEST-HOME', '123 Test Road', true, NOW(), NOW())
    `;
    await expectSqlState('23505', async () => {
      await prisma.$executeRaw`
        INSERT INTO user_addresses (
          id, user_id, label, address_line_1, is_primary, created_at, updated_at
        )
        VALUES (${PROFILE_IDS.userAddressDuplicate}::uuid, ${ID.userA}::uuid,
                'DBTEST-OFFICE', '456 Test Road', true, NOW(), NOW())
      `;
    });

    await prisma.$executeRaw`
      INSERT INTO organization_addresses (
        id, organization_id, label, address_line_1, is_primary, created_at, updated_at
      )
      VALUES (${PROFILE_IDS.organizationAddress}::uuid, ${ID.orgA}::uuid,
              'DBTEST-HQ', '123 Test Road', true, NOW(), NOW())
    `;
    await expectSqlState('23505', async () => {
      await prisma.$executeRaw`
        INSERT INTO organization_addresses (
          id, organization_id, label, address_line_1, is_primary, created_at, updated_at
        )
        VALUES (${PROFILE_IDS.organizationAddressDuplicate}::uuid, ${ID.orgA}::uuid,
                'DBTEST-WAREHOUSE', '456 Test Road', true, NOW(), NOW())
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

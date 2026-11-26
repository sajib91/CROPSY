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
  seller: uuid(9201),
  otherUser: uuid(9202),
  orgA: uuid(9211),
  orgB: uuid(9212),
  assetAccount: uuid(9221),
  liabilityAccount: uuid(9222),
  journal: uuid(9231),
  debitLine: uuid(9232),
  creditLine: uuid(9233),
  assetBalance: uuid(9234),
  liabilityBalance: uuid(9235),
  audit: uuid(9236),
  expectation: uuid(9237),
  settlement: uuid(9238),
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
    VALUES (${ID.seller}::uuid, 'dbtest-ledger-seller@example.com', 'test-hash', NOW(), NOW()),
           (${ID.otherUser}::uuid, 'dbtest-ledger-other@example.com', 'test-hash', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO organizations (id, name, slug, owner_user_id, created_at, updated_at)
    VALUES (${ID.orgA}::uuid, 'DB Test Ledger Org A', 'dbtest-ledger-org-a', ${ID.seller}::uuid, NOW(), NOW()),
           (${ID.orgB}::uuid, 'DB Test Ledger Org B', 'dbtest-ledger-org-b', ${ID.otherUser}::uuid, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO ledger_accounts (id, organization_id, code, name, account_type, normal_balance, created_at, updated_at)
    VALUES (${ID.assetAccount}::uuid, ${ID.orgA}::uuid, 'DBTEST-LEDGER-ASSET',
            'DB Test Ledger Asset', 'ASSET', 'DEBIT', NOW(), NOW()),
           (${ID.liabilityAccount}::uuid, ${ID.orgA}::uuid, 'DBTEST-LEDGER-LIABILITY',
            'DB Test Ledger Liability', 'LIABILITY', 'CREDIT', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO ledger_journals (
      id, organization_id, idempotency_key, reference_type, description, status,
      posted_at, created_at
    )
    VALUES (${ID.journal}::uuid, ${ID.orgA}::uuid, 'DBTEST-LEDGER-JOURNAL-1',
            'PAYMENT_CAPTURE', 'DB test balanced journal', 'POSTED', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  // Insert both lines in one statement so the deferred balance trigger sees a
  // balanced journal when the implicit transaction commits.
  await prisma.$executeRaw`
    INSERT INTO ledger_journal_lines (
      id, journal_id, organization_id, account_id, direction, bucket, amount, currency, created_at
    )
    VALUES (${ID.debitLine}::uuid, ${ID.journal}::uuid, ${ID.orgA}::uuid,
            ${ID.assetAccount}::uuid, 'DEBIT', 'PENDING', 100, 'BDT', NOW()),
           (${ID.creditLine}::uuid, ${ID.journal}::uuid, ${ID.orgA}::uuid,
            ${ID.liabilityAccount}::uuid, 'CREDIT', 'PENDING', 100, 'BDT', NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO ledger_balances (
      id, organization_id, account_id, owner_key, bucket, currency, balance, updated_at
    )
    VALUES (${ID.assetBalance}::uuid, ${ID.orgA}::uuid, ${ID.assetAccount}::uuid,
            'PLATFORM', 'PENDING', 'BDT', 100, NOW()),
           (${ID.liabilityBalance}::uuid, ${ID.orgA}::uuid, ${ID.liabilityAccount}::uuid,
            'PLATFORM', 'PENDING', 'BDT', 100, NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO ledger_audit_events (
      id, organization_id, action, entity_type, entity_id, metadata, created_at
    )
    VALUES (${ID.audit}::uuid, ${ID.orgA}::uuid, 'ledger.journal.posted', 'ledger_journal',
            ${ID.journal}::uuid, '{"source":"dbtest"}'::jsonb, NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO reconciliation_expectations (
      id, organization_id, expectation_key, reference_type, amount, currency, status,
      journal_id, created_at, matched_at
    )
    VALUES (${ID.expectation}::uuid, ${ID.orgA}::uuid, 'DBTEST-LEDGER-EXPECTATION-1',
            'PAYMENT', 100, 'BDT', 'MATCHED', ${ID.journal}::uuid, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO settlements (
      id, organization_id, seller_user_id, rule_key, idempotency_key, journal_id,
      period_start, period_end, gross_amount, deductions_amount, net_amount, currency,
      status, paid_at, created_at, updated_at
    )
    VALUES (${ID.settlement}::uuid, ${ID.orgA}::uuid, ${ID.seller}::uuid,
            'DBTEST_SETTLEMENT_RULE', 'DBTEST-LEDGER-SETTLEMENT-1', ${ID.journal}::uuid,
            '2026-11-01T00:00:00Z', '2026-11-30T00:00:00Z', 100, 0, 100, 'BDT',
            'PAID', NOW(), NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
}

describeDatabase('ledger database invariants', () => {
  test.before(async () => {
    await seedFixtures();
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('journals must balance and cannot be posted twice', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO ledger_journal_lines (
          id, journal_id, organization_id, account_id, direction, bucket, amount, currency, created_at
        )
        VALUES (${uuid(9241)}::uuid, ${ID.journal}::uuid, ${ID.orgA}::uuid,
                ${ID.assetAccount}::uuid, 'DEBIT', 'AVAILABLE', 1, 'BDT', NOW())
      `;
    });

    await expectSqlState('23505', async () => {
      await prisma.$executeRaw`
        INSERT INTO ledger_journals (
          id, organization_id, idempotency_key, reference_type, created_at
        )
        VALUES (${uuid(9242)}::uuid, ${ID.orgA}::uuid, 'DBTEST-LEDGER-JOURNAL-1',
                'PAYMENT_CAPTURE', NOW())
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO ledger_journal_lines (
          id, journal_id, organization_id, account_id, direction, bucket, amount, currency, created_at
        )
        VALUES (${uuid(9243)}::uuid, ${ID.journal}::uuid, ${ID.orgA}::uuid,
                ${ID.assetAccount}::uuid, 'DEBIT', 'PENDING', 0, 'BDT', NOW())
      `;
    });
  });

  test('posted journals, lines, and audit events are append-only', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE ledger_journals SET description = 'tampered' WHERE id = ${ID.journal}::uuid
      `;
    });
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`DELETE FROM ledger_journals WHERE id = ${ID.journal}::uuid`;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE ledger_journal_lines SET amount = 999 WHERE id = ${ID.debitLine}::uuid
      `;
    });
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`DELETE FROM ledger_journal_lines WHERE id = ${ID.creditLine}::uuid`;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE ledger_audit_events SET action = 'tampered' WHERE id = ${ID.audit}::uuid
      `;
    });
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`DELETE FROM ledger_audit_events WHERE id = ${ID.audit}::uuid`;
    });
  });

  test('financial rows reject cross-tenant references', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO ledger_journal_lines (
          id, journal_id, organization_id, account_id, direction, bucket, amount, currency, created_at
        )
        VALUES (${uuid(9251)}::uuid, ${ID.journal}::uuid, ${ID.orgB}::uuid,
                ${ID.assetAccount}::uuid, 'DEBIT', 'AVAILABLE', 100, 'BDT', NOW())
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE ledger_balances SET organization_id = ${ID.orgB}::uuid
        WHERE id = ${ID.assetBalance}::uuid
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE reconciliation_expectations SET organization_id = ${ID.orgB}::uuid
        WHERE id = ${ID.expectation}::uuid
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        UPDATE settlements SET organization_id = ${ID.orgB}::uuid
        WHERE id = ${ID.settlement}::uuid
      `;
    });
  });

  test('settlement amounts and reconciliation keys satisfy their invariants', async () => {
    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO settlements (
          id, organization_id, seller_user_id, idempotency_key, period_start, period_end,
          gross_amount, net_amount, created_at, updated_at
        )
        VALUES (${uuid(9261)}::uuid, ${ID.orgA}::uuid, ${ID.seller}::uuid,
                'DBTEST-LEDGER-SETTLEMENT-BAD-NET', '2026-11-01T00:00:00Z',
                '2026-11-30T00:00:00Z', 100, 101, NOW(), NOW())
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO settlements (
          id, organization_id, seller_user_id, idempotency_key, period_start, period_end,
          gross_amount, net_amount, created_at, updated_at
        )
        VALUES (${uuid(9262)}::uuid, ${ID.orgA}::uuid, ${ID.seller}::uuid,
                'DBTEST-LEDGER-SETTLEMENT-BAD-PERIOD', '2026-11-30T00:00:00Z',
                '2026-11-01T00:00:00Z', 100, 100, NOW(), NOW())
      `;
    });

    await expectSqlState('23505', async () => {
      await prisma.$executeRaw`
        INSERT INTO reconciliation_expectations (
          id, organization_id, expectation_key, reference_type, amount, created_at
        )
        VALUES (${uuid(9263)}::uuid, ${ID.orgA}::uuid, 'DBTEST-LEDGER-EXPECTATION-1',
                'PAYMENT', 100, NOW())
      `;
    });
  });
});

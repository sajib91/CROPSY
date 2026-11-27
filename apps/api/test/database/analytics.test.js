const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

const { AnalyticsPrismaStore } = require('../../src/modules/analytics/infrastructure');
const { REPORT_CODES } = require('../../src/modules/analytics/domain/analytics.entity');

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? test.describe : test.describe.skip;
const prisma = new PrismaClient();
const store = new AnalyticsPrismaStore({ prisma });

function uuid(number) {
  return `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
}

const USER_IDS = { a: uuid(8101), peer: uuid(8102), b: uuid(8103) };
const ORG_IDS = { a: uuid(8111), b: uuid(8112) };
const FARM_IDS = { a: uuid(8121), peer: uuid(8122), b: uuid(8123) };
const CULTIVATION_IDS = { a: uuid(8131), peer: uuid(8132), b: uuid(8133) };
const HARVEST_IDS = { a: uuid(8141), peer: uuid(8142), b: uuid(8143) };

const QUERY = {
  from: new Date('2026-01-01T00:00:00.000Z'),
  to: new Date('2026-12-31T23:59:59.000Z'),
  grain: 'month',
  limit: 100,
};

describeDatabase('analytics Prisma reporting store', () => {
  test.before(async () => {
    await prisma.$executeRaw`
      DELETE FROM "harvests" WHERE "organization_id" IN (${ORG_IDS.a}::uuid, ${ORG_IDS.b}::uuid)
    `;
    await prisma.$executeRaw`
      DELETE FROM "cultivations" WHERE "organization_id" IN (${ORG_IDS.a}::uuid, ${ORG_IDS.b}::uuid)
    `;
    await prisma.$executeRaw`
      DELETE FROM "farms" WHERE "organization_id" IN (${ORG_IDS.a}::uuid, ${ORG_IDS.b}::uuid)
    `;
    await prisma.$executeRaw`
      DELETE FROM "crop_varieties" WHERE "code" LIKE 'DBTEST-AN-%'
    `;
    await prisma.$executeRaw`
      DELETE FROM "crops" WHERE "code" LIKE 'DBTEST-AN-%'
    `;

    await prisma.$executeRaw`
      INSERT INTO "users" (id, email, password_hash, created_at, updated_at)
      VALUES (${USER_IDS.a}::uuid, 'dbtest-analytics-a@example.com', 'test-hash', NOW(), NOW()),
             (${USER_IDS.peer}::uuid, 'dbtest-analytics-peer@example.com', 'test-hash', NOW(), NOW()),
             (${USER_IDS.b}::uuid, 'dbtest-analytics-b@example.com', 'test-hash', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO "organizations" (id, name, slug, owner_user_id, created_at, updated_at)
      VALUES (${ORG_IDS.a}::uuid, 'DB Test Analytics A', 'dbtest-analytics-a', ${USER_IDS.a}::uuid, NOW(), NOW()),
             (${ORG_IDS.b}::uuid, 'DB Test Analytics B', 'dbtest-analytics-b', ${USER_IDS.b}::uuid, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;

    const crop = await prisma.crop.create({
      data: {
        id: uuid(8151),
        code: 'DBTEST-AN-RICE',
        name: 'DB Test Analytics Rice',
        category: 'CEREAL',
      },
    });
    const variety = await prisma.cropVariety.create({
      data: {
        id: uuid(8152),
        crop_id: crop.id,
        code: 'DBTEST-AN-RICE-V1',
        name: 'DB Test Analytics Rice Variety',
      },
    });

    await prisma.farm.create({
      data: {
        id: FARM_IDS.a,
        organization_id: ORG_IDS.a,
        owner_user_id: USER_IDS.a,
        name: 'DB Test Analytics Farm A',
        code: 'DBTEST-AN-FARM-A',
        farm_type: 'OWNED',
      },
    });
    await prisma.farm.create({
      data: {
        id: FARM_IDS.peer,
        organization_id: ORG_IDS.a,
        owner_user_id: USER_IDS.peer,
        name: 'DB Test Analytics Peer Farm',
        code: 'DBTEST-AN-FARM-PEER',
        farm_type: 'OWNED',
      },
    });
    await prisma.farm.create({
      data: {
        id: FARM_IDS.b,
        organization_id: ORG_IDS.b,
        owner_user_id: USER_IDS.b,
        name: 'DB Test Analytics Farm B',
        code: 'DBTEST-AN-FARM-B',
        farm_type: 'OWNED',
      },
    });

    await prisma.cultivation.create({
      data: {
        id: CULTIVATION_IDS.a,
        organization_id: ORG_IDS.a,
        farm_id: FARM_IDS.a,
        crop_id: crop.id,
        crop_variety_id: variety.id,
        code: 'DBTEST-AN-CULT-A',
        area_hectares: 1,
      },
    });
    await prisma.cultivation.create({
      data: {
        id: CULTIVATION_IDS.peer,
        organization_id: ORG_IDS.a,
        farm_id: FARM_IDS.peer,
        crop_id: crop.id,
        crop_variety_id: variety.id,
        code: 'DBTEST-AN-CULT-PEER',
        area_hectares: 2,
      },
    });
    await prisma.cultivation.create({
      data: {
        id: CULTIVATION_IDS.b,
        organization_id: ORG_IDS.b,
        farm_id: FARM_IDS.b,
        crop_id: crop.id,
        crop_variety_id: variety.id,
        code: 'DBTEST-AN-CULT-B',
        area_hectares: 3,
      },
    });

    await prisma.harvest.create({
      data: {
        id: HARVEST_IDS.a,
        organization_id: ORG_IDS.a,
        cultivation_id: CULTIVATION_IDS.a,
        farm_id: FARM_IDS.a,
        harvested_at: new Date('2026-01-15T00:00:00.000Z'),
        quantity_kg: 100,
        status: 'CONFIRMED',
      },
    });
    await prisma.harvest.create({
      data: {
        id: HARVEST_IDS.peer,
        organization_id: ORG_IDS.a,
        cultivation_id: CULTIVATION_IDS.peer,
        farm_id: FARM_IDS.peer,
        harvested_at: new Date('2026-02-15T00:00:00.000Z'),
        quantity_kg: 200,
        status: 'CONFIRMED',
      },
    });
    await prisma.harvest.create({
      data: {
        id: HARVEST_IDS.b,
        organization_id: ORG_IDS.b,
        cultivation_id: CULTIVATION_IDS.b,
        farm_id: FARM_IDS.b,
        harvested_at: new Date('2026-03-15T00:00:00.000Z'),
        quantity_kg: 999,
        status: 'CONFIRMED',
      },
    });
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('production aggregation is tenant-scoped, actor-scoped, and period-scoped in SQL', async () => {
    const adminRows = await store.readReport({
      report: 'farmer.production',
      organizationId: ORG_IDS.a,
      actorUserId: null,
      isOrganizationAdmin: true,
      query: QUERY,
    });
    assert.deepEqual(
      adminRows.map((row) => Number(row.value)),
      [100, 200],
    );
    assert.deepEqual(
      adminRows.map((row) => row.period_start.toISOString().slice(0, 7)),
      ['2026-01', '2026-02'],
    );

    const actorRows = await store.readReport({
      report: 'farmer.production',
      organizationId: ORG_IDS.a,
      actorUserId: USER_IDS.a,
      isOrganizationAdmin: false,
      query: QUERY,
    });
    assert.deepEqual(
      actorRows.map((row) => Number(row.value)),
      [100],
    );

    const otherTenantRows = await store.readReport({
      report: 'farmer.production',
      organizationId: ORG_IDS.b,
      actorUserId: null,
      isOrganizationAdmin: true,
      query: QUERY,
    });
    assert.deepEqual(
      otherTenantRows.map((row) => Number(row.value)),
      [999],
    );

    const periodRows = await store.readReport({
      report: 'farmer.production',
      organizationId: ORG_IDS.a,
      actorUserId: null,
      isOrganizationAdmin: true,
      query: {
        ...QUERY,
        from: new Date('2026-02-01T00:00:00.000Z'),
      },
    });
    assert.deepEqual(
      periodRows.map((row) => Number(row.value)),
      [200],
    );
  });

  test('every registered report reads real tables without seeded facts', async () => {
    const failures = [];
    for (const report of REPORT_CODES) {
      try {
        const rows = await store.readReport({
          report,
          organizationId: ORG_IDS.a,
          actorUserId: null,
          isOrganizationAdmin: true,
          query: QUERY,
        });
        assert.ok(Array.isArray(rows), `${report} must return an array`);
      } catch (error) {
        failures.push(`${report}: ${error.details?.cause || error.message}`);
      }
    }
    assert.deepEqual(failures, []);
  });

  test('reporting composite indexes exist in the applied schema', async () => {
    const indexes = await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN (
        'harvests_organization_id_harvested_at_idx',
        'cultivations_organization_id_harvested_at_idx',
        'farm_expenses_organization_id_expense_date_category_idx',
        'orders_organization_id_placed_at_status_idx',
        'orders_organization_id_buyer_user_id_placed_at_idx',
        'orders_organization_id_seller_user_id_placed_at_idx',
        'payments_organization_id_captured_at_status_idx',
        'ai_recommendations_organization_id_created_at_idx',
        'agent_executions_organization_id_created_at_idx',
        'ai_feedback_organization_id_created_at_idx'
      )
    `;
    assert.equal(indexes.length, 10);
  });
});

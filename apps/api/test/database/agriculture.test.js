const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

const { AgriculturePrismaStore } = require('../../src/modules/agriculture/infrastructure');

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? test.describe : test.describe.skip;
const prisma = new PrismaClient();
const store = new AgriculturePrismaStore({ prisma });

function uuid(number) {
  return `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
}

const USER_IDS = { a: uuid(7201), b: uuid(7202) };
const ORG_IDS = { a: uuid(7211), b: uuid(7212) };

function sqlState(error) {
  if (error?.meta?.code || error?.code) return error.meta?.code || error.code;

  // Prisma wraps raw PostgreSQL errors in a ConnectorError. In that shape the
  // SQLSTATE is only present in the rendered error message, not in `code`.
  const message = String(error?.message || error || '');
  const match =
    /\b(?:code|sqlstate)\s*[:=]?\s*["']?([0-9][0-9A-Z]{4})\b/i.exec(message) ||
    /\b([0-9][0-9A-Z]{4})\b/.exec(message);
  return match?.[1];
}

async function expectSqlState(expected, operation) {
  try {
    await operation();
  } catch (error) {
    assert.equal(
      sqlState(error),
      expected,
      `Expected ${expected}, received ${sqlState(error)}: ${error.message}`,
    );
    return;
  }
  assert.fail(`Expected ${expected}, but the operation succeeded`);
}

describeDatabase('crop cultivation and expense persistence guards', () => {
  let crop;
  let variety;
  let otherCrop;
  let otherVariety;
  let farm;
  let calendar;
  let cultivation;

  test.before(async () => {
    await prisma.$executeRaw`
      DELETE FROM "farm_expenses" WHERE "description" LIKE 'DBTEST-AGRI-%'
    `;
    await prisma.$executeRaw`
      DELETE FROM "agronomic_recommendations" WHERE "code" LIKE 'DBTEST-AGRI-%'
    `;
    await prisma.$executeRaw`
      DELETE FROM "crop_calendars" WHERE "code" LIKE 'DBTEST-AGRI-%'
    `;
    await prisma.$executeRaw`
      DELETE FROM "cultivations" WHERE "code" LIKE 'DBTEST-AGRI-%'
    `;
    await prisma.$executeRaw`
      DELETE FROM "crop_varieties" WHERE "code" LIKE 'DBTEST-AGRI-%'
    `;
    await prisma.$executeRaw`
      DELETE FROM "crops" WHERE "code" LIKE 'DBTEST-AGRI-%'
    `;
    await prisma.$executeRaw`
      DELETE FROM "farms" WHERE "code" LIKE 'DBTEST-AGRI-%'
    `;
    await prisma.$executeRaw`
      INSERT INTO "users" (id, email, password_hash, created_at, updated_at)
      VALUES (${USER_IDS.a}::uuid, 'dbtest-agri-a@example.com', 'test-hash', NOW(), NOW()),
             (${USER_IDS.b}::uuid, 'dbtest-agri-b@example.com', 'test-hash', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO "organizations" (id, name, slug, owner_user_id, created_at, updated_at)
      VALUES (${ORG_IDS.a}::uuid, 'DB Test Agriculture A', 'dbtest-agri-a', ${USER_IDS.a}::uuid, NOW(), NOW()),
             (${ORG_IDS.b}::uuid, 'DB Test Agriculture B', 'dbtest-agri-b', ${USER_IDS.b}::uuid, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;

    crop = await prisma.crop.create({
      data: {
        id: uuid(7231),
        code: 'DBTEST-AGRI-RICE',
        name: 'DB Test Rice',
        category: 'CEREAL',
      },
    });
    variety = await prisma.cropVariety.create({
      data: {
        id: uuid(7232),
        crop_id: crop.id,
        code: 'DBTEST-AGRI-RICE-V1',
        name: 'DB Test Rice Variety',
        maturity_days: 120,
      },
    });
    otherCrop = await prisma.crop.create({
      data: {
        id: uuid(7233),
        code: 'DBTEST-AGRI-WHEAT',
        name: 'DB Test Wheat',
        category: 'CEREAL',
      },
    });
    otherVariety = await prisma.cropVariety.create({
      data: {
        id: uuid(7234),
        crop_id: otherCrop.id,
        code: 'DBTEST-AGRI-WHEAT-V1',
        name: 'DB Test Wheat Variety',
      },
    });
    farm = await prisma.farm.create({
      data: {
        id: uuid(7235),
        organization_id: ORG_IDS.a,
        owner_user_id: USER_IDS.a,
        name: 'DB Test Agriculture Farm',
        code: 'DBTEST-AGRI-FARM',
        farm_type: 'OWNED',
      },
    });
    calendar = await prisma.cropCalendar.create({
      data: {
        id: uuid(7236),
        organization_id: ORG_IDS.a,
        scope_key: ORG_IDS.a,
        crop_id: crop.id,
        crop_variety_id: variety.id,
        code: 'DBTEST-AGRI-CAL',
        name: 'DB Test Calendar',
        sowing_start_month: 6,
        sowing_end_month: 8,
        harvest_days_min: 100,
        harvest_days_max: 130,
      },
    });
    cultivation = await prisma.cultivation.create({
      data: {
        id: uuid(7237),
        organization_id: ORG_IDS.a,
        farm_id: farm.id,
        crop_id: crop.id,
        crop_variety_id: variety.id,
        crop_calendar_id: calendar.id,
        code: 'DBTEST-AGRI-CULT',
        area_hectares: 1.5,
        expected_yield_kg: 1100,
        growth_stage: 'VEGETATIVE',
      },
    });
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('calendar scope month harvest window and variety match are guarded', async () => {
    await expectSqlState('23514', () =>
      prisma.cropCalendar.create({
        data: {
          id: uuid(7301),
          organization_id: ORG_IDS.a,
          scope_key: ORG_IDS.a,
          crop_id: crop.id,
          code: 'DBTEST-AGRI-CAL-MONTH',
          name: 'Invalid month',
          sowing_start_month: 13,
          sowing_end_month: 14,
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.cropCalendar.create({
        data: {
          id: uuid(7302),
          organization_id: ORG_IDS.a,
          scope_key: ORG_IDS.a,
          crop_id: crop.id,
          code: 'DBTEST-AGRI-CAL-WINDOW',
          name: 'Invalid harvest window',
          sowing_start_month: 1,
          sowing_end_month: 2,
          harvest_days_min: 130,
          harvest_days_max: 100,
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.cropCalendar.create({
        data: {
          id: uuid(7303),
          organization_id: ORG_IDS.a,
          scope_key: 'GLOBAL',
          crop_id: crop.id,
          code: 'DBTEST-AGRI-CAL-SCOPE',
          name: 'Invalid scope',
          sowing_start_month: 1,
          sowing_end_month: 2,
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.cropCalendar.create({
        data: {
          id: uuid(7304),
          organization_id: ORG_IDS.a,
          scope_key: ORG_IDS.a,
          crop_id: crop.id,
          crop_variety_id: otherVariety.id,
          code: 'DBTEST-AGRI-CAL-VARIETY',
          name: 'Mismatched variety',
          sowing_start_month: 1,
          sowing_end_month: 2,
        },
      }),
    );
  });

  test('recommendation scope validity AI rule key and calendar match are guarded', async () => {
    await expectSqlState('23514', () =>
      prisma.agronomicRecommendation
        .create({
          data: {
            id: uuid(7401),
            organization_id: ORG_IDS.a,
            scope_key: ORG_IDS.a,
            crop_id: crop.id,
            code: 'DBTEST-AGRI-REC-SCOPE',
            title: 'Invalid scope',
            body: 'Configured recommendation.',
          },
        })
        .then(
          (record) =>
            prisma.$executeRaw`UPDATE "agronomic_recommendations" SET "scope_key" = 'GLOBAL' WHERE "id" = ${record.id}::uuid`,
        ),
    );

    await expectSqlState('23514', () =>
      prisma.agronomicRecommendation.create({
        data: {
          id: uuid(7402),
          organization_id: ORG_IDS.a,
          scope_key: ORG_IDS.a,
          crop_id: crop.id,
          code: 'DBTEST-AGRI-REC-CONF',
          title: 'Invalid confidence',
          body: 'Configured recommendation.',
          confidence: 1.5,
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.agronomicRecommendation.create({
        data: {
          id: uuid(7403),
          organization_id: ORG_IDS.a,
          scope_key: ORG_IDS.a,
          crop_id: crop.id,
          code: 'DBTEST-AGRI-REC-VALIDITY',
          title: 'Invalid validity',
          body: 'Configured recommendation.',
          valid_from: new Date('2026-06-01T00:00:00.000Z'),
          valid_until: new Date('2026-05-01T00:00:00.000Z'),
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.agronomicRecommendation.create({
        data: {
          id: uuid(7404),
          organization_id: ORG_IDS.a,
          scope_key: ORG_IDS.a,
          crop_id: crop.id,
          code: 'DBTEST-AGRI-REC-AI',
          title: 'AI estimate without rule',
          body: 'AI recommendation.',
          source: 'AI_ESTIMATED',
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.agronomicRecommendation.create({
        data: {
          id: uuid(7405),
          organization_id: ORG_IDS.a,
          scope_key: ORG_IDS.a,
          crop_id: otherCrop.id,
          calendar_id: calendar.id,
          code: 'DBTEST-AGRI-REC-CAL',
          title: 'Mismatched calendar',
          body: 'Configured recommendation.',
        },
      }),
    );

    const configured = await prisma.agronomicRecommendation.create({
      data: {
        id: uuid(7406),
        organization_id: ORG_IDS.a,
        scope_key: ORG_IDS.a,
        crop_id: crop.id,
        crop_variety_id: variety.id,
        calendar_id: calendar.id,
        code: 'DBTEST-AGRI-REC-OK',
        title: 'Valid recommendation',
        body: 'Configured recommendation.',
        source: 'CONFIGURED',
        confidence: 0.8,
      },
    });
    assert.equal(configured.source, 'CONFIGURED');
  });

  test('expense amount currency source confidence and tenant references are guarded', async () => {
    await expectSqlState('23514', () =>
      prisma.farmExpense.create({
        data: {
          id: uuid(7501),
          organization_id: ORG_IDS.a,
          farm_id: farm.id,
          category: 'SEEDS',
          source: 'RECORDED',
          expense_date: new Date('2026-01-01T00:00:00.000Z'),
          amount: 0,
          currency: 'BDT',
          description: 'DBTEST-AGRI-EXP-AMOUNT',
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.farmExpense.create({
        data: {
          id: uuid(7502),
          organization_id: ORG_IDS.a,
          farm_id: farm.id,
          category: 'SEEDS',
          source: 'RECORDED',
          expense_date: new Date('2026-01-01T00:00:00.000Z'),
          amount: 100,
          currency: 'bdt',
          description: 'DBTEST-AGRI-EXP-CURRENCY',
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.farmExpense.create({
        data: {
          id: uuid(7503),
          organization_id: ORG_IDS.a,
          farm_id: farm.id,
          category: 'SEEDS',
          source: 'RECORDED',
          expense_date: new Date('2026-01-01T00:00:00.000Z'),
          amount: 100,
          currency: 'BDT',
          confidence: 0.5,
          description: 'DBTEST-AGRI-EXP-CONFIDENCE',
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.farmExpense.create({
        data: {
          id: uuid(7504),
          organization_id: ORG_IDS.a,
          farm_id: farm.id,
          category: 'PESTICIDE',
          source: 'AI_ESTIMATED',
          expense_date: new Date('2026-01-01T00:00:00.000Z'),
          amount: 100,
          currency: 'BDT',
          description: 'DBTEST-AGRI-EXP-AI',
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.farmExpense.create({
        data: {
          id: uuid(7505),
          organization_id: ORG_IDS.b,
          farm_id: farm.id,
          cultivation_id: cultivation.id,
          category: 'SEEDS',
          source: 'RECORDED',
          expense_date: new Date('2026-01-01T00:00:00.000Z'),
          amount: 100,
          currency: 'BDT',
          description: 'DBTEST-AGRI-EXP-TENANT',
        },
      }),
    );

    await expectSqlState(
      '23514',
      () =>
        prisma.$executeRaw`
        UPDATE "farms" SET "organization_id" = ${ORG_IDS.b}::uuid WHERE "id" = ${farm.id}::uuid
      `,
    );

    const recorded = await prisma.farmExpense.create({
      data: {
        id: uuid(7506),
        organization_id: ORG_IDS.a,
        farm_id: farm.id,
        cultivation_id: cultivation.id,
        category: 'SEEDS',
        source: 'RECORDED',
        expense_date: new Date('2026-01-01T00:00:00.000Z'),
        amount: 250.5,
        currency: 'BDT',
        receipt_url: 'https://receipts.example.com/dbtest',
        receipt_note: 'DBTEST-AGRI-EXP-OK',
        description: 'DBTEST-AGRI-EXP-OK',
      },
    });
    assert.equal(Number(recorded.amount), 250.5);
    assert.equal(recorded.source, 'RECORDED');

    const estimated = await prisma.farmExpense.create({
      data: {
        id: uuid(7507),
        organization_id: ORG_IDS.a,
        farm_id: farm.id,
        cultivation_id: cultivation.id,
        category: 'IRRIGATION',
        source: 'AI_ESTIMATED',
        expense_date: new Date('2026-01-02T00:00:00.000Z'),
        amount: 75,
        currency: 'BDT',
        estimate_rule_key: 'DBTEST_IRRIGATION_ESTIMATE',
        confidence: 0.7,
        description: 'DBTEST-AGRI-EXP-ESTIMATE',
      },
    });
    assert.equal(estimated.source, 'AI_ESTIMATED');
  });

  test('Prisma agriculture store normalizes decimals and filters records', async () => {
    const records = await store.listExpenses({ farm_id: farm.id });
    const recorded = records.find((item) => item.description === 'DBTEST-AGRI-EXP-OK');
    const estimated = records.find((item) => item.description === 'DBTEST-AGRI-EXP-ESTIMATE');
    assert.equal(typeof recorded.amount, 'number');
    assert.equal(recorded.amount, 250.5);
    assert.equal(estimated.source, 'AI_ESTIMATED');
    assert.equal(estimated.confidence, 0.7);

    const foundCalendar = await store.findCalendar(calendar.id);
    assert.equal(foundCalendar.scope_key, ORG_IDS.a);
    assert.equal(Number(foundCalendar.harvest_days_max), 130);
  });

  test('sixth migration guards are present in the database catalog', async () => {
    const rows = await prisma.$queryRaw`
      SELECT conname FROM pg_constraint
      WHERE conname IN (
        'crop_calendars_scope_check',
        'agronomic_recommendations_rule_key_check',
        'farm_expenses_source_check',
        'cultivations_crop_variety_match_check'
      )
    `;
    const names = rows.map((row) => row.conname).sort();
    assert.deepEqual(names, [
      'agronomic_recommendations_rule_key_check',
      'crop_calendars_scope_check',
      'cultivations_crop_variety_match_check',
      'farm_expenses_source_check',
    ]);
  });
});

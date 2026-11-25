const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

const {
  CatalogPrismaStore,
} = require('../../src/modules/catalog/infrastructure/catalog-prisma.store');
const {
  MarketplacePrismaStore,
} = require('../../src/modules/marketplace/infrastructure/marketplace-prisma.store');

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? test.describe : test.describe.skip;
const prisma = new PrismaClient();
const catalogStore = new CatalogPrismaStore({ prisma });
const marketplaceStore = new MarketplacePrismaStore({ prisma });

function uuid(number) {
  return `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
}

const IDS = {
  userA: uuid(7401),
  userB: uuid(7402),
  orgA: uuid(7411),
  orgB: uuid(7412),
  categoryA: uuid(7421),
  categoryB: uuid(7422),
  unitA: uuid(7431),
  unitB: uuid(7432),
  gradeA: uuid(7441),
  productA: uuid(7451),
  productB: uuid(7452),
  varietyA: uuid(7453),
  attributeText: uuid(7461),
  attributeNumber: uuid(7462),
  attributeBoolean: uuid(7463),
  attributeDate: uuid(7464),
  attributeEnum: uuid(7465),
  attributeWrong: uuid(7466),
  attributeMulti: uuid(7467),
  attributeInvalidEnum: uuid(7468),
  attributeTenantB: uuid(7469),
  attributeNoAllowed: uuid(7470),
  valueText: uuid(7481),
  valueNumber: uuid(7482),
  valueBoolean: uuid(7483),
  valueDate: uuid(7484),
  valueEnum: uuid(7485),
  valueWrong: uuid(7486),
  valueMulti: uuid(7487),
  valueInvalidEnum: uuid(7488),
  valueTenantMismatch: uuid(7489),
  listingNear: uuid(7491),
  listingFar: uuid(7492),
  listingDraft: uuid(7493),
  listingNoLocation: uuid(7494),
  locationNear: uuid(7501),
  locationFar: uuid(7502),
  locationDraft: uuid(7503),
  locationInvalid: uuid(7504),
  imageNear: uuid(7511),
  imageDuplicate: uuid(7512),
  imageNegative: uuid(7513),
  favoriteNear: uuid(7521),
  favoriteDuplicate: uuid(7522),
  reportNear: uuid(7531),
  reportDuplicate: uuid(7532),
  reportInvalidReview: uuid(7533),
  messageNear: uuid(7541),
  messageBlank: uuid(7542),
};

const ATTRIBUTE_IDS = [
  IDS.attributeText,
  IDS.attributeNumber,
  IDS.attributeBoolean,
  IDS.attributeDate,
  IDS.attributeEnum,
  IDS.attributeWrong,
  IDS.attributeMulti,
  IDS.attributeInvalidEnum,
  IDS.attributeTenantB,
  IDS.attributeNoAllowed,
];

const VALUE_IDS = [
  IDS.valueText,
  IDS.valueNumber,
  IDS.valueBoolean,
  IDS.valueDate,
  IDS.valueEnum,
  IDS.valueWrong,
  IDS.valueMulti,
  IDS.valueInvalidEnum,
  IDS.valueTenantMismatch,
];

const LISTING_IDS = [IDS.listingNear, IDS.listingFar, IDS.listingDraft, IDS.listingNoLocation];

function sqlState(error) {
  const message = String(error?.message || error || '');
  const match =
    /\b(?:code|sqlstate)\s*[:=]?\s*["']?([0-9][0-9A-Z]{4})\b/i.exec(message) ||
    /\b([0-9][0-9A-Z]{4})\b/.exec(message);
  if (match) return match[1];
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

async function cleanup() {
  await prisma.listingMessage.deleteMany({
    where: { id: { in: [IDS.messageNear, IDS.messageBlank] } },
  });
  await prisma.listingReport.deleteMany({
    where: { id: { in: [IDS.reportNear, IDS.reportDuplicate, IDS.reportInvalidReview] } },
  });
  await prisma.favoriteListing.deleteMany({
    where: { id: { in: [IDS.favoriteNear, IDS.favoriteDuplicate] } },
  });
  await prisma.listingImage.deleteMany({
    where: { id: { in: [IDS.imageNear, IDS.imageDuplicate, IDS.imageNegative] } },
  });
  await prisma.listingLocation.deleteMany({
    where: {
      id: { in: [IDS.locationNear, IDS.locationFar, IDS.locationDraft, IDS.locationInvalid] },
    },
  });
  await prisma.productListing.deleteMany({ where: { id: { in: LISTING_IDS } } });
  await prisma.productAttributeValue.deleteMany({
    where: { OR: [{ id: { in: VALUE_IDS } }, { attribute_id: { in: ATTRIBUTE_IDS } }] },
  });
  await prisma.productAttribute.deleteMany({ where: { id: { in: ATTRIBUTE_IDS } } });
  await prisma.productVariety.deleteMany({ where: { id: { in: [IDS.varietyA] } } });
  await prisma.productImage.deleteMany({
    where: { product_id: { in: [IDS.productA, IDS.productB] } },
  });
  await prisma.product.deleteMany({ where: { id: { in: [IDS.productA, IDS.productB] } } });
  await prisma.unitOfMeasure.deleteMany({ where: { id: { in: [IDS.unitA, IDS.unitB] } } });
  await prisma.qualityGrade.deleteMany({ where: { id: { in: [IDS.gradeA] } } });
  await prisma.productCategory.deleteMany({
    where: { id: { in: [IDS.categoryA, IDS.categoryB] } },
  });
  await prisma.organization.deleteMany({ where: { id: { in: [IDS.orgA, IDS.orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [IDS.userA, IDS.userB] } } });
}

async function seedFixtures() {
  await prisma.$executeRaw`
    INSERT INTO "users" (id, email, password_hash, created_at, updated_at)
    VALUES (${IDS.userA}::uuid, 'dbtest-cm-a@example.com', 'test-hash', NOW(), NOW()),
           (${IDS.userB}::uuid, 'dbtest-cm-b@example.com', 'test-hash', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO "organizations" (id, name, slug, owner_user_id, created_at, updated_at)
    VALUES (${IDS.orgA}::uuid, 'DB Test Catalog A', 'dbtest-cm-a', ${IDS.userA}::uuid, NOW(), NOW()),
           (${IDS.orgB}::uuid, 'DB Test Catalog B', 'dbtest-cm-b', ${IDS.userB}::uuid, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `;

  await prisma.productCategory.create({
    data: {
      id: IDS.categoryA,
      organization_id: IDS.orgA,
      code: 'DBTEST-CM-CAT-A',
      name: 'DB Test Grains A',
    },
  });
  await prisma.productCategory.create({
    data: {
      id: IDS.categoryB,
      organization_id: IDS.orgB,
      code: 'DBTEST-CM-CAT-B',
      name: 'DB Test Grains B',
    },
  });
  await prisma.unitOfMeasure.create({
    data: {
      id: IDS.unitA,
      organization_id: IDS.orgA,
      code: 'DBTEST-CM-KG-A',
      name: 'DB Test Kilogram A',
    },
  });
  await prisma.unitOfMeasure.create({
    data: {
      id: IDS.unitB,
      organization_id: IDS.orgB,
      code: 'DBTEST-CM-KG-B',
      name: 'DB Test Kilogram B',
    },
  });
  await prisma.qualityGrade.create({
    data: {
      id: IDS.gradeA,
      organization_id: IDS.orgA,
      code: 'DBTEST-CM-GRADE-A',
      name: 'DB Test Grade A',
      min_score: 80,
    },
  });
  await prisma.product.create({
    data: {
      id: IDS.productA,
      organization_id: IDS.orgA,
      category_id: IDS.categoryA,
      sku: 'DBTEST-CM-SKU-A',
      name: 'DB Test Rice A',
      name_bn: 'ডিবি টেস্ট চাল এ',
      unit_code: 'KG',
      unit_id: IDS.unitA,
      is_available: true,
    },
  });
  await prisma.product.create({
    data: {
      id: IDS.productB,
      organization_id: IDS.orgB,
      category_id: IDS.categoryB,
      sku: 'DBTEST-CM-SKU-B',
      name: 'DB Test Rice B',
      unit_code: 'KG',
      unit_id: IDS.unitB,
      is_available: true,
    },
  });
  await prisma.productVariety.create({
    data: {
      id: IDS.varietyA,
      organization_id: IDS.orgA,
      product_id: IDS.productA,
      code: 'DBTEST-CM-VARIETY-A',
      name: 'DB Test Aromatic A',
    },
  });

  for (const [id, code, valueType, allowedValues, organizationId, categoryId] of [
    [IDS.attributeText, 'DBTEST-CM-ATTR-TEXT', 'TEXT', null, IDS.orgA, IDS.categoryA],
    [IDS.attributeNumber, 'DBTEST-CM-ATTR-NUMBER', 'NUMBER', null, IDS.orgA, IDS.categoryA],
    [IDS.attributeBoolean, 'DBTEST-CM-ATTR-BOOLEAN', 'BOOLEAN', null, IDS.orgA, IDS.categoryA],
    [IDS.attributeDate, 'DBTEST-CM-ATTR-DATE', 'DATE', null, IDS.orgA, IDS.categoryA],
    [IDS.attributeEnum, 'DBTEST-CM-ATTR-ENUM', 'ENUM', ['A', 'B'], IDS.orgA, IDS.categoryA],
    [IDS.attributeWrong, 'DBTEST-CM-ATTR-WRONG', 'TEXT', null, IDS.orgA, IDS.categoryA],
    [IDS.attributeMulti, 'DBTEST-CM-ATTR-MULTI', 'TEXT', null, IDS.orgA, IDS.categoryA],
    [
      IDS.attributeInvalidEnum,
      'DBTEST-CM-ATTR-INVALID-ENUM',
      'ENUM',
      ['A'],
      IDS.orgA,
      IDS.categoryA,
    ],
    [IDS.attributeTenantB, 'DBTEST-CM-ATTR-TENANT-B', 'TEXT', null, IDS.orgB, IDS.categoryB],
  ]) {
    await prisma.productAttribute.create({
      data: {
        id,
        organization_id: organizationId,
        category_id: categoryId,
        code,
        name: `DB Test ${code}`,
        value_type: valueType,
        ...(allowedValues ? { allowed_values: allowedValues } : {}),
      },
    });
  }

  await Promise.all([
    prisma.productAttributeValue.create({
      data: {
        id: IDS.valueText,
        organization_id: IDS.orgA,
        attribute_id: IDS.attributeText,
        entity_type: 'PRODUCT',
        entity_id: IDS.productA,
        value_text: 'graded',
      },
    }),
    prisma.productAttributeValue.create({
      data: {
        id: IDS.valueNumber,
        organization_id: IDS.orgA,
        attribute_id: IDS.attributeNumber,
        entity_type: 'PRODUCT',
        entity_id: IDS.productA,
        value_number: 12.345,
      },
    }),
    prisma.productAttributeValue.create({
      data: {
        id: IDS.valueBoolean,
        organization_id: IDS.orgA,
        attribute_id: IDS.attributeBoolean,
        entity_type: 'PRODUCT',
        entity_id: IDS.productA,
        value_boolean: true,
      },
    }),
    prisma.productAttributeValue.create({
      data: {
        id: IDS.valueDate,
        organization_id: IDS.orgA,
        attribute_id: IDS.attributeDate,
        entity_type: 'PRODUCT',
        entity_id: IDS.productA,
        value_date: new Date('2026-11-20T00:00:00.000Z'),
      },
    }),
    prisma.productAttributeValue.create({
      data: {
        id: IDS.valueEnum,
        organization_id: IDS.orgA,
        attribute_id: IDS.attributeEnum,
        entity_type: 'PRODUCT',
        entity_id: IDS.productA,
        value_text: 'A',
      },
    }),
  ]);
}

function listingData(id, productId, sellerId, organizationId, overrides = {}) {
  return {
    id,
    organization_id: organizationId,
    product_id: productId,
    seller_user_id: sellerId,
    status: 'ACTIVE',
    title: `DB Test Listing ${id.slice(-4)}`,
    unit_price: 100,
    currency: 'BDT',
    quantity_available: 500,
    min_order_quantity: 5,
    available_location: 'Dhaka',
    harvest_date: new Date('2026-11-20T00:00:00.000Z'),
    ...overrides,
  };
}

describeDatabase('catalog and marketplace persistence', () => {
  test.before(async () => {
    await cleanup();
    await seedFixtures();
  });

  test.after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('seed taxonomy exposes the required product families', async () => {
    const rows = await prisma.productCategory.findMany({
      where: {
        code: {
          in: [
            'GRAINS',
            'VEGETABLES',
            'FRUITS',
            'SPICES',
            'PULSES',
            'SEEDS',
            'AGRICULTURAL_INPUTS',
            'OTHER_PRODUCE',
          ],
        },
      },
      select: { code: true, name: true },
    });

    assert.equal(rows.length, 8);
    const byCode = new Map(rows.map((row) => [row.code, row.name]));
    assert.equal(byCode.get('GRAINS'), 'Grains');
    assert.equal(byCode.get('SEEDS'), 'Seeds');
    assert.equal(byCode.get('AGRICULTURAL_INPUTS'), 'Agricultural inputs');
    assert.equal(byCode.get('OTHER_PRODUCE'), 'Other approved agricultural products');
  });

  test('typed attribute values are stored in their matching columns', async () => {
    const values = await prisma.productAttributeValue.findMany({
      where: { entity_id: IDS.productA, id: { in: VALUE_IDS } },
      orderBy: { id: 'asc' },
    });
    const byId = new Map(values.map((value) => [value.id, value]));

    assert.equal(byId.get(IDS.valueText).value_text, 'graded');
    assert.equal(byId.get(IDS.valueNumber).value_number.toNumber(), 12.345);
    assert.equal(byId.get(IDS.valueBoolean).value_boolean, true);
    assert.equal(byId.get(IDS.valueDate).value_date.toISOString().slice(0, 10), '2026-11-20');
    assert.equal(byId.get(IDS.valueEnum).value_text, 'A');

    await expectSqlState('23514', () =>
      prisma.productAttributeValue.create({
        data: {
          id: IDS.valueWrong,
          organization_id: IDS.orgA,
          attribute_id: IDS.attributeWrong,
          entity_type: 'PRODUCT',
          entity_id: IDS.productA,
          value_number: 1,
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.productAttributeValue.create({
        data: {
          id: IDS.valueMulti,
          organization_id: IDS.orgA,
          attribute_id: IDS.attributeMulti,
          entity_type: 'PRODUCT',
          entity_id: IDS.productA,
          value_text: 'graded',
          value_number: 1,
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.productAttributeValue.create({
        data: {
          id: IDS.valueInvalidEnum,
          organization_id: IDS.orgA,
          attribute_id: IDS.attributeInvalidEnum,
          entity_type: 'PRODUCT',
          entity_id: IDS.productA,
          value_text: 'B',
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.productAttribute.create({
        data: {
          id: IDS.attributeNoAllowed,
          organization_id: IDS.orgA,
          category_id: IDS.categoryA,
          code: 'DBTEST-CM-ATTR-NO-ALLOWED',
          name: 'DB Test invalid enum',
          value_type: 'ENUM',
        },
      }),
    );
  });

  test('tenant consistency triggers reject cross-organization references and moves', async () => {
    await expectSqlState('23514', () =>
      prisma.productVariety.create({
        data: {
          id: uuid(7601),
          organization_id: IDS.orgB,
          product_id: IDS.productA,
          code: 'DBTEST-CM-VARIETY-CROSS',
          name: 'DB Test cross-tenant variety',
        },
      }),
    );

    await expectSqlState('23514', () =>
      prisma.productAttributeValue.create({
        data: {
          id: IDS.valueTenantMismatch,
          organization_id: IDS.orgA,
          attribute_id: IDS.attributeTenantB,
          entity_type: 'PRODUCT',
          entity_id: IDS.productA,
          value_text: 'cross-tenant',
        },
      }),
    );

    await expectSqlState('23514', async () => {
      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: IDS.productA },
          data: { organization_id: IDS.orgB },
        });
      });
    });
  });

  test('marketplace constraints protect location, image, favorite, report, and message records', async () => {
    await prisma.productListing.create({
      data: listingData(IDS.listingNear, IDS.productA, IDS.userA, IDS.orgA, {
        quality_grade_id: IDS.gradeA,
      }),
    });
    await prisma.productListing.create({
      data: listingData(IDS.listingFar, IDS.productB, IDS.userB, IDS.orgB, {
        available_location: 'Chattogram',
      }),
    });
    await prisma.productListing.create({
      data: listingData(IDS.listingDraft, IDS.productA, IDS.userA, IDS.orgA, {
        status: 'DRAFT',
        title: 'DB Test Draft Listing',
      }),
    });

    await expectSqlState('23514', () =>
      prisma.productListing.create({
        data: listingData(IDS.listingNoLocation, IDS.productA, IDS.userA, IDS.orgA, {
          title: 'DB Test Invalid Listing',
          available_location: null,
          harvest_date: null,
        }),
      }),
    );

    await expectSqlState(
      '23514',
      () =>
        prisma.$executeRaw`
        INSERT INTO "listing_locations" (id, listing_id, created_at, updated_at)
        VALUES (${IDS.locationInvalid}::uuid, ${IDS.listingNear}::uuid, NOW(), NOW())
      `,
    );

    await expectSqlState('23514', () =>
      prisma.listingImage.create({
        data: {
          id: IDS.imageNegative,
          listing_id: IDS.listingNear,
          url: 'https://example.com/dbtest-negative.jpg',
          sort_order: -1,
        },
      }),
    );

    await marketplaceStore.createImage({
      id: IDS.imageNear,
      listing_id: IDS.listingNear,
      url: 'https://example.com/dbtest-near.jpg',
      alt_text: 'DB Test Rice',
      sort_order: 0,
    });
    await expectSqlState(['P2002', '23505'], () =>
      prisma.listingImage.create({
        data: {
          id: IDS.imageDuplicate,
          listing_id: IDS.listingNear,
          url: 'https://example.com/dbtest-duplicate.jpg',
          sort_order: 0,
        },
      }),
    );

    await marketplaceStore.createFavorite({
      id: IDS.favoriteNear,
      user_id: IDS.userB,
      listing_id: IDS.listingNear,
    });
    await expectSqlState(['P2002', '23505'], () =>
      prisma.favoriteListing.create({
        data: {
          id: IDS.favoriteDuplicate,
          user_id: IDS.userB,
          listing_id: IDS.listingNear,
        },
      }),
    );

    await marketplaceStore.createReport({
      id: IDS.reportNear,
      listing_id: IDS.listingNear,
      reporter_user_id: IDS.userB,
      reason: 'MISLEADING',
      details: 'DB test report',
      status: 'PENDING',
      reviewed_by_user_id: null,
      reviewed_at: null,
    });
    await expectSqlState(['P2002', '23505'], () =>
      prisma.listingReport.create({
        data: {
          id: IDS.reportDuplicate,
          listing_id: IDS.listingNear,
          reporter_user_id: IDS.userB,
          reason: 'FRAUD',
          status: 'PENDING',
        },
      }),
    );
    await expectSqlState('23514', () =>
      prisma.listingReport.create({
        data: {
          id: IDS.reportInvalidReview,
          listing_id: IDS.listingDraft,
          reporter_user_id: IDS.userB,
          reason: 'DUPLICATE',
          status: 'PENDING',
          reviewed_by_user_id: IDS.userA,
          reviewed_at: new Date(),
        },
      }),
    );

    await marketplaceStore.createMessage({
      id: IDS.messageNear,
      listing_id: IDS.listingNear,
      sender_user_id: IDS.userB,
      recipient_user_id: IDS.userA,
      body: 'DB test message',
      read_at: null,
    });
    await expectSqlState('23514', () =>
      prisma.listingMessage.create({
        data: {
          id: IDS.messageBlank,
          listing_id: IDS.listingNear,
          sender_user_id: IDS.userB,
          recipient_user_id: IDS.userA,
          body: '   ',
          read_at: null,
        },
      }),
    );
  });

  test('PostGIS proximity search filters by radius and status and normalizes adapter rows', async () => {
    for (const [id, listingId, label, latitude, longitude] of [
      [IDS.locationNear, IDS.listingNear, 'DB Test Dhaka', 23.8103, 90.4125],
      [IDS.locationFar, IDS.listingFar, 'DB Test Chattogram', 22.3569, 91.7832],
      [IDS.locationDraft, IDS.listingDraft, 'DB Test Dhaka Draft', 23.8203, 90.4225],
    ]) {
      await marketplaceStore.createLocation({
        id,
        listing_id: listingId,
        location_label: label,
        location: { latitude, longitude },
        radius_meters: 10000,
      });
    }

    const nearRows = await marketplaceStore.searchNearby({
      latitude: 23.8103,
      longitude: 90.4125,
      radiusMeters: 10000,
      listingIds: [IDS.listingNear, IDS.listingFar, IDS.listingDraft],
      statuses: ['ACTIVE'],
    });
    assert.deepEqual(
      nearRows.map((row) => row.listing_id),
      [IDS.listingNear],
    );
    assert.equal(typeof nearRows[0].distance_meters, 'number');
    assert.ok(nearRows[0].distance_meters < 1000);

    const mixedRows = await marketplaceStore.searchNearby({
      latitude: 23.8103,
      longitude: 90.4125,
      radiusMeters: 1000000,
      listingIds: [IDS.listingNear, IDS.listingFar, IDS.listingDraft],
      statuses: ['ACTIVE', 'DRAFT'],
    });
    assert.equal(mixedRows.length, 3);
    assert.equal(mixedRows[0].listing_id, IDS.listingNear);
    assert.ok(mixedRows[0].distance_meters < mixedRows[2].distance_meters);

    const location = await marketplaceStore.findLocation(IDS.locationNear);
    assert.equal(location.location.latitude, 23.8103);
    assert.equal(location.location.longitude, 90.4125);
    assert.equal(typeof location.location.latitude, 'number');

    const filteredLocations = await marketplaceStore.listLocations({
      listing_id: IDS.listingNear,
    });
    assert.equal(filteredLocations.length, 1);
    assert.equal(filteredLocations[0].id, IDS.locationNear);

    const listing = await marketplaceStore.findListing(IDS.listingNear);
    assert.equal(listing.unit_price, 100);
    assert.equal(listing.quantity_available, 500);
    assert.equal(listing.available_location, 'Dhaka');
    assert.ok(!('location' in listing));

    const products = await catalogStore.listProducts({ organization_id: IDS.orgA });
    assert.equal(products.length, 1);
    assert.equal(products[0].name_bn, 'ডিবি টেস্ট চাল এ');
    assert.equal(products[0].is_available, true);
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

const { toHectares } = require('../../src/modules/farmers/domain');
const { FarmPrismaStore } = require('../../src/modules/farmers/infrastructure');

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? test.describe : test.describe.skip;
const prisma = new PrismaClient();
const store = new FarmPrismaStore({ prisma });

function uuid(number) {
  return `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
}

const USER_IDS = {
  a: uuid(6101),
  b: uuid(6102),
};

const ORG_IDS = {
  a: uuid(6111),
  b: uuid(6112),
};

const POINT = [90.37, 23.77];
const FAR_POINT = [91.5, 24.5];
const MOVED_POINT = [90.42, 23.82];
const BOUNDARY = [
  [90.35, 23.75],
  [90.4, 23.75],
  [90.4, 23.8],
  [90.35, 23.8],
  [90.35, 23.75],
];
const MOVED_BOUNDARY = [
  [90.4, 23.8],
  [90.45, 23.8],
  [90.45, 23.85],
  [90.4, 23.85],
  [90.4, 23.8],
];
const BAD_BOUNDARY_WKT = 'POLYGON((90.35 23.75,90.4 23.8,90.35 23.8,90.4 23.75,90.35 23.75))';
const BBOX = { minLng: 90.3, minLat: 23.7, maxLng: 90.45, maxLat: 23.85 };

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

async function loadGeo() {
  const [division, district, upazila, union] = await Promise.all([
    prisma.division.findUnique({ where: { code: 'BD-DHA' } }),
    prisma.district.findUnique({ where: { code: 'BD-DHA-DHA' } }),
    prisma.upazila.findUnique({ where: { code: 'BD-DHA-DHA-S' } }),
    prisma.union.findUnique({ where: { code: 'BD-DHA-DHA-U' } }),
  ]);
  assert.ok(division && district && upazila && union, 'Bangladesh seed chain is missing');
  return { division, district, upazila, union };
}

function locationInput(geo, point = null, boundary = null) {
  return {
    address_line: '12 Farm Road, Savar',
    division_id: geo.division.id,
    district_id: geo.district.id,
    upazila_id: geo.upazila.id,
    union_id: geo.union.id,
    point,
    boundary,
  };
}

function farmBundle({
  code,
  geo,
  point = null,
  boundary = null,
  organizationId = ORG_IDS.a,
  ownerUserId = USER_IDS.a,
  parcels = [],
  soilProfile = null,
  irrigations = [],
}) {
  return {
    farm: {
      organization_id: organizationId,
      owner_user_id: ownerUserId,
      name: `DB Test Farm ${code}`,
      description: 'Database farm-management fixture.',
      code,
      farm_type: 'OWNED',
      area_unit: 'ACRE',
      area_value: 2,
      total_area_hectares: toHectares(2, 'ACRE'),
      ownership_type: 'OWNED',
    },
    location: point || boundary ? locationInput(geo, point, boundary) : null,
    parcels,
    soilProfile,
    irrigations,
  };
}

function parcelInput(code, boundary = BOUNDARY, organizationId = ORG_IDS.a) {
  return {
    organization_id: organizationId,
    code,
    name: 'Plot One',
    area_unit: 'SQUARE_METER',
    area_value: 5000,
    area_hectares: toHectares(5000, 'SQUARE_METER'),
    ownership_type: 'OWNED',
    status: 'CULTIVATED',
    boundary,
  };
}

function soilInput(organizationId = ORG_IDS.a) {
  return {
    organization_id: organizationId,
    soil_type: 'Alluvium',
    texture: 'LOAM',
    ph: 6.8,
    organic_matter_percent: 2.4,
    fertility: 'MEDIUM',
    drainage: 'Well drained',
    tested_at: new Date('2026-01-15T00:00:00.000Z'),
    testing_lab: 'Soil Lab',
    notes: 'Representative composite sample.',
  };
}

function irrigationInput(code, organizationId = ORG_IDS.a) {
  return {
    organization_id: organizationId,
    code,
    source: 'GROUNDWATER',
    method: 'DRIP',
    status: 'ACTIVE',
    capacity_liters_per_minute: 120,
    command_area_hectares: 0.5,
    frequency_per_week: 3,
    notes: 'Morning cycle.',
  };
}

describeDatabase('farm management persistence and PostGIS', () => {
  let geo;

  test.before(async () => {
    await prisma.$executeRaw`
      DELETE FROM "farms" WHERE "code" LIKE 'DBTEST-FARM-%'
    `;
    await prisma.$executeRaw`
      INSERT INTO "users" (id, email, password_hash, created_at, updated_at)
      VALUES (${USER_IDS.a}::uuid, 'dbtest-farm-a@example.com', 'test-hash', NOW(), NOW()),
             (${USER_IDS.b}::uuid, 'dbtest-farm-b@example.com', 'test-hash', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO "organizations" (id, name, slug, owner_user_id, created_at, updated_at)
      VALUES (${ORG_IDS.a}::uuid, 'DB Test Farm Org A', 'dbtest-farm-org-a', ${USER_IDS.a}::uuid, NOW(), NOW()),
             (${ORG_IDS.b}::uuid, 'DB Test Farm Org B', 'dbtest-farm-org-b', ${USER_IDS.b}::uuid, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    geo = await loadGeo();
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('persists a complete farm bundle and round-trips PostGIS geometry', async () => {
    const farm = await store.createFarmBundle({
      ...farmBundle({
        code: 'DBTEST-FARM-BUNDLE',
        geo,
        point: POINT,
        boundary: BOUNDARY,
        parcels: [parcelInput('DBTEST-FARM-BUNDLE-P1')],
        soilProfile: soilInput(),
        irrigations: [irrigationInput('DBTEST-FARM-BUNDLE-I1')],
      }),
    });

    assert.equal(farm.code, 'DBTEST-FARM-BUNDLE');
    assert.equal(farm.organization_id, ORG_IDS.a);
    assert.equal(farm.farm_type, 'OWNED');
    assert.equal(farm.area_unit, 'ACRE');
    assert.equal(Number(farm.area_value), 2);
    assert.equal(Number(farm.total_area_hectares), toHectares(2, 'ACRE'));
    assert.deepEqual(farm.location.point, POINT);
    assert.deepEqual(farm.location.boundary[0], BOUNDARY[0]);
    assert.equal(farm.location.boundary.length, BOUNDARY.length);
    assert.equal(farm.parcels.length, 1);
    assert.equal(Number(farm.parcels[0].area_hectares), 0.5);
    assert.deepEqual(farm.parcels[0].boundary[0], BOUNDARY[0]);
    assert.equal(farm.soil_profile.ph, 6.8);
    assert.equal(farm.soil_profile.fertility, 'MEDIUM');
    assert.equal(farm.soil_profile.tested_at.toISOString(), '2026-01-15T00:00:00.000Z');
    assert.equal(farm.irrigations.length, 1);
    assert.equal(Number(farm.irrigations[0].capacity_liters_per_minute), 120);

    const locationRows = await prisma.$queryRaw`
      SELECT ST_X("location") AS "lng", ST_Y("location") AS "lat",
             ST_SRID("location") AS "srid", ST_GeometryType("location") AS "type",
             ST_IsValid("boundary") AS "boundaryValid"
      FROM "farm_locations" WHERE "farm_id" = ${farm.id}::uuid
    `;
    assert.equal(locationRows.length, 1);
    assert.equal(Number(locationRows[0].lng), POINT[0]);
    assert.equal(Number(locationRows[0].lat), POINT[1]);
    assert.equal(Number(locationRows[0].srid), 4326);
    assert.equal(locationRows[0].type, 'ST_Point');
    assert.equal(locationRows[0].boundaryValid, true);

    const moved = await store.upsertLocation(
      farm.id,
      locationInput(geo, MOVED_POINT, MOVED_BOUNDARY),
    );
    assert.deepEqual(moved.point, MOVED_POINT);
    assert.deepEqual(moved.boundary[0], MOVED_BOUNDARY[0]);

    const updatedParcel = await store.updateParcel(farm.parcels[0].id, {
      name: 'Plot One Expanded',
      boundary: MOVED_BOUNDARY,
    });
    assert.equal(updatedParcel.name, 'Plot One Expanded');
    assert.deepEqual(updatedParcel.boundary[0], MOVED_BOUNDARY[0]);

    const parcelRows = await prisma.$queryRaw`
      SELECT ST_AsText("boundary") AS "boundary", ST_IsValid("boundary") AS "valid"
      FROM "land_parcels" WHERE "id" = ${farm.parcels[0].id}::uuid
    `;
    assert.match(parcelRows[0].boundary, /^POLYGON\(/);
    assert.equal(parcelRows[0].valid, true);
  });

  test('queries PostGIS farms by bounding box, radius, polygon, and status', async () => {
    const inside = await store.createFarmBundle({
      ...farmBundle({
        code: 'DBTEST-FARM-SPATIAL',
        geo,
        point: POINT,
        boundary: BOUNDARY,
      }),
    });
    const outside = await store.createFarmBundle({
      ...farmBundle({ code: 'DBTEST-FARM-OUTSIDE', geo, point: FAR_POINT }),
    });

    const bbox = await store.querySpatial({ mode: 'bbox', bbox: BBOX });
    assert.ok(bbox.some((farm) => farm.id === inside.id));
    assert.ok(!bbox.some((farm) => farm.id === outside.id));

    const near = await store.querySpatial({
      mode: 'near',
      point: POINT,
      radiusMeters: 5000,
    });
    assert.ok(near.some((farm) => farm.id === inside.id));
    assert.ok(!near.some((farm) => farm.id === outside.id));

    const within = await store.querySpatial({ mode: 'within', polygon: BOUNDARY });
    assert.ok(within.some((farm) => farm.id === inside.id));
    assert.ok(!within.some((farm) => farm.id === outside.id));

    await store.archiveFarm(inside.id);
    assert.ok(
      !(await store.querySpatial({ mode: 'bbox', bbox: BBOX })).some(
        (farm) => farm.id === inside.id,
      ),
    );
    assert.ok(
      (await store.querySpatial({ mode: 'bbox', bbox: BBOX, includeArchived: true })).some(
        (farm) => farm.id === inside.id,
      ),
    );
  });

  test('rejects invalid coordinates, SRIDs, and polygons at the database boundary', async () => {
    const farm = await store.createFarmBundle(farmBundle({ code: 'DBTEST-FARM-GEOGUARD', geo }));

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO "farm_locations" ("id", "farm_id", "address_line", "location", "created_at", "updated_at")
        VALUES (${uuid(6201)}::uuid, ${farm.id}::uuid, 'Outside Bangladesh',
                ST_SetSRID(ST_MakePoint(0, 0), 4326), NOW(), NOW())
      `;
    });

    await expectSqlState(['23514', '22023'], async () => {
      await prisma.$executeRaw`
        INSERT INTO "farm_locations" ("id", "farm_id", "address_line", "location", "created_at", "updated_at")
        VALUES (${uuid(6202)}::uuid, ${farm.id}::uuid, 'Wrong SRID',
                ST_SetSRID(ST_MakePoint(90.37, 23.77), 3857), NOW(), NOW())
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO "farm_locations" ("id", "farm_id", "address_line", "boundary", "created_at", "updated_at")
        VALUES (${uuid(6203)}::uuid, ${farm.id}::uuid, 'Self-intersecting boundary',
                ST_GeomFromText(${BAD_BOUNDARY_WKT}, 4326), NOW(), NOW())
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO "land_parcels" (
          "id", "organization_id", "farm_id", "code", "area_unit",
          "area_value", "area_hectares", "boundary", "created_at", "updated_at"
        )
        VALUES (${uuid(6204)}::uuid, ${ORG_IDS.a}::uuid, ${farm.id}::uuid,
                'DBTEST-BAD-PARCEL', 'HECTARE'::"AreaUnit", 1, 1,
                ST_GeomFromText(${BAD_BOUNDARY_WKT}, 4326), NOW(), NOW())
      `;
    });

    const rows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS "count" FROM "farm_locations" WHERE "farm_id" = ${farm.id}::uuid
    `;
    assert.equal(Number(rows[0].count), 0);
  });

  test('enforces soil measurements and tenant matching for farm children', async () => {
    const tenantFarm = await store.createFarmBundle(
      farmBundle({ code: 'DBTEST-FARM-TENANT', geo }),
    );
    const crossTenantFarm = await store.createFarmBundle(
      farmBundle({ code: 'DBTEST-FARM-CROSS', geo }),
    );
    const measurementFarm = await store.createFarmBundle(
      farmBundle({ code: 'DBTEST-FARM-MEASURE', geo }),
    );

    const soil = await store.upsertSoilProfile(tenantFarm.id, soilInput());
    assert.equal(soil.organization_id, ORG_IDS.a);
    assert.equal(soil.ph, 6.8);
    const irrigation = await store.createIrrigation(
      tenantFarm.id,
      irrigationInput('DBTEST-FARM-TENANT-I1'),
    );
    assert.equal(irrigation.organization_id, ORG_IDS.a);

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO "farm_soil_profiles" (
          "id", "organization_id", "farm_id", "soil_type", "texture", "ph",
          "organic_matter_percent", "fertility", "created_at", "updated_at"
        )
        VALUES (${uuid(6205)}::uuid, ${ORG_IDS.a}::uuid, ${measurementFarm.id}::uuid,
                'Alluvium', 'LOAM'::"FarmSoilTexture", 15, 2.4,
                'MEDIUM'::"SoilFertility", NOW(), NOW())
      `;
    });

    await expectSqlState('23514', async () => {
      await prisma.$executeRaw`
        INSERT INTO "farm_soil_profiles" (
          "id", "organization_id", "farm_id", "soil_type", "texture", "ph",
          "organic_matter_percent", "fertility", "created_at", "updated_at"
        )
        VALUES (${uuid(6206)}::uuid, ${ORG_IDS.a}::uuid, ${measurementFarm.id}::uuid,
                'Alluvium', 'LOAM'::"FarmSoilTexture", 6.8, 101,
                'MEDIUM'::"SoilFertility", NOW(), NOW())
      `;
    });

    await expectMessage(/Tenant mismatch/, async () => {
      await prisma.$executeRaw`
        INSERT INTO "farm_soil_profiles" (
          "id", "organization_id", "farm_id", "soil_type", "texture", "ph",
          "organic_matter_percent", "fertility", "created_at", "updated_at"
        )
        VALUES (${uuid(6207)}::uuid, ${ORG_IDS.b}::uuid, ${crossTenantFarm.id}::uuid,
                'Alluvium', 'LOAM'::"FarmSoilTexture", 6.8, 2.4,
                'MEDIUM'::"SoilFertility", NOW(), NOW())
      `;
    });

    await expectMessage(/Tenant mismatch/, async () => {
      await prisma.$executeRaw`
        INSERT INTO "farm_irrigations" (
          "id", "organization_id", "farm_id", "code", "source", "method",
          "status", "created_at", "updated_at"
        )
        VALUES (${uuid(6208)}::uuid, ${ORG_IDS.b}::uuid, ${crossTenantFarm.id}::uuid,
                'DBTEST-FARM-CROSS-I1', 'GROUNDWATER'::"IrrigationSource",
                'DRIP'::"IrrigationMethod", 'ACTIVE'::"IrrigationStatus", NOW(), NOW())
      `;
    });
  });

  test('prevents reassigning a tenant farm while farm children still reference it', async () => {
    const farm = await store.createFarmBundle({
      ...farmBundle({
        code: 'DBTEST-FARM-IMMUTABLE',
        geo,
        parcels: [parcelInput('DBTEST-FARM-IMMUTABLE-P1')],
        soilProfile: soilInput(),
        irrigations: [irrigationInput('DBTEST-FARM-IMMUTABLE-I1')],
      }),
    });

    await expectMessage(
      /Cannot change farms organization_id while (land_parcels|farm_soil_profiles|farm_irrigations) rows still reference it/,
      async () => {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            UPDATE "farms" SET "organization_id" = ${ORG_IDS.b}::uuid
            WHERE "id" = ${farm.id}::uuid
          `;
        });
      },
    );

    const rows = await prisma.$queryRaw`
      SELECT "organization_id"::text AS "organizationId" FROM "farms" WHERE "id" = ${farm.id}::uuid
    `;
    assert.equal(rows[0].organizationId, ORG_IDS.a);
  });

  test('installs farm migration objects and the seeded Bangladesh chain', async () => {
    const migrations = await prisma.$queryRaw`
      SELECT "migration_name" FROM "_prisma_migrations"
    `;
    assert.ok(migrations.some((row) => row.migration_name === '20261125150000_farm_management'));

    const constraintNames = [
      'farm_locations_location_srid_check',
      'farm_locations_location_bangladesh_check',
      'farm_locations_boundary_valid_check',
      'land_parcels_boundary_valid_check',
      'farms_area_value_check',
      'farm_soil_profiles_ph_check',
      'farm_soil_profiles_organic_matter_check',
      'farm_irrigations_capacity_check',
      'farm_irrigations_command_area_check',
      'farm_irrigations_frequency_check',
    ];
    const constraints = await prisma.$queryRaw`
      SELECT "conname" AS "name" FROM "pg_constraint" WHERE "conname" = ANY(${constraintNames}::text[])
    `;
    assert.equal(constraints.length, constraintNames.length);

    const indexNames = [
      'farm_soil_profiles_farm_id_key',
      'farm_irrigations_farm_id_code_key',
      'farm_locations_location_gix',
      'farm_locations_boundary_gix',
    ];
    const indexes = await prisma.$queryRaw`
      SELECT "indexname" AS "name" FROM "pg_indexes"
      WHERE "schemaname" = 'public' AND "indexname" = ANY(${indexNames}::text[])
    `;
    assert.equal(indexes.length, indexNames.length);

    const triggerNames = [
      'farm_soil_profiles_tenant_match_check',
      'farm_irrigations_tenant_match_check',
      'farms_tenant_immutable_check',
    ];
    const triggers = await prisma.$queryRaw`
      SELECT "tgname" AS "name" FROM "pg_trigger"
      WHERE NOT "tgisinternal" AND "tgname" = ANY(${triggerNames}::text[])
    `;
    assert.equal(triggers.length, triggerNames.length);

    const context = await store.findGeoContext({
      divisionId: geo.division.id,
      districtId: geo.district.id,
      upazilaId: geo.upazila.id,
      unionId: geo.union.id,
    });
    assert.equal(context.country_code, 'BD');
    assert.equal(context.division.code, 'BD-DHA');
    assert.equal(context.district.code, 'BD-DHA-DHA');
    assert.equal(context.upazila.code, 'BD-DHA-DHA-S');
    assert.equal(context.union.code, 'BD-DHA-DHA-U');
  });
});

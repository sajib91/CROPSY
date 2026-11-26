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
  userA: uuid(9501),
  userB: uuid(9502),
  orgA: uuid(9511),
  category: uuid(9521),
  product: uuid(9531),
  warehouse: uuid(9541),
  inventory: uuid(9542),
  location: uuid(9543),
  movement: uuid(9544),
  reconciliation: uuid(9545),
  order: uuid(9551),
  providerNear: uuid(9561),
  providerFar: uuid(9562),
  shipment: uuid(9571),
  inspection: uuid(9581),
  evidence: uuid(9582),
  batch: uuid(9591),
  eventPublic: uuid(9592),
  eventPrivate: uuid(9593),
};

function sqlState(error) {
  return error?.meta?.code || error?.code || String(error?.message || error);
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

async function cleanup() {
  await prisma.traceabilityEvent.deleteMany({
    where: { id: { in: [ID.eventPublic, ID.eventPrivate] } },
  });
  await prisma.traceabilityBatch.deleteMany({ where: { id: ID.batch } });
  await prisma.inspectionEvidence.deleteMany({ where: { id: ID.evidence } });
  await prisma.qualityInspection.deleteMany({ where: { id: ID.inspection } });
  await prisma.inventoryReconciliation.deleteMany({ where: { id: ID.reconciliation } });
  // Inventory movements are append-only in the database. The immutable row,
  // its inventory, and its warehouse/product parents are intentionally retained;
  // deleting the inventory would fire the movement's ON DELETE SET NULL update.
  // Fixtures upsert these records on subsequent runs.
  await prisma.warehouseLocation.deleteMany({ where: { id: ID.location } });
  await prisma.shipment.deleteMany({ where: { id: ID.shipment } });
  await prisma.deliveryService.deleteMany({
    where: { provider_id: { in: [ID.providerNear, ID.providerFar] } },
  });
  await prisma.logisticsProvider.deleteMany({
    where: { id: { in: [ID.providerNear, ID.providerFar] } },
  });
  await prisma.order.deleteMany({ where: { id: ID.order } });
}

async function seedFixtures() {
  await cleanup();

  await prisma.user.upsert({
    where: { id: ID.userA },
    create: {
      id: ID.userA,
      email: 'dbtest-ops-a@example.com',
      password_hash: 'test-hash',
    },
    update: {},
  });
  await prisma.user.upsert({
    where: { id: ID.userB },
    create: {
      id: ID.userB,
      email: 'dbtest-ops-b@example.com',
      password_hash: 'test-hash',
    },
    update: {},
  });
  await prisma.organization.upsert({
    where: { id: ID.orgA },
    create: {
      id: ID.orgA,
      name: 'DB Test Operations',
      slug: 'dbtest-operations',
      owner_user_id: ID.userA,
    },
    update: {},
  });
  await prisma.productCategory.upsert({
    where: { id: ID.category },
    create: {
      id: ID.category,
      organization_id: ID.orgA,
      code: 'DBTEST-OPS-CATEGORY',
      name: 'DB Test Operations Category',
    },
    update: {},
  });
  await prisma.product.upsert({
    where: { id: ID.product },
    create: {
      id: ID.product,
      organization_id: ID.orgA,
      category_id: ID.category,
      sku: 'DBTEST-OPS-PRODUCT',
      name: 'DB Test Operations Product',
      unit_code: 'KG',
    },
    update: {},
  });
  await prisma.order.upsert({
    where: { id: ID.order },
    create: {
      id: ID.order,
      organization_id: ID.orgA,
      buyer_user_id: ID.userB,
      seller_user_id: ID.userA,
      status: 'CONFIRMED',
      subtotal_amount: 100,
      total_amount: 100,
    },
    update: {},
  });

  await prisma.logisticsProvider.upsert({
    where: { id: ID.providerNear },
    create: {
      id: ID.providerNear,
      organization_id: ID.orgA,
      owner_user_id: ID.userA,
      code: 'DBTEST-OPS-NEAR',
      name: 'DB Test Nearby Provider',
      longitude: 90.4125,
      latitude: 23.8103,
      service_radius_km: 25,
      service_types: ['STANDARD'],
    },
    update: {},
  });
  await prisma.logisticsProvider.upsert({
    where: { id: ID.providerFar },
    create: {
      id: ID.providerFar,
      organization_id: ID.orgA,
      owner_user_id: ID.userA,
      code: 'DBTEST-OPS-FAR',
      name: 'DB Test Far Provider',
      longitude: 91.7832,
      latitude: 22.3569,
      service_radius_km: 5,
      service_types: ['STANDARD'],
    },
    update: {},
  });
  await prisma.shipment.upsert({
    where: { id: ID.shipment },
    create: {
      id: ID.shipment,
      organization_id: ID.orgA,
      order_id: ID.order,
      provider_id: ID.providerNear,
      reference_key: 'DBTEST-OPS-SHIPMENT-001',
      status: 'PENDING',
    },
    update: {},
  });

  await prisma.warehouse.upsert({
    where: { id: ID.warehouse },
    create: {
      id: ID.warehouse,
      organization_id: ID.orgA,
      code: 'DBTEST-OPS-WAREHOUSE',
      name: 'DB Test Operations Warehouse',
      capacity_cubic_meters: 1000,
    },
    update: {},
  });
  await prisma.warehouseLocation.upsert({
    where: { id: ID.location },
    create: {
      id: ID.location,
      warehouse_id: ID.warehouse,
      code: 'A-01-01',
      name: 'Rack A',
      zone: 'A',
      capacity_units: 100,
    },
    update: {},
  });
  await prisma.warehouseInventory.upsert({
    where: { id: ID.inventory },
    create: {
      id: ID.inventory,
      warehouse_id: ID.warehouse,
      location_id: ID.location,
      product_id: ID.product,
      batch_code: 'DBTEST-BATCH',
      quantity_on_hand: 10,
      quantity_reserved: 0,
      available_quantity: 10,
      unit_code: 'KG',
    },
    update: {},
  });
  const existingMovement = await prisma.inventoryMovement.findUnique({
    where: { id: ID.movement },
  });
  if (!existingMovement) {
    await prisma.inventoryMovement.create({
      data: {
        id: ID.movement,
        organization_id: ID.orgA,
        warehouse_id: ID.warehouse,
        warehouse_inventory_id: ID.inventory,
        product_id: ID.product,
        movement_type: 'RECEIPT',
        quantity: 10,
        quantity_before: 0,
        quantity_after: 10,
        unit_code: 'KG',
        reference_key: 'DBTEST-OPS-RECEIPT-001',
      },
    });
  }
  await prisma.inventoryReconciliation.upsert({
    where: { id: ID.reconciliation },
    create: {
      id: ID.reconciliation,
      organization_id: ID.orgA,
      warehouse_id: ID.warehouse,
      warehouse_inventory_id: ID.inventory,
      product_id: ID.product,
      counted_quantity: 8,
      system_quantity: 10,
      difference_quantity: -2,
      status: 'PENDING',
      reference_key: 'DBTEST-OPS-RECON-001',
      counted_by_user_id: ID.userA,
    },
    update: {},
  });

  await prisma.qualityInspection.upsert({
    where: { id: ID.inspection },
    create: {
      id: ID.inspection,
      organization_id: ID.orgA,
      shipment_id: ID.shipment,
      warehouse_inventory_id: ID.inventory,
      product_id: ID.product,
      batch_code: 'DBTEST-BATCH',
      inspector_user_id: ID.userA,
      inspected_at: new Date('2026-11-25T00:00:00Z'),
      result: 'PASSED',
      grade_code: 'A',
      grade_source: 'INSPECTOR',
    },
    update: {},
  });
  await prisma.inspectionEvidence.upsert({
    where: { id: ID.evidence },
    create: {
      id: ID.evidence,
      inspection_id: ID.inspection,
      evidence_type: 'IMAGE',
      uri: 'https://example.com/dbtest-evidence.jpg',
      mime_type: 'image/jpeg',
      recorded_by_user_id: ID.userA,
      public_disclosure: true,
    },
    update: {},
  });

  await prisma.traceabilityBatch.upsert({
    where: { id: ID.batch },
    create: {
      id: ID.batch,
      organization_id: ID.orgA,
      product_id: ID.product,
      shipment_id: ID.shipment,
      inspection_id: ID.inspection,
      batch_code: 'DBTEST-TRACE-BATCH',
      verification_token: 'dbtest-ops-token-001',
      created_by_user_id: ID.userA,
    },
    update: {},
  });
  await prisma.traceabilityEvent.upsert({
    where: { id: ID.eventPublic },
    create: {
      id: ID.eventPublic,
      batch_id: ID.batch,
      event_type: 'HARVESTED',
      occurred_at: new Date('2026-11-24T00:00:00Z'),
      title: 'Verified public harvest',
      public_disclosure: true,
      verification_status: 'VERIFIED',
    },
    update: {},
  });
  await prisma.traceabilityEvent.upsert({
    where: { id: ID.eventPrivate },
    create: {
      id: ID.eventPrivate,
      batch_id: ID.batch,
      event_type: 'STORAGE_HISTORY',
      occurred_at: new Date('2026-11-25T00:00:00Z'),
      title: 'Private storage note',
      public_disclosure: false,
      verification_status: 'UNVERIFIED',
    },
    update: {},
  });
}

describeDatabase('logistics, warehouse, quality, and traceability database invariants', () => {
  test.before(async () => {
    await seedFixtures();
  });

  test.after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('provider proximity uses PostGIS geography distance primitives', async () => {
    const rows = await prisma.$queryRaw`
      SELECT code,
             ST_Distance(
               ST_MakePoint(longitude::float8, latitude::float8)::geography,
               ST_MakePoint(90.4125::float8, 23.8103::float8)::geography
             ) AS distance_m
      FROM logistics_providers
      WHERE code IN ('DBTEST-OPS-NEAR', 'DBTEST-OPS-FAR')
        AND ST_DWithin(
          ST_MakePoint(longitude::float8, latitude::float8)::geography,
          ST_MakePoint(90.4125::float8, 23.8103::float8)::geography,
          1000
        )
      ORDER BY code
    `;
    assert.deepEqual(
      rows.map((row) => row.code),
      ['DBTEST-OPS-NEAR'],
    );
    assert.equal(Number(rows[0].distance_m), 0);

    const farRows = await prisma.$queryRaw`
      SELECT code
      FROM logistics_providers
      WHERE code = 'DBTEST-OPS-FAR'
        AND ST_DWithin(
          ST_MakePoint(longitude::float8, latitude::float8)::geography,
          ST_MakePoint(90.4125::float8, 23.8103::float8)::geography,
          1000
        )
    `;
    assert.equal(farRows.length, 0);
  });

  test('operational reference keys are unique', async () => {
    await expectSqlState('P2002', async () => {
      await prisma.shipment.create({
        data: {
          id: uuid(9611),
          organization_id: ID.orgA,
          order_id: ID.order,
          reference_key: 'DBTEST-OPS-SHIPMENT-001',
        },
      });
    });
    await expectSqlState('P2002', async () => {
      await prisma.traceabilityBatch.create({
        data: {
          id: uuid(9612),
          organization_id: ID.orgA,
          batch_code: 'DBTEST-TRACE-DUPLICATE',
          verification_token: 'dbtest-ops-token-001',
          created_by_user_id: ID.userA,
        },
      });
    });
    await expectSqlState('P2002', async () => {
      await prisma.inventoryReconciliation.create({
        data: {
          id: uuid(9613),
          organization_id: ID.orgA,
          warehouse_id: ID.warehouse,
          warehouse_inventory_id: ID.inventory,
          product_id: ID.product,
          counted_quantity: 10,
          system_quantity: 10,
          difference_quantity: 0,
          reference_key: 'DBTEST-OPS-RECON-001',
        },
      });
    });
  });

  test('quality verification and public disclosure defaults are conservative', async () => {
    const inspection = await prisma.qualityInspection.findUnique({ where: { id: ID.inspection } });
    assert.equal(inspection.verification_status, 'UNVERIFIED');
    assert.equal(inspection.grade_source, 'INSPECTOR');

    const evidence = await prisma.inspectionEvidence.findUnique({ where: { id: ID.evidence } });
    assert.equal(evidence.public_disclosure, true);

    const privateEvidence = await prisma.inspectionEvidence.create({
      data: {
        id: uuid(9621),
        inspection_id: ID.inspection,
        evidence_type: 'DOCUMENT',
        uri: 'https://example.com/dbtest-private.pdf',
      },
    });
    assert.equal(privateEvidence.public_disclosure, false);
    await prisma.inspectionEvidence.delete({ where: { id: privateEvidence.id } });
  });

  test('public traceability facts require verified public events and a verified public batch', async () => {
    const before = await prisma.$queryRaw`
      SELECT count(*)::int AS count
      FROM traceability_events e
      JOIN traceability_batches b ON b.id = e.batch_id
      WHERE b.id = ${ID.batch}::uuid
        AND b.verification_status = 'VERIFIED'::"VerificationStatus"
        AND b.public_disclosure = true
        AND e.public_disclosure = true
        AND e.verification_status = 'VERIFIED'::"VerificationStatus"
    `;
    assert.equal(before[0].count, 0);

    await prisma.traceabilityBatch.update({
      where: { id: ID.batch },
      data: {
        verification_status: 'VERIFIED',
        public_disclosure: true,
        verified_at: new Date('2026-11-26T00:00:00Z'),
        verified_by_user_id: ID.userA,
      },
    });

    const after = await prisma.$queryRaw`
      SELECT e.title
      FROM traceability_events e
      JOIN traceability_batches b ON b.id = e.batch_id
      WHERE b.id = ${ID.batch}::uuid
        AND b.verification_status = 'VERIFIED'::"VerificationStatus"
        AND b.public_disclosure = true
        AND e.public_disclosure = true
        AND e.verification_status = 'VERIFIED'::"VerificationStatus"
      ORDER BY e.occurred_at
    `;
    assert.deepEqual(
      after.map((row) => row.title),
      ['Verified public harvest'],
    );
  });

  test('stock movements and reconciliation differences are preserved as records', async () => {
    const movement = await prisma.inventoryMovement.findUnique({ where: { id: ID.movement } });
    assert.equal(movement.movement_type, 'RECEIPT');
    assert.equal(Number(movement.quantity_after), 10);
    assert.equal(movement.reference_key, 'DBTEST-OPS-RECEIPT-001');

    const reconciliation = await prisma.inventoryReconciliation.findUnique({
      where: { id: ID.reconciliation },
    });
    assert.equal(Number(reconciliation.difference_quantity), -2);
    assert.equal(reconciliation.status, 'PENDING');
  });
});

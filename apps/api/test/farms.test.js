const assert = require('node:assert/strict');
const test = require('node:test');

const {
  bearer,
  createApp,
  createTenantFixture,
  loginUser,
  register,
} = require('./support/auth-fixtures');
const { FarmStoreToken } = require('../src/modules/farmers/domain/farm.repository');

const BASE = '/api/v1/farmers';

async function login(app, email) {
  const result = await loginUser(app, email);
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.tokens.accessToken;
}

async function geoIds(app) {
  const store = app.cropsyContainer.resolve(FarmStoreToken);
  const division = (await store.listDivisions()).find((item) => item.name === 'Dhaka');
  const district = (await store.listDistricts(division.id)).find((item) => item.name === 'Dhaka');
  const upazila = (await store.listUpazilas(district.id)).find(
    (item) => item.name === 'Dhaka Sadar',
  );
  const union = (await store.listUnions(upazila.id)).find(
    (item) => item.name === 'Dhaka Sadar Union',
  );
  assert.ok(division && district && upazila && union, 'Bangladesh geo fixture is incomplete');
  return {
    divisionId: division.id,
    districtId: district.id,
    upazilaId: upazila.id,
    unionId: union.id,
  };
}

function ring() {
  return [
    [90.35, 23.75],
    [90.4, 23.75],
    [90.4, 23.8],
    [90.35, 23.8],
    [90.35, 23.75],
  ];
}

function location(geo) {
  return {
    addressLine: '12 Farm Road, Savar',
    ...geo,
    point: [90.37, 23.77],
    boundary: ring(),
  };
}

function farmPayload({ code, geo, ...overrides }) {
  return {
    name: 'North Field',
    description: 'A test farm in Dhaka.',
    code,
    farmType: 'OWNED',
    areaUnit: 'ACRE',
    areaValue: 2,
    ownershipType: 'OWNED',
    location: geo ? location(geo) : undefined,
    parcels: [
      {
        code: `${code}-P1`,
        name: 'Plot One',
        areaUnit: 'SQUARE_METER',
        areaValue: 5000,
        ownershipType: 'OWNED',
        status: 'CULTIVATED',
        boundary: ring(),
      },
    ],
    soilProfile: {
      soilType: 'Alluvium',
      texture: 'LOAM',
      ph: 6.8,
      organicMatterPercent: 2.4,
      fertility: 'MEDIUM',
      drainage: 'Well drained',
    },
    irrigations: [
      {
        code: `${code}-I1`,
        source: 'GROUNDWATER',
        method: 'DRIP',
        status: 'ACTIVE',
        capacityLitersPerMinute: 120,
        frequencyPerWeek: 3,
      },
    ],
    ...overrides,
  };
}

async function createFarm(app, token, payload) {
  const response = await app.inject({
    method: 'POST',
    url: `${BASE}/farms`,
    headers: bearer(token),
    payload,
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

test('farm registration stores multiple farms, area units, parcels, soil, and irrigation', async (t) => {
  const { app, store } = await createApp(t);
  const registration = await register(app, {
    email: 'farmer@example.com',
    roles: ['FARMER'],
  });
  const token = await login(app, 'farmer@example.com');
  const geo = await geoIds(app);

  const first = await createFarm(app, token, farmPayload({ code: 'NORTH-1', geo }));
  assert.equal(first.code, 'NORTH-1');
  assert.equal(first.area.unit, 'ACRE');
  assert.equal(first.area.value, 2);
  assert.equal(first.area.hectares, 0.809);
  assert.equal(first.parcels.length, 1);
  assert.equal(first.parcels[0].area.hectares, 0.5);
  assert.ok(first.parcels[0].boundary);
  assert.equal(first.soilProfile.fertility, 'MEDIUM');
  assert.equal(first.irrigations.length, 1);
  assert.equal(first.location.coordinates.type, 'Point');
  assert.deepEqual(first.location.coordinates.coordinates, [90.37, 23.77]);

  const second = await createFarm(app, token, {
    name: 'South Field',
    code: 'SOUTH-1',
    areaValue: 1,
  });
  assert.equal(second.area.unit, 'HECTARE');
  assert.equal(second.area.hectares, 1);

  const listed = await app.inject({
    method: 'GET',
    url: `${BASE}/farms`,
    headers: bearer(token),
  });
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(
    listed.json().data.farms.map((farm) => farm.code),
    ['SOUTH-1', 'NORTH-1'],
  );

  const updated = await app.inject({
    method: 'PATCH',
    url: `${BASE}/farms/${first.id}`,
    headers: bearer(token),
    payload: { name: 'North Field Expanded', areaUnit: 'HECTARE', areaValue: 3 },
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().data.name, 'North Field Expanded');
  assert.equal(updated.json().data.area.hectares, 3);

  const archived = await app.inject({
    method: 'DELETE',
    url: `${BASE}/farms/${second.id}`,
    headers: bearer(token),
  });
  assert.equal(archived.statusCode, 200);
  assert.equal(archived.json().data.status, 'ARCHIVED');

  const active = await app.inject({
    method: 'GET',
    url: `${BASE}/farms`,
    headers: bearer(token),
  });
  assert.equal(active.json().data.farms.length, 1);
  const withArchived = await app.inject({
    method: 'GET',
    url: `${BASE}/farms?includeArchived=true`,
    headers: bearer(token),
  });
  assert.equal(withArchived.json().data.farms.length, 2);

  for (const action of ['farmers.farm.created', 'farmers.farm.updated', 'farmers.farm.archived']) {
    assert.ok((await store.listAudit({ action })).length > 0, `missing audit for ${action}`);
  }
  assert.equal(registration.user.id, first.ownerUserId);
});

test('farm routes enforce permissions, tenant isolation, and coordinate privacy', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, store, orgA, orgB, adminId, adminToken } = fixture;
  const geo = await geoIds(app);

  const peerToken = await login(app, 'peer@example.com');
  const deniedRead = await app.inject({
    method: 'GET',
    url: `${BASE}/farms`,
    headers: bearer(peerToken),
  });
  assert.equal(deniedRead.statusCode, 403);
  const deniedWrite = await app.inject({
    method: 'POST',
    url: `${BASE}/farms`,
    headers: bearer(peerToken),
    payload: { name: 'Not allowed' },
  });
  assert.equal(deniedWrite.statusCode, 403);

  const farm = await createFarm(app, adminToken, {
    ...farmPayload({ code: 'COOP-1', geo }),
    organizationId: orgA.id,
  });
  assert.equal(farm.organizationId, orgA.id);
  assert.equal(farm.ownerUserId, adminId);

  const otherFarmer = await register(app, {
    email: 'other-farmer@example.com',
    roles: ['FARMER'],
  });
  await store.addOrganizationMember({
    organizationId: orgB.id,
    userId: otherFarmer.user.id,
    status: 'ACTIVE',
  });
  const otherToken = await login(app, 'other-farmer@example.com');
  const crossTenant = await app.inject({
    method: 'GET',
    url: `${BASE}/farms/${farm.id}`,
    headers: bearer(otherToken),
  });
  assert.equal(crossTenant.statusCode, 403);
  assert.equal(crossTenant.json().meta.details.code, 'cross_organization_access_denied');

  const expert = await register(app, {
    email: 'expert@example.com',
    roles: ['AGRICULTURAL_EXPERT'],
  });
  assert.equal(expert.response.statusCode, 201, expert.response.body);
  const expertToken = await login(app, 'expert@example.com');
  const redacted = await app.inject({
    method: 'GET',
    url: `${BASE}/farms/${farm.id}`,
    headers: bearer(expertToken),
  });
  assert.equal(redacted.statusCode, 403, 'org farm metadata remains tenant scoped');

  const personal = await createFarm(app, adminToken, {
    name: 'Private Field',
    code: 'PRIVATE-1',
    areaValue: 2,
    location: location(geo),
  });
  const personalRead = await app.inject({
    method: 'GET',
    url: `${BASE}/farms/${personal.id}`,
    headers: bearer(expertToken),
  });
  assert.equal(personalRead.statusCode, 200, personalRead.body);
  const redactedFarm = personalRead.json().data;
  assert.equal(redactedFarm.coordinatesAccess, 'REDACTED');
  assert.equal(redactedFarm.location.coordinates, undefined);
  assert.equal(redactedFarm.location.hasCoordinates, true);
  assert.equal(redactedFarm.parcels.length, 0);

  const deniedCoordinates = await app.inject({
    method: 'GET',
    url: `${BASE}/farms/${personal.id}/coordinates`,
    headers: bearer(expertToken),
  });
  assert.equal(deniedCoordinates.statusCode, 403);
  assert.equal(deniedCoordinates.json().meta.details.code, 'private_farm_coordinates');

  const deniedEntries = await store.listAudit({
    action: 'farmers.coordinates.denied',
    entityId: personal.id,
  });
  assert.equal(deniedEntries.length, 1);
  assert.equal(deniedEntries[0].actor_user_id, expert.user.id);

  const allowedCoordinates = await app.inject({
    method: 'GET',
    url: `${BASE}/farms/${personal.id}/coordinates`,
    headers: bearer(adminToken),
  });
  assert.equal(allowedCoordinates.statusCode, 200, allowedCoordinates.body);
  assert.deepEqual(allowedCoordinates.json().data.coordinates.coordinates, [90.37, 23.77]);
});

test('map and spatial queries return redacted farms and reject invalid geography', async (t) => {
  const { app } = await createApp(t);
  await register(app, {
    email: 'spatial@example.com',
    roles: ['FARMER'],
  });
  const token = await login(app, 'spatial@example.com');
  const geo = await geoIds(app);
  await createFarm(app, token, farmPayload({ code: 'SPATIAL-1', geo }));

  const divisions = await app.inject({
    method: 'GET',
    url: `${BASE}/geo/divisions`,
    headers: bearer(token),
  });
  assert.equal(divisions.statusCode, 200);
  assert.equal(divisions.json().data.divisions.length, 8);
  const districts = await app.inject({
    method: 'GET',
    url: `${BASE}/geo/divisions/${geo.divisionId}/districts`,
    headers: bearer(token),
  });
  assert.equal(districts.statusCode, 200);
  assert.ok(districts.json().data.districts.some((item) => item.name === 'Dhaka'));

  const map = await app.inject({
    method: 'GET',
    url: `${BASE}/farms/map`,
    headers: bearer(token),
  });
  assert.equal(map.statusCode, 200, map.body);
  const featureCollection = map.json().data;
  assert.equal(featureCollection.type, 'FeatureCollection');
  assert.equal(featureCollection.features.length, 1);
  assert.equal(featureCollection.features[0].geometry.type, 'Polygon');
  assert.equal(featureCollection.features[0].properties.summary.coordinatesAccess, 'REDACTED');

  const bbox = await app.inject({
    method: 'GET',
    url: `${BASE}/farms/spatial?mode=bbox&minLng=90.3&minLat=23.7&maxLng=90.45&maxLat=23.85`,
    headers: bearer(token),
  });
  assert.equal(bbox.statusCode, 200, bbox.body);
  assert.equal(bbox.json().data.farms.length, 1);

  const near = await app.inject({
    method: 'GET',
    url: `${BASE}/farms/spatial?mode=near&lng=90.37&lat=23.77&radiusMeters=5000`,
    headers: bearer(token),
  });
  assert.equal(near.statusCode, 200, near.body);
  assert.equal(near.json().data.farms.length, 1);

  const polygon = encodeURIComponent(JSON.stringify(ring()));
  const within = await app.inject({
    method: 'GET',
    url: `${BASE}/farms/spatial?mode=within&polygon=${polygon}`,
    headers: bearer(token),
  });
  assert.equal(within.statusCode, 200, within.body);
  assert.equal(within.json().data.farms.length, 1);

  const outside = await app.inject({
    method: 'POST',
    url: `${BASE}/farms`,
    headers: bearer(token),
    payload: farmPayload({
      code: 'OUTSIDE-1',
      geo,
      location: { ...location(geo), point: [0, 0] },
    }),
  });
  assert.equal(outside.statusCode, 400);

  const crossed = await app.inject({
    method: 'POST',
    url: `${BASE}/farms`,
    headers: bearer(token),
    payload: farmPayload({
      code: 'CROSSED-1',
      geo,
      location: {
        ...location(geo),
        boundary: [
          [90.35, 23.75],
          [90.4, 23.8],
          [90.35, 23.8],
          [90.4, 23.75],
          [90.35, 23.75],
        ],
      },
    }),
  });
  assert.equal(crossed.statusCode, 400);

  const badBbox = await app.inject({
    method: 'GET',
    url: `${BASE}/farms/spatial?mode=bbox&minLng=0&minLat=0&maxLng=1&maxLat=1`,
    headers: bearer(token),
  });
  assert.equal(badBbox.statusCode, 400);
});

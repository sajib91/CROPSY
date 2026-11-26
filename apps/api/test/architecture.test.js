const assert = require('node:assert/strict');
const test = require('node:test');

const buildServer = require('../src/app');
const { modules, moduleIds } = require('../src/modules/registry');
const { ConfigToken, EventBusToken } = require('../src/shared/di/tokens');
const { IamServiceToken } = require('../src/modules/iam/application/iam.service');
const { IamRepositoryToken } = require('../src/modules/iam/domain/iam.repository');
const { IamInMemoryRepository } = require('../src/modules/iam/infrastructure/iam.repository');

const testEnv = {
  ...process.env,
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  API_PREFIX: '/api/v1',
  SERVICE_NAME: 'cropsy-architecture-test',
};

async function createApp(t) {
  const app = await buildServer({ env: testEnv, logger: false });
  t.after(() => app.close());
  return app;
}

test('module registry exposes twenty independent module boundaries', async () => {
  assert.equal(modules.length, 21);
  assert.equal(new Set(moduleIds).size, 21);
  assert.ok(modules.every((module) => module.metadata.id === module.id));
  assert.ok(modules.every((module) => module.register && module.routes && module.service));
});

test('GET /api/v1/version reports the active version and supported versions', async (t) => {
  const app = await createApp(t);
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/version',
    headers: { 'x-request-id': 'version-check' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-request-id'], 'version-check');
  assert.equal(response.json().data.version, 'v1');
  assert.deepEqual(response.json().data.supportedVersions, ['v1']);
});

test('an unsupported x-api-version header is rejected centrally', async (t) => {
  const app = await createApp(t);
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/version',
    headers: { 'x-api-version': 'v2' },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, 'validation_error');
  assert.match(response.json().meta.message, /v2/);
});

test('GET /api/v1/modules lists every module with declared dependencies', async (t) => {
  const app = await createApp(t);
  const response = await app.inject({ method: 'GET', url: '/api/v1/modules' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.length, 21);
  assert.ok(
    response
      .json()
      .data.every((module) => Array.isArray(module.dependsOn) && Array.isArray(module.publishes)),
  );
});

test('GET /api/v1/modules/unknown returns the centralized not-found envelope', async (t) => {
  const app = await createApp(t);
  const response = await app.inject({ method: 'GET', url: '/api/v1/modules/unknown' });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, 'not_found');
  assert.match(response.json().meta.message, /Unknown module/);
});

test('module presentation uses the DI-resolved application service and validated DTO', async (t) => {
  const app = await createApp(t);
  const response = await app.inject({ method: 'GET', url: '/api/v1/iam/info' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().success, true);
  assert.equal(response.json().data.moduleId, 'iam');
  assert.equal(response.json().data.status, 'ACTIVE');
  assert.deepEqual(response.json().data.dependsOn, []);
  assert.ok(response.json().meta.apiVersion);
});

test('module route params are validated and unknown module ids are rejected', async (t) => {
  const app = await createApp(t);
  const valid = await app.inject({ method: 'GET', url: '/api/v1/iam/info/iam' });
  const invalid = await app.inject({ method: 'GET', url: '/api/v1/iam/info/billing' });

  assert.equal(valid.statusCode, 200);
  assert.equal(invalid.statusCode, 404);
  assert.equal(invalid.json().error, 'not_found');
});

test('container wires ports to adapters without module-to-module imports', async (t) => {
  const app = await createApp(t);

  assert.equal(app.cropsyContainer.resolve(ConfigToken), app.cropsyEnv);
  assert.equal(app.cropsyContainer.resolve(EventBusToken), app.cropsyEventBus);
  assert.ok(app.cropsyContainer.resolve(IamRepositoryToken) instanceof IamInMemoryRepository);
  assert.equal(
    app.cropsyContainer.resolve(IamServiceToken),
    app.cropsyContainer.resolve(IamServiceToken),
  );
});

test('application services publish domain events on first use', async (t) => {
  const app = await createApp(t);
  await app.inject({ method: 'GET', url: '/api/v1/orders/info' });

  const events = app.cropsyEventBus.recent(20);
  assert.ok(events.some((event) => event.type === 'orders.initialized'));
  assert.ok(events.every((event) => event.moduleId));
});

test('GET /api/v1/observability validates its limit query', async (t) => {
  const app = await createApp(t);
  const valid = await app.inject({ method: 'GET', url: '/api/v1/observability?limit=5' });
  const invalid = await app.inject({ method: 'GET', url: '/api/v1/observability?limit=0' });

  assert.equal(valid.statusCode, 200);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error, 'validation_error');
});

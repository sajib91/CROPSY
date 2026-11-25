const assert = require('node:assert/strict');
const test = require('node:test');

const buildServer = require('../src/app');

const testEnv = {
  ...process.env,
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  API_PREFIX: '/api/v1',
  SERVICE_NAME: 'cropsy-api-test',
};

test('GET /api/v1/health returns the standard response envelope', async (t) => {
  const app = await buildServer({ env: testEnv, logger: false });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
  assert.equal(response.statusCode, 200);

  const body = response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.service, 'cropsy-api-test');
  assert.match(body.data.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(body.data.uptimeSeconds >= 0);
});

test('GET /api/v1/health/ready reports readiness', async (t) => {
  const app = await buildServer({ env: testEnv, logger: false });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
  assert.equal(response.statusCode, 200);

  const body = response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ready');
  assert.deepEqual(body.data.checks, { process: 'ok' });
});

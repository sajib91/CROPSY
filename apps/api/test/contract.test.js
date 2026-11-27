const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  apiErrorEnvelopeSchema,
  apiSuccessEnvelopeSchema,
  contractPath,
  requireApiOperation,
} = require('@cropsy/api-contracts');
const {
  collectRoutes,
  generateOpenApi,
  operationsFromSpec,
} = require('../../../scripts/lib/api-contract-generation');
const { createApp } = require('./support/auth-fixtures');

const CONTRACTS_DIR = path.resolve(__dirname, '../../../packages/api-contracts');
const spec = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'openapi.json'), 'utf8'));
const inventory = JSON.parse(
  fs.readFileSync(path.join(CONTRACTS_DIR, 'generated/operations.json'), 'utf8'),
);

function operations() {
  return operationsFromSpec(spec);
}

function operation(method, routePath) {
  const found = spec.paths[routePath]?.[method.toLowerCase()];
  assert.ok(found, `Missing ${method} ${routePath} in OpenAPI spec`);
  return found;
}

function deref(schema) {
  if (!schema?.$ref) return schema;
  const name = schema.$ref.split('/').pop();
  return spec.components.schemas[name];
}

test('OpenAPI 3.1 spec is canonical and versioned', () => {
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.info.title, 'CROPSY Business API');
  assert.deepEqual(
    spec.servers.map((server) => server.url),
    ['/api/v1'],
  );
  assert.deepEqual(spec['x-api-versioning'], {
    active: 'v1',
    supported: ['v1'],
    strategy: 'path-prefix-and-header',
    header: 'X-API-Version',
  });
  assert.equal(spec['x-client-contracts'].mobile.clientValue, 'mobile');
  assert.equal(spec['x-client-contracts'].mobile.transport, 'bearer');
  assert.equal(spec['x-client-contracts'].web.transport, 'cookie');
  assert.equal(spec['x-client-contracts'].web.csrfHeader, 'X-CSRF-Token');
});

test('every registered API route is documented exactly once', async () => {
  const routes = await collectRoutes();
  const published = new Set(operations().map((entry) => `${entry.method} ${entry.path}`));
  const registered = new Set(routes.map((route) => `${route.method} ${route.path}`));

  assert.deepEqual(published, registered);

  const ids = operations().map((entry) => entry.operationId);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z][A-Za-z0-9]*$/);
});

test('generated spec and client inventory are reproducible', async () => {
  assert.deepEqual(await generateOpenApi(), spec);
  assert.equal(inventory.apiVersion, 'v1');
  assert.equal(inventory.basePath, '/api/v1');
  assert.deepEqual(inventory.operations, operations());
});

test('auth and authorization requirements are documented', () => {
  const health = operation('GET', '/health');
  assert.equal(health['x-authorization'].mode, 'public');
  assert.deepEqual(health.security, []);

  const login = operation('POST', '/iam/auth/login');
  assert.equal(login['x-authorization'].mode, 'public');
  assert.equal(login['x-client-contract'].mobile, 'bearer token with client: mobile');

  const products = operation('GET', '/catalog/products');
  assert.equal(products['x-authorization'].mode, 'authenticated');
  assert.deepEqual(products['x-authorization'].permissions, ['products.read']);
  assert.deepEqual(products.security, [{ bearerAuth: [] }, { cookieAuth: [] }]);

  const checkout = operation('POST', '/orders/checkout');
  assert.equal(checkout['x-authorization'].mode, 'authenticated');
  assert.equal(checkout['x-authorization'].csrfForCookieClients, true);

  assert.equal(spec.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.equal(spec.components.securitySchemes.cookieAuth.in, 'cookie');
});

test('request schemas use enforced backend DTOs', () => {
  const login = operation('POST', '/iam/auth/login');
  assert.equal(login.requestBody.required, true);
  const schema = deref(login.requestBody.content['application/json'].schema);
  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, ['identifier', 'password']);
  assert.deepEqual(schema.properties.client.enum, ['web', 'mobile']);

  const createProduct = operation('POST', '/catalog/products');
  assert.equal(createProduct['x-success-status'], 201);
  assert.match(
    createProduct.requestBody.content['application/json'].schema.$ref,
    /^#\/components\/schemas\//,
  );

  const action = operation('POST', '/marketplace/listings/{listingId}/deactivate');
  assert.equal(action.requestBody.required, false);
  assert.equal(
    action.requestBody.content['application/json'].schema.$ref,
    '#/components/schemas/JsonObjectRequest',
  );
});

test('responses document success and standard error envelopes', () => {
  for (const entry of operations()) {
    const responses = spec.paths[entry.path][entry.method.toLowerCase()].responses;
    const success = Object.keys(responses).filter((status) => /^2\d\d$/.test(status));
    assert.ok(success.length > 0, `${entry.operationId} has no success response`);
    assert.equal(
      responses[success[0]].content['application/json'].schema.$ref,
      '#/components/schemas/SuccessEnvelope',
    );
    assert.ok(responses['400'], `${entry.operationId} has no validation error response`);
    assert.equal(responses['400'].$ref, '#/components/responses/Error400');
    assert.ok(responses['500'], `${entry.operationId} has no server error response`);
    if (entry.authorization.mode === 'authenticated') {
      assert.ok(responses['401'], `${entry.operationId} has no authentication error response`);
      assert.ok(responses['403'], `${entry.operationId} has no authorization error response`);
    }
  }
  for (const [name, response] of Object.entries(spec.components.responses)) {
    assert.equal(
      response.content['application/json'].schema.$ref,
      '#/components/schemas/ErrorEnvelope',
    );
    assert.match(name, /^Error\d{3}$/);
  }
});

test('parameters, filtering, sorting, and pagination are documented', () => {
  for (const entry of operations()) {
    const routePath = spec.paths[entry.path][entry.method.toLowerCase()];
    const pathNames = [...entry.path.matchAll(/\{([A-Za-z_][\w]*)\}/g)].map((match) => match[1]);
    const documentedPathNames = routePath.parameters
      .map((parameter) => (parameter.in === 'path' ? parameter.name : null))
      .filter(Boolean);
    assert.deepEqual(documentedPathNames, pathNames);

    const queryNames = routePath.parameters
      .map((parameter) => (parameter.in === 'query' ? parameter.name : null))
      .filter(Boolean);
    assert.deepEqual(queryNames, entry.queryParameters);
    assert.deepEqual(
      routePath['x-filtering'].parameters,
      queryNames.filter((name) => !['limit', 'offset', 'sort'].includes(name)),
    );
    if (queryNames.includes('limit') || queryNames.includes('offset')) {
      assert.equal(routePath['x-pagination'].style, 'offset');
    }
  }

  const listings = operation('GET', '/marketplace/listings');
  assert.deepEqual(listings['x-pagination'].parameters, ['limit', 'offset']);
  assert.deepEqual(listings['x-sorting'].value, ['newest', 'price_asc', 'price_desc', 'distance']);
  assert.ok(listings['x-filtering'].parameters.includes('minPrice'));
});

test('generated client paths resolve concrete and templated operations', () => {
  assert.equal(contractPath('GET', '/marketplace/listings'), '/marketplace/listings');
  assert.equal(
    contractPath('GET', '/iam/auth/users/{userId}', { userId: 'abc-123' }),
    '/iam/auth/users/abc-123',
  );
  assert.deepEqual(requireApiOperation('POST', '/orders/checkout').pathParameters, []);
  assert.throws(() => requireApiOperation('GET', '/not/a/published/route'), /No OpenAPI operation/);
});

test('live responses match the documented envelopes', async (t) => {
  const { app } = await createApp(t);

  const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
  assert.equal(health.statusCode, 200);
  assert.equal(apiSuccessEnvelopeSchema.safeParse(health.json()).success, true);

  const unauthenticated = await app.inject({
    method: 'GET',
    url: '/api/v1/marketplace/listings',
  });
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(apiErrorEnvelopeSchema.safeParse(unauthenticated.json()).success, true);

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/v1/iam/auth/login',
    payload: { identifier: 'nobody@example.com' },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(apiErrorEnvelopeSchema.safeParse(invalid.json()).success, true);
});

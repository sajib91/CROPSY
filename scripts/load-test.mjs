import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const buildServer = require('../apps/api/src/app');
const { AuthStoreToken } = require('../apps/api/src/modules/iam/domain/auth.repository');
const { InMemoryRateLimiter } = require('../apps/api/src/shared/security/rate-limit');

const API_PREFIX = '/api/v1';
const PASSWORD = 'LoadPass123!';
const TEST_SECRET = 'load-test-secret-at-least-32-characters-long';
const AI_SECRET = 'load-test-ai-secret-at-least-32-chars';
const SCENARIO_NAMES = ['auth', 'marketplace', 'products', 'orders', 'inventory', 'ai'];

const AI_GATEWAY_METHODS = [
  'askAi',
  'retrieveAi',
  'recommendAi',
  'submitAiFeedback',
  'describeAiCapabilities',
  'chatAi',
  'createAiConversation',
  'getAiConversation',
  'listAiConversations',
  'evaluateRetrievalAi',
  'runAgenticAi',
  'approveAgenticAi',
  'graphExtractAi',
  'graphBuildAi',
  'graphRetrieveAi',
  'graphContextAi',
  'graphCapabilitiesAi',
  'ingestMultimodalAssetAi',
  'retrieveMultimodalAi',
  'runUnifiedAi',
  'unifiedCapabilitiesAi',
  'evaluateUnifiedAi',
  'analyzeImageAi',
  'imageAnalysisCapabilitiesAi',
  'submitImageFeedbackAi',
  'requestExpertReviewAi',
  'decideExpertReviewAi',
  'getExpertReviewAi',
  'evaluationFrameworkCapabilitiesAi',
  'runEvaluationAi',
  'getEvaluationRunAi',
  'submitEvaluationFeedbackAi',
  'createRegressionBaselineAi',
  'listRegressionBaselinesAi',
  'checkRegressionAi',
  'compareEvaluationsAi',
  'retrievalDiagnosticsAi',
  'failureDashboardAi',
  'agentMonitoringAi',
  'promptVersionsAi',
];

function parseOptions() {
  const { values } = parseArgs({
    options: {
      scenario: { type: 'string', default: 'all' },
      concurrency: { type: 'string', default: '8' },
      duration: { type: 'string', default: '5000' },
      warmup: { type: 'string', default: '1000' },
      seedCount: { type: 'string', default: '200' },
      out: { type: 'string', default: 'docs/performance/load-results.json' },
      maxRequests: { type: 'string' },
    },
    strict: true,
  });

  const scenario = values.scenario;
  if (scenario !== 'all' && !SCENARIO_NAMES.includes(scenario)) {
    throw new Error(
      `Unknown scenario "${scenario}". Choose one of: all, ${SCENARIO_NAMES.join(', ')}.`,
    );
  }

  const positive = (name, raw, fallback) => {
    if (raw === undefined) return fallback;
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`--${name} must be a positive integer.`);
    }
    return value;
  };

  return {
    scenario,
    concurrency: positive('concurrency', values.concurrency, 8),
    durationMs: positive('duration', values.duration, 5000),
    warmupMs: positive('warmup', values.warmup, 1000),
    seedCount: positive('seedCount', values.seedCount, 200),
    maxRequests: positive('maxRequests', values.maxRequests, undefined),
    out: path.resolve(values.out),
  };
}

function environmentInfo() {
  const cpus = os.cpus();
  return {
    generatedAt: new Date().toISOString(),
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    cpuModel: cpus[0]?.model || null,
    logicalCpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    nodeVersion: process.version,
    npmVersion: process.env.npm_config_user_agent || null,
    workingDirectory: process.cwd(),
  };
}

function createFakeAiGateway() {
  const gateway = {};
  for (const method of AI_GATEWAY_METHODS) {
    gateway[method] = async (input) => ({
      operation: method.replace(/Ai$/, ''),
      advisory: true,
      answer: `${method} result`,
      question: input?.question || null,
    });
  }
  return gateway;
}

function loadEnv() {
  const stores = [
    'AUTH_STORE',
    'FARM_STORE',
    'AGRICULTURE_STORE',
    'CATALOG_STORE',
    'MARKETPLACE_STORE',
    'WAREHOUSE_STORE',
    'ORDERS_STORE',
    'PAYMENTS_STORE',
    'LEDGER_STORE',
    'LOGISTICS_STORE',
    'QUALITY_STORE',
    'TRACEABILITY_STORE',
  ];

  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    HOST: '127.0.0.1',
    PORT: '4000',
    API_PREFIX,
    SERVICE_NAME: 'cropsy-load-test',
    ...Object.fromEntries(stores.map((name) => [name, 'memory'])),
    NOTIFICATION_QUEUE_DRIVER: 'memory',
    NOTIFICATION_REALTIME_ENABLED: 'false',
    AUTH_OTP_PROVIDER_MODE: 'preview',
    AUTH_OTP_PREVIEW_CODE_IN_RESPONSE: 'true',
    AUTH_JWT_SECRET: TEST_SECRET,
    AI_SERVICE_SECRET: AI_SECRET,
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: '1000',
    AUTH_RATE_LIMIT_WINDOW_SECONDS: '60',
    AUTH_OTP_RESEND_COOLDOWN_SECONDS: '1',
  };
}

async function createLoadApp() {
  const env = loadEnv();
  const rateLimiter = new InMemoryRateLimiter({ maxAttempts: 1000, windowSeconds: 60 });
  const aiGateway = createFakeAiGateway();
  const app = await buildServer({ env, logger: false, rateLimiter, aiGateway });
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  return { app, baseUrl, env, rateLimiter, aiGateway };
}

async function api(ctx, method, routePath, { token, body, headers = {} } = {}) {
  const response = await fetch(`${ctx.baseUrl}${routePath}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${routePath} failed: ${response.status} ${text.slice(0, 500)}`);
  }
  return JSON.parse(text).data;
}

async function registerUser(ctx, email, roles) {
  const registration = await api(ctx, 'POST', `${API_PREFIX}/iam/auth/register/email`, {
    body: {
      email,
      password: PASSWORD,
      profile: { firstName: 'Load', lastName: 'Tester' },
      requestedRoleCodes: roles,
      client: 'mobile',
    },
  });
  const login = await api(ctx, 'POST', `${API_PREFIX}/iam/auth/login`, {
    body: { identifier: email, password: PASSWORD, client: 'mobile' },
  });
  return { id: registration.user.id, email, token: login.accessToken };
}

async function createTenant(ctx, runId) {
  const admin = await registerUser(ctx, `load-admin-${runId}@example.com`, ['FARMER']);
  const buyer = await registerUser(ctx, `load-buyer-${runId}@example.com`, ['BUYER']);
  const store = ctx.app.cropsyContainer.resolve(AuthStoreToken);
  const organization = await store.createOrganization({
    name: 'Load test organization',
    ownerUserId: admin.id,
  });
  for (const userId of [admin.id, buyer.id]) {
    await store.addOrganizationMember({
      organizationId: organization.id,
      userId,
      status: 'ACTIVE',
    });
  }
  await store.addUserRole({
    userId: admin.id,
    roleCode: 'ORGANIZATION_ADMIN',
    organizationId: organization.id,
    grantedBy: admin.id,
  });
  return { admin, buyer, organization };
}

async function ensureCatalogBasics(ctx, admin, organization) {
  const units = await api(ctx, 'GET', `${API_PREFIX}/catalog/units`, { token: admin.token });
  if (!units.units.some((unit) => unit.code === 'KG')) {
    await api(ctx, 'POST', `${API_PREFIX}/catalog/units`, {
      token: admin.token,
      body: { code: 'KG', name: 'Kilogram', nameBn: 'কিলোগ্রাম', dimension: 'mass' },
    });
  }

  const categories = await api(ctx, 'GET', `${API_PREFIX}/catalog/categories`, {
    token: admin.token,
  });
  let category = categories.categories.find((item) => item.code === 'GRAINS');
  if (!category) {
    category = await api(ctx, 'POST', `${API_PREFIX}/catalog/categories`, {
      token: admin.token,
      body: {
        organizationId: organization.id,
        code: 'GRAINS',
        name: 'Grains',
        nameBn: 'শস্য',
      },
    });
  }

  const grade = await api(ctx, 'POST', `${API_PREFIX}/catalog/quality-grades`, {
    token: admin.token,
    body: { code: 'LOAD-GRADE-A', name: 'Load grade A', nameBn: 'লোড গ্রেড এ' },
  });
  return { category, grade };
}

async function createProduct(ctx, admin, organization, basics, sku, name) {
  return api(ctx, 'POST', `${API_PREFIX}/catalog/products`, {
    token: admin.token,
    body: {
      organizationId: organization.id,
      categoryId: basics.category.id,
      sku,
      name,
      unitCode: 'KG',
      description: `${name} used by load tests.`,
    },
  });
}

async function createListing(ctx, admin, product, basics, overrides = {}) {
  return api(ctx, 'POST', `${API_PREFIX}/marketplace/listings`, {
    token: admin.token,
    body: {
      productId: product.id,
      status: 'ACTIVE',
      title: overrides.title || 'Fresh aromatic rice',
      description: 'Available at the Dhaka wholesale market.',
      unitPrice: overrides.unitPrice ?? 120,
      currency: 'BDT',
      quantityAvailable: overrides.quantityAvailable ?? 1000000,
      minOrderQuantity: 1,
      qualityGradeId: basics.grade.id,
      harvestDate: '2026-11-20',
      availableLocation: 'Dhaka',
      locations: [
        {
          label: 'Dhaka wholesale market',
          latitude: 23.8103,
          longitude: 90.4125,
          radiusMeters: 5000,
        },
      ],
      images: [{ url: 'https://example.com/load-rice.jpg', altText: 'Rice', sortOrder: 0 }],
    },
  });
}

function request(label, method, routePath, token, body) {
  return { label, method, routePath, token, body };
}

function nextReference(prefix, runId, counter) {
  return `${prefix}-${runId}-${counter}`;
}

async function setupScenario(ctx, name, options, runId) {
  if (name === 'auth') {
    await createTenant(ctx, runId);
    const users = [];
    for (let index = 0; index < options.concurrency * 5; index += 1) {
      users.push(`load-login-${runId}-${index}@example.com`);
      await api(ctx, 'POST', `${API_PREFIX}/iam/auth/register/email`, {
        body: {
          email: users[index],
          password: PASSWORD,
          profile: { firstName: 'Load', lastName: 'Login' },
          requestedRoleCodes: ['BUYER'],
          client: 'mobile',
        },
      });
    }
    return {
      emails: users,
      makeRequests(_workerId, iteration, counter) {
        const email = this.emails[counter % this.emails.length];
        return [
          request('login', 'POST', `${API_PREFIX}/iam/auth/login`, null, {
            identifier: email,
            password: PASSWORD,
            client: 'mobile',
          }),
        ];
      },
    };
  }

  if (name === 'marketplace') {
    const tenant = await createTenant(ctx, runId);
    const basics = await ensureCatalogBasics(ctx, tenant.admin, tenant.organization);
    const product = await createProduct(
      ctx,
      tenant.admin,
      tenant.organization,
      basics,
      'LOAD-MARKET-RICE',
      'Load market rice',
    );
    for (let index = 0; index < options.seedCount; index += 1) {
      await createListing(ctx, tenant.admin, product, basics, {
        title: `Aromatic rice listing ${index}`,
        unitPrice: 100 + (index % 50),
      });
    }
    return {
      token: tenant.buyer.token,
      makeRequests() {
        return [
          request(
            'marketplace-search',
            'GET',
            `${API_PREFIX}/marketplace/listings?search=aromatic&categoryCode=GRAINS` +
              '&minPrice=100&maxPrice=200&location=Dhaka&latitude=23.811&longitude=90.413' +
              '&radiusMeters=10000&sort=distance&limit=50',
            this.token,
          ),
        ];
      },
    };
  }

  if (name === 'products') {
    const tenant = await createTenant(ctx, runId);
    const basics = await ensureCatalogBasics(ctx, tenant.admin, tenant.organization);
    for (let index = 0; index < options.seedCount; index += 1) {
      await createProduct(
        ctx,
        tenant.admin,
        tenant.organization,
        basics,
        `LOAD-CATALOG-RICE-${index}`,
        `Load catalog rice ${index}`,
      );
    }
    return {
      token: tenant.buyer.token,
      makeRequests() {
        return [
          request(
            'product-list',
            'GET',
            `${API_PREFIX}/catalog/products?search=${encodeURIComponent('Load catalog')}`,
            this.token,
          ),
        ];
      },
    };
  }

  if (name === 'orders') {
    const tenant = await createTenant(ctx, runId);
    const basics = await ensureCatalogBasics(ctx, tenant.admin, tenant.organization);
    const product = await createProduct(
      ctx,
      tenant.admin,
      tenant.organization,
      basics,
      'LOAD-ORDER-RICE',
      'Load order rice',
    );
    const listing = await createListing(ctx, tenant.admin, product, basics, {
      title: 'Load order aromatic rice',
      unitPrice: 100,
      quantityAvailable: 1000000,
    });
    const store = ctx.app.cropsyContainer.resolve(AuthStoreToken);
    const buyers = [tenant.buyer];
    for (let index = 1; index < options.concurrency; index += 1) {
      const buyer = await registerUser(ctx, `load-order-buyer-${runId}-${index}@example.com`, [
        'BUYER',
      ]);
      await store.addOrganizationMember({
        organizationId: tenant.organization.id,
        userId: buyer.id,
        status: 'ACTIVE',
      });
      buyers.push(buyer);
    }
    return {
      tokens: buyers.map((buyer) => buyer.token),
      listingId: listing.id,
      runId,
      makeRequests(workerId, iteration, counter) {
        const token = this.tokens[workerId % this.tokens.length];
        return [
          request('cart-add', 'POST', `${API_PREFIX}/orders/cart/items`, token, {
            listingId: this.listingId,
            quantity: 1,
          }),
          request('checkout', 'POST', `${API_PREFIX}/orders/checkout`, token, {
            referenceKey: nextReference(`checkout-${workerId}`, this.runId, counter),
          }),
        ];
      },
    };
  }

  if (name === 'inventory') {
    const tenant = await createTenant(ctx, runId);
    const basics = await ensureCatalogBasics(ctx, tenant.admin, tenant.organization);
    const product = await createProduct(
      ctx,
      tenant.admin,
      tenant.organization,
      basics,
      'LOAD-INVENTORY-RICE',
      'Load inventory rice',
    );
    const warehouse = await api(ctx, 'POST', `${API_PREFIX}/warehouse/warehouses`, {
      token: tenant.admin.token,
      body: {
        organizationId: tenant.organization.id,
        code: 'LOAD-WAREHOUSE',
        name: 'Load warehouse',
      },
    });
    const inventory = await api(ctx, 'POST', `${API_PREFIX}/warehouse/inventories`, {
      token: tenant.admin.token,
      body: {
        organizationId: tenant.organization.id,
        warehouseId: warehouse.id,
        productId: product.id,
        batchCode: 'LOAD-BATCH',
        quantity: 1000000,
        unitCode: 'KG',
        lowStockThreshold: 10,
        referenceKey: 'load-stock-register-001',
      },
    });
    return {
      token: tenant.admin.token,
      inventoryId: inventory.id,
      runId,
      makeRequests(workerId, iteration, counter) {
        return [
          request(
            'reservation',
            'POST',
            `${API_PREFIX}/warehouse/inventories/${this.inventoryId}/reservations`,
            this.token,
            {
              quantity: 1,
              referenceKey: nextReference(`reserve-${workerId}`, this.runId, counter),
              reason: 'Load test reservation',
            },
          ),
        ];
      },
    };
  }

  const tenant = await createTenant(ctx, runId);
  return {
    token: tenant.admin.token,
    makeRequests() {
      return [
        request('ai-ask', 'POST', `${API_PREFIX}/intelligence/ai/ask`, this.token, {
          question: 'Which rice variety suits a wet season?',
          language: 'en',
          topK: 3,
        }),
      ];
    },
  };
}

function createAccumulator() {
  return { samples: [], statuses: new Map(), errors: [], byLabel: new Map() };
}

function recordSample(accumulator, sample) {
  accumulator.samples.push(sample.latencyMs);
  const statusKey = String(sample.status);
  accumulator.statuses.set(statusKey, (accumulator.statuses.get(statusKey) || 0) + 1);
  if (!sample.ok) {
    accumulator.errors.push({
      label: sample.label,
      status: sample.status,
      body: sample.body.slice(0, 300),
    });
  }

  let labelStore = accumulator.byLabel.get(sample.label);
  if (!labelStore) {
    labelStore = { samples: [], statuses: new Map(), errors: [] };
    accumulator.byLabel.set(sample.label, labelStore);
  }
  labelStore.samples.push(sample.latencyMs);
  labelStore.statuses.set(statusKey, (labelStore.statuses.get(statusKey) || 0) + 1);
  if (!sample.ok) {
    labelStore.errors.push({ status: sample.status, body: sample.body.slice(0, 300) });
  }
}

async function performRequest(ctx, spec, accumulator) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${ctx.baseUrl}${spec.routePath}`, {
      method: spec.method,
      headers: {
        accept: 'application/json',
        ...(spec.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(spec.token ? { authorization: `Bearer ${spec.token}` } : {}),
      },
      ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    recordSample(accumulator, {
      label: spec.label,
      latencyMs: performance.now() - startedAt,
      status: response.status,
      ok: response.ok,
      body,
    });
  } catch (error) {
    recordSample(accumulator, {
      label: spec.label,
      latencyMs: performance.now() - startedAt,
      status: 'NETWORK_ERROR',
      ok: false,
      body: error instanceof Error ? error.message : String(error),
    });
  }
}

function quantile(sortedValues, fraction) {
  if (sortedValues.length === 0) return null;
  const position = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

function summarize(store, elapsedMs) {
  const sorted = [...store.samples].sort((left, right) => left - right);
  const statuses = Object.fromEntries(
    [...store.statuses.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
  const total = sorted.length;
  const errorCount = store.errors.length;
  return {
    requests: total,
    successes: total - errorCount,
    errors: errorCount,
    errorRate: total === 0 ? null : errorCount / total,
    elapsedMs,
    requestsPerSecond: elapsedMs === 0 ? null : (total / elapsedMs) * 1000,
    minMs: sorted[0] ?? null,
    meanMs: total === 0 ? null : sorted.reduce((sum, value) => sum + value, 0) / total,
    p50Ms: quantile(sorted, 0.5),
    p95Ms: quantile(sorted, 0.95),
    p99Ms: quantile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? null,
    statusHistogram: statuses,
    errorSamples: store.errors.slice(0, 10),
  };
}

async function executePhase(ctx, scenario, options, durationMs) {
  const accumulator = createAccumulator();
  const deadline = performance.now() + durationMs;
  let operationCounter = 0;
  const startGate = Promise.withResolvers();

  const workers = Array.from({ length: options.concurrency }, async (_unused, workerId) => {
    await startGate.promise;
    while (performance.now() < deadline) {
      if (options.maxRequests && operationCounter >= options.maxRequests) break;
      const counter = operationCounter;
      operationCounter += 1;
      const requests = scenario.makeRequests(workerId, counter, counter);
      for (const spec of requests) {
        await performRequest(ctx, spec, accumulator);
      }
    }
  });

  const startedAt = performance.now();
  startGate.resolve();
  await Promise.all(workers);
  const elapsedMs = performance.now() - startedAt;

  return {
    summary: summarize(accumulator, elapsedMs),
    byLabel: Object.fromEntries(
      [...accumulator.byLabel.entries()].map(([label, store]) => [
        label,
        summarize(store, elapsedMs),
      ]),
    ),
  };
}

function formatMs(value) {
  return value === null ? 'n/a' : `${value.toFixed(2)} ms`;
}

function printSummary(name, summary, label, byLabel = {}) {
  console.log(
    `${name.padEnd(12)} ${label.padEnd(9)} ` +
      `n=${String(summary.requests).padStart(6)} ` +
      `rps=${summary.requestsPerSecond?.toFixed(1).padStart(8) || 'n/a'} ` +
      `p50=${formatMs(summary.p50Ms).padStart(11)} ` +
      `p95=${formatMs(summary.p95Ms).padStart(11)} ` +
      `p99=${formatMs(summary.p99Ms).padStart(11)} ` +
      `errors=${summary.errors} ${JSON.stringify(summary.statusHistogram)}`,
  );
  for (const [requestLabel, result] of Object.entries(byLabel)) {
    console.log(
      `  ${requestLabel.padEnd(18)} ` +
        `n=${String(result.requests).padStart(6)} ` +
        `p50=${formatMs(result.p50Ms).padStart(11)} ` +
        `p95=${formatMs(result.p95Ms).padStart(11)} ` +
        `p99=${formatMs(result.p99Ms).padStart(11)} ` +
        `errors=${result.errors}`,
    );
  }
}

async function runScenario(name, options) {
  const ctx = await createLoadApp();
  const runId = Date.now().toString(36);
  try {
    const setupStartedAt = performance.now();
    const scenario = await setupScenario(ctx, name, options, runId);
    const setupMs = performance.now() - setupStartedAt;

    const warmup = await executePhase(
      ctx,
      scenario,
      { ...options, maxRequests: undefined },
      options.warmupMs,
    );
    const measured = await executePhase(ctx, scenario, options, options.durationMs);

    return {
      name,
      setupMs,
      warmup: warmup.summary,
      measured: measured.summary,
      byLabel: measured.byLabel,
      config: {
        concurrency: options.concurrency,
        durationMs: options.durationMs,
        warmupMs: options.warmupMs,
        seedCount: options.seedCount,
        maxRequests: options.maxRequests ?? null,
        stores: 'memory',
        queueDriver: 'memory',
        aiGateway: 'in-process fake',
        baseUrl: 'loopback HTTP socket',
      },
    };
  } finally {
    await ctx.app.close();
  }
}

async function main() {
  const options = parseOptions();
  const scenarioNames = options.scenario === 'all' ? SCENARIO_NAMES : [options.scenario];
  const results = {
    meta: {
      environment: environmentInfo(),
      options,
      measurementNotes: [
        'Latencies were measured around real HTTP fetch calls to a local Fastify listener.',
        'Warmup samples are reported separately and excluded from measured statistics.',
        'Percentiles use linear interpolation over sorted observed latencies.',
        'In-memory stores and fake AI gateway isolate API-layer cost; no Postgres, Redis, or external AI provider was exercised.',
        'Documented product targets are p95 < 500 ms for standard APIs and < 1 s for listing search.',
      ],
    },
    scenarios: [],
  };

  for (const name of scenarioNames) {
    const result = await runScenario(name, options);
    results.scenarios.push(result);
    printSummary(name, result.warmup, 'warmup');
    printSummary(name, result.measured, 'measured', result.byLabel);
    console.log(`  setup=${formatMs(result.setupMs)}\n`);
  }

  await mkdir(path.dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${options.out}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

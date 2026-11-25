const buildServer = require('../../src/app');
const { AuthStoreToken } = require('../../src/modules/iam/domain/auth.repository');
const { InMemoryRateLimiter } = require('../../src/shared/security/rate-limit');

const TEST_SECRET = 'test-secret-at-least-32-characters-long';
const BASE = '/api/v1/iam/auth';

function authTestEnv(overrides = {}) {
  return {
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    API_PREFIX: '/api/v1',
    SERVICE_NAME: 'cropsy-auth-test',
    AUTH_STORE: 'memory',
    AUTH_OTP_PROVIDER_MODE: 'preview',
    AUTH_JWT_SECRET: TEST_SECRET,
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: 1000,
    AUTH_OTP_RESEND_COOLDOWN_SECONDS: 1,
    ...overrides,
  };
}

async function createApp(t, envOverrides = {}) {
  const rateLimiter = new InMemoryRateLimiter({ maxAttempts: 1000, windowSeconds: 60 });
  const app = await buildServer({
    env: authTestEnv(envOverrides),
    logger: false,
    rateLimiter,
  });
  t.after(() => app.close());

  return {
    app,
    store: app.cropsyContainer.resolve(AuthStoreToken),
    rateLimiter,
    env: app.cropsyEnv,
  };
}

async function register(
  app,
  {
    email,
    phone,
    password = 'StrongPass123!',
    roles = ['BUYER'],
    client = 'mobile',
    profile = { firstName: 'Test', lastName: 'User' },
  } = {},
) {
  const url = email ? `${BASE}/register/email` : `${BASE}/register/phone`;
  const response = await app.inject({
    method: 'POST',
    url,
    payload: {
      ...(email ? { email } : { phone }),
      password,
      profile,
      requestedRoleCodes: roles,
      client,
    },
  });
  const body = response.json();
  return {
    response,
    body,
    user: body.data?.user || null,
    code: body.data?.verification?.previewCode || null,
  };
}

async function verifyOtp(app, { channel, purpose, destination, code }) {
  const response = await app.inject({
    method: 'POST',
    url: `${BASE}/otp/verify`,
    payload: { channel, purpose, destination, code },
  });
  return { response, body: response.json() };
}

async function loginUser(app, identifier, password = 'StrongPass123!', client = 'mobile') {
  const response = await app.inject({
    method: 'POST',
    url: `${BASE}/login`,
    payload: { identifier, password, client },
  });
  return { response, body: response.json(), tokens: response.json().data || null };
}

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

function cookieHeader(setCookie) {
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  return values
    .filter(Boolean)
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function createTenantFixture(t) {
  const fixture = await createApp(t);
  const { app, store } = fixture;

  const admin = await register(app, { email: 'admin@example.com', roles: ['FARMER'] });
  const peer = await register(app, { email: 'peer@example.com', roles: ['BUYER'] });
  const sameOrgUser = await register(app, { email: 'same-org@example.com', roles: ['FARMER'] });
  const otherOrgUser = await register(app, { email: 'other-org@example.com', roles: ['BUYER'] });

  const orgA = await store.createOrganization({
    name: 'Tenant A',
    ownerUserId: admin.user.id,
  });
  const orgB = await store.createOrganization({
    name: 'Tenant B',
    ownerUserId: otherOrgUser.user.id,
  });

  for (const userId of [admin.user.id, peer.user.id, sameOrgUser.user.id]) {
    await store.addOrganizationMember({ organizationId: orgA.id, userId, status: 'ACTIVE' });
  }
  await store.addOrganizationMember({
    organizationId: orgB.id,
    userId: otherOrgUser.user.id,
    status: 'ACTIVE',
  });

  await store.addUserRole({
    userId: admin.user.id,
    roleCode: 'ORGANIZATION_ADMIN',
    organizationId: orgA.id,
    grantedBy: admin.user.id,
  });

  const adminLogin = await loginUser(app, 'admin@example.com');
  assertLogin(adminLogin);

  return {
    ...fixture,
    orgA,
    orgB,
    adminId: admin.user.id,
    peerId: peer.user.id,
    sameOrgUserId: sameOrgUser.user.id,
    otherOrgUserId: otherOrgUser.user.id,
    adminToken: adminLogin.tokens.accessToken,
  };
}

function assertLogin(result) {
  if (result.response.statusCode !== 200) {
    throw new Error(`Fixture login failed: ${result.response.statusCode} ${result.response.body}`);
  }
}

module.exports = {
  BASE,
  assertLogin,
  authTestEnv,
  bearer,
  cookieHeader,
  createApp,
  createTenantFixture,
  loginUser,
  register,
  verifyOtp,
};

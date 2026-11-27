const assert = require('node:assert/strict');
const test = require('node:test');

const buildServer = require('../src/app');
const {
  BASE,
  authTestEnv,
  bearer,
  cookieHeader,
  createApp,
  loginUser,
  register,
  verifyOtp,
} = require('./support/auth-fixtures');

const PASSWORD = 'StrongPass123!';

function wrongCode(code) {
  return code === '000000' ? '111111' : '000000';
}

test('email registration, OTP verification, login, and refresh rotation', async (t) => {
  const { app } = await createApp(t);
  const email = 'alice@example.com';

  const registration = await register(app, { email, roles: ['FARMER'] });
  assert.equal(registration.response.statusCode, 201);
  assert.equal(registration.body.data.user.email, email);
  assert.deepEqual(registration.body.data.user.roles, ['FARMER']);
  assert.match(registration.code, /^\d{6}$/);

  const invalid = await verifyOtp(app, {
    channel: 'email',
    purpose: 'EMAIL_VERIFICATION',
    destination: email,
    code: wrongCode(registration.code),
  });
  assert.equal(invalid.response.statusCode, 400);
  assert.equal(invalid.body.meta.details.attemptsRemaining, 4);

  const verified = await verifyOtp(app, {
    channel: 'email',
    purpose: 'EMAIL_VERIFICATION',
    destination: email,
    code: registration.code,
  });
  assert.equal(verified.response.statusCode, 200);
  assert.equal(verified.body.data.verified, true);

  const login = await loginUser(app, email);
  assert.equal(login.response.statusCode, 200);
  const tokens = login.tokens;
  assert.ok(tokens.accessToken && tokens.refreshToken && tokens.csrfToken);
  assert.equal(tokens.tokenType, 'Bearer');

  const me = await app.inject({
    method: 'GET',
    url: `${BASE}/me`,
    headers: bearer(tokens.accessToken),
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().data.user.isEmailVerified, true);
  assert.ok(me.json().data.permissions.includes('profile.read'));

  const rotated = await app.inject({
    method: 'POST',
    url: `${BASE}/refresh`,
    payload: { refreshToken: tokens.refreshToken, client: 'mobile' },
  });
  assert.equal(rotated.statusCode, 200);
  assert.notEqual(rotated.json().data.refreshToken, tokens.refreshToken);

  const reuse = await app.inject({
    method: 'POST',
    url: `${BASE}/refresh`,
    payload: { refreshToken: tokens.refreshToken, client: 'mobile' },
  });
  assert.equal(reuse.statusCode, 401);
  assert.match(reuse.json().meta.message, /reuse detected/);

  const revokedSession = await app.inject({
    method: 'GET',
    url: `${BASE}/me`,
    headers: bearer(rotated.json().data.accessToken),
  });
  assert.equal(revokedSession.statusCode, 401);
  assert.match(revokedSession.json().meta.message, /Session is invalid/);
});

test('registration enforces password policy and rejects privileged self-assignment', async (t) => {
  const { app } = await createApp(t);

  const weak = await register(app, { email: 'weak@example.com', password: 'Short12345' });
  assert.equal(weak.response.statusCode, 400);
  assert.match(weak.body.meta.message, /at least 12 characters/);

  const superAdmin = await register(app, {
    email: 'root@example.com',
    roles: ['CROPSY_SUPER_ADMIN'],
  });
  assert.equal(superAdmin.response.statusCode, 403);
  assert.equal(superAdmin.body.error, 'forbidden');

  const orgAdmin = await register(app, {
    email: 'org-admin@example.com',
    roles: ['ORGANIZATION_ADMIN'],
  });
  assert.equal(orgAdmin.response.statusCode, 403);

  const unknownRole = await register(app, {
    email: 'unknown-role@example.com',
    roles: ['NOT_A_ROLE'],
  });
  assert.equal(unknownRole.response.statusCode, 403);
});

test('OTP verification is attempt-bounded and verified codes are single-use', async (t) => {
  const { app } = await createApp(t, { AUTH_OTP_MAX_ATTEMPTS: 3 });
  const email = 'bounded@example.com';
  const registration = await register(app, { email });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const failed = await verifyOtp(app, {
      channel: 'email',
      purpose: 'EMAIL_VERIFICATION',
      destination: email,
      code: wrongCode(registration.code),
    });
    assert.equal(failed.response.statusCode, 400);
  }

  const exhausted = await verifyOtp(app, {
    channel: 'email',
    purpose: 'EMAIL_VERIFICATION',
    destination: email,
    code: registration.code,
  });
  assert.equal(exhausted.response.statusCode, 429);
  assert.match(exhausted.body.meta.message, /attempt limit/);

  const phone = '+8801712345678';
  const phoneRegistration = await register(app, { phone, roles: ['BUYER'] });
  assert.equal(phoneRegistration.response.statusCode, 201);
  assert.equal(phoneRegistration.body.data.user.email, null);
  assert.equal(phoneRegistration.body.data.user.phone, phone);

  const payload = {
    channel: 'phone',
    purpose: 'PHONE_VERIFICATION',
    destination: phone,
    code: phoneRegistration.code,
  };
  assert.equal((await verifyOtp(app, payload)).response.statusCode, 200);
  assert.equal((await verifyOtp(app, payload)).response.statusCode, 400);
});

test('password reset, deactivation, and recovery restore a usable account', async (t) => {
  const { app } = await createApp(t);
  const email = 'recovery@example.com';

  const registration = await register(app, { email });
  await verifyOtp(app, {
    channel: 'email',
    purpose: 'EMAIL_VERIFICATION',
    destination: email,
    code: registration.code,
  });
  const initialLogin = await loginUser(app, email);
  assert.equal(initialLogin.response.statusCode, 200);

  const forgot = await app.inject({
    method: 'POST',
    url: `${BASE}/forgot-password`,
    payload: { identifier: email },
  });
  assert.equal(forgot.statusCode, 200);
  const resetCode = forgot.json().data.previewCode;
  assert.match(resetCode, /^\d{6}$/);

  const resetOtp = await verifyOtp(app, {
    channel: 'email',
    purpose: 'PASSWORD_RESET',
    destination: email,
    code: resetCode,
  });
  assert.equal(resetOtp.response.statusCode, 200);
  const resetToken = resetOtp.body.data.resetToken;

  const reset = await app.inject({
    method: 'POST',
    url: `${BASE}/reset-password`,
    payload: { resetToken, newPassword: 'ResetPass123!' },
  });
  assert.equal(reset.statusCode, 200);
  assert.ok(reset.json().data.sessionsRevoked >= 1);

  assert.equal((await loginUser(app, email, PASSWORD)).response.statusCode, 401);
  const afterReset = await loginUser(app, email, 'ResetPass123!');
  assert.equal(afterReset.response.statusCode, 200);

  const deactivated = await app.inject({
    method: 'POST',
    url: `${BASE}/deactivate`,
    headers: bearer(afterReset.tokens.accessToken),
    payload: { reason: 'temporary leave' },
  });
  assert.equal(deactivated.statusCode, 200);
  assert.equal((await loginUser(app, email, 'ResetPass123!')).response.statusCode, 401);

  const recoveryRequest = await app.inject({
    method: 'POST',
    url: `${BASE}/reactivate/request`,
    payload: { identifier: email },
  });
  assert.equal(recoveryRequest.statusCode, 200);
  const recoveryCode = recoveryRequest.json().data.previewCode;

  const recoveryOtp = await verifyOtp(app, {
    channel: 'email',
    purpose: 'ACCOUNT_RECOVERY',
    destination: email,
    code: recoveryCode,
  });
  assert.equal(recoveryOtp.response.statusCode, 200);

  const reactivated = await app.inject({
    method: 'POST',
    url: `${BASE}/reactivate`,
    payload: { recoveryToken: recoveryOtp.body.data.recoveryToken, newPassword: 'Recovered123!' },
  });
  assert.equal(reactivated.statusCode, 200);
  assert.equal((await loginUser(app, email, 'Recovered123!')).response.statusCode, 200);
});

test('web clients receive HttpOnly cookies and CSRF is required for mutations', async (t) => {
  const { app } = await createApp(t);
  const email = 'web@example.com';
  await register(app, { email, client: 'web' });

  const login = await loginUser(app, email, PASSWORD, 'web');
  assert.equal(login.response.statusCode, 200);
  const setCookie = login.response.headers['set-cookie'];
  assert.ok(setCookie);
  assert.ok(setCookie.some((value) => /cropsy_access=/.test(value) && /HttpOnly/.test(value)));
  assert.ok(setCookie.some((value) => /cropsy_refresh=/.test(value) && /HttpOnly/.test(value)));

  const cookie = cookieHeader(setCookie);
  const me = await app.inject({
    method: 'GET',
    url: `${BASE}/me`,
    headers: { cookie },
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().data.user.email, email);

  const payload = { currentPassword: PASSWORD, newPassword: 'AnotherPass123!' };
  const blocked = await app.inject({
    method: 'POST',
    url: `${BASE}/change-password`,
    headers: { cookie },
    payload,
  });
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.json().meta.details.code, 'csrf_token_mismatch');

  const allowed = await app.inject({
    method: 'POST',
    url: `${BASE}/change-password`,
    headers: { cookie, 'x-csrf-token': login.tokens.csrfToken },
    payload,
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().data.changed, true);
});

test('default-deny blocks protected routes while public health stays available', async (t) => {
  const { app } = await createApp(t);

  const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
  assert.equal(health.statusCode, 200);

  const protectedRoute = await app.inject({ method: 'GET', url: `${BASE}/sessions` });
  assert.equal(protectedRoute.statusCode, 401);

  const forged = await app.inject({
    method: 'GET',
    url: `${BASE}/me`,
    headers: bearer('forged.token.value'),
  });
  assert.equal(forged.statusCode, 401);
  assert.equal(forged.json().error, 'unauthorized');
});

test('OTP login issues a session once and rejects replayed login tokens', async (t) => {
  const { app } = await createApp(t);
  const email = 'otp-login@example.com';

  const registration = await register(app, { email, roles: ['BUYER'] });
  assert.equal(registration.response.statusCode, 201);

  const requested = await app.inject({
    method: 'POST',
    url: `${BASE}/otp/request`,
    payload: { channel: 'email', purpose: 'LOGIN', destination: email },
  });
  assert.equal(requested.statusCode, 200, requested.body);
  assert.match(requested.json().data.previewCode, /^\d{6}$/);

  const verified = await verifyOtp(app, {
    channel: 'email',
    purpose: 'LOGIN',
    destination: email,
    code: requested.json().data.previewCode,
  });
  assert.equal(verified.response.statusCode, 200, verified.response.body);
  const loginToken = verified.body.data.loginToken;
  assert.ok(loginToken);

  const login = await app.inject({
    method: 'POST',
    url: `${BASE}/login/otp`,
    payload: { loginToken, client: 'mobile', deviceName: 'Test phone' },
  });
  assert.equal(login.statusCode, 200, login.body);
  assert.ok(login.json().data.accessToken);
  assert.ok(login.json().data.sessionId);

  const me = await app.inject({
    method: 'GET',
    url: `${BASE}/me`,
    headers: bearer(login.json().data.accessToken),
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().data.user.email, email);

  const replay = await app.inject({
    method: 'POST',
    url: `${BASE}/login/otp`,
    payload: { loginToken, client: 'mobile' },
  });
  assert.equal(replay.statusCode, 401);
  assert.equal(replay.json().error, 'unauthorized');
});

test('sessions support listing, targeted revocation, logout, and logout-all', async (t) => {
  const { app } = await createApp(t);
  const email = 'sessions@example.com';

  const registration = await register(app, { email, roles: ['BUYER'] });
  assert.equal(registration.response.statusCode, 201);

  const first = await loginUser(app, email);
  const secondLogin = await app.inject({
    method: 'POST',
    url: `${BASE}/login`,
    payload: { identifier: email, password: PASSWORD, client: 'mobile', deviceName: 'Second' },
  });
  const thirdLogin = await app.inject({
    method: 'POST',
    url: `${BASE}/login`,
    payload: { identifier: email, password: PASSWORD, client: 'mobile', deviceName: 'Third' },
  });
  assert.equal(secondLogin.statusCode, 200, secondLogin.body);
  assert.equal(thirdLogin.statusCode, 200, thirdLogin.body);
  const second = secondLogin.json().data;
  const third = thirdLogin.json().data;

  const sessions = await app.inject({
    method: 'GET',
    url: `${BASE}/sessions`,
    headers: bearer(second.accessToken),
  });
  assert.equal(sessions.statusCode, 200, sessions.body);
  assert.equal(sessions.json().data.sessions.length, 3);
  assert.equal(sessions.json().data.sessions.filter((session) => session.isCurrent).length, 1);
  assert.equal(
    sessions.json().data.sessions.find((session) => session.isCurrent).id,
    second.sessionId,
  );

  const devices = await app.inject({
    method: 'GET',
    url: `${BASE}/devices`,
    headers: bearer(second.accessToken),
  });
  assert.equal(devices.statusCode, 200);
  assert.deepEqual(
    devices.json().data.devices.map((session) => session.id),
    sessions.json().data.sessions.map((session) => session.id),
  );

  const otherEmail = 'other-sessions@example.com';
  await register(app, { email: otherEmail, roles: ['BUYER'] });
  const other = await loginUser(app, otherEmail);
  assert.equal(other.response.statusCode, 200);

  const crossUserRevoke = await app.inject({
    method: 'DELETE',
    url: `${BASE}/sessions/${first.tokens.sessionId}`,
    headers: bearer(other.tokens.accessToken),
  });
  assert.equal(crossUserRevoke.statusCode, 403);

  const revoked = await app.inject({
    method: 'DELETE',
    url: `${BASE}/sessions/${first.tokens.sessionId}`,
    headers: bearer(second.accessToken),
  });
  assert.equal(revoked.statusCode, 200, revoked.body);
  assert.equal(revoked.json().data.revoked, true);
  assert.equal(revoked.json().data.sessionId, first.tokens.sessionId);

  const revokedToken = await app.inject({
    method: 'GET',
    url: `${BASE}/me`,
    headers: bearer(first.tokens.accessToken),
  });
  assert.equal(revokedToken.statusCode, 401);
  assert.equal(
    (await app.inject({ method: 'GET', url: `${BASE}/me`, headers: bearer(second.accessToken) }))
      .statusCode,
    200,
  );

  const logout = await app.inject({
    method: 'POST',
    url: `${BASE}/logout`,
    headers: bearer(second.accessToken),
  });
  assert.equal(logout.statusCode, 200, logout.body);
  assert.equal(logout.json().data.loggedOut, true);
  assert.ok(logout.json().data.sessionsRevoked >= 1);
  assert.equal(
    (await app.inject({ method: 'GET', url: `${BASE}/me`, headers: bearer(second.accessToken) }))
      .statusCode,
    401,
  );
  const staleRefresh = await app.inject({
    method: 'POST',
    url: `${BASE}/refresh`,
    payload: { refreshToken: second.refreshToken, client: 'mobile' },
  });
  assert.equal(staleRefresh.statusCode, 401);

  const beforeGlobal = await app.inject({
    method: 'GET',
    url: `${BASE}/sessions`,
    headers: bearer(third.accessToken),
  });
  assert.equal(beforeGlobal.statusCode, 200);
  assert.equal(beforeGlobal.json().data.sessions.length, 3);
  assert.ok(beforeGlobal.json().data.sessions.some((session) => session.revokedAt));

  const logoutAll = await app.inject({
    method: 'POST',
    url: `${BASE}/logout-all`,
    headers: bearer(third.accessToken),
  });
  assert.equal(logoutAll.statusCode, 200, logoutAll.body);
  assert.equal(logoutAll.json().data.loggedOut, true);
  assert.ok(logoutAll.json().data.sessionsRevoked >= 1);
  assert.equal(
    (await app.inject({ method: 'GET', url: `${BASE}/me`, headers: bearer(third.accessToken) }))
      .statusCode,
    401,
  );

  const freshLogin = await loginUser(app, email);
  assert.equal(freshLogin.response.statusCode, 200);
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: `${BASE}/me`,
        headers: bearer(freshLogin.tokens.accessToken),
      })
    ).statusCode,
    200,
  );
});

test('authorized callers can list roles, permissions, and organization memberships', async (t) => {
  const { app, store } = await createApp(t);
  const email = 'rbac-reads@example.com';
  const registration = await register(app, { email, roles: ['FARMER'] });
  assert.equal(registration.response.statusCode, 201);
  await store.addUserRole({
    userId: registration.user.id,
    roleCode: 'CROPSY_SUPER_ADMIN',
    grantedBy: registration.user.id,
  });

  const login = await loginUser(app, email);
  assert.equal(login.response.statusCode, 200);
  const headers = bearer(login.tokens.accessToken);

  const roles = await app.inject({ method: 'GET', url: `${BASE}/roles`, headers });
  assert.equal(roles.statusCode, 200, roles.body);
  assert.ok(roles.json().data.roles.length > 0);

  const permissions = await app.inject({ method: 'GET', url: `${BASE}/permissions`, headers });
  assert.equal(permissions.statusCode, 200, permissions.body);
  assert.ok(
    permissions
      .json()
      .data.permissions.some((permission) => permission.code === 'notifications.manage'),
  );

  const matrix = await app.inject({ method: 'GET', url: `${BASE}/matrix`, headers });
  assert.equal(matrix.statusCode, 200);
  assert.ok(matrix.json().data.matrix.length > 0);

  const organizations = await app.inject({ method: 'GET', url: `${BASE}/organizations`, headers });
  assert.equal(organizations.statusCode, 200);
  assert.ok(Array.isArray(organizations.json().data.organizations));
});

test('auth rate limits ignore client-supplied forwarding headers', async (t) => {
  const app = await buildServer({
    env: authTestEnv({ AUTH_RATE_LIMIT_MAX_ATTEMPTS: 3 }),
    logger: false,
  });
  t.after(() => app.close());

  const attempt = (forwardedFor) =>
    app.inject({
      method: 'POST',
      url: `${BASE}/login`,
      headers: { 'x-forwarded-for': forwardedFor },
      remoteAddress: '198.51.100.10',
      payload: {
        identifier: 'rate-limit-target@example.com',
        password: 'WrongPassword123!',
        client: 'mobile',
      },
    });

  assert.equal((await attempt('203.0.113.1')).statusCode, 401);
  assert.equal((await attempt('203.0.113.2')).statusCode, 401);
  assert.equal((await attempt('203.0.113.3')).statusCode, 401);

  const blocked = await attempt('203.0.113.4');
  assert.equal(blocked.statusCode, 429);
  assert.match(blocked.json().meta.message, /Too many attempts/);
});

test('verification OTP requests do not reveal whether an account exists', async (t) => {
  const { app, store } = await createApp(t);
  const email = 'otp-enumeration@example.com';
  const created = await store.createUser({
    email,
    phone: null,
    passwordHash: 'not-used-for-otp-request',
    profile: { firstName: 'Otp', lastName: 'Enumeration' },
    roleCodes: ['FARMER'],
  });
  assert.ok(created.id);

  const requestOtp = (destination) =>
    app.inject({
      method: 'POST',
      url: `${BASE}/otp/request`,
      payload: {
        channel: 'email',
        purpose: 'EMAIL_VERIFICATION',
        destination,
      },
    });

  const known = await requestOtp(email);
  const unknown = await requestOtp('not-registered@example.com');
  assert.equal(known.statusCode, 200);
  assert.equal(unknown.statusCode, 200);

  const knownBody = { ...known.json().data };
  const unknownBody = { ...unknown.json().data };
  const knownExpiresAt = knownBody.expiresAt;
  const unknownExpiresAt = unknownBody.expiresAt;
  delete knownBody.previewCode;
  delete unknownBody.previewCode;
  delete knownBody.expiresAt;
  delete unknownBody.expiresAt;
  assert.deepEqual(unknownBody, knownBody);
  assert.ok(Math.abs(Date.parse(unknownExpiresAt) - Date.parse(knownExpiresAt)) < 5000);
});

test('OTP preview codes are returned only when explicitly enabled for tests', async (t) => {
  const app = await buildServer({
    env: authTestEnv({ AUTH_OTP_PREVIEW_CODE_IN_RESPONSE: 'false' }),
    logger: false,
  });
  t.after(() => app.close());

  const registration = await register(app, {
    email: 'no-preview@example.com',
    roles: ['FARMER'],
  });
  assert.equal(registration.response.statusCode, 201);
  assert.equal(registration.body.data.verification.previewCode, undefined);

  const requested = await app.inject({
    method: 'POST',
    url: `${BASE}/otp/request`,
    payload: { channel: 'email', purpose: 'LOGIN', destination: 'no-preview@example.com' },
  });
  assert.equal(requested.statusCode, 200);
  assert.equal(requested.json().data.previewCode, undefined);
});

test('any-permission checks stop after the first grant', async (t) => {
  const { app, store } = await createApp(t);
  const email = 'any-permission@example.com';
  const registration = await register(app, { email, roles: ['FARMER'] });
  assert.equal(registration.response.statusCode, 201);

  const organization = await store.createOrganization({
    name: 'Any permission organization',
    ownerUserId: registration.user.id,
  });
  await store.addOrganizationMember({
    organizationId: organization.id,
    userId: registration.user.id,
    status: 'ACTIVE',
  });
  await store.addUserRole({
    userId: registration.user.id,
    roleCode: 'ORGANIZATION_ADMIN',
    organizationId: organization.id,
    grantedBy: registration.user.id,
  });

  const login = await loginUser(app, email);
  assert.equal(login.response.statusCode, 200);
  const summary = await app.inject({
    method: 'GET',
    url: `${BASE}/users/${registration.user.id}`,
    headers: bearer(login.tokens.accessToken),
  });
  assert.equal(summary.statusCode, 200);

  const decisions = await store.listAudit({ action: 'iam.authz.allowed' });
  const anyPermissionGrants = decisions.filter((entry) =>
    ['users.read', 'profile.read'].includes(entry.after?.permission),
  );
  assert.equal(anyPermissionGrants.length, 1);
  assert.equal(anyPermissionGrants[0].after.permission, 'users.read');
});

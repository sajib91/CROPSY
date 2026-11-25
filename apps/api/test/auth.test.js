const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BASE,
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

const AUTH_BASE = '/api/auth';
const USERS_BASE = '/api/users';
const ORGANIZATIONS_BASE = '/api/organizations';

export function channelForIdentifier(value) {
  return String(value || '').includes('@') ? 'email' : 'phone';
}

export class AuthError extends Error {
  constructor({ message, code, details, status, retryAfterSeconds }) {
    super(message || 'The request could not be completed.');
    this.name = 'AuthError';
    this.code = code || 'request_failed';
    this.details = details || {};
    this.status = status || 0;
    this.retryAfterSeconds = retryAfterSeconds || null;
  }
}

function toAuthError(response, body, fallback) {
  const meta = body?.meta || {};
  const details = meta.details || {};
  const retryAfter = details.retryAfterSeconds ?? meta.retryAfterSeconds;

  return new AuthError({
    code: body?.error || 'request_failed',
    message: meta.message || fallback,
    details,
    status: response.status,
    retryAfterSeconds: Number.isFinite(Number(retryAfter)) ? Number(retryAfter) : null,
  });
}

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request(base, path, { method = 'GET', body, retry = true } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseBody(response);

  if (!response.ok) {
    const error = toAuthError(response, payload, 'The request could not be completed.');
    const canRefresh =
      retry &&
      response.status === 401 &&
      path !== '/refresh' &&
      path !== '/login' &&
      path !== '/login/otp';

    if (canRefresh) {
      try {
        await request(AUTH_BASE, '/refresh', {
          method: 'POST',
          body: { client: 'web' },
          retry: false,
        });
        return request(base, path, { method, body, retry: false });
      } catch {
        // Keep the original error; the retry already failed to renew the session.
      }
    }

    throw error;
  }

  return payload?.data;
}

const authRequest = (path, options) => request(AUTH_BASE, path, options);
const usersRequest = (path, options) => request(USERS_BASE, path, options);
const organizationsRequest = (path, options) => request(ORGANIZATIONS_BASE, path, options);

export async function getSession() {
  const session = await authRequest('/session');
  if (session?.authenticated || !session?.hasRefresh) return session;

  try {
    await authRequest('/refresh', { method: 'POST', body: { client: 'web' }, retry: false });
    return await authRequest('/session', { retry: false });
  } catch {
    return session;
  }
}

export function getPurposeState() {
  return authRequest('/purpose');
}

export function registerAccount({
  channel,
  destination,
  password,
  profile,
  requestedRoleCodes = [],
}) {
  const payload = {
    password,
    profile,
    requestedRoleCodes,
    client: 'web',
    deviceName: 'Web browser',
    ...(channel === 'email' ? { email: destination } : { phone: destination }),
  };

  return authRequest(`/register/${channel}`, { method: 'POST', body: payload, retry: false });
}

export function requestOtp({ channel, purpose, destination }) {
  return authRequest('/otp/request', {
    method: 'POST',
    body: { channel, purpose, destination },
    retry: false,
  });
}

export function verifyOtp({ channel, purpose, destination, code }) {
  return authRequest('/otp/verify', {
    method: 'POST',
    body: { channel, purpose, destination, code },
    retry: false,
  });
}

export function login({ identifier, password }) {
  return authRequest('/login', {
    method: 'POST',
    body: { identifier, password, client: 'web', deviceName: 'Web browser' },
    retry: false,
  });
}

export function loginWithOtp() {
  return authRequest('/login/otp', {
    method: 'POST',
    body: { client: 'web', deviceName: 'Web browser' },
    retry: false,
  });
}

export function refreshSession() {
  return authRequest('/refresh', {
    method: 'POST',
    body: { client: 'web' },
    retry: false,
  });
}

export function switchOrganization(organizationId) {
  return organizationsRequest('/switch', {
    method: 'POST',
    body: { organizationId },
    retry: false,
  });
}

export function logout() {
  return authRequest('/logout', { method: 'POST', retry: false });
}

export function forgotPassword({ identifier }) {
  return authRequest('/forgot-password', { method: 'POST', body: { identifier }, retry: false });
}

export function resetPassword({ newPassword }) {
  return authRequest('/reset-password', {
    method: 'POST',
    body: { newPassword },
    retry: false,
  });
}

export function changePassword({ currentPassword, newPassword, revokeOtherSessions = true }) {
  return authRequest('/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword, revokeOtherSessions },
  });
}

export function deactivateAccount(reason) {
  return authRequest('/deactivate', {
    method: 'POST',
    body: reason ? { reason } : {},
  });
}

export function getSessions() {
  return authRequest('/sessions');
}

export function revokeSession(sessionId) {
  return authRequest(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

export function logoutAll() {
  return authRequest('/logout-all', { method: 'POST' });
}

export function getUserProfile() {
  return usersRequest('/me');
}

export function getRoleProfiles() {
  return usersRequest('/me/role-profiles');
}

export function getFarmerProfile() {
  return usersRequest('/me/farmer-profile');
}

export function upsertRoleProfile(roleCode, data, organizationId) {
  return usersRequest(`/me/roles/${encodeURIComponent(roleCode)}/profile`, {
    method: 'PUT',
    body: { data, ...(organizationId ? { organizationId } : {}) },
  });
}

export function upsertFarmerProfile(data) {
  return usersRequest('/me/farmer-profile', { method: 'PUT', body: data });
}

export function updateUserProfile(profile) {
  return usersRequest('/me/profile', { method: 'PATCH', body: profile });
}

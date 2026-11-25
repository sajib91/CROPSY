const { ForbiddenError, UnauthorizedError } = require('../kernel/errors');
const { parseCookies } = require('../security/cookies');

const PUBLIC_ROUTE_PATTERNS = Object.freeze([
  /^\/?$/,
  /^\/health(?:\/ready)?$/,
  /^\/version$/,
  /^\/modules(?:\/[^/]+)?$/,
  /^\/observability$/,
  /^\/iam\/auth\/register\/(?:email|phone)$/,
  /^\/iam\/auth\/otp\/(?:request|verify)$/,
  /^\/iam\/auth\/login(?:\/otp)?$/,
  /^\/iam\/auth\/refresh$/,
  /^\/iam\/auth\/forgot-password$/,
  /^\/iam\/auth\/reset-password$/,
  /^\/iam\/auth\/reactivate(?:\/request)?$/,
  /^\/iam\/auth\/logout$/,
  /^\/[^/]+\/info(?:\/[^/]+)?$/,
]);

function routeAuthConfig(request) {
  const routeConfig = request.routeOptions?.config || request.routeConfig || {};
  return Object.prototype.hasOwnProperty.call(routeConfig, 'auth') ? routeConfig.auth : undefined;
}

function relativePath(request, apiPrefix) {
  const pathname = request.url.split('?')[0];
  if (pathname === apiPrefix) return '/';
  if (pathname.startsWith(`${apiPrefix}/`)) return pathname.slice(apiPrefix.length);
  return pathname;
}

function isPublicRoute(request, apiPrefix) {
  const config = routeAuthConfig(request);
  if (config === false || config === 'public') return true;
  const path = relativePath(request, apiPrefix);
  return PUBLIC_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
}

function bearerToken(request) {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function requestCredentials(request, env) {
  const bearer = bearerToken(request);
  if (bearer) return { token: bearer, via: 'bearer' };

  const cookies = parseCookies(request.headers.cookie);
  const cookie = cookies[env.AUTH_COOKIE_ACCESS_NAME];
  if (cookie) return { token: cookie, via: 'cookie' };
  return { token: null, via: null };
}

function refreshTokenFromRequest(request, env) {
  const cookies = parseCookies(request.headers.cookie);
  return cookies[env.AUTH_COOKIE_REFRESH_NAME] || null;
}

function requestedOrganizationId(request) {
  const header = request.headers['x-organization-id'];
  const raw = Array.isArray(header) ? header[0] : header;
  const candidates = [raw, request.query?.organizationId, request.params?.organizationId];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

function requireAuthenticated(request) {
  if (!request.auth || !request.auth.user) {
    throw new UnauthorizedError({ message: 'Authentication is required.' });
  }
  return request.auth;
}

function hasPermission(auth, permission) {
  return Boolean(auth && auth.permissions && auth.permissions.includes(permission));
}

function requirePermission(request, permission, options = {}) {
  const auth = requireAuthenticated(request);
  if (auth.isSuperAdmin && options.allowSuperAdmin !== false) {
    return { allowed: true, permission, reason: 'super_admin' };
  }
  if (hasPermission(auth, permission)) {
    return { allowed: true, permission, reason: 'granted' };
  }
  throw new ForbiddenError({
    message: `Missing required permission '${permission}'.`,
    details: { permission },
  });
}

function requireAnyPermission(request, permissions) {
  const auth = requireAuthenticated(request);
  if (auth.isSuperAdmin) return { allowed: true, permissions, reason: 'super_admin' };
  const granted = permissions.find((permission) => hasPermission(auth, permission));
  if (granted) return { allowed: true, permission: granted, reason: 'granted' };
  throw new ForbiddenError({
    message: 'None of the required permissions are granted.',
    details: { required: permissions },
  });
}

function requireOrganizationScope(request, expectedOrganizationId) {
  const auth = requireAuthenticated(request);
  if (auth.isSuperAdmin) return auth.organizationId || expectedOrganizationId || null;
  if (!auth.organizationId) {
    throw new ForbiddenError({
      message: 'An active organization context is required.',
      details: { code: 'organization_context_required' },
    });
  }
  if (expectedOrganizationId && expectedOrganizationId !== auth.organizationId) {
    throw new ForbiddenError({
      message: 'Access to the requested organization is denied.',
      details: { code: 'cross_organization_access_denied' },
    });
  }
  return auth.organizationId;
}

function requireOwnership(request, ownerUserId, options = {}) {
  const auth = requireAuthenticated(request);
  if (auth.user.id === ownerUserId) return { allowed: true, reason: 'owner' };
  if (auth.isSuperAdmin && options.allowSuperAdmin !== false) {
    return { allowed: true, reason: 'super_admin' };
  }
  if (options.permission && hasPermission(auth, options.permission)) {
    return { allowed: true, reason: 'organization_permission' };
  }
  throw new ForbiddenError({
    message: 'Access to this resource is denied.',
    details: { code: 'resource_ownership_denied' },
  });
}

function requireCsrf(request) {
  const auth = requireAuthenticated(request);
  if (auth.via !== 'cookie') return true;
  const supplied = Array.isArray(request.headers['x-csrf-token'])
    ? request.headers['x-csrf-token'][0]
    : request.headers['x-csrf-token'];
  if (!supplied || supplied !== auth.csrfToken) {
    throw new ForbiddenError({
      message: 'A valid CSRF token is required for cookie-authenticated mutations.',
      details: { code: 'csrf_token_mismatch' },
    });
  }
  return true;
}

module.exports = {
  PUBLIC_ROUTE_PATTERNS,
  bearerToken,
  hasPermission,
  isPublicRoute,
  refreshTokenFromRequest,
  relativePath,
  requestCredentials,
  requestedOrganizationId,
  requireAnyPermission,
  requireAuthenticated,
  requireCsrf,
  requireOrganizationScope,
  requireOwnership,
  requirePermission,
  routeAuthConfig,
};

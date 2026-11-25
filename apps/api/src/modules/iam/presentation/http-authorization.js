const {
  isPublicRoute,
  relativePath,
  requestCredentials,
  requireCsrf,
  requireOrganizationScope,
  routeAuthConfig,
} = require('../../../shared/http/authorization');
const { ForbiddenError, UnauthorizedError } = require('../../../shared/kernel/errors');
const { AuthorizationServiceToken } = require('../application/tokens');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Default-deny HTTP authorization boundary. Public routes are explicitly
 * allowlisted in the shared route policy; every other route requires a valid
 * access token, a live server-side session, and any declared permissions.
 */
function registerHttpAuthorization(app) {
  const env = app.cropsyEnv;
  const authorization = () => app.cropsyContainer.resolve(AuthorizationServiceToken);

  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request) => {
    if (isPublicRoute(request, env.API_PREFIX)) {
      request.auth = null;
      // Logout is public because a stale access token must not block revocation,
      // but cookie-based logout still requires CSRF protection.
      if (relativePath(request, env.API_PREFIX) === '/iam/auth/logout') {
        const credentials = requestCredentials(request, env);
        if (credentials.token) {
          try {
            request.auth = await authorization().authenticateAccessToken(credentials.token, {
              via: credentials.via,
              request,
            });
            if (credentials.via === 'cookie') requireCsrf(request);
          } catch {
            request.auth = null;
          }
        }
      }
      return;
    }

    const credentials = requestCredentials(request, env);
    if (!credentials.token) {
      throw new UnauthorizedError({ message: 'Authentication is required.' });
    }

    request.auth = await authorization().authenticateAccessToken(credentials.token, {
      via: credentials.via,
      request,
    });

    if (!SAFE_METHODS.has(request.method) && credentials.via === 'cookie') {
      requireCsrf(request);
    }
  });

  app.addHook('preHandler', async (request) => {
    if (isPublicRoute(request, env.API_PREFIX)) return;
    const policy = routeAuthConfig(request);
    if (!policy || typeof policy !== 'object') return;
    const service = authorization();

    for (const permission of policy.permissions || []) {
      await service.assertPermission(request.auth, permission);
    }

    if (Array.isArray(policy.anyPermissions) && policy.anyPermissions.length > 0) {
      const decisions = [];
      let allowed = false;
      for (const permission of policy.anyPermissions) {
        const decision = await service.checkPermission(request.auth, permission);
        decisions.push(decision);
        if (decision.allowed) allowed = true;
      }
      if (!allowed) {
        throw new ForbiddenError({
          message: 'None of the required permissions are granted.',
          details: { required: policy.anyPermissions, decisions },
        });
      }
    }

    if (policy.organizationScope) {
      requireOrganizationScope(request);
    }
  });
}

module.exports = { registerHttpAuthorization };

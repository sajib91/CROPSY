const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const { clearAuthCookies, setAuthCookies } = require('../../../shared/security/cookies');
const {
  refreshTokenFromRequest,
  requestCredentials,
  requireAuthenticated,
  requireCsrf,
} = require('../../../shared/http/authorization');
const { validate } = require('../../../shared/validation/validate');
const dto = require('../application/auth.dto');
const { AuthServiceToken } = require('../application/tokens');
const { AuthorizationServiceToken } = require('../application/tokens');

const accessCheckSchema = z
  .object({
    permission: z.string().trim().min(1),
    organizationId: z.string().uuid().optional(),
  })
  .strict();

const userIdParamsSchema = z.object({ userId: z.string().uuid() }).strict();
const organizationIdParamsSchema = z.object({ organizationId: z.string().uuid() }).strict();

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

function issueCookies(reply, tokens, request) {
  const env = request.server.cropsyEnv;
  if (tokens.client === 'web') setAuthCookies(reply, tokens, env, request);
  return tokens;
}

module.exports = async function authRoutes(fastify) {
  const auth = fastify.cropsyContainer.resolve(AuthServiceToken);
  const authorization = fastify.cropsyContainer.resolve(AuthorizationServiceToken);
  const env = fastify.cropsyEnv;

  fastify.post('/register/email', { config: { auth: false } }, async (request, reply) => {
    const input = validate(dto.registerEmailSchema, request.body, 'email registration');
    const result = await auth.register({ kind: 'email', input, request });
    return reply.code(201).send(ok(result, meta(request)));
  });

  fastify.post('/register/phone', { config: { auth: false } }, async (request, reply) => {
    const input = validate(dto.registerPhoneSchema, request.body, 'phone registration');
    const result = await auth.register({ kind: 'phone', input, request });
    return reply.code(201).send(ok(result, meta(request)));
  });

  fastify.post('/otp/request', { config: { auth: false } }, async (request) => {
    const input = validate(dto.otpRequestSchema, request.body, 'OTP request');
    return ok(await auth.requestOtp({ input, request }), meta(request));
  });

  fastify.post('/otp/verify', { config: { auth: false } }, async (request) => {
    const input = validate(dto.otpVerifySchema, request.body, 'OTP verification');
    return ok(await auth.verifyOtp({ input, request }), meta(request));
  });

  fastify.post('/login', { config: { auth: false } }, async (request, reply) => {
    const input = validate(dto.loginSchema, request.body, 'login');
    const tokens = await auth.login({ input, request });
    issueCookies(reply, tokens, request);
    return ok(tokens, meta(request));
  });

  fastify.post('/login/otp', { config: { auth: false } }, async (request, reply) => {
    const input = validate(dto.loginOtpSchema, request.body, 'OTP login');
    const tokens = await auth.loginWithOtp({ input, request });
    issueCookies(reply, tokens, request);
    return ok(tokens, meta(request));
  });

  fastify.post('/refresh', { config: { auth: false } }, async (request, reply) => {
    const input = validate(dto.refreshSchema, request.body || {}, 'refresh');
    const refreshToken = input.refreshToken || refreshTokenFromRequest(request, env);
    const tokens = await auth.refresh({ input: { ...input, refreshToken }, request });
    issueCookies(reply, tokens, request);
    return ok(tokens, meta(request));
  });

  fastify.post('/logout', { config: { auth: false } }, async (request, reply) => {
    const credentials = requestCredentials(request, env);
    if (credentials.via === 'cookie') requireCsrf(request);
    const refreshToken = refreshTokenFromRequest(request, env);
    const result = await auth.logout({
      accessToken: credentials.token,
      via: credentials.via,
      refreshToken,
      request,
    });
    clearAuthCookies(reply, env, request);
    return ok(result, meta(request));
  });

  fastify.post('/logout-all', { config: { auth: {} } }, async (request, reply) => {
    const context = requireAuthenticated(request);
    const result = await auth.logoutAll({ context, request });
    clearAuthCookies(reply, env, request);
    return ok(result, meta(request));
  });

  fastify.get('/me', { config: { auth: {} } }, async (request) =>
    ok(auth.me(requireAuthenticated(request)), meta(request)),
  );

  fastify.get('/sessions', { config: { auth: {} } }, async (request) => {
    const context = requireAuthenticated(request);
    return ok({ sessions: await auth.listSessions(context) }, meta(request));
  });

  fastify.get('/devices', { config: { auth: {} } }, async (request) => {
    const context = requireAuthenticated(request);
    return ok({ devices: await auth.listSessions(context) }, meta(request));
  });

  fastify.delete('/sessions/:sessionId', { config: { auth: {} } }, async (request) => {
    const context = requireAuthenticated(request);
    const { sessionId } = validate(dto.sessionIdSchema, request.params, 'session id');
    return ok(await auth.revokeSession({ context, sessionId, request }), meta(request));
  });

  fastify.post('/forgot-password', { config: { auth: false } }, async (request) => {
    const input = validate(dto.forgotPasswordSchema, request.body, 'forgot password');
    return ok(await auth.forgotPassword({ input, request }), meta(request));
  });

  fastify.post('/reset-password', { config: { auth: false } }, async (request) => {
    const input = validate(dto.resetPasswordSchema, request.body, 'password reset');
    return ok(await auth.resetPassword({ input, request }), meta(request));
  });

  fastify.post('/change-password', { config: { auth: {} } }, async (request) => {
    const context = requireAuthenticated(request);
    const input = validate(dto.changePasswordSchema, request.body, 'password change');
    return ok(await auth.changePassword({ context, input, request }), meta(request));
  });

  fastify.post('/deactivate', { config: { auth: {} } }, async (request, reply) => {
    const context = requireAuthenticated(request);
    const input = validate(dto.deactivateSchema, request.body || {}, 'deactivation');
    const result = await auth.deactivate({ context, input, request });
    clearAuthCookies(reply, env, request);
    return ok(result, meta(request));
  });

  fastify.post('/reactivate/request', { config: { auth: false } }, async (request) => {
    const input = validate(dto.reactivateRequestSchema, request.body, 'recovery request');
    return ok(await auth.reactivateRequest({ input, request }), meta(request));
  });

  fastify.post('/reactivate', { config: { auth: false } }, async (request) => {
    const input = validate(dto.reactivateSchema, request.body, 'account recovery');
    return ok(await auth.reactivate({ input, request }), meta(request));
  });

  fastify.get('/organizations', { config: { auth: {} } }, async (request) => {
    const context = requireAuthenticated(request);
    return ok({ organizations: auth.listOrganizations(context) }, meta(request));
  });

  fastify.get(
    '/organizations/:organizationId/members',
    { config: { auth: { permissions: ['organizations.read'], organizationScope: true } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId } = validate(
        organizationIdParamsSchema,
        request.params,
        'organization id',
      );
      await authorization.assertOrganization(context, organizationId);
      return ok(
        {
          organizationId,
          members: await auth.getOrganizationMembers(organizationId),
        },
        meta(request),
      );
    },
  );

  fastify.get(
    '/users/:userId',
    { config: { auth: { anyPermissions: ['users.read', 'profile.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { userId } = validate(userIdParamsSchema, request.params, 'user id');
      await authorization.assertUserAccess(context, userId, ['users.read', 'profile.read']);
      return ok(await auth.getUserSummary(userId), meta(request));
    },
  );

  fastify.post(
    '/users/:userId/roles',
    { config: { auth: { permissions: ['roles.manage'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { userId } = validate(userIdParamsSchema, request.params, 'user id');
      const input = validate(dto.assignRoleSchema, request.body, 'role assignment');
      await authorization.assertUserAccess(context, userId, ['roles.manage', 'users.manage']);
      return ok(await auth.assignRole({ context, userId, ...input, request }), meta(request));
    },
  );

  fastify.get('/audit', { config: { auth: { permissions: ['audit.read'] } } }, async (request) => {
    const context = requireAuthenticated(request);
    const filter = validate(dto.auditQuerySchema, request.query, 'audit query');
    const events = await authorization.listAuthorizedAudit(context, filter);
    return ok({ events }, meta(request));
  });

  fastify.get('/access/check', { config: { auth: {} } }, async (request) => {
    const context = requireAuthenticated(request);
    const input = validate(accessCheckSchema, request.query, 'access check');
    if (input.organizationId) await authorization.assertOrganization(context, input.organizationId);
    const decision = await authorization.checkPermission(context, input.permission);
    return ok(decision, meta(request));
  });

  fastify.get(
    '/roles',
    { config: { auth: { permissions: ['permissions.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      return ok({ roles: auth.listRoles(context) }, meta(request));
    },
  );

  fastify.get(
    '/permissions',
    { config: { auth: { permissions: ['permissions.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      return ok({ permissions: auth.listPermissions(context) }, meta(request));
    },
  );

  fastify.get(
    '/matrix',
    { config: { auth: { permissions: ['permissions.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      return ok({ matrix: auth.permissionMatrix(context) }, meta(request));
    },
  );

  fastify.put(
    '/roles/:roleCode/permissions',
    { config: { auth: { permissions: ['roles.manage'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { roleCode } = validate(dto.roleCodeSchema, request.params, 'role code');
      const input = validate(dto.rolePermissionSchema, request.body, 'role permissions');
      return ok(
        await auth.updateRolePermissions({
          context,
          roleCode,
          permissionCodes: input.permissions,
          request,
        }),
        meta(request),
      );
    },
  );
};

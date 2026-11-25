const {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} = require('../../../shared/kernel/errors');
const { normalizeRoleCode } = require('../domain/auth-policy');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function permissionsFromAssignment(assignment) {
  const role = assignment.role || {};
  const grants = Array.isArray(role.permissions)
    ? role.permissions
    : Array.isArray(assignment.permissions)
      ? assignment.permissions
      : [];
  return [
    ...new Set(
      grants
        .map((grant) => (typeof grant === 'string' ? grant : grant?.permission?.code))
        .filter(Boolean),
    ),
  ];
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email || null,
    phone: user.phone || null,
    accountStatus: user.account_status,
    isEmailVerified: Boolean(user.is_email_verified),
    isPhoneVerified: Boolean(user.is_phone_verified),
    lastLoginAt: user.last_login_at || null,
  };
}

class AuthorizationService {
  constructor({ store, tokenManager, policy, eventBus, logger, env }) {
    if (!store || !tokenManager || !policy) {
      throw new TypeError('AuthorizationService requires store, tokenManager, and policy.');
    }
    this.store = store;
    this.tokenManager = tokenManager;
    this.policy = policy;
    this.eventBus = eventBus;
    this.logger = logger;
    this.env = env;
  }

  async buildContext({
    user,
    session,
    _sessionTokenHash,
    via = 'bearer',
    csrfToken = null,
    requestedOrganizationId = null,
    token = null,
  }) {
    const roleAssignments = await this.store.listUserRoles(user.id);
    const roles = roleAssignments
      .filter((assignment) => assignment.role)
      .map((assignment) => ({
        code: assignment.role_code || assignment.role.code,
        scope: assignment.role.scope,
        organizationId: assignment.organization_id || null,
        permissions: permissionsFromAssignment(assignment),
      }));

    const organizations = await this.store.listOrganizationMemberships(user.id);
    const organizationIds = organizations.map((membership) => membership.organization_id);
    const isSuperAdmin = roles.some(
      (role) => role.code === 'CROPSY_SUPER_ADMIN' && !role.organizationId,
    );

    let activeOrganizationId = null;
    if (requestedOrganizationId) {
      if (!UUID_PATTERN.test(requestedOrganizationId)) {
        throw new ForbiddenError({
          message: 'Invalid organization context.',
          details: { code: 'invalid_organization_context' },
        });
      }
      const organization = await this.store.findOrganization(requestedOrganizationId);
      if (!organization || organization.deleted_at) {
        throw new NotFoundError({ message: 'Organization was not found.' });
      }
      if (!isSuperAdmin && !organizationIds.includes(requestedOrganizationId)) {
        throw new ForbiddenError({
          message: 'Access to the requested organization is denied.',
          details: { code: 'cross_organization_access_denied' },
        });
      }
      activeOrganizationId = requestedOrganizationId;
    } else if (!isSuperAdmin && organizationIds.length > 0) {
      activeOrganizationId = organizationIds[0];
    }

    const permissions = new Set();
    for (const role of roles) {
      if (!role.organizationId) {
        role.permissions.forEach((permission) => permissions.add(permission));
      }
    }
    for (const role of roles) {
      if (role.organizationId && role.organizationId === activeOrganizationId) {
        role.permissions.forEach((permission) => permissions.add(permission));
      }
    }
    if (isSuperAdmin) {
      this.policy.permissions.forEach((permission) => permissions.add(permission.code));
    }

    return {
      user: publicUser(user),
      session: session ? { ...session } : null,
      roles,
      organizations: organizations.map((membership) => ({
        id: membership.organization_id,
        name: membership.organization?.name || null,
        roleCodes: membership.roleCodes || [],
        permissions: membership.permissions || [],
      })),
      organizationIds,
      organizationId: activeOrganizationId,
      permissions: [...permissions].sort(),
      isSuperAdmin,
      via,
      csrfToken,
      token,
    };
  }

  async authenticateAccessToken(token, { via = 'bearer', request } = {}) {
    const payload = this.tokenManager.verifyAccessToken(token);

    const session = await this.store.findSession(payload.sid);
    if (
      !session ||
      session.revoked_at ||
      new Date(session.expires_at).getTime() <= Date.now() ||
      session.session_token_hash !== payload.sth
    ) {
      throw new UnauthorizedError({ message: 'Session is invalid or expired.' });
    }

    const user = await this.store.findUserById(payload.sub);
    if (!user || user.account_status !== 'ACTIVE') {
      throw new UnauthorizedError({ message: 'Account is not active.' });
    }

    await this.store.updateSession(session.id, { last_seen_at: new Date() });

    return this.buildContext({
      user,
      session: { ...session, last_seen_at: new Date() },
      sessionTokenHash: payload.sth,
      via,
      csrfToken: payload.csrf,
      requestedOrganizationId: request ? this.requestedOrganizationId(request) : null,
      token,
    });
  }

  requestedOrganizationId(request) {
    const header = request.headers['x-organization-id'];
    const direct = Array.isArray(header) ? header[0] : header;
    return (
      [direct, request.query?.organizationId, request.params?.organizationId]
        .find((value) => typeof value === 'string' && value.trim().length > 0)
        ?.trim() || null
    );
  }

  serializeContext(context) {
    return {
      user: context.user,
      session: context.session
        ? {
            id: context.session.id,
            expiresAt: context.session.expires_at,
            lastSeenAt: context.session.last_seen_at,
          }
        : null,
      roles: context.roles.map((role) => ({
        code: role.code,
        scope: role.scope,
        organizationId: role.organizationId,
      })),
      organizations: context.organizations,
      organizationId: context.organizationId,
      permissions: context.permissions,
      isSuperAdmin: context.isSuperAdmin,
    };
  }

  async recordDecision(context, { permission, allowed, reason, organizationId, details }) {
    const actorUserId = context?.user?.id || null;
    const audit = {
      organizationId: organizationId || context?.organizationId || null,
      actorUserId,
      action: allowed ? 'iam.authz.allowed' : 'iam.authz.denied',
      entityType: 'authorization',
      entityId: permission || 'resource',
      after: {
        permission: permission || null,
        allowed,
        reason,
        roles: context?.roles?.map((role) => role.code) || [],
        ...(details || {}),
      },
      severity: allowed ? 'INFO' : 'WARN',
    };
    await this.store.appendAudit(audit);
    this.eventBus?.publish({
      type: audit.action,
      moduleId: 'iam',
      aggregateId: actorUserId || 'anonymous',
      payload: audit.after,
    });
    return audit;
  }

  async checkPermission(context, permission, options = {}) {
    if (options.requireOrganization && !context.organizationId && !context.isSuperAdmin) {
      await this.recordDecision(context, {
        permission,
        allowed: false,
        reason: 'organization_context_required',
        organizationId: context.organizationId,
      });
      return { allowed: false, reason: 'organization_context_required', permission };
    }

    if (context.isSuperAdmin) {
      await this.recordDecision(context, {
        permission,
        allowed: true,
        reason: 'super_admin',
        organizationId: context.organizationId,
      });
      return { allowed: true, reason: 'super_admin', permission };
    }

    if (context.permissions.includes(permission)) {
      await this.recordDecision(context, {
        permission,
        allowed: true,
        reason: 'granted',
        organizationId: context.organizationId,
      });
      return { allowed: true, reason: 'granted', permission };
    }

    await this.recordDecision(context, {
      permission,
      allowed: false,
      reason: 'permission_denied',
      organizationId: context.organizationId,
    });
    return { allowed: false, reason: 'permission_denied', permission };
  }

  async assertPermission(context, permission, options = {}) {
    const decision = await this.checkPermission(context, permission, options);
    if (!decision.allowed) {
      throw new ForbiddenError({
        message: `Missing required permission '${permission}'.`,
        details: { permission, reason: decision.reason },
      });
    }
    return decision;
  }

  async assertOrganization(context, organizationId) {
    if (!organizationId) {
      if (context.isSuperAdmin) return null;
      throw new ForbiddenError({
        message: 'An active organization context is required.',
        details: { code: 'organization_context_required' },
      });
    }
    if (!UUID_PATTERN.test(organizationId)) {
      throw new ForbiddenError({
        message: 'Invalid organization context.',
        details: { code: 'invalid_organization_context' },
      });
    }

    const organization = await this.store.findOrganization(organizationId);
    if (!organization || organization.deleted_at) {
      throw new NotFoundError({ message: 'Organization was not found.' });
    }

    if (context.isSuperAdmin) return organization;

    if (
      !context.organizationIds.includes(organizationId) ||
      context.organizationId !== organizationId
    ) {
      await this.recordDecision(context, {
        permission: null,
        allowed: false,
        reason: 'cross_organization_access_denied',
        organizationId,
        details: { requestedOrganizationId: organizationId },
      });
      throw new ForbiddenError({
        message: 'Access to the requested organization is denied.',
        details: { code: 'cross_organization_access_denied' },
      });
    }
    return organization;
  }

  async assertResourceAccess(context, { organizationId, ownerUserId, permissions = [] }) {
    if (organizationId) await this.assertOrganization(context, organizationId);

    const isOwner = Boolean(ownerUserId && context.user.id === ownerUserId);
    const granted = permissions.filter((permission) => context.permissions.includes(permission));
    if (context.isSuperAdmin || isOwner || granted.length > 0) {
      await this.recordDecision(context, {
        permission: permissions[0] || null,
        allowed: true,
        reason: context.isSuperAdmin
          ? 'super_admin'
          : isOwner
            ? 'owner'
            : 'organization_permission',
        organizationId: organizationId || context.organizationId,
        details: { ownerUserId: ownerUserId || null },
      });
      return { allowed: true, isOwner };
    }

    await this.recordDecision(context, {
      permission: permissions[0] || null,
      allowed: false,
      reason: 'resource_access_denied',
      organizationId: organizationId || context.organizationId,
      details: { ownerUserId: ownerUserId || null },
    });
    throw new ForbiddenError({
      message: 'Access to this resource is denied.',
      details: { code: 'resource_access_denied' },
    });
  }

  async organizationIdsForUser(userId) {
    const memberships = await this.store.listOrganizationMemberships(userId);
    const roles = await this.store.listUserRoles(userId);
    return [
      ...new Set([
        ...memberships.map((membership) => membership.organization_id),
        ...roles.map((role) => role.organization_id).filter(Boolean),
      ]),
    ];
  }

  async assertUserAccess(context, userId, permissions) {
    if (context.user.id === userId) {
      return { allowed: true, reason: 'owner', organizationId: context.organizationId };
    }
    if (context.isSuperAdmin) {
      return { allowed: true, reason: 'super_admin', organizationId: context.organizationId };
    }

    const targetOrganizations = await this.organizationIdsForUser(userId);
    const sharedOrganizations = targetOrganizations.filter(
      (organizationId) => organizationId === context.organizationId,
    );
    const granted = permissions.filter((permission) => context.permissions.includes(permission));
    if (sharedOrganizations.length > 0 && granted.length > 0) {
      await this.recordDecision(context, {
        permission: granted[0],
        allowed: true,
        reason: 'organization_permission',
        organizationId: sharedOrganizations[0],
        details: { targetUserId: userId },
      });
      return {
        allowed: true,
        reason: 'organization_permission',
        organizationId: sharedOrganizations[0],
      };
    }

    await this.recordDecision(context, {
      permission: permissions[0] || null,
      allowed: false,
      reason: 'resource_access_denied',
      organizationId: context.organizationId,
      details: { targetUserId: userId, targetOrganizations },
    });
    throw new ForbiddenError({
      message: 'Access to this user is denied.',
      details: { code: 'resource_access_denied' },
    });
  }

  async listAuthorizedAudit(context, filter) {
    await this.assertPermission(context, 'audit.read');
    const organizationId = filter.organizationId || context.organizationId;
    if (!context.isSuperAdmin && !organizationId) {
      throw new ForbiddenError({
        message: 'An active organization context is required.',
        details: { code: 'organization_context_required' },
      });
    }
    if (organizationId) await this.assertOrganization(context, organizationId);
    return this.store.listAudit({ ...filter, organizationId: organizationId || undefined });
  }

  async validateRoleSelection(roleCodes, { allowAdmin = false } = {}) {
    const codes = [...new Set((roleCodes || []).map(normalizeRoleCode).filter(Boolean))];
    const catalog = new Map(this.policy.roles.map((role) => [role.code, role]));
    const allowed = new Set(
      this.env.AUTH_SELF_REGISTERABLE_ROLE_CODES.split(',').map(normalizeRoleCode).filter(Boolean),
    );

    for (const code of codes) {
      const role = catalog.get(code);
      if (!role) throw new ForbiddenError({ message: `Unknown role code '${code}'.` });
      if (!role.selfRegisterable && !(allowAdmin && role.code === 'ORGANIZATION_ADMIN')) {
        throw new ForbiddenError({ message: `Role '${code}' cannot be self-assigned.` });
      }
      if (!allowAdmin && !allowed.has(code)) {
        throw new ForbiddenError({ message: `Role '${code}' is not self-registerable.` });
      }
      if (!role.allowMultiple && codes.length > 1) {
        throw new ForbiddenError({
          message: `Role '${code}' cannot be combined with other roles.`,
        });
      }
    }
    return codes.length ? codes : ['BUYER'];
  }
}

module.exports = { AuthorizationService, permissionsFromAssignment, publicUser };

const { randomUUID } = require('node:crypto');

const { normalizeRoleCode } = require('../domain/auth-policy');

function normalizeIdentifier(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function roleRecord(role) {
  if (!role) return null;
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    name_bn: role.name_bn,
    description: role.description,
    scope: role.scope,
    is_system: role.is_system,
    permissions: (role.permissions || []).map((grant) =>
      typeof grant.permission === 'object' ? grant.permission.code : grant.permission,
    ),
  };
}

function permissionCodesFrom(role) {
  return (role?.permissions || []).map((grant) =>
    typeof grant.permission === 'object' ? grant.permission.code : grant.permission,
  );
}

class IamAuthPrismaRepository {
  constructor({ prisma }) {
    if (!prisma || typeof prisma.$transaction !== 'function') {
      throw new TypeError('IamAuthPrismaRepository requires a Prisma client.');
    }
    this.prisma = prisma;
  }

  async findRoleByCode(code) {
    const role = await this.prisma.role.findUnique({
      where: { code: normalizeRoleCode(code) },
      include: { permissions: { include: { permission: true } } },
    });
    return roleRecord(role);
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { code: 'asc' },
    });
    return roles.map(roleRecord);
  }

  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
    return permissions.map((permission) => ({
      id: permission.id,
      code: permission.code,
      resource: permission.resource,
      action: permission.action,
      description: permission.description,
    }));
  }

  async replaceRolePermissions(code, permissionCodes) {
    const role = await this.prisma.role.findUnique({
      where: { code: normalizeRoleCode(code) },
    });
    if (!role) throw new Error(`Unknown role '${code}'.`);

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: [...new Set(permissionCodes)] } },
    });
    if (permissions.length !== new Set(permissionCodes).size) {
      throw new Error('One or more permission codes are unknown.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { role_id: role.id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          id: randomUUID(),
          role_id: role.id,
          permission_id: permission.id,
        })),
      });
      return {
        id: role.id,
        code: role.code,
        permissions: [...permissionCodes],
      };
    });
  }

  async findUserById(id) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findUserByIdentifier(identifier) {
    const value = normalizeIdentifier(identifier);
    if (!value) return null;
    return this.prisma.user.findFirst({
      where: { OR: [{ email: value }, { phone: value }] },
    });
  }

  async listUsers() {
    return this.prisma.user.findMany({ orderBy: { created_at: 'desc' } });
  }

  async createUser({ email, phone, passwordHash, profile, roleCodes = [], roleAssignments = [] }) {
    const normalizedEmail = email ? normalizeIdentifier(email) : null;
    const normalizedPhone = phone ? String(phone).trim() : null;
    const existing = await this.findUserByIdentifier(normalizedEmail || normalizedPhone);
    if (existing) {
      const error = new Error(
        existing.email === normalizedEmail
          ? 'Email is already registered.'
          : 'Phone is already registered.',
      );
      error.code = existing.email === normalizedEmail ? 'EMAIL_CONFLICT' : 'PHONE_CONFLICT';
      throw error;
    }

    const assignments = roleAssignments.length
      ? roleAssignments
      : roleCodes.map((code) => ({ roleCode: code }));

    const resolved = [];
    for (const assignment of assignments) {
      const role = await this.findRoleByCode(assignment.roleCode);
      if (!role) throw new Error(`Unknown role '${assignment.roleCode}'.`);
      if (role.scope === 'ORGANIZATION' && !assignment.organizationId) {
        throw new Error(`Organization role '${role.code}' requires an organization.`);
      }
      resolved.push({ ...assignment, roleCode: role.code, roleId: role.id });
    }

    return this.prisma.user.create({
      data: {
        id: randomUUID(),
        email: normalizedEmail,
        phone: normalizedPhone,
        password_hash: passwordHash,
        ...(profile
          ? {
              profile: {
                create: {
                  id: randomUUID(),
                  first_name: profile.firstName,
                  last_name: profile.lastName,
                  name_bn: profile.nameBn || null,
                  preferred_language: profile.preferredLanguage || 'EN',
                },
              },
            }
          : {}),
        roles: {
          create: resolved.map((assignment) => ({
            id: randomUUID(),
            role_id: assignment.roleId,
            organization_id: assignment.organizationId || null,
            scope_key: assignment.organizationId || 'PLATFORM',
            granted_by_user_id: assignment.grantedBy || null,
          })),
        },
      },
    });
  }

  async updateUser(id, patch) {
    const allowed = new Set([
      'password_hash',
      'account_status',
      'is_email_verified',
      'is_phone_verified',
      'failed_login_attempts',
      'locked_until',
      'last_login_at',
    ]);
    const data = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key)) throw new Error(`Cannot update user field '${key}'.`);
      data[key] = value;
    }
    return this.prisma.user.update({ where: { id }, data });
  }

  async listUserRoles(userId) {
    const records = await this.prisma.userRole.findMany({
      where: { user_id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    return records.map((record) => ({
      id: record.id,
      user_id: record.user_id,
      role_id: record.role_id,
      role_code: record.role.code,
      organization_id: record.organization_id,
      scope_key: record.scope_key,
      granted_by_user_id: record.granted_by_user_id,
      role: roleRecord(record.role),
    }));
  }

  async addUserRole({ userId, roleCode, organizationId = null, grantedBy = null }) {
    const role = await this.findRoleByCode(roleCode);
    if (!role) throw new Error(`Unknown role '${roleCode}'.`);
    if (role.scope === 'ORGANIZATION' && !organizationId) {
      throw new Error(`Organization role '${role.code}' requires an organization.`);
    }
    const scopeKey = organizationId || 'PLATFORM';
    const existing = await this.prisma.userRole.findFirst({
      where: { user_id: userId, role_id: role.id, scope_key: scopeKey },
    });
    if (existing) return existing;

    return this.prisma.userRole.create({
      data: {
        id: randomUUID(),
        user_id: userId,
        role_id: role.id,
        organization_id: organizationId,
        scope_key: scopeKey,
        granted_by_user_id: grantedBy,
      },
    });
  }

  async createOrganization({ id = randomUUID(), name, status = 'ACTIVE', ownerUserId }) {
    if (!ownerUserId) throw new Error('Creating an organization requires an owner user id.');
    const slug = `${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}-${id.slice(0, 8)}`;
    return this.prisma.organization.create({
      data: { id, name, slug, status, owner_user_id: ownerUserId },
    });
  }

  async findOrganization(id) {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  async addOrganizationMember({ organizationId, userId, status = 'ACTIVE' }) {
    return this.prisma.organizationMember.upsert({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
      update: { status },
      create: {
        id: randomUUID(),
        organization_id: organizationId,
        user_id: userId,
        status,
        joined_at: status === 'ACTIVE' ? new Date() : null,
      },
    });
  }

  async listOrganizationMemberships(userId) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { user_id: userId, status: 'ACTIVE' },
      include: { organization: true },
    });
    const roles = await this.listUserRoles(userId);
    return memberships
      .filter((membership) => membership.organization?.deleted_at === null)
      .map((membership) => {
        const scopedRoles = roles.filter(
          (assignment) => assignment.organization_id === membership.organization_id,
        );
        return {
          id: membership.id,
          organization_id: membership.organization_id,
          user_id: membership.user_id,
          status: membership.status,
          organization: membership.organization,
          roleCodes: scopedRoles.map((assignment) => assignment.role_code),
          permissions: [
            ...new Set(scopedRoles.flatMap((assignment) => permissionCodesFrom(assignment.role))),
          ],
        };
      });
  }

  async listOrganizationMembers(organizationId) {
    const members = await this.prisma.organizationMember.findMany({
      where: { organization_id: organizationId, status: 'ACTIVE' },
      include: { user: true },
    });
    return members.map((member) => ({
      id: member.id,
      organization_id: member.organization_id,
      user_id: member.user_id,
      status: member.status,
      user: member.user,
    }));
  }

  async createOtp({
    userId = null,
    email = null,
    phone = null,
    purpose,
    codeHash,
    maxAttempts = 5,
    expiresAt,
  }) {
    return this.prisma.oTPVerification.create({
      data: {
        id: randomUUID(),
        user_id: userId,
        email: email ? normalizeIdentifier(email) : null,
        phone: phone ? String(phone).trim() : null,
        purpose,
        code_hash: codeHash,
        max_attempts: maxAttempts,
        expires_at: expiresAt,
      },
    });
  }

  async findLatestOtp({ destination = null, purpose, channel, includeConsumed = false }) {
    const field = channel === 'email' ? 'email' : 'phone';
    const value =
      channel === 'email' ? normalizeIdentifier(destination) : String(destination || '').trim();
    return this.prisma.oTPVerification.findFirst({
      where: {
        purpose,
        [field]: value,
        ...(includeConsumed ? {} : { consumed_at: null }),
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOtpById(id) {
    return this.prisma.oTPVerification.findUnique({ where: { id } });
  }

  async updateOtp(id, patch) {
    const allowed = new Set(['attempts', 'consumed_at', 'code_hash']);
    const data = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key)) throw new Error(`Cannot update OTP field '${key}'.`);
      data[key] = value;
    }
    return this.prisma.oTPVerification.update({ where: { id }, data });
  }

  async createSession({
    userId,
    sessionTokenHash,
    ipAddress = null,
    userAgent = null,
    deviceName = null,
    expiresAt,
  }) {
    return this.prisma.session.create({
      data: {
        id: randomUUID(),
        user_id: userId,
        session_token_hash: sessionTokenHash,
        ip_address: ipAddress,
        user_agent: [deviceName, userAgent].filter(Boolean).join(' | ') || null,
        expires_at: expiresAt,
        last_seen_at: new Date(),
      },
    });
  }

  async findSession(id) {
    return this.prisma.session.findUnique({ where: { id } });
  }

  async findSessionByTokenHash(hash) {
    return this.prisma.session.findUnique({ where: { session_token_hash: hash } });
  }

  async updateSession(id, patch) {
    const allowed = new Set(['last_seen_at', 'revoked_at']);
    const data = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key)) throw new Error(`Cannot update session field '${key}'.`);
      data[key] = value;
    }
    return this.prisma.session.update({ where: { id }, data });
  }

  async listSessions(userId) {
    return this.prisma.session.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  async createRefreshToken({ userId, sessionId, tokenHash, expiresAt, rotatedToId = null }) {
    return this.prisma.refreshToken.create({
      data: {
        id: randomUUID(),
        user_id: userId,
        session_id: sessionId,
        token_hash: tokenHash,
        rotated_to_id: rotatedToId,
        expires_at: expiresAt,
      },
    });
  }

  async findRefreshTokenByHash(hash) {
    return this.prisma.refreshToken.findUnique({ where: { token_hash: hash } });
  }

  async findRefreshTokenById(id) {
    return this.prisma.refreshToken.findUnique({ where: { id } });
  }

  async updateRefreshToken(id, patch) {
    const allowed = new Set(['revoked_at', 'rotated_to_id']);
    const data = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key)) throw new Error(`Cannot update refresh token field '${key}'.`);
      data[key] = value;
    }
    return this.prisma.refreshToken.update({ where: { id }, data });
  }

  async revokeRefreshTokensForSession(sessionId) {
    const result = await this.prisma.refreshToken.updateMany({
      where: { session_id: sessionId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return result.count;
  }

  async appendAudit(entry) {
    return this.prisma.auditLog.create({
      data: {
        id: randomUUID(),
        organization_id: entry.organizationId || null,
        actor_user_id: entry.actorUserId || null,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId || null,
        before: entry.before || undefined,
        after: entry.after || undefined,
        ip_address: entry.ipAddress || null,
        user_agent: entry.userAgent || null,
        severity: entry.severity || 'INFO',
      },
    });
  }

  async listAudit({
    organizationId = undefined,
    actorUserId = undefined,
    action = undefined,
    entityType = undefined,
    entityId = undefined,
    limit = 100,
  } = {}) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(organizationId === undefined ? {} : { organization_id: organizationId }),
        ...(actorUserId === undefined ? {} : { actor_user_id: actorUserId }),
        ...(action === undefined ? {} : { action }),
        ...(entityType === undefined ? {} : { entity_type: entityType }),
        ...(entityId === undefined ? {} : { entity_id: entityId }),
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }
}

module.exports = { IamAuthPrismaRepository };

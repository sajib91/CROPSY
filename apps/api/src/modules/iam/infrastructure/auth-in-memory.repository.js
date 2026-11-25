const { randomUUID } = require('node:crypto');

const { createDefaultPolicy, normalizeRoleCode, validatePolicy } = require('../domain/auth-policy');

function copy(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(copy);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  }
  return value;
}

function normalizeIdentifier(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

class IamAuthInMemoryRepository {
  constructor({ policy = createDefaultPolicy() } = {}) {
    this.policy = validatePolicy(policy);
    this.users = new Map();
    this.roles = new Map();
    this.permissions = new Map();
    this.userRoles = [];
    this.organizations = new Map();
    this.organizationMembers = [];
    this.otps = [];
    this.sessions = [];
    this.refreshTokens = [];
    this.audits = [];
    this.seedReferenceData();
  }

  seedReferenceData() {
    for (const permission of this.policy.permissions) {
      this.permissions.set(permission.code, {
        id: randomUUID(),
        ...permission,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
    for (const role of this.policy.roles) {
      this.roles.set(role.code, {
        id: randomUUID(),
        ...role,
        permissions: [...(this.policy.rolePermissions[role.code] || [])],
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }

  async findRoleByCode(code) {
    const role = this.roles.get(normalizeRoleCode(code));
    return role ? copy(role) : null;
  }

  async listRoles() {
    return copy([...this.roles.values()]);
  }

  async listPermissions() {
    return copy([...this.permissions.values()]);
  }

  async replaceRolePermissions(code, permissionCodes) {
    const roleCode = normalizeRoleCode(code);
    const role = this.roles.get(roleCode);
    if (!role) throw new Error(`Unknown role '${code}'.`);
    for (const permission of permissionCodes) {
      if (!this.permissions.has(permission)) {
        throw new Error(`Unknown permission '${permission}'.`);
      }
    }
    role.permissions = [...new Set(permissionCodes)];
    role.updated_at = new Date();
    return copy(role);
  }

  async findUserById(id) {
    const user = this.users.get(id);
    return user ? copy(user) : null;
  }

  async findUserByIdentifier(identifier) {
    const value = normalizeIdentifier(identifier);
    if (!value) return null;
    const user = [...this.users.values()].find(
      (candidate) =>
        normalizeIdentifier(candidate.email) === value ||
        normalizeIdentifier(candidate.phone) === value,
    );
    return user ? copy(user) : null;
  }

  async listUsers() {
    return copy([...this.users.values()]);
  }

  async createUser({ email, phone, passwordHash, profile, roleCodes = [], roleAssignments = [] }) {
    const normalizedEmail = email ? normalizeIdentifier(email) : null;
    const normalizedPhone = phone ? phone.trim() : null;
    if (
      normalizedEmail &&
      [...this.users.values()].some((user) => user.email === normalizedEmail)
    ) {
      const error = new Error('Email is already registered.');
      error.code = 'EMAIL_CONFLICT';
      throw error;
    }
    if (
      normalizedPhone &&
      [...this.users.values()].some((user) => user.phone === normalizedPhone)
    ) {
      const error = new Error('Phone is already registered.');
      error.code = 'PHONE_CONFLICT';
      throw error;
    }

    const now = new Date();
    const user = {
      id: randomUUID(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password_hash: passwordHash,
      account_status: 'ACTIVE',
      is_email_verified: false,
      is_phone_verified: false,
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: null,
      created_at: now,
      updated_at: now,
      profile: profile ? { ...profile, id: randomUUID(), user_id: null } : null,
    };
    this.users.set(user.id, user);

    const assignments = roleAssignments.length
      ? roleAssignments
      : roleCodes.map((code) => ({ roleCode: code }));
    for (const assignment of assignments) {
      await this.addUserRole({
        userId: user.id,
        roleCode: assignment.roleCode,
        organizationId: assignment.organizationId || null,
        grantedBy: assignment.grantedBy || null,
      });
    }
    return copy(user);
  }

  async updateUser(id, patch) {
    const user = this.users.get(id);
    if (!user) throw new Error(`Unknown user '${id}'.`);
    const allowed = new Set([
      'password_hash',
      'account_status',
      'is_email_verified',
      'is_phone_verified',
      'failed_login_attempts',
      'locked_until',
      'last_login_at',
    ]);
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key)) throw new Error(`Cannot update user field '${key}'.`);
      user[key] = value;
    }
    user.updated_at = new Date();
    return copy(user);
  }

  async listUserRoles(userId) {
    return copy(
      this.userRoles
        .filter((assignment) => assignment.user_id === userId)
        .map((assignment) => {
          const role = this.roles.get(assignment.role_code);
          return {
            ...assignment,
            role: role ? { ...role } : null,
          };
        }),
    );
  }

  async addUserRole({ userId, roleCode, organizationId = null, grantedBy = null }) {
    const code = normalizeRoleCode(roleCode);
    const role = this.roles.get(code);
    if (!role) throw new Error(`Unknown role '${roleCode}'.`);
    if (role.scope === 'ORGANIZATION' && !organizationId) {
      throw new Error(`Organization role '${code}' requires an organization.`);
    }
    const scopeKey = organizationId || 'PLATFORM';
    const existing = this.userRoles.find(
      (assignment) =>
        assignment.user_id === userId &&
        assignment.role_code === code &&
        assignment.scope_key === scopeKey,
    );
    if (existing) return copy(existing);

    const assignment = {
      id: randomUUID(),
      user_id: userId,
      role_code: code,
      role_id: role.id,
      organization_id: organizationId,
      scope_key: scopeKey,
      granted_by_user_id: grantedBy,
      created_at: new Date(),
      updated_at: new Date(),
      role: copy(role),
    };
    this.userRoles.push(assignment);
    return copy(assignment);
  }

  async createOrganization({ id = randomUUID(), name, status = 'ACTIVE', ownerUserId = null }) {
    const organization = {
      id,
      name,
      status,
      owner_user_id: ownerUserId,
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.organizations.set(id, organization);
    return copy(organization);
  }

  async findOrganization(id) {
    const organization = this.organizations.get(id);
    return organization ? copy(organization) : null;
  }

  async addOrganizationMember({ organizationId, userId, status = 'ACTIVE' }) {
    const existing = this.organizationMembers.find(
      (member) => member.organization_id === organizationId && member.user_id === userId,
    );
    if (existing) {
      existing.status = status;
      return copy(existing);
    }
    const member = {
      id: randomUUID(),
      organization_id: organizationId,
      user_id: userId,
      status,
      joined_at: status === 'ACTIVE' ? new Date() : null,
      left_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.organizationMembers.push(member);
    return copy(member);
  }

  async listOrganizationMemberships(userId) {
    return copy(
      this.organizationMembers
        .filter((member) => member.user_id === userId && member.status === 'ACTIVE')
        .map((member) => {
          const organization = this.organizations.get(member.organization_id);
          const roles = this.userRoles
            .filter(
              (assignment) =>
                assignment.user_id === userId &&
                assignment.organization_id === member.organization_id,
            )
            .map((assignment) => this.roles.get(assignment.role_code))
            .filter(Boolean);
          return {
            ...member,
            organization: organization ? copy(organization) : null,
            roleCodes: roles.map((role) => role.code),
            permissions: [...new Set(roles.flatMap((role) => role.permissions))],
          };
        })
        .filter((membership) => membership.organization && !membership.organization.deleted_at),
    );
  }

  async listOrganizationMembers(organizationId) {
    return copy(
      this.organizationMembers
        .filter((member) => member.organization_id === organizationId && member.status === 'ACTIVE')
        .map((member) => ({ ...member, user: copy(this.users.get(member.user_id)) })),
    );
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
    const otp = {
      id: randomUUID(),
      user_id: userId,
      email: email ? normalizeIdentifier(email) : null,
      phone: phone ? phone.trim() : null,
      purpose,
      code_hash: codeHash,
      attempts: 0,
      max_attempts: maxAttempts,
      expires_at: expiresAt,
      consumed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.otps.push(otp);
    return copy(otp);
  }

  async findLatestOtp({ destination = null, purpose, channel, includeConsumed = false }) {
    const value = normalizeIdentifier(destination);
    const candidates = this.otps
      .filter((otp) => {
        if (otp.purpose !== purpose) return false;
        if (!includeConsumed && otp.consumed_at) return false;
        if (channel === 'email') return normalizeIdentifier(otp.email) === value;
        if (channel === 'phone')
          return otp.phone === (destination ? String(destination).trim() : null);
        return false;
      })
      .sort((a, b) => b.created_at - a.created_at);
    return candidates.length ? copy(candidates[0]) : null;
  }

  async findOtpById(id) {
    const otp = this.otps.find((candidate) => candidate.id === id);
    return otp ? copy(otp) : null;
  }

  async updateOtp(id, patch) {
    const otp = this.otps.find((candidate) => candidate.id === id);
    if (!otp) throw new Error(`Unknown OTP '${id}'.`);
    Object.assign(otp, patch, { updated_at: new Date() });
    return copy(otp);
  }

  async createSession({
    userId,
    sessionTokenHash,
    ipAddress = null,
    userAgent = null,
    deviceName = null,
    expiresAt,
  }) {
    const session = {
      id: randomUUID(),
      user_id: userId,
      session_token_hash: sessionTokenHash,
      ip_address: ipAddress,
      user_agent: [deviceName, userAgent].filter(Boolean).join(' | ') || null,
      expires_at: expiresAt,
      last_seen_at: new Date(),
      revoked_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.sessions.push(session);
    return copy(session);
  }

  async findSession(id) {
    const session = this.sessions.find((candidate) => candidate.id === id);
    return session ? copy(session) : null;
  }

  async findSessionByTokenHash(hash) {
    const session = this.sessions.find((candidate) => candidate.session_token_hash === hash);
    return session ? copy(session) : null;
  }

  async updateSession(id, patch) {
    const session = this.sessions.find((candidate) => candidate.id === id);
    if (!session) throw new Error(`Unknown session '${id}'.`);
    Object.assign(session, patch, { updated_at: new Date() });
    return copy(session);
  }

  async listSessions(userId) {
    return copy(
      this.sessions
        .filter((session) => session.user_id === userId)
        .sort((a, b) => b.created_at - a.created_at),
    );
  }

  async createRefreshToken({ userId, sessionId, tokenHash, expiresAt, rotatedToId = null }) {
    const token = {
      id: randomUUID(),
      user_id: userId,
      session_id: sessionId,
      token_hash: tokenHash,
      rotated_to_id: rotatedToId,
      expires_at: expiresAt,
      revoked_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.refreshTokens.push(token);
    return copy(token);
  }

  async findRefreshTokenByHash(hash) {
    const token = this.refreshTokens.find((candidate) => candidate.token_hash === hash);
    return token ? copy(token) : null;
  }

  async findRefreshTokenById(id) {
    const token = this.refreshTokens.find((candidate) => candidate.id === id);
    return token ? copy(token) : null;
  }

  async updateRefreshToken(id, patch) {
    const token = this.refreshTokens.find((candidate) => candidate.id === id);
    if (!token) throw new Error(`Unknown refresh token '${id}'.`);
    Object.assign(token, patch, { updated_at: new Date() });
    return copy(token);
  }

  async revokeRefreshTokensForSession(sessionId) {
    let count = 0;
    for (const token of this.refreshTokens) {
      if (token.session_id === sessionId && !token.revoked_at) {
        token.revoked_at = new Date();
        token.updated_at = new Date();
        count += 1;
      }
    }
    return count;
  }

  async appendAudit(entry) {
    const audit = {
      id: randomUUID(),
      organization_id: entry.organizationId || null,
      actor_user_id: entry.actorUserId || null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId || null,
      before: entry.before || null,
      after: entry.after || null,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
      severity: entry.severity || 'INFO',
      created_at: entry.createdAt || new Date(),
    };
    this.audits.push(audit);
    return copy(audit);
  }

  async listAudit({
    organizationId = undefined,
    actorUserId = undefined,
    action = undefined,
    entityType = undefined,
    entityId = undefined,
    limit = 100,
  } = {}) {
    return copy(
      this.audits
        .filter((audit) => organizationId === undefined || audit.organization_id === organizationId)
        .filter((audit) => actorUserId === undefined || audit.actor_user_id === actorUserId)
        .filter((audit) => action === undefined || audit.action === action)
        .filter((audit) => entityType === undefined || audit.entity_type === entityType)
        .filter((audit) => entityId === undefined || audit.entity_id === entityId)
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limit),
    );
  }
}

module.exports = { IamAuthInMemoryRepository };

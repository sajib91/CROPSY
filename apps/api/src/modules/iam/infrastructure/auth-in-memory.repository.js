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

function slugify(name, id) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'organization'}-${id.slice(0, 8)}`;
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
    this.organizationInvitations = [];
    this.organizationAddresses = [];
    this.organizationDocuments = [];
    this.userAddresses = [];
    this.notificationPreferences = [];
    this.roleProfileExtensions = [];
    this.farmerProfiles = [];
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

  async findRoleById(id) {
    const role = [...this.roles.values()].find((candidate) => candidate.id === id);
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
    const normalizedPhone = phone ? String(phone).trim() : null;
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
    const id = randomUUID();
    const user = {
      id,
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
      profile: profile
        ? {
            id: randomUUID(),
            user_id: id,
            first_name: profile.firstName,
            last_name: profile.lastName,
            name_bn: profile.nameBn || null,
            avatar_url: null,
            date_of_birth: null,
            gender: null,
            national_id_hash: null,
            preferred_language: profile.preferredLanguage || 'EN',
            default_currency: 'BDT',
            created_at: now,
            updated_at: now,
          }
        : null,
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
      'email',
      'phone',
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
      if (key === 'email' && value) {
        const conflict = [...this.users.values()].find(
          (candidate) => candidate.id !== id && candidate.email === normalizeIdentifier(value),
        );
        if (conflict) {
          const error = new Error('Email is already registered.');
          error.code = 'EMAIL_CONFLICT';
          throw error;
        }
      }
      if (key === 'phone' && value) {
        const conflict = [...this.users.values()].find(
          (candidate) => candidate.id !== id && candidate.phone === String(value).trim(),
        );
        if (conflict) {
          const error = new Error('Phone is already registered.');
          error.code = 'PHONE_CONFLICT';
          throw error;
        }
      }
      user[key] = key === 'email' && value ? normalizeIdentifier(value) : value;
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

  async removeUserRole({ userId, roleCode, organizationId = null }) {
    const code = normalizeRoleCode(roleCode);
    const scopeKey = organizationId || 'PLATFORM';
    const before = this.userRoles.length;
    this.userRoles = this.userRoles.filter(
      (assignment) =>
        !(
          assignment.user_id === userId &&
          assignment.role_code === code &&
          assignment.scope_key === scopeKey
        ),
    );
    return before - this.userRoles.length;
  }

  async removeUserRolesForOrganization(userId, organizationId) {
    const before = this.userRoles.length;
    this.userRoles = this.userRoles.filter(
      (assignment) =>
        !(assignment.user_id === userId && assignment.organization_id === organizationId),
    );
    return before - this.userRoles.length;
  }

  async createOrganization({
    id = randomUUID(),
    name,
    slug,
    legalName = null,
    taxId = null,
    ownerUserId = null,
    organizationType = 'OTHER',
    description = null,
    website = null,
    contactEmail = null,
    contactPhone = null,
    verificationStatus = 'UNVERIFIED',
    defaultCurrency = 'BDT',
    status = 'ACTIVE',
  }) {
    const normalizedSlug = slug ? String(slug).trim() : slugify(name, id);
    if (
      [...this.organizations.values()].some((organization) => organization.slug === normalizedSlug)
    ) {
      const error = new Error('Organization slug is already in use.');
      error.code = 'SLUG_CONFLICT';
      throw error;
    }
    const now = new Date();
    const organization = {
      id,
      name,
      slug: normalizedSlug,
      legal_name: legalName,
      tax_id: taxId,
      owner_user_id: ownerUserId,
      organization_type: organizationType,
      description,
      website,
      contact_email: contactEmail ? normalizeIdentifier(contactEmail) : null,
      contact_phone: contactPhone ? String(contactPhone).trim() : null,
      verification_status: verificationStatus,
      verification_note: null,
      verified_at: null,
      verified_by_user_id: null,
      default_currency: defaultCurrency,
      status,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    };
    this.organizations.set(id, organization);
    return copy(organization);
  }

  async findOrganization(id) {
    const organization = this.organizations.get(id);
    return organization ? copy(organization) : null;
  }

  async findOrganizationBySlug(slug) {
    const value = String(slug || '').trim();
    const organization = [...this.organizations.values()].find(
      (candidate) => candidate.slug === value,
    );
    return organization ? copy(organization) : null;
  }

  async listOrganizations({
    ownerUserId = undefined,
    organizationType = undefined,
    status = undefined,
    verificationStatus = undefined,
  } = {}) {
    return copy(
      [...this.organizations.values()]
        .filter((organization) => !organization.deleted_at)
        .filter((organization) =>
          ownerUserId === undefined ? true : organization.owner_user_id === ownerUserId,
        )
        .filter((organization) =>
          organizationType === undefined
            ? true
            : organization.organization_type === organizationType,
        )
        .filter((organization) => (status === undefined ? true : organization.status === status))
        .filter((organization) =>
          verificationStatus === undefined
            ? true
            : organization.verification_status === verificationStatus,
        ),
    );
  }

  async updateOrganization(id, patch) {
    const organization = this.organizations.get(id);
    if (!organization) throw new Error(`Unknown organization '${id}'.`);
    const fieldMap = {
      name: 'name',
      slug: 'slug',
      legalName: 'legal_name',
      taxId: 'tax_id',
      organizationType: 'organization_type',
      description: 'description',
      website: 'website',
      contactEmail: 'contact_email',
      contactPhone: 'contact_phone',
      verificationStatus: 'verification_status',
      verificationNote: 'verification_note',
      verifiedAt: 'verified_at',
      verifiedByUserId: 'verified_by_user_id',
      defaultCurrency: 'default_currency',
      status: 'status',
      deletedAt: 'deleted_at',
    };
    for (const [key, value] of Object.entries(patch)) {
      const field = fieldMap[key];
      if (!field) throw new Error(`Cannot update organization field '${key}'.`);
      if (field === 'slug' && value) {
        const conflict = [...this.organizations.values()].find(
          (candidate) => candidate.id !== id && candidate.slug === String(value).trim(),
        );
        if (conflict) {
          const error = new Error('Organization slug is already in use.');
          error.code = 'SLUG_CONFLICT';
          throw error;
        }
      }
      organization[field] = field === 'contact_email' && value ? normalizeIdentifier(value) : value;
    }
    organization.updated_at = new Date();
    return copy(organization);
  }

  async addOrganizationMember({ organizationId, userId, status = 'ACTIVE' }) {
    const existing = this.organizationMembers.find(
      (member) => member.organization_id === organizationId && member.user_id === userId,
    );
    const now = new Date();
    if (existing) {
      existing.status = status;
      existing.joined_at = status === 'ACTIVE' ? existing.joined_at || now : existing.joined_at;
      if (status === 'LEFT') existing.left_at = now;
      existing.updated_at = now;
      return copy(existing);
    }
    const member = {
      id: randomUUID(),
      organization_id: organizationId,
      user_id: userId,
      status,
      joined_at: status === 'ACTIVE' ? now : null,
      left_at: status === 'LEFT' ? now : null,
      created_at: now,
      updated_at: now,
    };
    this.organizationMembers.push(member);
    return copy(member);
  }

  async updateOrganizationMember(organizationId, userId, patch) {
    const member = this.organizationMembers.find(
      (candidate) => candidate.organization_id === organizationId && candidate.user_id === userId,
    );
    if (!member) throw new Error(`Unknown organization member '${userId}'.`);
    const now = new Date();
    if (patch.status !== undefined) {
      member.status = patch.status;
      if (patch.status === 'ACTIVE') member.joined_at = member.joined_at || now;
      if (patch.status === 'LEFT') member.left_at = now;
    }
    if (patch.leftAt !== undefined) member.left_at = patch.leftAt;
    member.updated_at = now;
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

  async createOrganizationInvitation({
    organizationId,
    email,
    roleId,
    roleCode = null,
    invitedByUserId,
    tokenHash,
    status = 'PENDING',
    expiresAt,
  }) {
    const now = new Date();
    const invitation = {
      id: randomUUID(),
      organization_id: organizationId,
      email: normalizeIdentifier(email),
      role_id: roleId,
      role_code: roleCode,
      invited_by_user_id: invitedByUserId,
      token_hash: tokenHash,
      status,
      expires_at: expiresAt,
      accepted_at: null,
      created_at: now,
      updated_at: now,
    };
    if (this.organizationInvitations.some((candidate) => candidate.token_hash === tokenHash)) {
      const error = new Error('Invitation token is already in use.');
      error.code = 'INVITATION_TOKEN_CONFLICT';
      throw error;
    }
    this.organizationInvitations.push(invitation);
    return copy(invitation);
  }

  async findOrganizationInvitationByTokenHash(tokenHash) {
    const invitation = this.organizationInvitations.find(
      (candidate) => candidate.token_hash === tokenHash,
    );
    return invitation ? copy(invitation) : null;
  }

  async listOrganizationInvitations(organizationId, { status = undefined } = {}) {
    return copy(
      this.organizationInvitations
        .filter((invitation) => invitation.organization_id === organizationId)
        .filter((invitation) => (status === undefined ? true : invitation.status === status)),
    );
  }

  async updateOrganizationInvitation(id, patch) {
    const invitation = this.organizationInvitations.find((candidate) => candidate.id === id);
    if (!invitation) throw new Error(`Unknown invitation '${id}'.`);
    const fieldMap = {
      status: 'status',
      acceptedAt: 'accepted_at',
      expiresAt: 'expires_at',
    };
    for (const [key, value] of Object.entries(patch)) {
      const field = fieldMap[key];
      if (!field) throw new Error(`Cannot update invitation field '${key}'.`);
      invitation[field] = value;
    }
    invitation.updated_at = new Date();
    return copy(invitation);
  }

  async createOrganizationAddress({
    organizationId,
    label,
    addressLine1,
    addressLine2 = null,
    city = null,
    divisionId = null,
    districtId = null,
    upazilaId = null,
    unionId = null,
    postalCode = null,
    isPrimary = false,
  }) {
    if (
      this.organizationAddresses.some(
        (address) => address.organization_id === organizationId && address.label === label,
      )
    ) {
      const error = new Error('Organization address label is already in use.');
      error.code = 'ADDRESS_LABEL_CONFLICT';
      throw error;
    }
    const now = new Date();
    if (isPrimary) {
      for (const address of this.organizationAddresses) {
        if (address.organization_id === organizationId) address.is_primary = false;
      }
    }
    const address = {
      id: randomUUID(),
      organization_id: organizationId,
      label,
      address_line_1: addressLine1,
      address_line_2: addressLine2,
      city,
      division_id: divisionId,
      district_id: districtId,
      upazila_id: upazilaId,
      union_id: unionId,
      postal_code: postalCode,
      is_primary: isPrimary,
      created_at: now,
      updated_at: now,
    };
    this.organizationAddresses.push(address);
    return copy(address);
  }

  async listOrganizationAddresses(organizationId) {
    return copy(
      this.organizationAddresses.filter((address) => address.organization_id === organizationId),
    );
  }

  async updateOrganizationAddress(id, patch) {
    const address = this.organizationAddresses.find((candidate) => candidate.id === id);
    if (!address) throw new Error(`Unknown organization address '${id}'.`);
    const fieldMap = {
      label: 'label',
      addressLine1: 'address_line_1',
      addressLine2: 'address_line_2',
      city: 'city',
      divisionId: 'division_id',
      districtId: 'district_id',
      upazilaId: 'upazila_id',
      unionId: 'union_id',
      postalCode: 'postal_code',
      isPrimary: 'is_primary',
    };
    for (const [key, value] of Object.entries(patch)) {
      const field = fieldMap[key];
      if (!field) throw new Error(`Cannot update organization address field '${key}'.`);
      address[field] = value;
    }
    if (address.is_primary) {
      for (const candidate of this.organizationAddresses) {
        if (candidate.id !== id && candidate.organization_id === address.organization_id) {
          candidate.is_primary = false;
        }
      }
    }
    address.updated_at = new Date();
    return copy(address);
  }

  async createUserAddress({
    userId,
    label,
    addressLine1,
    addressLine2 = null,
    city = null,
    divisionId = null,
    districtId = null,
    upazilaId = null,
    unionId = null,
    postalCode = null,
    isPrimary = false,
  }) {
    if (
      this.userAddresses.some((address) => address.user_id === userId && address.label === label)
    ) {
      const error = new Error('Address label is already in use.');
      error.code = 'ADDRESS_LABEL_CONFLICT';
      throw error;
    }
    const now = new Date();
    if (isPrimary) {
      for (const address of this.userAddresses) {
        if (address.user_id === userId) address.is_primary = false;
      }
    }
    const address = {
      id: randomUUID(),
      user_id: userId,
      label,
      address_line_1: addressLine1,
      address_line_2: addressLine2,
      city,
      division_id: divisionId,
      district_id: districtId,
      upazila_id: upazilaId,
      union_id: unionId,
      postal_code: postalCode,
      is_primary: isPrimary,
      created_at: now,
      updated_at: now,
    };
    this.userAddresses.push(address);
    return copy(address);
  }

  async listUserAddresses(userId) {
    return copy(this.userAddresses.filter((address) => address.user_id === userId));
  }

  async updateUserAddress(id, patch) {
    const address = this.userAddresses.find((candidate) => candidate.id === id);
    if (!address) throw new Error(`Unknown user address '${id}'.`);
    const fieldMap = {
      label: 'label',
      addressLine1: 'address_line_1',
      addressLine2: 'address_line_2',
      city: 'city',
      divisionId: 'division_id',
      districtId: 'district_id',
      upazilaId: 'upazila_id',
      unionId: 'union_id',
      postalCode: 'postal_code',
      isPrimary: 'is_primary',
    };
    for (const [key, value] of Object.entries(patch)) {
      const field = fieldMap[key];
      if (!field) throw new Error(`Cannot update user address field '${key}'.`);
      address[field] = value;
    }
    if (address.is_primary) {
      for (const candidate of this.userAddresses) {
        if (candidate.id !== id && candidate.user_id === address.user_id) {
          candidate.is_primary = false;
        }
      }
    }
    address.updated_at = new Date();
    return copy(address);
  }

  async createOrganizationDocument({
    organizationId,
    uploadedByUserId,
    documentType,
    fileName,
    fileUrl,
    mimeType = null,
    sizeBytes = null,
    verificationStatus = 'PENDING',
    notes = null,
  }) {
    const now = new Date();
    const document = {
      id: randomUUID(),
      organization_id: organizationId,
      uploaded_by_user_id: uploadedByUserId,
      document_type: documentType,
      file_name: fileName,
      file_url: fileUrl,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      verification_status: verificationStatus,
      notes,
      created_at: now,
      updated_at: now,
    };
    this.organizationDocuments.push(document);
    return copy(document);
  }

  async listOrganizationDocuments(organizationId) {
    return copy(
      this.organizationDocuments.filter((document) => document.organization_id === organizationId),
    );
  }

  async updateOrganizationDocument(id, patch) {
    const document = this.organizationDocuments.find((candidate) => candidate.id === id);
    if (!document) throw new Error(`Unknown organization document '${id}'.`);
    const allowed = new Set([
      'fileName',
      'fileUrl',
      'mimeType',
      'sizeBytes',
      'verificationStatus',
      'notes',
    ]);
    const fieldMap = {
      fileName: 'file_name',
      fileUrl: 'file_url',
      mimeType: 'mime_type',
      sizeBytes: 'size_bytes',
      verificationStatus: 'verification_status',
      notes: 'notes',
    };
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key)) throw new Error(`Cannot update document field '${key}'.`);
      document[fieldMap[key]] = value;
    }
    document.updated_at = new Date();
    return copy(document);
  }

  async findUserProfile(userId) {
    const user = this.users.get(userId);
    return user?.profile ? copy(user.profile) : null;
  }

  async upsertUserProfile(userId, patch) {
    const user = this.users.get(userId);
    if (!user) throw new Error(`Unknown user '${userId}'.`);
    const fieldMap = {
      firstName: 'first_name',
      lastName: 'last_name',
      nameBn: 'name_bn',
      avatarUrl: 'avatar_url',
      dateOfBirth: 'date_of_birth',
      gender: 'gender',
      nationalIdHash: 'national_id_hash',
      preferredLanguage: 'preferred_language',
      defaultCurrency: 'default_currency',
    };
    const now = new Date();
    if (!user.profile) {
      user.profile = {
        id: randomUUID(),
        user_id: userId,
        first_name: patch.firstName,
        last_name: patch.lastName,
        name_bn: patch.nameBn || null,
        avatar_url: patch.avatarUrl || null,
        date_of_birth: patch.dateOfBirth || null,
        gender: patch.gender || null,
        national_id_hash: patch.nationalIdHash || null,
        preferred_language: patch.preferredLanguage || 'EN',
        default_currency: patch.defaultCurrency || 'BDT',
        created_at: now,
        updated_at: now,
      };
      return copy(user.profile);
    }
    for (const [key, value] of Object.entries(patch)) {
      const field = fieldMap[key];
      if (!field) throw new Error(`Cannot update profile field '${key}'.`);
      user.profile[field] = value;
    }
    user.profile.updated_at = now;
    return copy(user.profile);
  }

  async listNotificationPreferences(userId) {
    return copy(this.notificationPreferences.filter((preference) => preference.user_id === userId));
  }

  async replaceNotificationPreferences(userId, preferences) {
    this.notificationPreferences = this.notificationPreferences.filter(
      (preference) => preference.user_id !== userId,
    );
    const now = new Date();
    for (const preference of preferences) {
      this.notificationPreferences.push({
        id: randomUUID(),
        user_id: userId,
        channel: preference.channel,
        event_type: preference.eventType,
        enabled: preference.enabled !== false,
        created_at: now,
        updated_at: now,
      });
    }
    return this.listNotificationPreferences(userId);
  }

  async findRoleProfileExtension({ userId, roleCode, scopeKey }) {
    const extension = this.roleProfileExtensions.find(
      (candidate) =>
        candidate.user_id === userId &&
        candidate.role_code === normalizeRoleCode(roleCode) &&
        candidate.scope_key === scopeKey,
    );
    return extension ? copy(extension) : null;
  }

  async upsertRoleProfileExtension({ userId, roleCode, organizationId = null, scopeKey, data }) {
    const code = normalizeRoleCode(roleCode);
    const existing = this.roleProfileExtensions.find(
      (candidate) =>
        candidate.user_id === userId &&
        candidate.role_code === code &&
        candidate.scope_key === scopeKey,
    );
    const now = new Date();
    if (existing) {
      existing.data = copy(data);
      existing.updated_at = now;
      return copy(existing);
    }
    const extension = {
      id: randomUUID(),
      user_id: userId,
      role_code: code,
      organization_id: organizationId,
      scope_key: scopeKey,
      data: copy(data),
      created_at: now,
      updated_at: now,
    };
    this.roleProfileExtensions.push(extension);
    return copy(extension);
  }

  async listRoleProfileExtensions(userId) {
    return copy(this.roleProfileExtensions.filter((extension) => extension.user_id === userId));
  }

  async findFarmerProfile(userId) {
    const profile = this.farmerProfiles.find((candidate) => candidate.user_id === userId);
    return profile ? copy(profile) : null;
  }

  async upsertFarmerProfile({
    userId,
    organizationId = null,
    farmerCode,
    verificationStatus,
    farmSizeHectares,
    experienceYears,
    primaryCropId,
  }) {
    const existing = this.farmerProfiles.find((candidate) => candidate.user_id === userId);
    const now = new Date();
    if (existing) {
      const patch = {
        organization_id: organizationId === undefined ? existing.organization_id : organizationId,
        verification_status:
          verificationStatus === undefined ? existing.verification_status : verificationStatus,
        farm_size_hectares:
          farmSizeHectares === undefined ? existing.farm_size_hectares : farmSizeHectares,
        experience_years:
          experienceYears === undefined ? existing.experience_years : experienceYears,
        primary_crop_id: primaryCropId === undefined ? existing.primary_crop_id : primaryCropId,
      };
      Object.assign(existing, patch, { updated_at: now });
      return copy(existing);
    }
    const code = farmerCode || `FRM-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    if (this.farmerProfiles.some((candidate) => candidate.farmer_code === code)) {
      const error = new Error('Farmer code is already in use.');
      error.code = 'FARMER_CODE_CONFLICT';
      throw error;
    }
    const profile = {
      id: randomUUID(),
      user_id: userId,
      organization_id: organizationId,
      farmer_code: code,
      verification_status: verificationStatus || 'UNVERIFIED',
      farm_size_hectares: farmSizeHectares || 0,
      experience_years: experienceYears,
      primary_crop_id: primaryCropId,
      created_at: now,
      updated_at: now,
    };
    this.farmerProfiles.push(profile);
    return copy(profile);
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
      phone: phone ? String(phone).trim() : null,
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

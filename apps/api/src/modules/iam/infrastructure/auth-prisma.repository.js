const { randomUUID } = require('node:crypto');

const { normalizeRoleCode } = require('../domain/auth-policy');

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

function invitationRecord(invitation) {
  if (!invitation) return null;
  return {
    ...invitation,
    roleCode: invitation.role?.code || invitation.role_code || null,
  };
}

function isUniqueViolation(error) {
  return Boolean(error && error.code === 'P2002');
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

  async findRoleById(id) {
    const role = await this.prisma.role.findUnique({
      where: { id },
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

    try {
      return await this.prisma.user.create({
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
    } catch (error) {
      if (isUniqueViolation(error)) {
        const conflict = new Error('Email or phone is already registered.');
        conflict.code = 'IDENTITY_CONFLICT';
        throw conflict;
      }
      throw error;
    }
  }

  async updateUser(id, patch) {
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
    const data = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key)) throw new Error(`Cannot update user field '${key}'.`);
      if ((key === 'email' || key === 'phone') && value) {
        const conflict = await this.prisma.user.findFirst({
          where: {
            id: { not: id },
            OR: [
              ...(key === 'email' ? [{ email: normalizeIdentifier(value) }] : []),
              ...(key === 'phone' ? [{ phone: String(value).trim() }] : []),
            ],
          },
        });
        if (conflict) {
          const error = new Error(
            key === 'email' ? 'Email is already registered.' : 'Phone is already registered.',
          );
          error.code = key === 'email' ? 'EMAIL_CONFLICT' : 'PHONE_CONFLICT';
          throw error;
        }
        data[key] = key === 'email' ? normalizeIdentifier(value) : String(value).trim();
      } else {
        data[key] = value;
      }
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

  async removeUserRole({ userId, roleCode, organizationId = null }) {
    const role = await this.findRoleByCode(roleCode);
    if (!role) return 0;
    const result = await this.prisma.userRole.deleteMany({
      where: {
        user_id: userId,
        role_id: role.id,
        scope_key: organizationId || 'PLATFORM',
      },
    });
    return result.count;
  }

  async removeUserRolesForOrganization(userId, organizationId) {
    const result = await this.prisma.userRole.deleteMany({
      where: { user_id: userId, organization_id: organizationId },
    });
    return result.count;
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
    if (!ownerUserId) throw new Error('Creating an organization requires an owner user id.');
    const normalizedSlug = slug ? String(slug).trim() : slugify(name, id);
    const existing = await this.prisma.organization.findUnique({ where: { slug: normalizedSlug } });
    if (existing) {
      const error = new Error('Organization slug is already in use.');
      error.code = 'SLUG_CONFLICT';
      throw error;
    }
    try {
      return await this.prisma.organization.create({
        data: {
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
          default_currency: defaultCurrency,
          status,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const conflict = new Error('Organization slug is already in use.');
        conflict.code = 'SLUG_CONFLICT';
        throw conflict;
      }
      throw error;
    }
  }

  async findOrganization(id) {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  async findOrganizationBySlug(slug) {
    return this.prisma.organization.findUnique({ where: { slug: String(slug || '').trim() } });
  }

  async listOrganizations({
    ownerUserId = undefined,
    organizationType = undefined,
    status = undefined,
    verificationStatus = undefined,
  } = {}) {
    return this.prisma.organization.findMany({
      where: {
        deleted_at: null,
        ...(ownerUserId === undefined ? {} : { owner_user_id: ownerUserId }),
        ...(organizationType === undefined ? {} : { organization_type: organizationType }),
        ...(status === undefined ? {} : { status }),
        ...(verificationStatus === undefined ? {} : { verification_status: verificationStatus }),
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async updateOrganization(id, patch) {
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
    const data = {};
    for (const [key, value] of Object.entries(patch)) {
      const field = fieldMap[key];
      if (!field) throw new Error(`Cannot update organization field '${key}'.`);
      if (field === 'slug' && value) {
        const conflict = await this.prisma.organization.findFirst({
          where: { id: { not: id }, slug: String(value).trim() },
        });
        if (conflict) {
          const error = new Error('Organization slug is already in use.');
          error.code = 'SLUG_CONFLICT';
          throw error;
        }
      }
      data[field] = field === 'contact_email' && value ? normalizeIdentifier(value) : value;
    }
    try {
      return await this.prisma.organization.update({ where: { id }, data });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const conflict = new Error('Organization slug is already in use.');
        conflict.code = 'SLUG_CONFLICT';
        throw conflict;
      }
      throw error;
    }
  }

  async addOrganizationMember({ organizationId, userId, status = 'ACTIVE' }) {
    return this.prisma.organizationMember.upsert({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
      update: {
        status,
        joined_at: status === 'ACTIVE' ? new Date() : undefined,
        left_at: status === 'LEFT' ? new Date() : null,
      },
      create: {
        id: randomUUID(),
        organization_id: organizationId,
        user_id: userId,
        status,
        joined_at: status === 'ACTIVE' ? new Date() : null,
        left_at: status === 'LEFT' ? new Date() : null,
      },
    });
  }

  async updateOrganizationMember(organizationId, userId, patch) {
    const data = {};
    if (patch.status !== undefined) {
      data.status = patch.status;
      if (patch.status === 'LEFT') data.left_at = new Date();
    }
    if (patch.joinedAt !== undefined) data.joined_at = patch.joinedAt;
    if (patch.leftAt !== undefined) data.left_at = patch.leftAt;
    return this.prisma.organizationMember.update({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
      data,
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
      joined_at: member.joined_at,
      user: member.user,
    }));
  }

  async createOrganizationInvitation({
    organizationId,
    email,
    roleId,
    invitedByUserId,
    tokenHash,
    status = 'PENDING',
    expiresAt,
  }) {
    try {
      return await this.prisma.organizationInvitation.create({
        data: {
          id: randomUUID(),
          organization_id: organizationId,
          email: normalizeIdentifier(email),
          role_id: roleId,
          invited_by_user_id: invitedByUserId,
          token_hash: tokenHash,
          status,
          expires_at: expiresAt,
        },
        include: { role: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const conflict = new Error('Invitation token is already in use.');
        conflict.code = 'INVITATION_TOKEN_CONFLICT';
        throw conflict;
      }
      throw error;
    }
  }

  async findOrganizationInvitationByTokenHash(tokenHash) {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { token_hash: tokenHash },
      include: { role: true },
    });
    return invitationRecord(invitation);
  }

  async listOrganizationInvitations(organizationId, { status = undefined } = {}) {
    const invitations = await this.prisma.organizationInvitation.findMany({
      where: {
        organization_id: organizationId,
        ...(status === undefined ? {} : { status }),
      },
      include: { role: true },
      orderBy: { created_at: 'desc' },
    });
    return invitations.map(invitationRecord);
  }

  async updateOrganizationInvitation(id, patch) {
    const data = {};
    const fieldMap = {
      status: 'status',
      acceptedAt: 'accepted_at',
      expiresAt: 'expires_at',
    };
    for (const [key, value] of Object.entries(patch)) {
      const field = fieldMap[key];
      if (!field) throw new Error(`Cannot update invitation field '${key}'.`);
      data[field] = value;
    }
    const invitation = await this.prisma.organizationInvitation.update({
      where: { id },
      data,
      include: { role: true },
    });
    return invitationRecord(invitation);
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (isPrimary) {
          await tx.organizationAddress.updateMany({
            where: { organization_id: organizationId, is_primary: true },
            data: { is_primary: false },
          });
        }
        return tx.organizationAddress.create({
          data: {
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
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const conflict = new Error('Organization address label is already in use.');
        conflict.code = 'ADDRESS_LABEL_CONFLICT';
        throw conflict;
      }
      throw error;
    }
  }

  async listOrganizationAddresses(organizationId) {
    return this.prisma.organizationAddress.findMany({
      where: { organization_id: organizationId },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
    });
  }

  async updateOrganizationAddress(id, patch) {
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
    const data = {};
    for (const [key, value] of Object.entries(patch)) {
      const field = fieldMap[key];
      if (!field) throw new Error(`Cannot update organization address field '${key}'.`);
      data[field] = value;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const address = await tx.organizationAddress.findUnique({ where: { id } });
        if (!address) throw new Error(`Unknown organization address '${id}'.`);
        if (data.is_primary) {
          await tx.organizationAddress.updateMany({
            where: { organization_id: address.organization_id, id: { not: id }, is_primary: true },
            data: { is_primary: false },
          });
        }
        return tx.organizationAddress.update({ where: { id }, data });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const conflict = new Error('Organization address label is already in use.');
        conflict.code = 'ADDRESS_LABEL_CONFLICT';
        throw conflict;
      }
      throw error;
    }
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
    return this.prisma.organizationDocument.create({
      data: {
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
      },
    });
  }

  async listOrganizationDocuments(organizationId) {
    return this.prisma.organizationDocument.findMany({
      where: { organization_id: organizationId },
      orderBy: { created_at: 'desc' },
    });
  }

  async updateOrganizationDocument(id, patch) {
    const fieldMap = {
      fileName: 'file_name',
      fileUrl: 'file_url',
      mimeType: 'mime_type',
      sizeBytes: 'size_bytes',
      verificationStatus: 'verification_status',
      notes: 'notes',
    };
    const data = {};
    for (const [key, value] of Object.entries(patch)) {
      const field = fieldMap[key];
      if (!field) throw new Error(`Cannot update document field '${key}'.`);
      data[field] = value;
    }
    return this.prisma.organizationDocument.update({ where: { id }, data });
  }

  async findUserProfile(userId) {
    return this.prisma.userProfile.findUnique({ where: { user_id: userId } });
  }

  async upsertUserProfile(userId, patch) {
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
    const data = {};
    for (const [key, value] of Object.entries(patch)) {
      const field = fieldMap[key];
      if (!field) throw new Error(`Cannot update profile field '${key}'.`);
      data[field] = field === 'date_of_birth' && value ? new Date(value) : value;
    }

    try {
      const existing = await this.findUserProfile(userId);
      if (!existing) {
        if (!patch.firstName || !patch.lastName) {
          throw new Error('Creating a profile requires firstName and lastName.');
        }
        return await this.prisma.userProfile.create({
          data: {
            id: randomUUID(),
            user_id: userId,
            first_name: patch.firstName,
            last_name: patch.lastName,
            name_bn: patch.nameBn || null,
            avatar_url: patch.avatarUrl || null,
            date_of_birth: patch.dateOfBirth ? new Date(patch.dateOfBirth) : null,
            gender: patch.gender || null,
            national_id_hash: patch.nationalIdHash || null,
            preferred_language: patch.preferredLanguage || 'EN',
            default_currency: patch.defaultCurrency || 'BDT',
          },
        });
      }
      return await this.prisma.userProfile.update({
        where: { user_id: userId },
        data,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const conflict = new Error('National id is already registered.');
        conflict.code = 'NATIONAL_ID_CONFLICT';
        throw conflict;
      }
      throw error;
    }
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (isPrimary) {
          await tx.userAddress.updateMany({
            where: { user_id: userId, is_primary: true },
            data: { is_primary: false },
          });
        }
        return tx.userAddress.create({
          data: {
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
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const conflict = new Error('Address label is already in use.');
        conflict.code = 'ADDRESS_LABEL_CONFLICT';
        throw conflict;
      }
      throw error;
    }
  }

  async listUserAddresses(userId) {
    return this.prisma.userAddress.findMany({
      where: { user_id: userId },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
    });
  }

  async updateUserAddress(id, patch) {
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
    const data = {};
    for (const [key, value] of Object.entries(patch)) {
      const field = fieldMap[key];
      if (!field) throw new Error(`Cannot update user address field '${key}'.`);
      data[field] = value;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const address = await tx.userAddress.findUnique({ where: { id } });
        if (!address) throw new Error(`Unknown user address '${id}'.`);
        if (data.is_primary) {
          await tx.userAddress.updateMany({
            where: { user_id: address.user_id, id: { not: id }, is_primary: true },
            data: { is_primary: false },
          });
        }
        return tx.userAddress.update({ where: { id }, data });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const conflict = new Error('Address label is already in use.');
        conflict.code = 'ADDRESS_LABEL_CONFLICT';
        throw conflict;
      }
      throw error;
    }
  }

  async listNotificationPreferences(userId) {
    return this.prisma.notificationPreference.findMany({
      where: { user_id: userId },
      orderBy: [{ channel: 'asc' }, { event_type: 'asc' }],
    });
  }

  async replaceNotificationPreferences(userId, preferences) {
    return this.prisma.$transaction(async (tx) => {
      await tx.notificationPreference.deleteMany({ where: { user_id: userId } });
      await tx.notificationPreference.createMany({
        data: preferences.map((preference) => ({
          id: randomUUID(),
          user_id: userId,
          channel: preference.channel,
          event_type: preference.eventType,
          enabled: preference.enabled !== false,
        })),
      });
      return tx.notificationPreference.findMany({
        where: { user_id: userId },
        orderBy: [{ channel: 'asc' }, { event_type: 'asc' }],
      });
    });
  }

  async findRoleProfileExtension({ userId, roleCode, scopeKey }) {
    return this.prisma.roleProfileExtension.findUnique({
      where: {
        user_id_role_code_scope_key: {
          user_id: userId,
          role_code: normalizeRoleCode(roleCode),
          scope_key: scopeKey,
        },
      },
    });
  }

  async upsertRoleProfileExtension({ userId, roleCode, organizationId = null, scopeKey, data }) {
    const code = normalizeRoleCode(roleCode);
    try {
      return await this.prisma.roleProfileExtension.upsert({
        where: {
          user_id_role_code_scope_key: {
            user_id: userId,
            role_code: code,
            scope_key: scopeKey,
          },
        },
        update: { data, organization_id: organizationId },
        create: {
          id: randomUUID(),
          user_id: userId,
          role_code: code,
          organization_id: organizationId,
          scope_key: scopeKey,
          data,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const conflict = new Error('Role profile extension already exists.');
        conflict.code = 'ROLE_PROFILE_CONFLICT';
        throw conflict;
      }
      throw error;
    }
  }

  async listRoleProfileExtensions(userId) {
    return this.prisma.roleProfileExtension.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'asc' },
    });
  }

  async findFarmerProfile(userId) {
    return this.prisma.farmerProfile.findUnique({ where: { user_id: userId } });
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
    const existing = await this.findFarmerProfile(userId);
    if (existing) {
      return this.prisma.farmerProfile.update({
        where: { user_id: userId },
        data: {
          organization_id: organizationId === undefined ? existing.organization_id : organizationId,
          verification_status:
            verificationStatus === undefined ? existing.verification_status : verificationStatus,
          farm_size_hectares:
            farmSizeHectares === undefined ? existing.farm_size_hectares : farmSizeHectares,
          experience_years:
            experienceYears === undefined ? existing.experience_years : experienceYears,
          primary_crop_id: primaryCropId === undefined ? existing.primary_crop_id : primaryCropId,
        },
      });
    }

    const code = farmerCode || `FRM-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    try {
      return await this.prisma.farmerProfile.create({
        data: {
          id: randomUUID(),
          user_id: userId,
          organization_id: organizationId,
          farmer_code: code,
          verification_status: verificationStatus || 'UNVERIFIED',
          farm_size_hectares: farmSizeHectares || 0,
          experience_years: experienceYears,
          primary_crop_id: primaryCropId,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const conflict = new Error('Farmer code is already in use.');
        conflict.code = 'FARMER_CODE_CONFLICT';
        throw conflict;
      }
      throw error;
    }
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

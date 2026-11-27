const { assertRepository } = require('../../../shared/domain/repository');
const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, UsersEntity } = require('../domain/users.entity');
const { UsersRepositoryToken } = require('../domain/users.repository');
const {
  addressCreateSchema,
  addressUpdateSchema,
  contactUpdateSchema,
  farmerProfileSchema,
  moduleInfoSchema,
  notificationPreferencesSchema,
  profileUpdateSchema,
  roleProfileUpdateSchema,
  toAddressDto,
  toFarmerProfileDto,
  toModuleInfoDto,
  toPreferenceDto,
  toProfileDto,
  toRoleExtensionDto,
} = require('./users.dto');

const UsersServiceToken = Symbol.for('cropsy.service.users');

function normalizeRoleCode(value) {
  return typeof value === 'string'
    ? value
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_')
    : null;
}

function normalizeIdentifier(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

function assignmentRoleCode(assignment) {
  return normalizeRoleCode(assignment.role_code || assignment.role?.code);
}

function requestMeta(request) {
  // Security-relevant audit metadata must use the socket peer address. Fastify
  // is configured with trustProxy: false, so forwarding headers are untrusted.
  return {
    ipAddress: String(request?.ip || 'unknown')
      .trim()
      .slice(0, 64),
    userAgent: request?.headers?.['user-agent']
      ? String(request.headers['user-agent']).slice(0, 2000)
      : null,
    requestId: request?.requestId || null,
  };
}

function translateStoreError(error) {
  if (error.code === 'EMAIL_CONFLICT') {
    throw new ConflictError({ message: 'Email is already registered.' });
  }
  if (error.code === 'PHONE_CONFLICT') {
    throw new ConflictError({ message: 'Phone is already registered.' });
  }
  if (error.code === 'ADDRESS_LABEL_CONFLICT') {
    throw new ConflictError({ message: 'Address label is already in use.' });
  }
  if (error.code === 'NATIONAL_ID_CONFLICT') {
    throw new ConflictError({ message: 'National id is already registered.' });
  }
  if (error.code === 'FARMER_CODE_CONFLICT') {
    throw new ConflictError({ message: 'Farmer code is already in use.' });
  }
  if (error.code === 'ROLE_PROFILE_CONFLICT') {
    throw new ConflictError({ message: 'Role profile extension already exists.' });
  }
  throw error;
}

class UsersService {
  constructor({ repository, eventBus, logger, metadata, identityStore, authorization }) {
    assertRepository(repository, ['get', 'save'], UsersRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('UsersService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('UsersService requires module metadata.');
    }
    if (!identityStore || !authorization) {
      throw new TypeError('UsersService requires identityStore and authorization ports.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.store = identityStore;
    this.authorization = authorization;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new UsersEntity();
      await this.repository.save(entity);
      this.eventBus.publish({
        type: `${MODULE_ID}.initialized`,
        moduleId: MODULE_ID,
        aggregateId: entity.id,
        payload: { name: entity.name },
      });
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    const dto = toModuleInfoDto(entity, this.metadata);
    return validate(moduleInfoSchema, dto, 'users module info');
  }

  async audit(
    { action, entityType, entityId, actorUserId, organizationId = null, before, after = {} },
    request,
  ) {
    const meta = requestMeta(request);
    const entry = {
      action,
      entityType,
      entityId: entityId || null,
      actorUserId: actorUserId || null,
      organizationId,
      before: before === undefined ? undefined : before,
      after: { ...after, ...(meta.requestId ? { requestId: meta.requestId } : {}) },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      severity: 'INFO',
    };
    await this.store.appendAudit(entry);
    this.eventBus?.publish({
      type: action,
      moduleId: MODULE_ID,
      aggregateId: actorUserId || entityId || 'anonymous',
      payload: entry.after,
    });
    return entry;
  }

  async assertTargetAccess(context, userId, permissions) {
    await this.authorization.assertUserAccess(context, userId, permissions);
  }

  async findUser(userId) {
    const user = await this.store.findUserById(userId);
    if (!user) throw new NotFoundError({ message: 'User was not found.' });
    return user;
  }

  async buildProfile(userId) {
    const [user, profile, assignments, organizations] = await Promise.all([
      this.findUser(userId),
      this.store.findUserProfile(userId),
      this.store.listUserRoles(userId),
      this.store.listOrganizationMemberships(userId),
    ]);
    return toProfileDto({
      user,
      profile,
      roles: assignments.map((assignment) => ({
        code: assignmentRoleCode(assignment),
      })),
      organizations,
    });
  }

  async getProfile({ context, userId }) {
    await this.assertTargetAccess(context, userId, ['users.read']);
    return this.buildProfile(userId);
  }

  async updateProfile({ context, userId, input, request }) {
    await this.assertTargetAccess(context, userId, ['profile.manage', 'users.manage']);
    const patch = validate(profileUpdateSchema, input, 'profile update');
    if (Object.keys(patch).length === 0) {
      throw new ValidationError({ message: 'No profile fields were supplied.' });
    }

    const beforeProfile = await this.store.findUserProfile(userId);
    if (!beforeProfile && (!patch.firstName || !patch.lastName)) {
      throw new ValidationError({
        message: 'First name and last name are required when creating a profile.',
      });
    }

    try {
      await this.store.upsertUserProfile(userId, patch);
    } catch (error) {
      translateStoreError(error);
    }
    await this.audit(
      {
        action: 'users.profile.updated',
        entityType: 'user_profile',
        entityId: userId,
        actorUserId: context.user.id,
        organizationId: context.organizationId,
        before: beforeProfile,
        after: { fields: Object.keys(patch) },
      },
      request,
    );
    return this.buildProfile(userId);
  }

  async updateContact({ context, userId, input, request }) {
    await this.assertTargetAccess(context, userId, ['profile.manage', 'users.manage']);
    const { email, phone } = validate(contactUpdateSchema, input, 'contact update');
    const before = await this.findUser(userId);
    const patch = {};
    if (email !== undefined) {
      patch.email = email;
      if (normalizeIdentifier(email) !== normalizeIdentifier(before.email)) {
        patch.is_email_verified = false;
      }
    }
    if (phone !== undefined) {
      patch.phone = phone;
      if (String(phone).trim() !== String(before.phone || '').trim()) {
        patch.is_phone_verified = false;
      }
    }

    let updated;
    try {
      updated = await this.store.updateUser(userId, patch);
    } catch (error) {
      translateStoreError(error);
    }
    await this.audit(
      {
        action: 'users.contact.updated',
        entityType: 'user',
        entityId: userId,
        actorUserId: context.user.id,
        organizationId: context.organizationId,
        before: { email: before.email, phone: before.phone },
        after: { email: updated.email, phone: updated.phone },
      },
      request,
    );
    return this.buildProfile(userId);
  }

  async listAddresses({ context, userId }) {
    await this.assertTargetAccess(context, userId, ['profile.read', 'users.read']);
    const addresses = await this.store.listUserAddresses(userId);
    return addresses.map(toAddressDto);
  }

  async addAddress({ context, userId, input, request }) {
    await this.assertTargetAccess(context, userId, ['profile.manage', 'users.manage']);
    const data = validate(addressCreateSchema, input, 'user address');
    let address;
    try {
      address = await this.store.createUserAddress({ ...data, userId });
    } catch (error) {
      translateStoreError(error);
    }
    await this.audit(
      {
        action: 'users.address.created',
        entityType: 'user_address',
        entityId: address.id,
        actorUserId: context.user.id,
        organizationId: context.organizationId,
        after: { userId, label: address.label, isPrimary: address.is_primary },
      },
      request,
    );
    return toAddressDto(address);
  }

  async updateAddress({ context, userId, addressId, input, request }) {
    await this.assertTargetAccess(context, userId, ['profile.manage', 'users.manage']);
    const addresses = await this.store.listUserAddresses(userId);
    const existing = addresses.find((address) => address.id === addressId);
    if (!existing) throw new NotFoundError({ message: 'User address was not found.' });
    const patch = validate(addressUpdateSchema, input, 'user address update');
    if (Object.keys(patch).length === 0) {
      throw new ValidationError({ message: 'No address fields were supplied.' });
    }

    let address;
    try {
      address = await this.store.updateUserAddress(addressId, patch);
    } catch (error) {
      translateStoreError(error);
    }
    await this.audit(
      {
        action: 'users.address.updated',
        entityType: 'user_address',
        entityId: addressId,
        actorUserId: context.user.id,
        organizationId: context.organizationId,
        before: { label: existing.label, isPrimary: existing.is_primary },
        after: { label: address.label, isPrimary: address.is_primary },
      },
      request,
    );
    return toAddressDto(address);
  }

  async listPreferences({ context, userId }) {
    await this.assertTargetAccess(context, userId, ['profile.read', 'users.read']);
    const preferences = await this.store.listNotificationPreferences(userId);
    return preferences.map(toPreferenceDto);
  }

  async replacePreferences({ context, userId, input, request }) {
    await this.assertTargetAccess(context, userId, ['profile.manage', 'users.manage']);
    const preferences = validate(notificationPreferencesSchema, input, 'notification preferences');
    const before = await this.store.listNotificationPreferences(userId);
    const updated = await this.store.replaceNotificationPreferences(userId, preferences);
    await this.audit(
      {
        action: 'users.preferences.updated',
        entityType: 'notification_preferences',
        entityId: userId,
        actorUserId: context.user.id,
        organizationId: context.organizationId,
        before: before.map((preference) => ({
          channel: preference.channel,
          eventType: preference.event_type,
          enabled: preference.enabled,
        })),
        after: updated.map((preference) => ({
          channel: preference.channel,
          eventType: preference.event_type,
          enabled: preference.enabled,
        })),
      },
      request,
    );
    return updated.map(toPreferenceDto);
  }

  async findRoleAssignment(userId, roleCode) {
    const code = normalizeRoleCode(roleCode);
    const assignments = await this.store.listUserRoles(userId);
    const assignment = assignments.find((candidate) => assignmentRoleCode(candidate) === code);
    if (!assignment) {
      throw new ForbiddenError({
        message: `The target user does not have the '${code}' role.`,
        details: { code: 'role_not_assigned' },
      });
    }
    const role = await this.store.findRoleByCode(code);
    if (!role) throw new NotFoundError({ message: `Role '${code}' was not found.` });
    return { code, assignment, role };
  }

  async resolveRoleScope(context, userId, roleCode, requestedOrganizationId = null) {
    const { code, assignment, role } = await this.findRoleAssignment(userId, roleCode);
    if (role.scope !== 'ORGANIZATION') {
      if (requestedOrganizationId) {
        throw new ValidationError({
          message: `Role '${code}' is platform-scoped and cannot target an organization.`,
        });
      }
      return { code, role, organizationId: null, scopeKey: 'PLATFORM' };
    }

    const assignedOrganizationId = assignment.organization_id;
    if (!assignedOrganizationId) {
      throw new ValidationError({
        message: `Organization role '${code}' has no organization assignment.`,
      });
    }
    if (
      requestedOrganizationId &&
      normalizeIdentifier(requestedOrganizationId) !== normalizeIdentifier(assignedOrganizationId)
    ) {
      throw new ForbiddenError({
        message: 'The requested organization does not match the role assignment.',
        details: { code: 'role_organization_mismatch' },
      });
    }
    if (!context.isSuperAdmin && !context.organizationIds.includes(assignedOrganizationId)) {
      throw new ForbiddenError({
        message: 'Access to the role organization is denied.',
        details: { code: 'cross_organization_access_denied' },
      });
    }
    await this.authorization.assertOrganization(context, assignedOrganizationId);
    return {
      code,
      role,
      organizationId: assignedOrganizationId,
      scopeKey: assignedOrganizationId,
    };
  }

  async listRoleProfiles({ context, userId }) {
    await this.assertTargetAccess(context, userId, ['profile.read', 'users.read']);
    const [extensions, assignments] = await Promise.all([
      this.store.listRoleProfileExtensions(userId),
      this.store.listUserRoles(userId),
    ]);
    const roleCodes = assignments.map(assignmentRoleCode).filter(Boolean);
    return {
      roleCodes,
      extensions: extensions.map(toRoleExtensionDto),
      farmerProfile: roleCodes.includes('FARMER')
        ? toFarmerProfileDto(await this.store.findFarmerProfile(userId))
        : null,
    };
  }

  async upsertRoleProfile({ context, userId, roleCode, input, request }) {
    await this.assertTargetAccess(context, userId, ['profile.manage', 'users.manage']);
    const code = normalizeRoleCode(roleCode);
    if (!code) throw new ValidationError({ message: 'Role code is required.' });
    if (code === 'FARMER') {
      throw new ValidationError({
        message: 'Farmer agricultural information belongs in the farmer profile endpoint.',
        details: { code: 'use_farmer_profile_endpoint' },
      });
    }
    const { organizationId, data } = validate(
      roleProfileUpdateSchema,
      input,
      'role profile update',
    );
    const scope = await this.resolveRoleScope(context, userId, code, organizationId || null);
    const existing = await this.store.findRoleProfileExtension({
      userId,
      roleCode: scope.code,
      scopeKey: scope.scopeKey,
    });
    let extension;
    try {
      extension = await this.store.upsertRoleProfileExtension({
        userId,
        roleCode: scope.code,
        organizationId: scope.organizationId,
        scopeKey: scope.scopeKey,
        data,
      });
    } catch (error) {
      translateStoreError(error);
    }
    await this.audit(
      {
        action: 'users.role_profile.updated',
        entityType: 'role_profile_extension',
        entityId: extension.id,
        actorUserId: context.user.id,
        organizationId: scope.organizationId,
        before: existing ? { data: existing.data } : undefined,
        after: { roleCode: scope.code, scopeKey: scope.scopeKey, fields: Object.keys(data) },
      },
      request,
    );
    return toRoleExtensionDto(extension);
  }

  async getFarmerProfile({ context, userId }) {
    await this.assertTargetAccess(context, userId, ['profile.read', 'users.read']);
    await this.findRoleAssignment(userId, 'FARMER');
    return toFarmerProfileDto(await this.store.findFarmerProfile(userId));
  }

  async upsertFarmerProfile({ context, userId, input, request }) {
    await this.assertTargetAccess(context, userId, ['profile.manage', 'users.manage']);
    const data = validate(farmerProfileSchema, input, 'farmer profile');
    if (
      context.user.id === userId &&
      data.verificationStatus &&
      data.verificationStatus !== 'UNVERIFIED'
    ) {
      throw new ForbiddenError({
        message: 'Farmers cannot set their own verification status.',
        details: { code: 'verification_status_forbidden' },
      });
    }
    const scope = await this.resolveRoleScope(
      context,
      userId,
      'FARMER',
      data.organizationId || null,
    );
    const before = await this.store.findFarmerProfile(userId);
    let profile;
    try {
      profile = await this.store.upsertFarmerProfile({
        userId,
        organizationId: scope.organizationId,
        ...data,
      });
    } catch (error) {
      translateStoreError(error);
    }
    await this.audit(
      {
        action: 'users.farmer_profile.updated',
        entityType: 'farmer_profile',
        entityId: profile.id,
        actorUserId: context.user.id,
        organizationId: scope.organizationId,
        before: before ? { verificationStatus: before.verification_status } : undefined,
        after: { farmerCode: profile.farmer_code, verificationStatus: profile.verification_status },
      },
      request,
    );
    return toFarmerProfileDto(profile);
  }
}

module.exports = { UsersService, UsersServiceToken };

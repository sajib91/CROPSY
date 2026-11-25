const { assertRepository } = require('../../../shared/domain/repository');
const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, OrganizationsEntity } = require('../domain/organizations.entity');
const { OrganizationsRepositoryToken } = require('../domain/organizations.repository');
const {
  ORGANIZATION_TYPES,
  addressCreateSchema,
  addressUpdateSchema,
  createOrganizationSchema,
  documentCreateSchema,
  documentUpdateSchema,
  invitationTokenSchema,
  inviteMemberSchema,
  moduleInfoSchema,
  organizationQuerySchema,
  organizationStatusUpdateSchema,
  switchOrganizationSchema,
  toAddressDto,
  toDocumentDto,
  toInvitationDto,
  toMemberDto,
  toModuleInfoDto,
  toOrganizationDto,
  updateOrganizationSchema,
  verificationUpdateSchema,
} = require('./organizations.dto');

const OrganizationsServiceToken = Symbol.for('cropsy.service.organizations');

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function requestMeta(request) {
  const forwarded = request?.headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return {
    ipAddress: String(raw || request?.ip || 'unknown')
      .split(',')[0]
      .trim()
      .slice(0, 64),
    userAgent: request?.headers?.['user-agent']
      ? String(request.headers['user-agent']).slice(0, 2000)
      : null,
    requestId: request?.requestId || null,
  };
}

function translateStoreError(error) {
  if (error.code === 'SLUG_CONFLICT') {
    throw new ConflictError({ message: 'Organization slug is already in use.' });
  }
  if (error.code === 'ADDRESS_LABEL_CONFLICT') {
    throw new ConflictError({ message: 'Address label is already in use.' });
  }
  if (error.code === 'INVITATION_TOKEN_CONFLICT') {
    throw new ConflictError({ message: 'Invitation token is already in use.' });
  }
  throw error;
}

class OrganizationsService {
  constructor({
    repository,
    eventBus,
    logger,
    metadata,
    identityStore,
    authorization,
    tokenManager,
    config,
  }) {
    assertRepository(repository, ['get', 'save'], OrganizationsRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('OrganizationsService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('OrganizationsService requires module metadata.');
    }
    for (const [name, dependency] of Object.entries({
      identityStore,
      authorization,
      tokenManager,
      config,
    })) {
      if (!dependency) throw new TypeError(`OrganizationsService requires ${name}.`);
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.store = identityStore;
    this.authorization = authorization;
    this.tokenManager = tokenManager;
    this.config = config;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new OrganizationsEntity();
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
    return validate(moduleInfoSchema, dto, 'organizations module info');
  }

  async audit(
    {
      action,
      entityType,
      entityId,
      actorUserId = null,
      organizationId = null,
      before = undefined,
      after = {},
      severity = 'INFO',
    },
    request,
  ) {
    const meta = requestMeta(request);
    const entry = {
      action,
      entityType,
      entityId: entityId || null,
      actorUserId,
      organizationId,
      before: before === undefined ? undefined : before,
      after: { ...after, ...(meta.requestId ? { requestId: meta.requestId } : {}) },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      severity,
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

  async assertOrganizationAccess(context, organizationId) {
    return this.authorization.assertOrganization(context, organizationId);
  }

  async listOrganizations({ context, query = {} }) {
    const filter = validate(organizationQuerySchema, query, 'organization query');
    const organizations = await this.store.listOrganizations(filter);
    if (context.isSuperAdmin) return organizations.map(toOrganizationDto);

    const memberships = await this.store.listOrganizationMemberships(context.user.id);
    const allowed = new Set(memberships.map((membership) => membership.organization_id));
    return organizations
      .filter((organization) => allowed.has(organization.id))
      .map(toOrganizationDto);
  }

  async createOrganization({ context, input, request }) {
    const data = validate(createOrganizationSchema, input, 'organization registration');
    let organization;
    try {
      organization = await this.store.createOrganization({
        ...data,
        ownerUserId: context.user.id,
      });
    } catch (error) {
      translateStoreError(error);
    }

    await this.store.addOrganizationMember({
      organizationId: organization.id,
      userId: context.user.id,
      status: 'ACTIVE',
    });
    const adminRole = await this.store.findRoleByCode('ORGANIZATION_ADMIN');
    if (adminRole) {
      await this.store.addUserRole({
        userId: context.user.id,
        roleCode: adminRole.code,
        organizationId: organization.id,
        grantedBy: context.user.id,
      });
    }

    await this.audit(
      {
        action: 'organizations.created',
        entityType: 'organization',
        entityId: organization.id,
        actorUserId: context.user.id,
        organizationId: organization.id,
        after: { name: organization.name, organizationType: organization.organization_type },
      },
      request,
    );

    return {
      organization: toOrganizationDto(organization),
      activeOrganizationId: organization.id,
    };
  }

  async getOrganization({ context, organizationId }) {
    const organization = await this.assertOrganizationAccess(context, organizationId);
    return toOrganizationDto(organization);
  }

  async updateOrganization({ context, organizationId, input, request }) {
    const before = await this.assertOrganizationAccess(context, organizationId);
    const patch = validate(updateOrganizationSchema, input, 'organization profile update');
    if (Object.keys(patch).length === 0) {
      throw new ValidationError({ message: 'No organization fields were supplied.' });
    }

    let updated;
    try {
      updated = await this.store.updateOrganization(organizationId, patch);
    } catch (error) {
      translateStoreError(error);
    }
    await this.audit(
      {
        action: 'organizations.updated',
        entityType: 'organization',
        entityId: organizationId,
        actorUserId: context.user.id,
        organizationId,
        before: toOrganizationDto(before),
        after: toOrganizationDto(updated),
      },
      request,
    );
    return toOrganizationDto(updated);
  }

  async setStatus({ context, organizationId, input, request }) {
    const before = await this.assertOrganizationAccess(context, organizationId);
    const { status } = validate(
      organizationStatusUpdateSchema,
      input,
      'organization status update',
    );
    const updated = await this.store.updateOrganization(organizationId, { status });
    await this.audit(
      {
        action: 'organizations.status.updated',
        entityType: 'organization',
        entityId: organizationId,
        actorUserId: context.user.id,
        organizationId,
        before: { status: before.status },
        after: { status: updated.status },
      },
      request,
    );
    return toOrganizationDto(updated);
  }

  async verifyOrganization({ context, organizationId, input, request }) {
    const before = await this.assertOrganizationAccess(context, organizationId);
    const { verificationStatus, verificationNote } = validate(
      verificationUpdateSchema,
      input,
      'organization verification update',
    );
    const patch = {
      verificationStatus,
      verificationNote: verificationNote || null,
      verifiedAt: verificationStatus === 'VERIFIED' ? new Date() : null,
      verifiedByUserId: verificationStatus === 'VERIFIED' ? context.user.id : null,
    };
    const updated = await this.store.updateOrganization(organizationId, patch);
    await this.audit(
      {
        action: 'organizations.verification.updated',
        entityType: 'organization',
        entityId: organizationId,
        actorUserId: context.user.id,
        organizationId,
        before: {
          verificationStatus: before.verification_status,
          verificationNote: before.verification_note,
        },
        after: {
          verificationStatus: updated.verification_status,
          verificationNote: updated.verification_note,
        },
      },
      request,
    );
    return toOrganizationDto(updated);
  }

  listTypes() {
    return ORGANIZATION_TYPES.map(([code, name]) => ({ code, name }));
  }

  async listMembers({ context, organizationId }) {
    await this.assertOrganizationAccess(context, organizationId);
    const members = await this.store.listOrganizationMembers(organizationId);
    return members.map(toMemberDto);
  }

  async inviteMember({ context, organizationId, input, request }) {
    const organization = await this.assertOrganizationAccess(context, organizationId);
    const { email, roleCode } = validate(inviteMemberSchema, input, 'member invitation');
    const normalizedEmail = normalizeEmail(email);
    const role = await this.store.findRoleByCode(roleCode);
    if (!role) throw new NotFoundError({ message: `Role '${roleCode}' was not found.` });
    if (role.scope !== 'ORGANIZATION') {
      throw new ValidationError({ message: 'Invitations require an organization-scoped role.' });
    }

    const existing = await this.store.listOrganizationMembers(organizationId);
    if (existing.some((member) => normalizeEmail(member.user?.email) === normalizedEmail)) {
      throw new ConflictError({ message: 'This user is already a member of the organization.' });
    }

    const token = this.tokenManager.createOpaqueToken(48);
    const ttlHours = this.config.ORGANIZATION_INVITATION_TTL_HOURS;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    let invitation;
    try {
      invitation = await this.store.createOrganizationInvitation({
        organizationId,
        email: normalizedEmail,
        roleId: role.id,
        roleCode: role.code,
        invitedByUserId: context.user.id,
        tokenHash: this.tokenManager.hashToken(token),
        status: 'PENDING',
        expiresAt,
      });
    } catch (error) {
      translateStoreError(error);
    }

    await this.audit(
      {
        action: 'organizations.invitation.created',
        entityType: 'organization_invitation',
        entityId: invitation.id,
        actorUserId: context.user.id,
        organizationId,
        after: {
          organizationName: organization.name,
          email: normalizedEmail,
          roleCode: role.code,
          expiresAt: expiresAt.toISOString(),
        },
      },
      request,
    );

    return { invitation: toInvitationDto(invitation), token };
  }

  async listInvitations({ context, organizationId }) {
    await this.assertOrganizationAccess(context, organizationId);
    const invitations = await this.store.listOrganizationInvitations(organizationId);
    return invitations.map(toInvitationDto);
  }

  async acceptInvitation({ context, input, request }) {
    const { token, email } = validate(invitationTokenSchema, input, 'invitation acceptance');
    const invitation = await this.store.findOrganizationInvitationByTokenHash(
      this.tokenManager.hashToken(token),
    );
    if (!invitation) throw new NotFoundError({ message: 'Invitation was not found.' });
    if (invitation.status !== 'PENDING') {
      throw new ConflictError({ message: 'Invitation is no longer pending.' });
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      await this.store.updateOrganizationInvitation(invitation.id, { status: 'EXPIRED' });
      throw new ConflictError({ message: 'Invitation has expired.' });
    }
    if (email && normalizeEmail(email) !== normalizeEmail(invitation.email)) {
      throw new ForbiddenError({
        message: 'Invitation email does not match the supplied address.',
        details: { code: 'invitation_email_mismatch' },
      });
    }

    const user = await this.store.findUserByIdentifier(invitation.email);
    if (!user) {
      throw new ValidationError({
        message: 'Register the invited email address before accepting the invitation.',
      });
    }

    const roleCode = invitation.roleCode || invitation.role_code;
    const role = roleCode
      ? await this.store.findRoleByCode(roleCode)
      : await this.store.findRoleById(invitation.role_id);
    if (!role) throw new NotFoundError({ message: 'Invitation role was not found.' });
    if (role.scope !== 'ORGANIZATION') {
      throw new ValidationError({ message: 'Invitation role is not organization-scoped.' });
    }

    await this.store.addOrganizationMember({
      organizationId: invitation.organization_id,
      userId: user.id,
      status: 'ACTIVE',
    });
    await this.store.addUserRole({
      userId: user.id,
      roleCode: role.code,
      organizationId: invitation.organization_id,
      grantedBy: invitation.invited_by_user_id,
    });
    const updated = await this.store.updateOrganizationInvitation(invitation.id, {
      status: 'ACCEPTED',
      acceptedAt: new Date(),
    });

    await this.audit(
      {
        action: 'organizations.invitation.accepted',
        entityType: 'organization_invitation',
        entityId: invitation.id,
        actorUserId: context.user.id,
        organizationId: invitation.organization_id,
        after: { userId: user.id, roleCode: role.code, status: updated.status },
      },
      request,
    );

    return {
      organizationId: invitation.organization_id,
      userId: user.id,
      roleCode: role.code,
    };
  }

  async cancelInvitation({ context, organizationId, invitationId, request }) {
    await this.assertOrganizationAccess(context, organizationId);
    const invitation = await this.store
      .listOrganizationInvitations(organizationId)
      .then((items) => items.find((item) => item.id === invitationId));
    if (!invitation) throw new NotFoundError({ message: 'Invitation was not found.' });
    const updated = await this.store.updateOrganizationInvitation(invitationId, {
      status: 'CANCELLED',
    });
    await this.audit(
      {
        action: 'organizations.invitation.cancelled',
        entityType: 'organization_invitation',
        entityId: invitationId,
        actorUserId: context.user.id,
        organizationId,
        before: { status: invitation.status },
        after: { status: updated.status },
      },
      request,
    );
    return toInvitationDto(updated);
  }

  async removeMember({ context, organizationId, userId, request }) {
    const organization = await this.assertOrganizationAccess(context, organizationId);
    if (userId === organization.owner_user_id) {
      throw new ValidationError({ message: 'The organization owner cannot be removed.' });
    }
    const members = await this.store.listOrganizationMembers(organizationId);
    const member = members.find((candidate) => candidate.user_id === userId);
    if (!member) throw new NotFoundError({ message: 'Organization member was not found.' });

    await this.store.updateOrganizationMember(organizationId, userId, { status: 'LEFT' });
    const removedRoles = await this.store.removeUserRolesForOrganization(userId, organizationId);
    await this.audit(
      {
        action: 'organizations.member.removed',
        entityType: 'organization_member',
        entityId: userId,
        actorUserId: context.user.id,
        organizationId,
        before: { status: member.status },
        after: { status: 'LEFT', removedRoles },
      },
      request,
    );
    return { organizationId, userId, status: 'LEFT', removedRoles };
  }

  async listAddresses({ context, organizationId }) {
    await this.assertOrganizationAccess(context, organizationId);
    const addresses = await this.store.listOrganizationAddresses(organizationId);
    return addresses.map(toAddressDto);
  }

  async addAddress({ context, organizationId, input, request }) {
    await this.assertOrganizationAccess(context, organizationId);
    const data = validate(addressCreateSchema, input, 'organization address');
    let address;
    try {
      address = await this.store.createOrganizationAddress({
        ...data,
        organizationId,
      });
    } catch (error) {
      translateStoreError(error);
    }
    await this.audit(
      {
        action: 'organizations.address.created',
        entityType: 'organization_address',
        entityId: address.id,
        actorUserId: context.user.id,
        organizationId,
        after: { label: address.label, isPrimary: address.is_primary },
      },
      request,
    );
    return toAddressDto(address);
  }

  async updateAddress({ context, organizationId, addressId, input, request }) {
    await this.assertOrganizationAccess(context, organizationId);
    const addresses = await this.store.listOrganizationAddresses(organizationId);
    const existing = addresses.find((address) => address.id === addressId);
    if (!existing) throw new NotFoundError({ message: 'Organization address was not found.' });
    const patch = validate(addressUpdateSchema, input, 'organization address update');
    if (Object.keys(patch).length === 0) {
      throw new ValidationError({ message: 'No address fields were supplied.' });
    }
    let address;
    try {
      address = await this.store.updateOrganizationAddress(addressId, patch);
    } catch (error) {
      translateStoreError(error);
    }
    await this.audit(
      {
        action: 'organizations.address.updated',
        entityType: 'organization_address',
        entityId: addressId,
        actorUserId: context.user.id,
        organizationId,
        before: { label: existing.label, isPrimary: existing.is_primary },
        after: { label: address.label, isPrimary: address.is_primary },
      },
      request,
    );
    return toAddressDto(address);
  }

  async listDocuments({ context, organizationId }) {
    await this.assertOrganizationAccess(context, organizationId);
    const documents = await this.store.listOrganizationDocuments(organizationId);
    return documents.map(toDocumentDto);
  }

  async addDocument({ context, organizationId, input, request }) {
    await this.assertOrganizationAccess(context, organizationId);
    const data = validate(documentCreateSchema, input, 'organization document');
    const document = await this.store.createOrganizationDocument({
      ...data,
      organizationId,
      uploadedByUserId: context.user.id,
      verificationStatus: 'PENDING',
    });
    await this.audit(
      {
        action: 'organizations.document.created',
        entityType: 'organization_document',
        entityId: document.id,
        actorUserId: context.user.id,
        organizationId,
        after: {
          documentType: document.document_type,
          fileName: document.file_name,
          verificationStatus: document.verification_status,
        },
      },
      request,
    );
    return toDocumentDto(document);
  }

  async updateDocument({ context, organizationId, documentId, input, request }) {
    await this.assertOrganizationAccess(context, organizationId);
    const documents = await this.store.listOrganizationDocuments(organizationId);
    const existing = documents.find((document) => document.id === documentId);
    if (!existing) throw new NotFoundError({ message: 'Organization document was not found.' });
    const patch = validate(documentUpdateSchema, input, 'organization document update');
    const document = await this.store.updateOrganizationDocument(documentId, patch);
    await this.audit(
      {
        action: 'organizations.document.updated',
        entityType: 'organization_document',
        entityId: documentId,
        actorUserId: context.user.id,
        organizationId,
        before: { verificationStatus: existing.verification_status },
        after: { verificationStatus: document.verification_status },
      },
      request,
    );
    return toDocumentDto(document);
  }

  async switchOrganization({ context, input, request }) {
    const { organizationId } = validate(switchOrganizationSchema, input, 'organization switch');

    // Switching may target any organization the caller already belongs to, so
    // the active token organization cannot be used for this one check.
    const organization = await this.store.findOrganization(organizationId);
    if (!organization || organization.deleted_at) {
      throw new NotFoundError({ message: 'Organization was not found.' });
    }
    const permitted = context.isSuperAdmin || context.organizationIds.includes(organizationId);
    if (!permitted) {
      await this.audit(
        {
          action: 'organizations.switch.denied',
          entityType: 'organization',
          entityId: organizationId,
          actorUserId: context.user.id,
          organizationId,
          after: { reason: 'cross_organization_access_denied' },
          severity: 'WARN',
        },
        request,
      );
      throw new ForbiddenError({
        message: 'Access to the requested organization is denied.',
        details: { code: 'cross_organization_access_denied' },
      });
    }

    if (!context.session?.id || !context.sessionTokenHash) {
      throw new ForbiddenError({
        message: 'The current session cannot be used to switch organizations.',
        details: { code: 'organization_context_required' },
      });
    }

    const csrfToken = this.tokenManager.createOpaqueToken(24);
    const accessToken = this.tokenManager.createAccessToken({
      userId: context.user.id,
      sessionId: context.session.id,
      sessionTokenHash: context.sessionTokenHash,
      csrfToken,
      organizationId,
    });

    await this.audit(
      {
        action: 'organizations.switched',
        entityType: 'organization',
        entityId: organizationId,
        actorUserId: context.user.id,
        organizationId,
        after: { name: organization.name },
      },
      request,
    );

    return {
      accessToken,
      csrfToken,
      tokenType: 'Bearer',
      expiresIn: this.config.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      sessionId: context.session.id,
      organizationId,
      organization: toOrganizationDto(organization),
    };
  }
}

module.exports = { OrganizationsService, OrganizationsServiceToken };

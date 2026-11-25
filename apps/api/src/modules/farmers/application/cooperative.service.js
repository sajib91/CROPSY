const { randomBytes, randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const dto = require('./cooperative.dto');

const COOPERATIVE_EVENTS = Object.freeze({
  GROUP_CREATED: 'farmers.group.created',
  GROUP_UPDATED: 'farmers.group.updated',
  MEMBER_JOINED: 'farmers.group.member-joined',
  MEMBER_DECIDED: 'farmers.group.member-decided',
  MEMBER_REMOVED: 'farmers.group.member-removed',
  CAMPAIGN_CREATED: 'farmers.campaign.created',
  CAMPAIGN_UPDATED: 'farmers.campaign.updated',
  CONTRIBUTION_CREATED: 'farmers.contribution.created',
  CONTRIBUTION_UPDATED: 'farmers.contribution.updated',
  CONTRIBUTION_CONFIRMED: 'farmers.contribution.confirmed',
  CONTRIBUTION_REJECTED: 'farmers.contribution.rejected',
  PURCHASE_REQUEST_CREATED: 'farmers.purchase-request.created',
  PURCHASE_REQUEST_DECIDED: 'farmers.purchase-request.decided',
  ALLOCATIONS_PROPOSED: 'farmers.allocations.proposed',
  ALLOCATIONS_FINALIZED: 'farmers.allocations.finalized',
  EARNINGS_ACCRUED: 'farmers.earnings.accrued',
});

const CATALOG_PORT_METHODS = Object.freeze([
  'findProduct',
  'findUnitByCode',
  'findQualityGradeByCode',
]);
const WAREHOUSE_PORT_METHODS = Object.freeze(['findInventoryById']);
const IDENTITY_METHODS = Object.freeze(['findUserById', 'appendAudit']);

const FARMER_GROUP_STATUSES = Object.freeze(['ACTIVE', 'SUSPENDED', 'DISSOLVED']);

function requireRecord(record, label) {
  if (!record) throw new NotFoundError({ message: `${label} was not found.` });
  return record;
}

function userIdOf(context) {
  if (!context?.user?.id) {
    throw new ForbiddenError({ message: 'Authentication is required.' });
  }
  return context.user.id;
}

function newId() {
  return randomUUID();
}

function generateCode(prefix, size = 5) {
  const normalized =
    String(prefix || 'COOP')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6) || 'COOP';
  return `${normalized}-${randomBytes(size).toString('hex').toUpperCase()}`;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError({ message: 'Invalid timestamp.' });
  return date;
}

/**
 * Cooperative selling methods are composed into FarmersService so the module
 * keeps a single service token while the implementation stays readable. All
 * persistence goes through the existing FARM_STORE adapter; cross-module reads
 * use read-only DI ports and never import another module's implementation.
 */
function createCooperativeApi({
  service,
  farmStore,
  warehouseAccess,
  catalog,
  identityStore,
  authorization,
}) {
  assertRepository(catalog, CATALOG_PORT_METHODS, 'CatalogAccessPort');
  assertRepository(warehouseAccess, WAREHOUSE_PORT_METHODS, 'WarehouseAccessPort');
  assertRepository(identityStore, IDENTITY_METHODS, 'IdentityStore');
  if (!authorization) throw new TypeError('Cooperative methods require authorization.');

  async function resolveOrganizationId(context, explicit) {
    if (explicit) {
      if (!context.isSuperAdmin) await authorization.assertOrganization(context, explicit);
      return explicit;
    }
    if (context.isSuperAdmin) return null;
    if (!context.organizationId) {
      throw new ForbiddenError({
        message: 'An active organization context is required.',
        details: { code: 'organization_context_required' },
      });
    }
    await authorization.assertOrganization(context, context.organizationId);
    return context.organizationId;
  }

  async function assertRecordOrganization(context, record, _label) {
    if (record.organization_id === null || record.organization_id === undefined) return record;
    if (!context.isSuperAdmin) {
      await authorization.assertOrganization(context, record.organization_id);
    }
    return record;
  }

  async function requireGroup(context, groupId) {
    const group = requireRecord(await farmStore.findFarmerGroup(groupId), 'Farmer group');
    await assertRecordOrganization(context, group, 'Farmer group');
    return group;
  }

  async function requireLeader(context, group) {
    if (context.isSuperAdmin) return;
    const userId = userIdOf(context);
    if (group.owner_user_id === userId) return;
    const member = await farmStore.findGroupMember(group.id, userId);
    if (!member || member.status !== 'ACTIVE' || member.role !== 'LEADER') {
      throw new ForbiddenError({
        message: 'Only the group owner or an active leader may perform this action.',
        details: { code: 'group_leadership_required' },
      });
    }
  }

  async function requireActiveMember(context, group) {
    if (context.isSuperAdmin) return;
    const userId = userIdOf(context);
    if (group.owner_user_id === userId) return;
    const member = await farmStore.findGroupMember(group.id, userId);
    if (!member || member.status !== 'ACTIVE') {
      throw new ForbiddenError({
        message: 'Active group membership is required.',
        details: { code: 'group_membership_required' },
      });
    }
  }

  async function requireCampaign(context, campaignId) {
    const campaign = requireRecord(
      await farmStore.findCampaign(campaignId),
      'Cooperative campaign',
    );
    const group = await requireGroup(context, campaign.group_id);
    if (campaign.group_id !== group.id) {
      throw new ForbiddenError({ message: 'Campaign group mismatch.' });
    }
    await assertRecordOrganization(context, campaign, 'Cooperative campaign');
    return { campaign, group };
  }

  async function requireEditableCampaign(context, campaignId) {
    const resolved = await requireCampaign(context, campaignId);
    await requireLeader(context, resolved.group);
    return resolved;
  }

  async function requireContribution(context, contributionId) {
    const contribution = requireRecord(
      await farmStore.findContribution(contributionId),
      'Group contribution',
    );
    const resolved = await requireCampaign(context, contribution.campaign_id);
    if (contribution.group_id !== resolved.group.id) {
      throw new ForbiddenError({ message: 'Contribution group mismatch.' });
    }
    await assertRecordOrganization(context, contribution, 'Group contribution');
    return { contribution, ...resolved };
  }

  async function requirePurchaseRequest(context, requestId) {
    const purchaseRequest = requireRecord(
      await farmStore.findPurchaseRequest(requestId),
      'Group purchase request',
    );
    const resolved = await requireCampaign(context, purchaseRequest.campaign_id);
    if (purchaseRequest.group_id !== resolved.group.id) {
      throw new ForbiddenError({ message: 'Purchase request group mismatch.' });
    }
    await assertRecordOrganization(context, purchaseRequest, 'Group purchase request');
    return { purchaseRequest, ...resolved };
  }

  async function requireProductReference(context, productId, organizationId) {
    const product = requireRecord(await catalog.findProduct(productId), 'Product');
    if (organizationId && product.organization_id && product.organization_id !== organizationId) {
      throw new ForbiddenError({ message: 'Product belongs to another organization.' });
    }
    if (product.organization_id && !context.isSuperAdmin) {
      await authorization.assertOrganization(context, product.organization_id);
    }
    return product;
  }

  async function requireUnit(unitCodeValue, organizationId) {
    const unit = requireRecord(await catalog.findUnitByCode(unitCodeValue), 'Unit of measure');
    if (organizationId && unit.organization_id && unit.organization_id !== organizationId) {
      throw new ForbiddenError({ message: 'Unit of measure belongs to another organization.' });
    }
    if (unit.is_active === false) {
      throw new ValidationError({ message: 'The selected unit of measure is inactive.' });
    }
    return unit;
  }

  function assertPolicyConfig(policyCode, config) {
    if (policyCode === 'QUALITY_WEIGHTED') {
      if (
        !config ||
        !config.weights ||
        typeof config.weights !== 'object' ||
        Array.isArray(config.weights)
      ) {
        throw new ValidationError({
          message: 'QUALITY_WEIGHTED allocations require a policyConfig.weights object.',
        });
      }
    }
  }

  async function audit(action, entityType, entityId, organizationId, request, before, after) {
    return service.audit(
      {
        action,
        entityType,
        entityId,
        actorUserId: request?.auth?.user?.id || null,
        organizationId: organizationId || null,
        before,
        after: after || {},
      },
      request,
    );
  }

  function distributeUnits(totalUnits, weights) {
    const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
      throw new ValidationError({ message: 'Allocation weights must sum to a positive number.' });
    }
    const exact = weights.map((item) => (totalUnits * item.weight) / totalWeight);
    const units = exact.map(Math.floor);
    let remainder = totalUnits - units.reduce((sum, value) => sum + value, 0);
    const order = exact
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let cursor = 0; remainder > 0; cursor += 1, remainder -= 1) {
      units[order[cursor % order.length].index] += 1;
    }
    return { units, totalWeight };
  }

  return {
    // -----------------------------------------------------------------------
    // Farmer groups and membership
    // -----------------------------------------------------------------------

    async listGroups({ context, query = {} }) {
      const value = validate(dto.groupQuerySchema, query, 'farmer group query');
      const organizationId = await resolveOrganizationId(context, value.organizationId ?? null);
      const groups = await farmStore.listFarmerGroups({
        ...(organizationId ? { organization_id: organizationId } : {}),
        ...(value.status ? { status: value.status } : {}),
      });
      return groups.map(dto.toGroupDto);
    },

    async createGroup({ context, input, request }) {
      const value = validate(dto.groupCreateSchema, input, 'farmer group input');
      const organizationId = await resolveOrganizationId(context, value.organizationId ?? null);
      const code = value.code || generateCode('GRP');
      const sameCode = await farmStore.listFarmerGroups({ code });
      if (sameCode.length) throw new ConflictError({ message: 'Group code is already in use.' });
      const group = await farmStore.createFarmerGroup({
        id: newId(),
        organization_id: organizationId,
        owner_user_id: userIdOf(context),
        code,
        name: value.name,
        description: value.description ?? null,
        status: 'ACTIVE',
      });
      await farmStore.createGroupMember({
        id: newId(),
        group_id: group.id,
        user_id: group.owner_user_id,
        role: 'LEADER',
        status: 'ACTIVE',
        joined_at: new Date(),
      });
      await audit(
        COOPERATIVE_EVENTS.GROUP_CREATED,
        'FarmerGroup',
        group.id,
        group.organization_id,
        request,
        undefined,
        dto.toGroupDto(group),
      );
      return dto.toGroupDto(group);
    },

    async getGroup({ context, groupId }) {
      return dto.toGroupDto(await requireGroup(context, groupId));
    },

    async updateGroup({ context, groupId, input, request }) {
      const value = validate(dto.groupUpdateSchema, input, 'farmer group update');
      const group = await requireGroup(context, groupId);
      await requireLeader(context, group);
      const updated = await farmStore.updateFarmerGroup(groupId, {
        ...(value.name !== undefined ? { name: value.name } : {}),
        ...(value.description !== undefined ? { description: value.description } : {}),
        ...(value.status !== undefined ? { status: value.status } : {}),
      });
      await audit(
        COOPERATIVE_EVENTS.GROUP_UPDATED,
        'FarmerGroup',
        group.id,
        group.organization_id,
        request,
        dto.toGroupDto(group),
        dto.toGroupDto(updated),
      );
      return dto.toGroupDto(updated);
    },

    async listGroupMembers({ context, groupId, query = {} }) {
      const group = await requireGroup(context, groupId);
      const status = validate(
        dto.groupQuerySchema,
        { status: query.status },
        'member query',
      ).status;
      const members = await farmStore.listGroupMembers({
        group_id: group.id,
        ...(status ? { status } : {}),
      });
      return members.map(dto.toMemberDto);
    },

    async joinGroup({ context, groupId, input, request }) {
      const value = validate(dto.membershipCreateSchema, input || {}, 'membership input');
      const group = await requireGroup(context, groupId);
      const userId = value.userId || userIdOf(context);
      if (userId !== userIdOf(context) && !context.isSuperAdmin) {
        await requireLeader(context, group);
      }
      if (group.status !== FARMER_GROUP_STATUSES[0]) {
        throw new ConflictError({ message: 'Group is not accepting members.' });
      }
      requireRecord(await identityStore.findUserById(userId), 'User');
      const existing = await farmStore.findGroupMember(group.id, userId);
      if (existing && existing.status !== 'REMOVED') {
        throw new ConflictError({ message: 'User is already a group member.' });
      }
      let member;
      if (existing) {
        member = await farmStore.updateGroupMember(existing.id, {
          status: 'PENDING',
          role: 'MEMBER',
          joined_at: null,
        });
      } else {
        member = await farmStore.createGroupMember({
          id: newId(),
          group_id: group.id,
          user_id: userId,
          role: 'MEMBER',
          status: 'PENDING',
          joined_at: null,
        });
      }
      await audit(
        COOPERATIVE_EVENTS.MEMBER_JOINED,
        'FarmerGroupMember',
        member.id,
        group.organization_id,
        request,
        undefined,
        dto.toMemberDto(member),
      );
      return dto.toMemberDto(member);
    },

    async decideMembership({ context, groupId, userId, input, request }) {
      const { decision } = validate(dto.membershipDecisionSchema, input, 'membership decision');
      const group = await requireGroup(context, groupId);
      await requireLeader(context, group);
      if (userId === group.owner_user_id) {
        throw new ForbiddenError({ message: 'Group owner membership cannot be changed.' });
      }
      const member = requireRecord(
        await farmStore.findGroupMember(group.id, userId),
        'Group membership',
      );
      if (member.status !== 'PENDING') {
        throw new ConflictError({ message: 'Membership request is not pending.' });
      }
      const updated = await farmStore.updateGroupMember(member.id, {
        status: decision === 'ACCEPT' ? 'ACTIVE' : 'REMOVED',
        joined_at: decision === 'ACCEPT' ? new Date() : null,
      });
      await audit(
        COOPERATIVE_EVENTS.MEMBER_DECIDED,
        'FarmerGroupMember',
        member.id,
        group.organization_id,
        request,
        dto.toMemberDto(member),
        { ...dto.toMemberDto(updated), decision },
      );
      return dto.toMemberDto(updated);
    },

    async removeMember({ context, groupId, userId, request }) {
      const group = await requireGroup(context, groupId);
      await requireLeader(context, group);
      if (userId === group.owner_user_id) {
        throw new ForbiddenError({ message: 'Group owner cannot be removed.' });
      }
      const member = requireRecord(
        await farmStore.findGroupMember(group.id, userId),
        'Group membership',
      );
      const updated = await farmStore.updateGroupMember(member.id, { status: 'REMOVED' });
      await audit(
        COOPERATIVE_EVENTS.MEMBER_REMOVED,
        'FarmerGroupMember',
        member.id,
        group.organization_id,
        request,
        dto.toMemberDto(member),
        dto.toMemberDto(updated),
      );
      return dto.toMemberDto(updated);
    },

    // -----------------------------------------------------------------------
    // Cooperative campaigns
    // -----------------------------------------------------------------------

    async listCampaigns({ context, query = {} }) {
      const value = validate(dto.campaignQuerySchema, query, 'campaign query');
      const organizationId = await resolveOrganizationId(context, value.organizationId ?? null);
      const campaigns = await farmStore.listCampaigns({
        ...(organizationId ? { organization_id: organizationId } : {}),
        ...(value.groupId ? { group_id: value.groupId } : {}),
        ...(value.productId ? { product_id: value.productId } : {}),
        ...(value.status ? { status: value.status } : {}),
      });
      return campaigns.map(dto.toCampaignDto);
    },

    async createCampaign({ context, groupId, input, request }) {
      const value = validate(dto.campaignCreateSchema, input, 'campaign input');
      const group = await requireGroup(context, groupId);
      await requireLeader(context, group);
      const organizationId = await resolveOrganizationId(context, value.organizationId ?? null);
      if (group.organization_id && group.organization_id !== organizationId) {
        throw new ForbiddenError({ message: 'Campaign organization must match the group.' });
      }
      await requireProductReference(
        context,
        value.productId,
        organizationId || group.organization_id,
      );
      await requireUnit(value.unitCode, organizationId || group.organization_id);
      assertPolicyConfig(value.allocationPolicyCode, value.allocationPolicyConfig);
      const code = value.code || generateCode('CMP');
      if ((await farmStore.listCampaigns({ code })).length) {
        throw new ConflictError({ message: 'Campaign code is already in use.' });
      }
      const campaign = await farmStore.createCampaign({
        id: newId(),
        organization_id: organizationId || group.organization_id || null,
        group_id: group.id,
        created_by_user_id: userIdOf(context),
        product_id: value.productId,
        code,
        name: value.name,
        description: value.description ?? null,
        status: 'DRAFT',
        unit_code: value.unitCode,
        allocation_policy_code: value.allocationPolicyCode,
        allocation_policy_config: value.allocationPolicyConfig ?? null,
        starts_at: toDate(value.startsAt),
        ends_at: toDate(value.endsAt),
      });
      await audit(
        COOPERATIVE_EVENTS.CAMPAIGN_CREATED,
        'CooperativeCampaign',
        campaign.id,
        campaign.organization_id,
        request,
        undefined,
        dto.toCampaignDto(campaign),
      );
      return dto.toCampaignDto(campaign);
    },

    async getCampaign({ context, campaignId }) {
      const { campaign } = await requireCampaign(context, campaignId);
      return dto.toCampaignDto(campaign);
    },

    async updateCampaign({ context, campaignId, input, request }) {
      const value = validate(dto.campaignUpdateSchema, input, 'campaign update');
      const { campaign, group } = await requireEditableCampaign(context, campaignId);
      if (value.allocationPolicyCode !== undefined) {
        assertPolicyConfig(
          value.allocationPolicyCode,
          value.allocationPolicyConfig !== undefined
            ? value.allocationPolicyConfig
            : campaign.allocation_policy_code === 'QUALITY_WEIGHTED'
              ? campaign.allocation_policy_config
              : null,
        );
      } else if (
        value.allocationPolicyConfig !== undefined &&
        campaign.allocation_policy_code === 'QUALITY_WEIGHTED'
      ) {
        assertPolicyConfig(campaign.allocation_policy_code, value.allocationPolicyConfig);
      }
      const updated = await farmStore.updateCampaign(campaignId, {
        ...(value.name !== undefined ? { name: value.name } : {}),
        ...(value.description !== undefined ? { description: value.description } : {}),
        ...(value.status !== undefined ? { status: value.status } : {}),
        ...(value.allocationPolicyCode !== undefined
          ? { allocation_policy_code: value.allocationPolicyCode }
          : {}),
        ...(value.allocationPolicyConfig !== undefined
          ? { allocation_policy_config: value.allocationPolicyConfig }
          : {}),
        ...(value.startsAt !== undefined ? { starts_at: toDate(value.startsAt) } : {}),
        ...(value.endsAt !== undefined ? { ends_at: toDate(value.endsAt) } : {}),
      });
      await audit(
        COOPERATIVE_EVENTS.CAMPAIGN_UPDATED,
        'CooperativeCampaign',
        campaign.id,
        campaign.organization_id,
        request,
        dto.toCampaignDto(campaign),
        { ...dto.toCampaignDto(updated), groupId: group.id },
      );
      return dto.toCampaignDto(updated);
    },

    // -----------------------------------------------------------------------
    // Contributions and collective inventory
    // -----------------------------------------------------------------------

    async listContributions({ context, query = {} }) {
      const value = validate(dto.contributionQuerySchema, query, 'contribution query');
      const organizationId = await resolveOrganizationId(context, value.organizationId ?? null);
      const contributions = await farmStore.listContributions({
        ...(organizationId ? { organization_id: organizationId } : {}),
        ...(value.groupId ? { group_id: value.groupId } : {}),
        ...(value.campaignId ? { campaign_id: value.campaignId } : {}),
        ...(value.contributorUserId ? { contributor_user_id: value.contributorUserId } : {}),
        ...(value.status ? { status: value.status } : {}),
      });
      return contributions.map(dto.toContributionDto);
    },

    async getContribution({ context, contributionId }) {
      const { contribution } = await requireContribution(context, contributionId);
      return dto.toContributionDto(contribution);
    },

    async createContribution({ context, campaignId, input, request }) {
      const value = validate(dto.contributionCreateSchema, input, 'contribution input');
      const { campaign, group } = await requireCampaign(context, campaignId);
      await requireActiveMember(context, group);
      if (campaign.status !== 'OPEN') {
        throw new ConflictError({ message: 'Campaign is not open for contributions.' });
      }
      if (value.productId !== campaign.product_id) {
        throw new ValidationError({
          message: 'Contribution product must match the campaign product.',
        });
      }
      const unitCodeValue = value.unitCode || campaign.unit_code;
      if (unitCodeValue !== campaign.unit_code) {
        throw new ValidationError({ message: 'Contribution unit must match the campaign unit.' });
      }
      await requireUnit(unitCodeValue, campaign.organization_id || group.organization_id);
      if (value.qualityGradeCode) {
        requireRecord(
          await catalog.findQualityGradeByCode(value.qualityGradeCode),
          'Quality grade',
        );
      }
      if (value.warehouseInventoryId) {
        const inventory = requireRecord(
          await warehouseAccess.findInventoryById(value.warehouseInventoryId),
          'Warehouse inventory',
        );
        if (inventory.product_id !== campaign.product_id || inventory.unit_code !== unitCodeValue) {
          throw new ValidationError({
            message: 'Warehouse inventory does not match the campaign.',
          });
        }
        await assertRecordOrganization(context, inventory, 'Warehouse inventory');
      }
      if (value.referenceKey) {
        const existing = await farmStore.listContributions({ reference_key: value.referenceKey });
        if (existing.length) {
          if (existing[0].contributor_user_id === userIdOf(context)) {
            return dto.toContributionDto(existing[0]);
          }
          throw new ConflictError({ message: 'Contribution reference key is already in use.' });
        }
      }
      const contribution = await farmStore.createContribution({
        id: newId(),
        organization_id: campaign.organization_id || group.organization_id || null,
        group_id: group.id,
        campaign_id: campaign.id,
        contributor_user_id: userIdOf(context),
        product_id: value.productId,
        warehouse_inventory_id: value.warehouseInventoryId ?? null,
        quantity: value.quantity,
        quality_grade_code: value.qualityGradeCode ?? null,
        unit_code: unitCodeValue,
        status: 'PENDING',
        notes: value.notes ?? null,
        reference_key: value.referenceKey ?? null,
      });
      await audit(
        COOPERATIVE_EVENTS.CONTRIBUTION_CREATED,
        'GroupContribution',
        contribution.id,
        contribution.organization_id,
        request,
        undefined,
        dto.toContributionDto(contribution),
      );
      return dto.toContributionDto(contribution);
    },

    async updateContribution({ context, contributionId, input, request }) {
      const value = validate(dto.contributionUpdateSchema, input, 'contribution update');
      const { contribution, campaign } = await requireContribution(context, contributionId);
      if (!context.isSuperAdmin && contribution.contributor_user_id !== userIdOf(context)) {
        throw new ForbiddenError({
          message: 'A contribution may only be changed by its contributor.',
          details: { code: 'contribution_ownership_denied' },
        });
      }
      if (
        (value.quantity !== undefined || value.qualityGradeCode !== undefined) &&
        campaign.status !== 'OPEN'
      ) {
        throw new ConflictError({ message: 'Campaign is not open for contribution changes.' });
      }
      if (value.status !== undefined && !['WITHDRAWN', 'PENDING'].includes(value.status)) {
        throw new ValidationError({
          message: 'Contributors may only set status to PENDING or WITHDRAWN.',
        });
      }
      const updated = await farmStore.updateContribution(contributionId, {
        ...(value.quantity !== undefined ? { quantity: value.quantity } : {}),
        ...(value.qualityGradeCode !== undefined
          ? { quality_grade_code: value.qualityGradeCode }
          : {}),
        ...(value.notes !== undefined ? { notes: value.notes } : {}),
        ...(value.status !== undefined ? { status: value.status } : {}),
      });
      await audit(
        COOPERATIVE_EVENTS.CONTRIBUTION_UPDATED,
        'GroupContribution',
        contribution.id,
        contribution.organization_id,
        request,
        dto.toContributionDto(contribution),
        dto.toContributionDto(updated),
      );
      return dto.toContributionDto(updated);
    },

    async decideContribution({ context, contributionId, input, request }) {
      const { decision, note } = validate(
        dto.contributionDecisionSchema,
        input,
        'contribution decision',
      );
      const { contribution, group } = await requireContribution(context, contributionId);
      await requireLeader(context, group);
      if (contribution.status !== 'PENDING') {
        throw new ConflictError({ message: 'Contribution is not pending review.' });
      }
      const updated = await farmStore.updateContribution(contributionId, {
        status: decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED',
      });
      await audit(
        decision === 'CONFIRM'
          ? COOPERATIVE_EVENTS.CONTRIBUTION_CONFIRMED
          : COOPERATIVE_EVENTS.CONTRIBUTION_REJECTED,
        'GroupContribution',
        contribution.id,
        contribution.organization_id,
        request,
        dto.toContributionDto(contribution),
        { ...dto.toContributionDto(updated), ...(note ? { note } : {}) },
      );
      return dto.toContributionDto(updated);
    },

    // -----------------------------------------------------------------------
    // Purchase requests, allocations, and earnings
    // -----------------------------------------------------------------------

    async listPurchaseRequests({ context, query = {} }) {
      const value = validate(dto.purchaseRequestQuerySchema, query, 'purchase request query');
      const organizationId = await resolveOrganizationId(context, value.organizationId ?? null);
      const requests = await farmStore.listPurchaseRequests({
        ...(organizationId ? { organization_id: organizationId } : {}),
        ...(value.groupId ? { group_id: value.groupId } : {}),
        ...(value.campaignId ? { campaign_id: value.campaignId } : {}),
        ...(value.buyerUserId ? { buyer_user_id: value.buyerUserId } : {}),
        ...(value.status ? { status: value.status } : {}),
      });
      return requests.map(dto.toPurchaseRequestDto);
    },

    async getPurchaseRequest({ context, requestId }) {
      const { purchaseRequest } = await requirePurchaseRequest(context, requestId);
      return dto.toPurchaseRequestDto(purchaseRequest);
    },

    async createPurchaseRequest({ context, campaignId, input, request }) {
      const value = validate(dto.purchaseRequestCreateSchema, input, 'purchase request input');
      const { campaign, group } = await requireCampaign(context, campaignId);
      if (campaign.status !== 'OPEN') {
        throw new ConflictError({ message: 'Campaign is not open for purchase requests.' });
      }
      const unitCodeValue = value.unitCode || campaign.unit_code;
      if (unitCodeValue !== campaign.unit_code) {
        throw new ValidationError({
          message: 'Purchase request unit must match the campaign unit.',
        });
      }
      if (
        Boolean(value.salesAmount !== null && value.salesAmount !== undefined) !==
        Boolean(value.currency)
      ) {
        throw new ValidationError({
          message: 'salesAmount and currency must be supplied together.',
        });
      }
      if (value.referenceKey) {
        const existing = await farmStore.listPurchaseRequests({
          reference_key: value.referenceKey,
        });
        if (existing.length) {
          if (existing[0].buyer_user_id === userIdOf(context)) {
            return dto.toPurchaseRequestDto(existing[0]);
          }
          throw new ConflictError({ message: 'Purchase request reference key is already in use.' });
        }
      }
      const purchaseRequest = await farmStore.createPurchaseRequest({
        id: newId(),
        organization_id: campaign.organization_id || group.organization_id || null,
        group_id: group.id,
        campaign_id: campaign.id,
        buyer_user_id: userIdOf(context),
        quantity: value.quantity,
        unit_code: unitCodeValue,
        sales_amount: value.salesAmount ?? null,
        currency: value.currency ?? null,
        status: 'PENDING',
        reference_key: value.referenceKey ?? null,
        notes: value.notes ?? null,
      });
      await audit(
        COOPERATIVE_EVENTS.PURCHASE_REQUEST_CREATED,
        'GroupPurchaseRequest',
        purchaseRequest.id,
        purchaseRequest.organization_id,
        request,
        undefined,
        dto.toPurchaseRequestDto(purchaseRequest),
      );
      return dto.toPurchaseRequestDto(purchaseRequest);
    },

    async decidePurchaseRequest({ context, requestId, input, request }) {
      const { decision, note } = validate(
        dto.purchaseRequestDecisionSchema,
        input,
        'purchase request decision',
      );
      const { purchaseRequest, group } = await requirePurchaseRequest(context, requestId);
      await requireLeader(context, group);
      const allowed =
        (purchaseRequest.status === 'PENDING' && decision !== 'CANCEL') ||
        (decision === 'CANCEL' && ['PENDING', 'ACCEPTED'].includes(purchaseRequest.status));
      if (!allowed) {
        throw new ConflictError({ message: 'Purchase request cannot be changed to that status.' });
      }
      const status =
        decision === 'ACCEPT' ? 'ACCEPTED' : decision === 'REJECT' ? 'REJECTED' : 'CANCELLED';
      const updated = await farmStore.updatePurchaseRequest(requestId, { status });
      await audit(
        COOPERATIVE_EVENTS.PURCHASE_REQUEST_DECIDED,
        'GroupPurchaseRequest',
        requestId,
        purchaseRequest.organization_id,
        request,
        dto.toPurchaseRequestDto(purchaseRequest),
        { ...dto.toPurchaseRequestDto(updated), decision, ...(note ? { note } : {}) },
      );
      return dto.toPurchaseRequestDto(updated);
    },

    async proposeAllocations({ context, requestId, input, request }) {
      const value = validate(dto.allocationRequestSchema, input || {}, 'allocation request');
      const { purchaseRequest, campaign, group } = await requirePurchaseRequest(context, requestId);
      await requireLeader(context, group);
      if (purchaseRequest.status !== 'ACCEPTED') {
        throw new ConflictError({
          message: 'Purchase request must be accepted before allocation.',
        });
      }
      const existing = await farmStore.listAllocations({ purchase_request_id: purchaseRequest.id });
      if (existing.some((item) => item.status === 'FINALIZED')) {
        throw new ConflictError({ message: 'Purchase request has already been finalized.' });
      }
      if (existing.length) return existing.map(dto.toAllocationDto);

      const policyCode = value.policyCode || campaign.allocation_policy_code;
      const config =
        value.policyConfig !== undefined
          ? value.policyConfig
          : (campaign.allocation_policy_config ?? null);
      assertPolicyConfig(policyCode, config);

      const contributions = (
        await farmStore.listContributions({ campaign_id: campaign.id })
      ).filter((item) => item.status === 'CONFIRMED');
      if (!contributions.length) {
        throw new ConflictError({
          message: 'Campaign has no confirmed contributions to allocate.',
        });
      }
      const weights = contributions.map((contribution) => {
        let weight = 1;
        if (policyCode === 'QUALITY_WEIGHTED') {
          const raw =
            config.weights[contribution.contributor_user_id] ??
            config.weights[contribution.quality_grade_code];
          if (raw === undefined) {
            throw new ValidationError({
              message:
                'QUALITY_WEIGHTED policy requires a weight for every confirmed contribution.',
            });
          }
          weight = Number(raw);
          if (!Number.isFinite(weight) || weight < 0) {
            throw new ValidationError({
              message: 'Allocation weights must be non-negative numbers.',
            });
          }
        }
        return { contribution, weight: weight * Number(contribution.quantity) };
      });
      const { units, totalWeight } = distributeUnits(
        Math.round(Number(purchaseRequest.quantity) * 1000),
        weights,
      );
      const snapshot = {
        policyCode,
        config: config || {},
        totalWeight,
        contributionCount: contributions.length,
        calculatedAt: new Date().toISOString(),
      };
      const allocations = [];
      for (let index = 0; index < weights.length; index += 1) {
        allocations.push(
          await farmStore.createAllocation({
            id: newId(),
            organization_id: purchaseRequest.organization_id,
            group_id: group.id,
            campaign_id: campaign.id,
            purchase_request_id: purchaseRequest.id,
            contribution_id: weights[index].contribution.id,
            contributor_user_id: weights[index].contribution.contributor_user_id,
            allocated_quantity: units[index] / 1000,
            unit_code: purchaseRequest.unit_code,
            status: 'PROPOSED',
            policy_code: policyCode,
            policy_snapshot: snapshot,
          }),
        );
      }
      await audit(
        COOPERATIVE_EVENTS.ALLOCATIONS_PROPOSED,
        'GroupAllocation',
        purchaseRequest.id,
        purchaseRequest.organization_id,
        request,
        undefined,
        { allocations: allocations.map(dto.toAllocationDto) },
      );
      return allocations.map(dto.toAllocationDto);
    },

    async listAllocations({ context, query = {} }) {
      const value = validate(dto.allocationQuerySchema, query, 'allocation query');
      const organizationId = await resolveOrganizationId(context, value.organizationId ?? null);
      const allocations = await farmStore.listAllocations({
        ...(organizationId ? { organization_id: organizationId } : {}),
        ...(value.groupId ? { group_id: value.groupId } : {}),
        ...(value.campaignId ? { campaign_id: value.campaignId } : {}),
        ...(value.requestId ? { purchase_request_id: value.requestId } : {}),
        ...(value.contributorUserId ? { contributor_user_id: value.contributorUserId } : {}),
        ...(value.status ? { status: value.status } : {}),
      });
      return allocations.map(dto.toAllocationDto);
    },

    async finalizePurchaseRequest({ context, requestId, request }) {
      const { purchaseRequest, group } = await requirePurchaseRequest(context, requestId);
      await requireLeader(context, group);
      const existingEarnings = await farmStore.listEarnings({ purchase_request_id: requestId });
      if (existingEarnings.length) return existingEarnings.map(dto.toEarningDto);
      if (purchaseRequest.status !== 'ACCEPTED') {
        throw new ConflictError({
          message: 'Purchase request must be accepted before finalization.',
        });
      }
      if (
        purchaseRequest.sales_amount === null ||
        purchaseRequest.sales_amount === undefined ||
        !purchaseRequest.currency
      ) {
        throw new ValidationError({
          message: 'salesAmount and currency are required before finalizing earnings.',
        });
      }
      const allocations = (
        await farmStore.listAllocations({ purchase_request_id: requestId })
      ).filter((item) => item.status === 'PROPOSED');
      if (!allocations.length) {
        throw new ConflictError({ message: 'Propose allocations before finalizing.' });
      }
      const totalUnits = allocations.reduce(
        (sum, item) => sum + Math.round(Number(item.allocated_quantity) * 1000),
        0,
      );
      const salesCents = Math.round(Number(purchaseRequest.sales_amount) * 100);
      const exact = allocations.map(
        (item) => (salesCents * Math.round(Number(item.allocated_quantity) * 1000)) / totalUnits,
      );
      const cents = exact.map(Math.floor);
      let remainder = salesCents - cents.reduce((sum, value) => sum + value, 0);
      const order = exact
        .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
        .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
      for (let cursor = 0; remainder > 0; cursor += 1, remainder -= 1) {
        cents[order[cursor % order.length].index] += 1;
      }
      const earnings = [];
      for (let index = 0; index < allocations.length; index += 1) {
        const allocation = allocations[index];
        await farmStore.updateAllocation(allocation.id, { status: 'FINALIZED' });
        earnings.push(
          await farmStore.createEarning({
            id: newId(),
            organization_id: purchaseRequest.organization_id,
            group_id: group.id,
            campaign_id: purchaseRequest.campaign_id,
            allocation_id: allocation.id,
            contribution_id: allocation.contribution_id,
            purchase_request_id: purchaseRequest.id,
            contributor_user_id: allocation.contributor_user_id,
            amount: cents[index] / 100,
            currency: purchaseRequest.currency,
            status: 'ACCRUED',
            policy_code: allocation.policy_code,
            metadata: {
              purchaseRequestId: purchaseRequest.id,
              allocationId: allocation.id,
              policySnapshot: allocation.policy_snapshot ?? null,
            },
          }),
        );
      }
      await farmStore.updatePurchaseRequest(requestId, { status: 'FULFILLED' });
      await audit(
        COOPERATIVE_EVENTS.ALLOCATIONS_FINALIZED,
        'GroupPurchaseRequest',
        requestId,
        purchaseRequest.organization_id,
        request,
        dto.toPurchaseRequestDto(purchaseRequest),
        { allocations: allocations.map(dto.toAllocationDto) },
      );
      await audit(
        COOPERATIVE_EVENTS.EARNINGS_ACCRUED,
        'GroupEarning',
        requestId,
        purchaseRequest.organization_id,
        request,
        undefined,
        { earnings: earnings.map(dto.toEarningDto) },
      );
      return earnings.map(dto.toEarningDto);
    },

    async listEarnings({ context, query = {} }) {
      const value = validate(dto.earningQuerySchema, query, 'earning query');
      const organizationId = await resolveOrganizationId(context, value.organizationId ?? null);
      const earnings = await farmStore.listEarnings({
        ...(organizationId ? { organization_id: organizationId } : {}),
        ...(value.groupId ? { group_id: value.groupId } : {}),
        ...(value.campaignId ? { campaign_id: value.campaignId } : {}),
        ...(value.contributorUserId ? { contributor_user_id: value.contributorUserId } : {}),
        ...(value.status ? { status: value.status } : {}),
      });
      return earnings.map(dto.toEarningDto);
    },

    async listMyEarnings({ context, query = {} }) {
      const value = validate(dto.earningQuerySchema, query, 'earning query');
      const earnings = await farmStore.listEarnings({
        contributor_user_id: userIdOf(context),
        ...(value.groupId ? { group_id: value.groupId } : {}),
        ...(value.campaignId ? { campaign_id: value.campaignId } : {}),
        ...(value.status ? { status: value.status } : {}),
      });
      return earnings.map(dto.toEarningDto);
    },
  };
}

module.exports = { createCooperativeApi, COOPERATIVE_EVENTS };

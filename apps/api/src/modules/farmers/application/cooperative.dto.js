const { isoDateTime, z } = require('@cropsy/validation');

const {
  COOPERATIVE_CAMPAIGN_STATUSES,
  FARMER_GROUP_STATUSES,
  GROUP_ALLOCATION_STATUSES,
  GROUP_CONTRIBUTION_STATUSES,
  GROUP_EARNING_STATUSES,
  GROUP_PURCHASE_REQUEST_STATUSES,
  ALLOCATION_POLICY_CODES,
} = require('../domain/farmers.entity');

const uuid = z.string().uuid();
const shortText = z.string().trim().min(1).max(180);
const longText = z.string().trim().max(4000);
const code = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Z0-9_-]+$/i, 'Code may contain letters, digits, underscores, and hyphens.');
const referenceKey = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/, 'Reference key contains unsupported characters.');
const unitCode = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[A-Za-z0-9_-]+$/, 'Unit code may contain letters, digits, underscores, and hyphens.');
const attributeCode = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, 'Code may contain letters, digits, underscores, and hyphens.');
const quantity = z.number().min(0.001).max(1e12);
const money = z.number().min(0).max(1e12);
const currency = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Currency must be a three-letter uppercase code.');
const optionalUuid = uuid.nullable().optional();

const groupCreateSchema = z
  .object({
    organizationId: optionalUuid,
    code: code.optional(),
    name: shortText,
    description: longText.nullable().optional(),
  })
  .strict();

const groupUpdateSchema = z
  .object({
    name: shortText.optional(),
    description: longText.nullable().optional(),
    status: z.enum(FARMER_GROUP_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required.' });

const groupParamsSchema = z.object({ groupId: uuid });
const groupQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    status: z.enum(FARMER_GROUP_STATUSES).optional(),
  })
  .strict();

const memberParamsSchema = z.object({ groupId: uuid, userId: uuid });
const membershipCreateSchema = z
  .object({
    userId: uuid.optional(),
  })
  .strict();
const membershipDecisionSchema = z
  .object({
    decision: z.enum(['ACCEPT', 'REJECT']),
  })
  .strict();

const campaignCreateSchema = z
  .object({
    organizationId: optionalUuid,
    code: code.optional(),
    name: shortText,
    description: longText.nullable().optional(),
    productId: uuid,
    unitCode,
    allocationPolicyCode: z.enum(ALLOCATION_POLICY_CODES).default('PROPORTIONAL'),
    allocationPolicyConfig: z.record(z.unknown()).nullable().optional(),
    startsAt: isoDateTime.nullable().optional(),
    endsAt: isoDateTime.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.endsAt || !value.startsAt || new Date(value.endsAt) >= new Date(value.startsAt),
    {
      message: 'endsAt cannot precede startsAt.',
    },
  );

const campaignUpdateSchema = z
  .object({
    name: shortText.optional(),
    description: longText.nullable().optional(),
    status: z.enum(COOPERATIVE_CAMPAIGN_STATUSES).optional(),
    allocationPolicyCode: z.enum(ALLOCATION_POLICY_CODES).optional(),
    allocationPolicyConfig: z.record(z.unknown()).nullable().optional(),
    startsAt: isoDateTime.nullable().optional(),
    endsAt: isoDateTime.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required.' });

const campaignParamsSchema = z.object({ campaignId: uuid });
const campaignQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    groupId: uuid.optional(),
    productId: uuid.optional(),
    status: z.enum(COOPERATIVE_CAMPAIGN_STATUSES).optional(),
  })
  .strict();

const contributionCreateSchema = z
  .object({
    productId: uuid,
    quantity,
    unitCode: unitCode.optional(),
    qualityGradeCode: attributeCode.optional(),
    warehouseInventoryId: uuid.nullable().optional(),
    notes: longText.nullable().optional(),
    referenceKey: referenceKey.optional(),
  })
  .strict();

const contributionUpdateSchema = z
  .object({
    quantity: quantity.optional(),
    qualityGradeCode: attributeCode.nullable().optional(),
    notes: longText.nullable().optional(),
    status: z.enum(GROUP_CONTRIBUTION_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required.' });

const contributionDecisionSchema = z
  .object({
    decision: z.enum(['CONFIRM', 'REJECT']),
    note: longText.optional(),
  })
  .strict();

const contributionParamsSchema = z.object({ contributionId: uuid });
const contributionQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    groupId: uuid.optional(),
    campaignId: uuid.optional(),
    contributorUserId: uuid.optional(),
    status: z.enum(GROUP_CONTRIBUTION_STATUSES).optional(),
  })
  .strict();

const purchaseRequestCreateSchema = z
  .object({
    quantity,
    unitCode: unitCode.optional(),
    salesAmount: money.nullable().optional(),
    currency: currency.nullable().optional(),
    notes: longText.nullable().optional(),
    referenceKey: referenceKey.optional(),
  })
  .strict();

const purchaseRequestDecisionSchema = z
  .object({
    decision: z.enum(['ACCEPT', 'REJECT', 'CANCEL']),
    note: longText.optional(),
  })
  .strict();

const purchaseRequestParamsSchema = z.object({ requestId: uuid });
const purchaseRequestQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    groupId: uuid.optional(),
    campaignId: uuid.optional(),
    buyerUserId: uuid.optional(),
    status: z.enum(GROUP_PURCHASE_REQUEST_STATUSES).optional(),
  })
  .strict();

const allocationRequestSchema = z
  .object({
    policyCode: z.enum(ALLOCATION_POLICY_CODES).optional(),
    policyConfig: z.record(z.unknown()).nullable().optional(),
  })
  .strict();

const allocationQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    groupId: uuid.optional(),
    campaignId: uuid.optional(),
    requestId: uuid.optional(),
    contributorUserId: uuid.optional(),
    status: z.enum(GROUP_ALLOCATION_STATUSES).optional(),
  })
  .strict();

const earningQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    groupId: uuid.optional(),
    campaignId: uuid.optional(),
    contributorUserId: uuid.optional(),
    status: z.enum(GROUP_EARNING_STATUSES).optional(),
  })
  .strict();

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toGroupDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    ownerUserId: record.owner_user_id,
    code: record.code,
    name: record.name,
    description: record.description ?? null,
    status: record.status,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toMemberDto(record) {
  return {
    id: record.id,
    groupId: record.group_id,
    userId: record.user_id,
    role: record.role,
    status: record.status,
    joinedAt: toIso(record.joined_at),
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toCampaignDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    groupId: record.group_id,
    createdByUserId: record.created_by_user_id,
    productId: record.product_id,
    code: record.code,
    name: record.name,
    description: record.description ?? null,
    status: record.status,
    unitCode: record.unit_code,
    allocationPolicyCode: record.allocation_policy_code,
    allocationPolicyConfig: record.allocation_policy_config ?? null,
    startsAt: toIso(record.starts_at),
    endsAt: toIso(record.ends_at),
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toContributionDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    groupId: record.group_id,
    campaignId: record.campaign_id,
    contributorUserId: record.contributor_user_id,
    productId: record.product_id,
    warehouseInventoryId: record.warehouse_inventory_id ?? null,
    quantity: Number(record.quantity),
    qualityGradeCode: record.quality_grade_code ?? null,
    unitCode: record.unit_code,
    status: record.status,
    notes: record.notes ?? null,
    referenceKey: record.reference_key ?? null,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toPurchaseRequestDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    groupId: record.group_id,
    campaignId: record.campaign_id,
    buyerUserId: record.buyer_user_id,
    quantity: Number(record.quantity),
    unitCode: record.unit_code,
    salesAmount:
      record.sales_amount === null || record.sales_amount === undefined
        ? null
        : Number(record.sales_amount),
    currency: record.currency ?? null,
    status: record.status,
    referenceKey: record.reference_key ?? null,
    notes: record.notes ?? null,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toAllocationDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    groupId: record.group_id,
    campaignId: record.campaign_id,
    purchaseRequestId: record.purchase_request_id,
    contributionId: record.contribution_id,
    contributorUserId: record.contributor_user_id,
    allocatedQuantity: Number(record.allocated_quantity),
    unitCode: record.unit_code,
    status: record.status,
    policyCode: record.policy_code,
    policySnapshot: record.policy_snapshot ?? null,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toEarningDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    groupId: record.group_id,
    campaignId: record.campaign_id,
    allocationId: record.allocation_id ?? null,
    contributionId: record.contribution_id ?? null,
    purchaseRequestId: record.purchase_request_id ?? null,
    contributorUserId: record.contributor_user_id,
    amount: Number(record.amount),
    currency: record.currency,
    status: record.status,
    policyCode: record.policy_code,
    metadata: record.metadata ?? null,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

module.exports = {
  groupCreateSchema,
  groupUpdateSchema,
  groupParamsSchema,
  groupQuerySchema,
  memberParamsSchema,
  membershipCreateSchema,
  membershipDecisionSchema,
  campaignCreateSchema,
  campaignUpdateSchema,
  campaignParamsSchema,
  campaignQuerySchema,
  contributionCreateSchema,
  contributionUpdateSchema,
  contributionDecisionSchema,
  contributionParamsSchema,
  contributionQuerySchema,
  purchaseRequestCreateSchema,
  purchaseRequestDecisionSchema,
  purchaseRequestParamsSchema,
  purchaseRequestQuerySchema,
  allocationRequestSchema,
  allocationQuerySchema,
  earningQuerySchema,
  toGroupDto,
  toMemberDto,
  toCampaignDto,
  toContributionDto,
  toPurchaseRequestDto,
  toAllocationDto,
  toEarningDto,
};

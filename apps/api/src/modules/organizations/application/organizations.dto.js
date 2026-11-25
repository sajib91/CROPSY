const { z, isoDateTime } = require('@cropsy/validation');

const nonEmpty = z.string().trim().min(1);
const uuid = z.string().uuid();

const ORGANIZATION_TYPES = Object.freeze([
  ['AGRICULTURAL_COMPANY', 'Agricultural Company'],
  ['FARMER_COOPERATIVE', 'Farmer Cooperative'],
  ['WHOLESALE_BUSINESS', 'Wholesale Business'],
  ['RETAIL_BUSINESS', 'Retail Business'],
  ['AGRICULTURAL_SUPPLIER', 'Agricultural Supplier'],
  ['LOGISTICS_COMPANY', 'Logistics Company'],
  ['WAREHOUSE', 'Warehouse'],
  ['OTHER', 'Other'],
]);

const ORGANIZATION_DOCUMENT_TYPES = Object.freeze([
  'REGISTRATION_CERTIFICATE',
  'TAX_DOCUMENT',
  'TRADE_LICENSE',
  'BANK_STATEMENT',
  'INSURANCE',
  'OTHER',
]);

const ORGANIZATION_STATUSES = Object.freeze(['ACTIVE', 'SUSPENDED', 'INACTIVE']);
const VERIFICATION_STATUSES = Object.freeze(['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED']);
const MEMBER_STATUSES = Object.freeze(['ACTIVE', 'INVITED', 'SUSPENDED', 'LEFT']);
const INVITATION_STATUSES = Object.freeze([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);

const organizationTypeSchema = z.enum(ORGANIZATION_TYPES.map(([code]) => code));
const organizationDocumentTypeSchema = z.enum(ORGANIZATION_DOCUMENT_TYPES);
const organizationStatusSchema = z.enum(ORGANIZATION_STATUSES);
const verificationStatusSchema = z.enum(VERIFICATION_STATUSES);
const invitationStatusSchema = z.enum(INVITATION_STATUSES);

const moduleInfoSchema = z.object({
  id: z.string().uuid(),
  moduleId: nonEmpty,
  name: nonEmpty,
  description: nonEmpty,
  status: nonEmpty,
  path: nonEmpty,
  dependsOn: z.array(nonEmpty),
  publishes: z.array(nonEmpty),
  subscribes: z.array(nonEmpty),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

function toModuleInfoDto(entity, metadata) {
  return {
    id: entity.id,
    moduleId: metadata.id,
    name: metadata.name,
    description: metadata.description,
    status: entity.status,
    path: metadata.path,
    dependsOn: [...metadata.dependsOn],
    publishes: [...metadata.publishes],
    subscribes: [...metadata.subscribes],
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

const createOrganizationSchema = z
  .object({
    name: nonEmpty.max(180),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase URL slug.')
      .max(180)
      .optional(),
    legalName: nonEmpty.max(255).optional(),
    taxId: nonEmpty.max(64).optional(),
    organizationType: organizationTypeSchema.default('OTHER'),
    description: z.string().trim().max(4000).optional(),
    website: z.string().trim().url().max(255).optional(),
    contactEmail: z.string().trim().email().max(255).optional(),
    contactPhone: z
      .string()
      .trim()
      .regex(/^(?:\+?88)?01[3-9]\d{8}$/, 'Use a valid Bangladesh mobile number.')
      .optional(),
    defaultCurrency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .default('BDT'),
  })
  .strict();

const updateOrganizationSchema = createOrganizationSchema.partial();

const organizationStatusUpdateSchema = z
  .object({
    status: organizationStatusSchema,
  })
  .strict();

const verificationUpdateSchema = z
  .object({
    verificationStatus: verificationStatusSchema,
    verificationNote: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((value) => value.verificationStatus !== 'REJECTED' || Boolean(value.verificationNote), {
    message: 'A verification note is required when rejecting an organization.',
  });

const organizationIdParamsSchema = z.object({ organizationId: uuid }).strict();

const organizationQuerySchema = z
  .object({
    organizationType: organizationTypeSchema.optional(),
    status: organizationStatusSchema.optional(),
    verificationStatus: verificationStatusSchema.optional(),
  })
  .strict();

const inviteMemberSchema = z
  .object({
    email: z.string().trim().email().max(255),
    roleCode: nonEmpty.max(80),
  })
  .strict();

const invitationTokenSchema = z
  .object({
    token: nonEmpty.max(512),
    email: z.string().trim().email().max(255).optional(),
  })
  .strict();

const invitationParamsSchema = z.object({ organizationId: uuid, invitationId: uuid }).strict();

const memberParamsSchema = z
  .object({
    organizationId: uuid,
    userId: uuid,
  })
  .strict();

const addressCreateSchema = z
  .object({
    label: nonEmpty.max(80),
    addressLine1: nonEmpty.max(255),
    addressLine2: z.string().trim().max(255).optional(),
    city: z.string().trim().max(120).optional(),
    divisionId: uuid.optional(),
    districtId: uuid.optional(),
    upazilaId: uuid.optional(),
    unionId: uuid.optional(),
    postalCode: z.string().trim().max(16).optional(),
    isPrimary: z.boolean().default(false),
  })
  .strict();

const addressUpdateSchema = addressCreateSchema.partial();

const addressParamsSchema = z
  .object({
    organizationId: uuid,
    addressId: uuid,
  })
  .strict();

const documentCreateSchema = z
  .object({
    documentType: organizationDocumentTypeSchema,
    fileName: nonEmpty.max(255),
    fileUrl: z.string().trim().url().max(2000),
    mimeType: z.string().trim().max(120).optional(),
    sizeBytes: z.coerce.number().int().min(0).max(104857600).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

const documentUpdateSchema = z
  .object({
    verificationStatus: verificationStatusSchema,
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

const documentParamsSchema = z
  .object({
    organizationId: uuid,
    documentId: uuid,
  })
  .strict();

const switchOrganizationSchema = z.object({ organizationId: uuid }).strict();

function toOrganizationDto(organization) {
  if (!organization) return null;
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    legalName: organization.legal_name || null,
    taxId: organization.tax_id || null,
    ownerUserId: organization.owner_user_id,
    organizationType: organization.organization_type,
    description: organization.description || null,
    website: organization.website || null,
    contactEmail: organization.contact_email || null,
    contactPhone: organization.contact_phone || null,
    verificationStatus: organization.verification_status,
    verificationNote: organization.verification_note || null,
    verifiedAt: organization.verified_at || null,
    defaultCurrency: organization.default_currency,
    status: organization.status,
    createdAt: organization.created_at,
    updatedAt: organization.updated_at,
  };
}

function toMemberDto(member) {
  return {
    userId: member.user_id,
    email: member.user?.email || null,
    phone: member.user?.phone || null,
    status: member.status,
    joinedAt: member.joined_at || null,
    leftAt: member.left_at || null,
  };
}

function toInvitationDto(invitation) {
  return {
    id: invitation.id,
    organizationId: invitation.organization_id,
    email: invitation.email,
    roleCode: invitation.roleCode || invitation.role_code || null,
    status: invitation.status,
    expiresAt: invitation.expires_at,
    acceptedAt: invitation.accepted_at || null,
    createdAt: invitation.created_at,
  };
}

function toAddressDto(address) {
  return {
    id: address.id,
    organizationId: address.organization_id,
    label: address.label,
    addressLine1: address.address_line_1,
    addressLine2: address.address_line_2 || null,
    city: address.city || null,
    divisionId: address.division_id || null,
    districtId: address.district_id || null,
    upazilaId: address.upazila_id || null,
    unionId: address.union_id || null,
    postalCode: address.postal_code || null,
    isPrimary: Boolean(address.is_primary),
    createdAt: address.created_at,
    updatedAt: address.updated_at,
  };
}

function toDocumentDto(document) {
  return {
    id: document.id,
    organizationId: document.organization_id,
    uploadedByUserId: document.uploaded_by_user_id,
    documentType: document.document_type,
    fileName: document.file_name,
    fileUrl: document.file_url,
    mimeType: document.mime_type || null,
    sizeBytes: document.size_bytes ?? null,
    verificationStatus: document.verification_status,
    notes: document.notes || null,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
}

module.exports = {
  INVITATION_STATUSES,
  MEMBER_STATUSES,
  ORGANIZATION_DOCUMENT_TYPES,
  ORGANIZATION_STATUSES,
  ORGANIZATION_TYPES,
  VERIFICATION_STATUSES,
  addressCreateSchema,
  addressParamsSchema,
  addressUpdateSchema,
  createOrganizationSchema,
  documentCreateSchema,
  documentParamsSchema,
  documentUpdateSchema,
  invitationParamsSchema,
  invitationStatusSchema,
  invitationTokenSchema,
  inviteMemberSchema,
  memberParamsSchema,
  moduleInfoSchema,
  organizationIdParamsSchema,
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
  verificationStatusSchema,
  verificationUpdateSchema,
};

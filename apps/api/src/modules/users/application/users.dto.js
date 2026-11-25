const { z, isoDateTime } = require('@cropsy/validation');

const nonEmpty = z.string().trim().min(1);
const uuid = z.string().uuid();

const NOTIFICATION_CHANNELS = Object.freeze(['IN_APP', 'EMAIL', 'SMS', 'PUSH']);
const VERIFICATION_STATUSES = Object.freeze(['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED']);
const GENDERS = Object.freeze(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']);

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

const profileUpdateSchema = z
  .object({
    firstName: nonEmpty.max(120).optional(),
    lastName: nonEmpty.max(120).optional(),
    nameBn: z.string().trim().max(240).nullable().optional(),
    avatarUrl: z.string().trim().url().max(2000).nullable().optional(),
    dateOfBirth: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
      .nullable()
      .optional(),
    gender: z.enum(GENDERS).nullable().optional(),
    preferredLanguage: z.enum(['EN', 'BN']).optional(),
    defaultCurrency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  })
  .strict();

const contactUpdateSchema = z
  .object({
    email: z.string().trim().email().max(255).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^(?:\+?88)?01[3-9]\d{8}$/, 'Use a valid Bangladesh mobile number.')
      .optional(),
  })
  .strict()
  .refine((value) => value.email !== undefined || value.phone !== undefined, {
    message: 'Supply email or phone.',
  });

const userIdParamsSchema = z.object({ userId: uuid }).strict();
const roleCodeParamsSchema = z.object({ roleCode: nonEmpty.max(80) }).strict();
const addressIdParamsSchema = z.object({ addressId: uuid }).strict();

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

const notificationPreferenceSchema = z
  .object({
    channel: z.enum(NOTIFICATION_CHANNELS),
    eventType: nonEmpty.max(80),
    enabled: z.boolean().default(true),
  })
  .strict();

const notificationPreferencesSchema = z
  .array(notificationPreferenceSchema)
  .max(100)
  .superRefine((items, context) => {
    const seen = new Set();
    for (const [index, item] of items.entries()) {
      const key = `${item.channel}:${item.eventType}`;
      if (seen.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: 'Duplicate channel and event type.',
        });
      }
      seen.add(key);
    }
  });

const farmerProfileSchema = z
  .object({
    farmerCode: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_-]{4,64}$/, 'Use 4-64 uppercase letters, digits, hyphens, or underscores.')
      .optional(),
    organizationId: uuid.optional(),
    // Omitted fields must stay omitted so partial updates preserve persisted
    // verification state instead of resetting it to a default.
    verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
    farmSizeHectares: z.coerce.number().min(0).max(1000000).optional(),
    experienceYears: z.coerce.number().int().min(0).max(80).nullable().optional(),
    primaryCropId: uuid.nullable().optional(),
  })
  .strict();

const roleProfileDataSchema = z.record(z.any()).superRefine((value, context) => {
  if (Object.keys(value).length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Role profile data must have at least one field.',
    });
  }
  if (JSON.stringify(value).length > 10000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Role profile data must be at most 10000 characters.',
    });
  }
});

const roleProfileUpdateSchema = z
  .object({
    organizationId: uuid.optional(),
    data: roleProfileDataSchema,
  })
  .strict();

function accountVerificationStatus(user) {
  const emailVerified = Boolean(user.is_email_verified);
  const phoneVerified = Boolean(user.is_phone_verified);
  if (emailVerified && phoneVerified) return 'VERIFIED';
  if (emailVerified || phoneVerified) return 'PENDING';
  return 'UNVERIFIED';
}

function toProfileDto({ user, profile, roles = [], organizations = [] }) {
  return {
    id: user.id,
    userId: user.id,
    email: user.email || null,
    phone: user.phone || null,
    firstName: profile?.first_name || '',
    lastName: profile?.last_name || '',
    nameBn: profile?.name_bn || null,
    avatarUrl: profile?.avatar_url || null,
    dateOfBirth: profile?.date_of_birth || null,
    gender: profile?.gender || null,
    preferredLanguage: profile?.preferred_language || 'EN',
    defaultCurrency: profile?.default_currency || 'BDT',
    accountStatus: user.account_status,
    isEmailVerified: Boolean(user.is_email_verified),
    isPhoneVerified: Boolean(user.is_phone_verified),
    // UserProfile has no verification column. Account-level verification is
    // derived from verified contact channels; role-specific verification lives
    // in FarmerProfile or document records.
    verificationStatus: accountVerificationStatus(user),
    roleCodes: roles.map((role) => role.code || role.role_code).filter(Boolean),
    organizations: organizations.map((organization) => ({
      id: organization.id || organization.organization_id,
      name: organization.name || organization.organization?.name || null,
      roleCodes: organization.roleCodes || [],
    })),
  };
}

function toAddressDto(address) {
  return {
    id: address.id,
    userId: address.user_id,
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

function toPreferenceDto(preference) {
  return {
    id: preference.id,
    channel: preference.channel,
    eventType: preference.event_type,
    enabled: Boolean(preference.enabled),
    createdAt: preference.created_at,
    updatedAt: preference.updated_at,
  };
}

function toFarmerProfileDto(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    userId: profile.user_id,
    organizationId: profile.organization_id || null,
    farmerCode: profile.farmer_code,
    verificationStatus: profile.verification_status,
    farmSizeHectares: Number(profile.farm_size_hectares),
    experienceYears: profile.experience_years ?? null,
    primaryCropId: profile.primary_crop_id || null,
    storage: 'farmer_profile',
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function toRoleExtensionDto(extension) {
  return {
    id: extension.id,
    userId: extension.user_id,
    roleCode: extension.role_code,
    organizationId: extension.organization_id || null,
    scopeKey: extension.scope_key,
    data: extension.data,
    storage: 'role_profile_extension',
    createdAt: extension.created_at,
    updatedAt: extension.updated_at,
  };
}

module.exports = {
  GENDERS,
  NOTIFICATION_CHANNELS,
  VERIFICATION_STATUSES,
  addressCreateSchema,
  addressIdParamsSchema,
  addressUpdateSchema,
  contactUpdateSchema,
  farmerProfileSchema,
  moduleInfoSchema,
  notificationPreferencesSchema,
  profileUpdateSchema,
  roleCodeParamsSchema,
  roleProfileDataSchema,
  roleProfileUpdateSchema,
  toAddressDto,
  toFarmerProfileDto,
  toModuleInfoDto,
  toPreferenceDto,
  toProfileDto,
  toRoleExtensionDto,
  userIdParamsSchema,
};

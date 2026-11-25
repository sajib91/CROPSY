const { isoDateTime, z } = require('@cropsy/validation');

const {
  LISTING_SORTS,
  LISTING_STATUSES,
  REPORT_REASONS,
  REPORT_STATUSES,
} = require('../domain/marketplace.entity');

const uuid = z.string().uuid();
const shortText = z.string().trim().min(1).max(180);
const longText = z.string().trim().max(4000);
const code = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Z0-9_-]+$/i, 'Code may contain letters, digits, underscores, and hyphens.');
const currency = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Currency must be a three-letter uppercase code.');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.');
const positiveNumber = z.number().min(0.001).max(1e12);
const imageUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'Image URL must use http or https.',
  });

const nullableText = (schema = shortText) => schema.nullable().optional();
const optionalUuid = uuid.nullable().optional();

const moduleInfoSchema = z.object({
  id: z.string().uuid(),
  moduleId: shortText,
  name: shortText,
  description: shortText,
  status: shortText,
  path: shortText,
  dependsOn: z.array(shortText),
  publishes: z.array(shortText),
  subscribes: z.array(shortText),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const locationCreateSchema = z
  .object({
    divisionId: optionalUuid,
    districtId: optionalUuid,
    upazilaId: optionalUuid,
    unionId: optionalUuid,
    label: nullableText(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    radiusMeters: z.number().int().min(1).max(1000000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.latitude === undefined) !== (value.longitude === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['latitude'],
        message: 'latitude and longitude must be supplied together.',
      });
    }
    const hasDetail =
      value.label ||
      value.divisionId ||
      value.districtId ||
      value.upazilaId ||
      value.unionId ||
      (value.latitude !== undefined && value.longitude !== undefined);
    if (!hasDetail) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['label'],
        message: 'At least one location detail is required.',
      });
    }
  });

const listingImageCreateSchema = z
  .object({
    url: imageUrl,
    altText: nullableText(),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .strict();

const listingCreateSchema = z
  .object({
    organizationId: optionalUuid,
    productId: uuid,
    status: z.enum(LISTING_STATUSES).default('DRAFT'),
    title: shortText,
    description: nullableText(longText),
    unitPrice: positiveNumber,
    currency: currency.default('BDT'),
    quantityAvailable: positiveNumber,
    minOrderQuantity: positiveNumber.default(1),
    qualityGradeId: optionalUuid,
    harvestDate: isoDate.nullable().optional(),
    availableLocation: nullableText(),
    startsAt: isoDateTime.nullable().optional(),
    endsAt: isoDateTime.nullable().optional(),
    locations: z.array(locationCreateSchema).max(20).default([]),
    images: z.array(listingImageCreateSchema).max(20).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.availableLocation && !value.harvestDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['availableLocation'],
        message: 'Either availableLocation or harvestDate is required.',
      });
    }
    if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'endsAt must be later than startsAt.',
      });
    }
  });

const listingUpdateSchema = z
  .object({
    status: z.enum(LISTING_STATUSES).optional(),
    title: shortText.optional(),
    description: nullableText(longText),
    unitPrice: positiveNumber.optional(),
    currency: currency.optional(),
    quantityAvailable: positiveNumber.optional(),
    minOrderQuantity: positiveNumber.optional(),
    qualityGradeId: optionalUuid,
    harvestDate: isoDate.nullable().optional(),
    availableLocation: nullableText(),
    startsAt: isoDateTime.nullable().optional(),
    endsAt: isoDateTime.nullable().optional(),
  })
  .strict();

const listingQuerySchema = z
  .object({
    search: z.string().trim().max(180).optional(),
    productId: uuid.optional(),
    categoryId: uuid.optional(),
    categoryCode: code.optional(),
    sellerUserId: uuid.optional(),
    organizationId: uuid.optional(),
    status: z.enum(LISTING_STATUSES).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    location: z.string().trim().max(180).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    radiusMeters: z.coerce.number().int().min(1).max(1000000).optional(),
    sort: z.enum(LISTING_SORTS).default('newest'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict()
  .superRefine((value, context) => {
    const coordinates = [value.latitude, value.longitude, value.radiusMeters].filter(
      (item) => item !== undefined,
    );
    if (coordinates.length > 0 && coordinates.length < 3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['latitude'],
        message: 'latitude, longitude, and radiusMeters must be supplied together.',
      });
    }
    if (
      value.minPrice !== undefined &&
      value.maxPrice !== undefined &&
      value.maxPrice < value.minPrice
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxPrice'],
        message: 'maxPrice must be greater than or equal to minPrice.',
      });
    }
  });

const reportCreateSchema = z
  .object({
    reason: z.enum(REPORT_REASONS),
    details: nullableText(longText),
  })
  .strict();

const reportReviewSchema = z
  .object({ status: z.enum(REPORT_STATUSES).refine((value) => value !== 'PENDING') })
  .strict();

const reportQuerySchema = z
  .object({
    listingId: uuid.optional(),
    status: z.enum(REPORT_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const messageCreateSchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();

const messageQuerySchema = z
  .object({
    listingId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const paramsSchema = z.object({ moduleId: shortText });
const idParamsSchema = z.object({ id: uuid });
const listingParamsSchema = z.object({ listingId: uuid });
const listingImageParamsSchema = z.object({ listingId: uuid, imageId: uuid });
const listingLocationParamsSchema = z.object({ listingId: uuid, locationId: uuid });
const favoriteParamsSchema = z.object({ listingId: uuid });
const sellerParamsSchema = z.object({ sellerId: uuid });
const reportParamsSchema = z.object({ reportId: uuid });
const messageParamsSchema = z.object({ messageId: uuid });

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

function toLocationDto(record) {
  return {
    id: record.id,
    label: record.location_label || null,
    divisionId: record.division_id || null,
    districtId: record.district_id || null,
    upazilaId: record.upazila_id || null,
    unionId: record.union_id || null,
    radiusMeters: record.radius_meters ?? null,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

function toImageDto(record) {
  return {
    id: record.id,
    url: record.url,
    altText: record.alt_text || null,
    sortOrder: record.sort_order,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

function toSellerDto({ user, profile, organization, farmerProfile } = {}) {
  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const displayName = `${firstName} ${lastName}`.trim() || 'CROPSY seller';
  return {
    id: user?.id || null,
    displayName,
    displayNameBn: profile?.name_bn || null,
    avatarUrl: profile?.avatar_url || null,
    organization: organization
      ? { id: organization.id, name: organization.name, slug: organization.slug || null }
      : null,
    verificationStatus: farmerProfile?.verification_status || null,
  };
}

function toProductDto(record, category) {
  if (!record) return null;
  return {
    id: record.id,
    sku: record.sku,
    name: record.name,
    nameBn: record.name_bn || null,
    unitCode: record.unit_code,
    categoryId: record.category_id,
    categoryCode: category?.code || null,
    categoryName: category?.name || null,
    categoryNameBn: category?.name_bn || null,
    description: record.description || null,
    descriptionBn: record.description_bn || null,
    isAvailable: record.is_available,
  };
}

function toGradeDto(record) {
  if (!record) return null;
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    nameBn: record.name_bn || null,
  };
}

function isoDateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function toListingDto(record, related = {}) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    productId: record.product_id,
    product: toProductDto(related.product, related.category),
    seller: related.seller || null,
    status: record.status,
    title: record.title,
    description: record.description || null,
    unitPrice: record.unit_price,
    currency: record.currency,
    quantityAvailable: record.quantity_available,
    minOrderQuantity: record.min_order_quantity,
    qualityGrade: toGradeDto(related.qualityGrade),
    harvestDate: isoDateOnly(record.harvest_date),
    availableLocation: record.available_location || null,
    locations: (related.locations || []).map(toLocationDto),
    images: (related.images || []).map(toImageDto),
    distanceMeters: related.distanceMeters ?? null,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

function toReportDto(record) {
  return {
    id: record.id,
    listingId: record.listing_id,
    reporterUserId: record.reporter_user_id,
    reason: record.reason,
    details: record.details || null,
    status: record.status,
    reviewedByUserId: record.reviewed_by_user_id || null,
    reviewedAt: record.reviewed_at ? record.reviewed_at.toISOString() : null,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

function toMessageDto(record) {
  return {
    id: record.id,
    listingId: record.listing_id,
    senderUserId: record.sender_user_id,
    recipientUserId: record.recipient_user_id,
    body: record.body,
    readAt: record.read_at ? record.read_at.toISOString() : null,
    createdAt: record.created_at.toISOString(),
  };
}

module.exports = {
  favoriteParamsSchema,
  idParamsSchema,
  listingCreateSchema,
  listingImageCreateSchema,
  listingImageParamsSchema,
  listingLocationParamsSchema,
  listingParamsSchema,
  listingQuerySchema,
  listingUpdateSchema,
  locationCreateSchema,
  messageCreateSchema,
  messageParamsSchema,
  messageQuerySchema,
  moduleInfoSchema,
  paramsSchema,
  reportCreateSchema,
  reportParamsSchema,
  reportQuerySchema,
  reportReviewSchema,
  sellerParamsSchema,
  toImageDto,
  toListingDto,
  toLocationDto,
  toMessageDto,
  toModuleInfoDto,
  toReportDto,
  toSellerDto,
};

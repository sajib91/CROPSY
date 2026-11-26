const { isoDateTime, z } = require('@cropsy/validation');

const {
  BATCH_STATUSES,
  TRACEABILITY_EVENT_TYPES,
  VERIFICATION_STATUSES,
} = require('../domain/traceability.entity');

const uuid = z.string().uuid();
const nonEmptyString = z.string().trim().min(1);
const shortText = z.string().trim().min(1).max(180);
const longText = z.string().trim().max(4000);
const optionalUuid = uuid.nullable().optional();
const code = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[A-Z0-9_-]+$/i, 'Code may contain letters, digits, underscores, and hyphens.');
const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);
const metadata = z.record(z.unknown()).default({});

const PUBLIC_VERIFICATION_NOTICE = 'No verified public facts are available for this code.';
const PUBLIC_VERIFICATION_DISCLAIMER = 'Unverified claims are not represented as certified.';

const moduleInfoSchema = z.object({
  id: uuid,
  moduleId: nonEmptyString,
  name: nonEmptyString,
  description: nonEmptyString,
  status: nonEmptyString,
  path: nonEmptyString,
  dependsOn: z.array(nonEmptyString),
  publishes: z.array(nonEmptyString),
  subscribes: z.array(nonEmptyString),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

function toModuleInfoDto(entity, metadataInfo) {
  return {
    id: entity.id,
    moduleId: metadataInfo.id,
    name: metadataInfo.name,
    description: metadataInfo.description,
    status: entity.status,
    path: metadataInfo.path,
    dependsOn: [...metadataInfo.dependsOn],
    publishes: [...metadataInfo.publishes],
    subscribes: [...metadataInfo.subscribes],
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

const batchCreateSchema = z
  .object({
    organizationId: optionalUuid,
    productId: uuid,
    batchCode: code,
    harvestId: optionalUuid,
    cultivationId: optionalUuid,
    farmId: optionalUuid,
    farmerUserId: optionalUuid,
    sellerUserId: optionalUuid,
    buyerUserId: optionalUuid,
    shipmentId: optionalUuid,
    inspectionId: optionalUuid,
    warehouseEntryAt: isoDateTime.nullable().optional(),
    publicDisclosure: z.boolean().default(false),
    notes: longText.nullable().optional(),
  })
  .strict();

const batchUpdateSchema = z
  .object({
    status: z.enum(BATCH_STATUSES).optional(),
    publicDisclosure: z.boolean().optional(),
    sellerUserId: optionalUuid,
    buyerUserId: optionalUuid,
    shipmentId: optionalUuid,
    warehouseEntryAt: isoDateTime.nullable().optional(),
    notes: longText.nullable().optional(),
  })
  .strict();

const batchQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    productId: uuid.optional(),
    batchCode: code.optional(),
    status: z.enum(BATCH_STATUSES).optional(),
    verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
    search: z.string().trim().max(120).optional(),
  })
  .strict();

const timelineQuerySchema = z
  .object({
    batchId: uuid.optional(),
    since: isoDateTime.optional(),
    until: isoDateTime.optional(),
  })
  .strict();

const eventCreateSchema = z
  .object({
    eventType: z.enum(TRACEABILITY_EVENT_TYPES),
    occurredAt: isoDateTime.optional(),
    title: shortText,
    description: longText.nullable().optional(),
    locationDescription: z.string().trim().max(255).nullable().optional(),
    longitude: longitude.nullable().optional(),
    latitude: latitude.nullable().optional(),
    actorUserId: optionalUuid,
    sourceModule: z.string().trim().max(40).nullable().optional(),
    sourceRecordId: z.string().trim().min(1).max(128).nullable().optional(),
    publicDisclosure: z.boolean().default(false),
    verificationStatus: z.enum(VERIFICATION_STATUSES).default('UNVERIFIED'),
    warehouseId: optionalUuid,
    shipmentId: optionalUuid,
    inspectionId: optionalUuid,
    metadata,
  })
  .strict()
  .refine(
    (value) =>
      (value.longitude === undefined || value.longitude === null) ===
      (value.latitude === undefined || value.latitude === null),
    { message: 'longitude and latitude must be supplied together.' },
  );

const verificationSchema = z
  .object({
    note: longText.optional(),
  })
  .strict();

const verificationTokenSchema = z.string().trim().min(1).max(128);

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function toBatchDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    productId: record.product_id ?? null,
    batchCode: record.batch_code,
    harvestId: record.harvest_id ?? null,
    cultivationId: record.cultivation_id ?? null,
    farmId: record.farm_id ?? null,
    farmerUserId: record.farmer_user_id ?? null,
    sellerUserId: record.seller_user_id ?? null,
    buyerUserId: record.buyer_user_id ?? null,
    shipmentId: record.shipment_id ?? null,
    inspectionId: record.inspection_id ?? null,
    warehouseEntryAt: toIso(record.warehouse_entry_at),
    status: record.status,
    verificationStatus: record.verification_status,
    publicDisclosure: record.public_disclosure !== false,
    verificationToken: record.verification_token,
    qrPayload: record.qr_payload ?? null,
    createdByUserId: record.created_by_user_id ?? null,
    verifiedByUserId: record.verified_by_user_id ?? null,
    verifiedAt: toIso(record.verified_at),
    notes: record.notes ?? null,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toEventDto(record) {
  return {
    id: record.id,
    batchId: record.batch_id,
    eventType: record.event_type,
    occurredAt: toIso(record.occurred_at),
    title: record.title,
    description: record.description ?? null,
    locationDescription: record.location_description ?? null,
    longitude: toNumber(record.longitude),
    latitude: toNumber(record.latitude),
    actorUserId: record.actor_user_id ?? null,
    sourceModule: record.source_module ?? null,
    sourceRecordId: record.source_record_id ?? null,
    publicDisclosure: record.public_disclosure !== false,
    verificationStatus: record.verification_status ?? 'UNVERIFIED',
    metadata: record.metadata ?? {},
    createdAt: toIso(record.created_at),
  };
}

function toAuditDto(record) {
  return {
    id: record.id,
    batchId: record.batch_id ?? null,
    action: record.action,
    actorUserId: record.actor_user_id ?? null,
    organizationId: record.organization_id ?? null,
    before: record.before ?? null,
    after: record.after ?? {},
    createdAt: toIso(record.created_at),
  };
}

function toPublicFact(event) {
  return {
    occurredAt: toIso(event.occurred_at ?? event.occurredAt),
    eventType: event.event_type ?? event.eventType ?? null,
    title: event.title ?? null,
    description: event.description ?? null,
    locationDescription: event.location_description ?? event.locationDescription ?? null,
  };
}

function isPubliclyVerifiable(batch) {
  return Boolean(
    batch &&
    batch.verification_status === 'VERIFIED' &&
    batch.public_disclosure !== false &&
    batch.verification_token,
  );
}

function toPublicVerificationDto(batch, events = []) {
  if (!isPubliclyVerifiable(batch)) {
    return {
      batchCode: null,
      productId: null,
      verificationStatus: 'UNVERIFIED',
      verifiedAt: null,
      publicDisclosure: false,
      facts: [],
      notice: PUBLIC_VERIFICATION_NOTICE,
      disclaimer: PUBLIC_VERIFICATION_DISCLAIMER,
    };
  }

  const facts = (events || [])
    .filter((event) => {
      const disclosed =
        event.public_disclosure === undefined ? event.publicDisclosure : event.public_disclosure;
      const status =
        event.verification_status === undefined
          ? event.verificationStatus
          : event.verification_status;
      return disclosed === true && status === 'VERIFIED';
    })
    .map(toPublicFact);

  if (facts.length === 0) {
    return {
      batchCode: null,
      productId: null,
      verificationStatus: 'UNVERIFIED',
      verifiedAt: null,
      publicDisclosure: false,
      facts: [],
      notice: PUBLIC_VERIFICATION_NOTICE,
      disclaimer: PUBLIC_VERIFICATION_DISCLAIMER,
    };
  }

  return {
    batchCode: batch.batch_code,
    productId: batch.product_id ?? null,
    verificationStatus: batch.verification_status,
    verifiedAt: toIso(batch.verified_at),
    publicDisclosure: true,
    facts,
    disclaimer: PUBLIC_VERIFICATION_DISCLAIMER,
  };
}

module.exports = {
  moduleInfoSchema,
  toModuleInfoDto,
  batchCreateSchema,
  batchUpdateSchema,
  batchQuerySchema,
  timelineQuerySchema,
  eventCreateSchema,
  verificationSchema,
  verificationTokenSchema,
  toBatchDto,
  toEventDto,
  toAuditDto,
  toPublicVerificationDto,
  isPubliclyVerifiable,
  PUBLIC_VERIFICATION_NOTICE,
  PUBLIC_VERIFICATION_DISCLAIMER,
};

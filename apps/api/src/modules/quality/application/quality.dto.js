const { z, isoDateTime } = require('@cropsy/validation');

const {
  EVIDENCE_TYPES,
  GRADE_SOURCES,
  INSPECTION_RESULTS,
  VERIFICATION_STATUSES,
} = require('../domain/quality.entity');

const uuid = z.string().uuid();
const optionalUuid = uuid.nullable().optional();
const nonEmptyString = z.string().trim().min(1);
const shortText = z.string().trim().min(1).max(180);
const longText = z.string().trim().max(4000);
const batchCode = z.string().trim().min(1).max(128);
const gradeCode = z.string().trim().min(1).max(32);
const uri = z.string().trim().min(1).max(2048);
const mimeType = z.string().trim().min(1).max(255);
const checksum = z.string().trim().min(1).max(255);
const note = z.string().trim().min(1).max(4000);

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

const inspectionCreateSchema = z
  .object({
    organizationId: optionalUuid,
    shipmentId: optionalUuid,
    warehouseInventoryId: optionalUuid,
    productId: optionalUuid,
    batchCode: batchCode.nullable().optional(),
    inspectorUserId: optionalUuid,
    inspectedAt: isoDateTime.optional(),
    result: z.enum(INSPECTION_RESULTS).default('PENDING'),
    gradeCode: gradeCode.nullable().optional(),
    gradeSource: z.enum(GRADE_SOURCES).default('INSPECTOR'),
    notes: longText.nullable().optional(),
  })
  .strict();

const inspectionUpdateSchema = z
  .object({
    shipmentId: optionalUuid,
    warehouseInventoryId: optionalUuid,
    productId: optionalUuid,
    batchCode: batchCode.nullable().optional(),
    inspectorUserId: optionalUuid,
    inspectedAt: isoDateTime.optional(),
    result: z.enum(INSPECTION_RESULTS).optional(),
    gradeCode: gradeCode.nullable().optional(),
    gradeSource: z.enum(GRADE_SOURCES).optional(),
    notes: longText.nullable().optional(),
  })
  .strict();

const inspectionQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    shipmentId: uuid.optional(),
    warehouseInventoryId: uuid.optional(),
    productId: uuid.optional(),
    batchCode: shortText.optional(),
    result: z.enum(INSPECTION_RESULTS).optional(),
    gradeCode: gradeCode.optional(),
    verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
  })
  .strict();

const evidenceCreateSchema = z
  .object({
    evidenceType: z.enum(EVIDENCE_TYPES).default('OTHER'),
    uri,
    checksum: checksum.nullable().optional(),
    mimeType: mimeType.nullable().optional(),
    description: longText.nullable().optional(),
    capturedAt: isoDateTime.nullable().optional(),
    recordedByUserId: optionalUuid,
    publicDisclosure: z.boolean().default(false),
  })
  .strict();

const imageCreateSchema = z
  .object({
    uri,
    checksum: checksum.nullable().optional(),
    mimeType: mimeType
      .regex(/^image\//i, 'Image mimeType must begin with image/')
      .nullable()
      .optional(),
    description: longText.nullable().optional(),
    capturedAt: isoDateTime.nullable().optional(),
    recordedByUserId: optionalUuid,
    publicDisclosure: z.boolean().default(false),
  })
  .strict();

const evidenceQuerySchema = z
  .object({
    evidenceType: z.enum(EVIDENCE_TYPES).optional(),
    publicDisclosure: z.coerce.boolean().optional(),
  })
  .strict();

const gradeSchema = z
  .object({
    gradeCode,
    gradeSource: z.enum(GRADE_SOURCES).default('INSPECTOR'),
  })
  .strict();

const verifySchema = z
  .object({
    note: longText.nullable().optional(),
  })
  .strict();

const rejectSchema = z
  .object({
    note,
  })
  .strict();

const auditQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    inspectionId: uuid.optional(),
    action: shortText.optional(),
    since: isoDateTime.optional(),
    until: isoDateTime.optional(),
  })
  .strict();

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toInspectionDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    shipmentId: record.shipment_id ?? null,
    warehouseInventoryId: record.warehouse_inventory_id ?? null,
    productId: record.product_id ?? null,
    batchCode: record.batch_code ?? null,
    inspectorUserId: record.inspector_user_id ?? null,
    inspectedAt: toIso(record.inspected_at),
    result: record.result,
    gradeCode: record.grade_code ?? null,
    gradeSource: record.grade_source,
    notes: record.notes ?? null,
    verificationStatus: record.verification_status,
    verifiedByUserId: record.verified_by_user_id ?? null,
    verifiedAt: toIso(record.verified_at),
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toEvidenceDto(record) {
  return {
    id: record.id,
    inspectionId: record.inspection_id,
    evidenceType: record.evidence_type,
    uri: record.uri,
    checksum: record.checksum ?? null,
    mimeType: record.mime_type ?? null,
    description: record.description ?? null,
    capturedAt: toIso(record.captured_at),
    recordedByUserId: record.recorded_by_user_id ?? null,
    publicDisclosure: record.public_disclosure === true,
    createdAt: toIso(record.created_at),
  };
}

function toAuditDto(record) {
  return {
    id: record.id,
    inspectionId: record.inspection_id ?? null,
    action: record.action,
    actorUserId: record.actor_user_id ?? null,
    organizationId: record.organization_id ?? null,
    before: record.before ?? null,
    after: record.after ?? null,
    ipAddress: record.ip_address ?? null,
    userAgent: record.user_agent ?? null,
    requestId: record.request_id ?? null,
    createdAt: toIso(record.created_at),
  };
}

function valueOf(record, snakeKey, camelKey) {
  if (!record) return null;
  return record[snakeKey] ?? record[camelKey] ?? null;
}

function toPublicEvidenceDto(record) {
  return {
    evidenceType: valueOf(record, 'evidence_type', 'evidenceType'),
    uri: record.uri,
    checksum: record.checksum ?? null,
    mimeType: valueOf(record, 'mime_type', 'mimeType'),
    description: record.description ?? null,
    capturedAt: toIso(valueOf(record, 'captured_at', 'capturedAt')),
  };
}

/** Facts published to traceability. Private evidence is never exposed. */
function toInspectionFactsDto(record, evidenceRows = []) {
  const verificationStatus = valueOf(record, 'verification_status', 'verificationStatus');
  const publicEvidence =
    verificationStatus === 'VERIFIED'
      ? evidenceRows
          .filter((row) => row?.public_disclosure === true || row?.publicDisclosure === true)
          .map(toPublicEvidenceDto)
      : [];
  return {
    id: record?.id ?? null,
    batchCode: valueOf(record, 'batch_code', 'batchCode'),
    productId: valueOf(record, 'product_id', 'productId'),
    inspectedAt: toIso(valueOf(record, 'inspected_at', 'inspectedAt')),
    result: record?.result ?? null,
    gradeCode: valueOf(record, 'grade_code', 'gradeCode'),
    gradeSource: valueOf(record, 'grade_source', 'gradeSource'),
    verificationStatus,
    verifiedAt: toIso(valueOf(record, 'verified_at', 'verifiedAt')),
    publicEvidence,
  };
}

module.exports = {
  moduleInfoSchema,
  toModuleInfoDto,
  inspectionCreateSchema,
  inspectionUpdateSchema,
  inspectionQuerySchema,
  evidenceCreateSchema,
  imageCreateSchema,
  evidenceQuerySchema,
  gradeSchema,
  verifySchema,
  rejectSchema,
  auditQuerySchema,
  toInspectionDto,
  toEvidenceDto,
  toAuditDto,
  toPublicEvidenceDto,
  toInspectionFactsDto,
  toIso,
};

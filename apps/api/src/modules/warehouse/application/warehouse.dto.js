const { isoDateTime, z } = require('@cropsy/validation');

const {
  INVENTORY_ALERT_STATUSES,
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_RESERVATION_STATUSES,
  WAREHOUSE_STATUSES,
} = require('../domain/warehouse.entity');

const uuid = z.string().uuid();
const nonEmptyString = z.string().trim().min(1);
const shortText = z.string().trim().min(1).max(180);
const longText = z.string().trim().max(4000);
const code = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Z0-9_-]+$/i, 'Code may contain letters, digits, underscores, and hyphens.');
const unitCode = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[A-Za-z0-9_-]+$/, 'Unit code may contain letters, digits, underscores, and hyphens.');
const referenceKey = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/, 'Reference key contains unsupported characters.');
const quantity = z.number().min(0.001).max(1e12);
const nonnegativeQuantity = z.number().min(0).max(1e12);
const optionalUuid = uuid.nullable().optional();

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

const warehouseCreateSchema = z
  .object({
    organizationId: optionalUuid,
    code,
    name: shortText,
    managerUserId: optionalUuid,
    addressId: optionalUuid,
    divisionId: optionalUuid,
    districtId: optionalUuid,
    upazilaId: optionalUuid,
    unionId: optionalUuid,
    capacityCubicMeters: nonnegativeQuantity.optional(),
    status: z.enum(WAREHOUSE_STATUSES).default('ACTIVE'),
  })
  .strict();

const warehouseUpdateSchema = z
  .object({
    name: shortText.optional(),
    managerUserId: optionalUuid,
    addressId: optionalUuid,
    divisionId: optionalUuid,
    districtId: optionalUuid,
    upazilaId: optionalUuid,
    unionId: optionalUuid,
    capacityCubicMeters: nonnegativeQuantity.nullable().optional(),
    status: z.enum(WAREHOUSE_STATUSES).optional(),
  })
  .strict();

const warehouseParamsSchema = z.object({ warehouseId: uuid });
const warehouseQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    status: z.enum(WAREHOUSE_STATUSES).optional(),
    search: z.string().trim().max(120).optional(),
  })
  .strict();

const inventoryCreateSchema = z
  .object({
    organizationId: optionalUuid,
    warehouseId: uuid,
    productId: uuid,
    batchCode: z.string().trim().min(1).max(80).default('NO_BATCH'),
    quantity,
    unitCode,
    lowStockThreshold: nonnegativeQuantity.default(0),
    reason: longText.nullable().optional(),
    referenceKey: referenceKey.optional(),
  })
  .strict();

const inventoryUpdateSchema = z
  .object({
    quantity: quantity.optional(),
    lowStockThreshold: nonnegativeQuantity.optional(),
    reason: longText.optional(),
    referenceKey: referenceKey.optional(),
  })
  .strict()
  .refine((value) => value.quantity !== undefined || value.lowStockThreshold !== undefined, {
    message: 'quantity or lowStockThreshold is required.',
  });

const inventoryParamsSchema = z.object({ inventoryId: uuid });
const inventoryQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    warehouseId: uuid.optional(),
    productId: uuid.optional(),
    batchCode: z.string().trim().max(80).optional(),
    status: z.enum(['BELOW_THRESHOLD', 'OPEN_ALERT']).optional(),
  })
  .strict();

const movementCreateSchema = z
  .object({
    deltaQuantity: z
      .number()
      .min(-1e12)
      .max(1e12)
      .refine((value) => value !== 0, {
        message: 'deltaQuantity must be non-zero.',
      }),
    reason: longText.min(1),
    referenceKey: referenceKey.optional(),
  })
  .strict();

const quantityMutationSchema = z
  .object({
    quantity,
    reason: longText.optional(),
    referenceKey: referenceKey.optional(),
  })
  .strict();

const reservationCreateSchema = z
  .object({
    quantity,
    referenceKey,
    reason: longText.optional(),
    expiresAt: isoDateTime.nullable().optional(),
  })
  .strict();

const reservationSettleSchema = z
  .object({
    quantity: quantity.optional(),
    reason: longText.optional(),
    referenceKey: referenceKey.optional(),
  })
  .strict();

const reservationParamsSchema = z.object({ reservationId: uuid });
const reservationQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    warehouseId: uuid.optional(),
    productId: uuid.optional(),
    inventoryId: uuid.optional(),
    status: z.enum(INVENTORY_RESERVATION_STATUSES).optional(),
  })
  .strict();

const movementQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    warehouseId: uuid.optional(),
    productId: uuid.optional(),
    inventoryId: uuid.optional(),
    movementType: z.enum(INVENTORY_MOVEMENT_TYPES).optional(),
    actorUserId: uuid.optional(),
    since: isoDateTime.optional(),
    until: isoDateTime.optional(),
  })
  .strict();

const alertQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    warehouseId: uuid.optional(),
    productId: uuid.optional(),
    inventoryId: uuid.optional(),
    status: z.enum(INVENTORY_ALERT_STATUSES).optional(),
  })
  .strict();

const alertParamsSchema = z.object({ alertId: uuid });

const alertActionSchema = z
  .object({
    note: longText.optional(),
  })
  .strict();

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toWarehouseDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    code: record.code,
    name: record.name,
    managerUserId: record.manager_user_id ?? null,
    addressId: record.address_id ?? null,
    divisionId: record.division_id ?? null,
    districtId: record.district_id ?? null,
    upazilaId: record.upazila_id ?? null,
    unionId: record.union_id ?? null,
    capacityCubicMeters: record.capacity_cubic_meters ?? null,
    status: record.status,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toInventoryDto(record, related = {}) {
  return {
    id: record.id,
    warehouseId: record.warehouse_id,
    productId: record.product_id,
    batchCode: record.batch_code,
    quantityOnHand: Number(record.quantity_on_hand),
    quantityReserved: Number(record.quantity_reserved),
    availableQuantity: Number(record.available_quantity),
    lowStockThreshold: Number(record.low_stock_threshold || 0),
    unitCode: record.unit_code,
    warehouse: related.warehouse ? toWarehouseDto(related.warehouse) : null,
    product: related.product
      ? { id: related.product.id, sku: related.product.sku, name: related.product.name }
      : null,
    openAlertId: related.alert?.id || null,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toMovementDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    warehouseId: record.warehouse_id,
    inventoryId: record.warehouse_inventory_id ?? null,
    productId: record.product_id,
    movementType: record.movement_type,
    quantity: Number(record.quantity),
    quantityBefore: Number(record.quantity_before),
    quantityAfter: Number(record.quantity_after),
    unitCode: record.unit_code,
    reason: record.reason ?? null,
    referenceKey: record.reference_key ?? null,
    referenceId: record.reference_id ?? null,
    actorUserId: record.actor_user_id ?? null,
    createdAt: toIso(record.created_at),
  };
}

function toReservationDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    warehouseId: record.warehouse_id,
    inventoryId: record.warehouse_inventory_id,
    productId: record.product_id,
    quantity: Number(record.quantity),
    settledQuantity: Number(record.settled_quantity || 0),
    remainingQuantity: Number(record.quantity) - Number(record.settled_quantity || 0),
    status: record.status,
    referenceKey: record.reference_key,
    actorUserId: record.actor_user_id ?? null,
    expiresAt: toIso(record.expires_at),
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toAlertDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    warehouseId: record.warehouse_id,
    inventoryId: record.warehouse_inventory_id,
    productId: record.product_id,
    thresholdQuantity: Number(record.threshold_quantity),
    availableQuantity: Number(record.available_quantity),
    status: record.status,
    acknowledgedByUserId: record.acknowledged_by_user_id ?? null,
    acknowledgedAt: toIso(record.acknowledged_at),
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

module.exports = {
  moduleInfoSchema,
  toModuleInfoDto,
  warehouseCreateSchema,
  warehouseUpdateSchema,
  warehouseParamsSchema,
  warehouseQuerySchema,
  inventoryCreateSchema,
  inventoryUpdateSchema,
  inventoryParamsSchema,
  inventoryQuerySchema,
  movementCreateSchema,
  quantityMutationSchema,
  reservationCreateSchema,
  reservationSettleSchema,
  reservationParamsSchema,
  reservationQuerySchema,
  movementQuerySchema,
  alertQuerySchema,
  alertParamsSchema,
  alertActionSchema,
  toWarehouseDto,
  toInventoryDto,
  toMovementDto,
  toReservationDto,
  toAlertDto,
};

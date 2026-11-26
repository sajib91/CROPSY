const { isoDateTime, z } = require('@cropsy/validation');

const {
  INVENTORY_ALERT_STATUSES,
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_RESERVATION_STATUSES,
  RECONCILIATION_STATUSES,
  STORAGE_CONDITION_STATUSES,
  WAREHOUSE_LOCATION_STATUSES,
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
const batchCode = z.string().trim().min(1).max(80);
const defaultBatchCode = batchCode.default('NO_BATCH');
const booleanQuery = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);
const temperature = z.number().min(-100).max(200);
const humidity = z.number().min(0).max(100);

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

// Locations -----------------------------------------------------------------

const locationCreateSchema = z
  .object({
    warehouseId: uuid,
    code,
    name: shortText,
    zone: shortText.nullable().optional(),
    aisle: shortText.nullable().optional(),
    rack: shortText.nullable().optional(),
    shelf: shortText.nullable().optional(),
    capacityUnits: nonnegativeQuantity.nullable().optional(),
    status: z.enum(WAREHOUSE_LOCATION_STATUSES).default('ACTIVE'),
  })
  .strict();

const locationUpdateSchema = z
  .object({
    name: shortText.optional(),
    zone: shortText.nullable().optional(),
    aisle: shortText.nullable().optional(),
    rack: shortText.nullable().optional(),
    shelf: shortText.nullable().optional(),
    capacityUnits: nonnegativeQuantity.nullable().optional(),
    status: z.enum(WAREHOUSE_LOCATION_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one location field is required.',
  });

const locationParamsSchema = z.object({ locationId: uuid });
const locationQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    warehouseId: uuid.optional(),
    status: z.enum(WAREHOUSE_LOCATION_STATUSES).optional(),
    search: z.string().trim().max(120).optional(),
  })
  .strict();

// Receiving, allocation, transfer and dispatch ------------------------------

const receiptCreateSchema = z
  .object({
    warehouseId: uuid,
    productId: uuid,
    batchCode: defaultBatchCode,
    quantity,
    unitCode,
    referenceKey,
    locationId: optionalUuid,
    notes: longText.optional(),
  })
  .strict();

const allocationCreateSchema = z
  .object({
    warehouseId: uuid,
    productId: uuid,
    batchCode: defaultBatchCode,
    quantity,
    unitCode,
    referenceKey,
    orderId: optionalUuid,
    notes: longText.optional(),
  })
  .strict();

const transferCreateSchema = z
  .object({
    fromWarehouseId: uuid,
    toWarehouseId: uuid,
    productId: uuid,
    batchCode: defaultBatchCode,
    quantity,
    unitCode,
    referenceKey,
    notes: longText.optional(),
  })
  .strict()
  .refine((value) => value.fromWarehouseId !== value.toWarehouseId, {
    message: 'Source and destination warehouses must be different.',
  });

const dispatchCreateSchema = z
  .object({
    warehouseId: uuid,
    productId: uuid,
    batchCode: defaultBatchCode,
    quantity,
    unitCode,
    referenceKey,
    shipmentId: optionalUuid,
    notes: longText.optional(),
  })
  .strict();

// Storage conditions --------------------------------------------------------

const conditionCreateSchema = z
  .object({
    warehouseId: uuid,
    warehouseInventoryId: optionalUuid,
    recordedAt: isoDateTime.optional(),
    temperatureC: temperature,
    humidityPercent: humidity,
    conditionStatus: z.enum(STORAGE_CONDITION_STATUSES).default('NORMAL'),
    notes: longText.optional(),
  })
  .strict();

const conditionQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    warehouseId: uuid.optional(),
    inventoryId: uuid.optional(),
    conditionStatus: z.enum(STORAGE_CONDITION_STATUSES).optional(),
    since: isoDateTime.optional(),
    until: isoDateTime.optional(),
  })
  .strict();

// Reconciliation ------------------------------------------------------------

const reconciliationCreateSchema = z
  .object({
    warehouseId: uuid,
    warehouseInventoryId: uuid,
    productId: optionalUuid,
    countedQuantity: nonnegativeQuantity,
    referenceKey,
    notes: longText.optional(),
  })
  .strict();

const reconciliationApproveSchema = z
  .object({
    notes: longText.optional(),
  })
  .strict();

const reconciliationParamsSchema = z.object({ reconciliationId: uuid });
const reconciliationQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    warehouseId: uuid.optional(),
    productId: uuid.optional(),
    inventoryId: uuid.optional(),
    status: z.enum(RECONCILIATION_STATUSES).optional(),
  })
  .strict();

// Staff assignments ---------------------------------------------------------

const staffCreateSchema = z
  .object({
    warehouseId: uuid,
    userId: uuid,
    roleCode: shortText,
    isActive: z.boolean().default(true),
  })
  .strict();

const staffUpdateSchema = z
  .object({
    roleCode: shortText.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.roleCode !== undefined || value.isActive !== undefined, {
    message: 'roleCode or isActive is required.',
  });

const staffParamsSchema = z.object({ staffId: uuid });
const staffQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    warehouseId: uuid.optional(),
    userId: uuid.optional(),
    roleCode: shortText.optional(),
    isActive: booleanQuery.optional(),
  })
  .strict();

// Reporting -----------------------------------------------------------------

const reportQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    warehouseId: uuid.optional(),
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

function toLocationDto(record) {
  return {
    id: record.id,
    warehouseId: record.warehouse_id,
    code: record.code,
    name: record.name,
    zone: record.zone ?? null,
    aisle: record.aisle ?? null,
    rack: record.rack ?? null,
    shelf: record.shelf ?? null,
    capacityUnits:
      record.capacity_units === null || record.capacity_units === undefined
        ? null
        : Number(record.capacity_units),
    status: record.status,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toConditionDto(record) {
  return {
    id: record.id,
    warehouseId: record.warehouse_id,
    inventoryId: record.warehouse_inventory_id ?? null,
    recordedAt: toIso(record.recorded_at),
    temperatureC: Number(record.temperature_c),
    humidityPercent: Number(record.humidity_percent),
    conditionStatus: record.condition_status,
    notes: record.notes ?? null,
    recordedByUserId: record.recorded_by_user_id ?? null,
    createdAt: toIso(record.created_at),
  };
}

function toReconciliationDto(record) {
  return {
    id: record.id,
    warehouseId: record.warehouse_id,
    inventoryId: record.warehouse_inventory_id,
    productId: record.product_id,
    countedQuantity: Number(record.counted_quantity),
    systemQuantity: Number(record.system_quantity),
    differenceQuantity: Number(record.difference_quantity),
    status: record.status,
    referenceKey: record.reference_key,
    notes: record.notes ?? null,
    countedByUserId: record.counted_by_user_id ?? null,
    approvedByUserId: record.approved_by_user_id ?? null,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toStaffDto(record) {
  return {
    id: record.id,
    warehouseId: record.warehouse_id,
    userId: record.user_id,
    roleCode: record.role_code,
    assignedByUserId: record.assigned_by_user_id ?? null,
    isActive: record.is_active !== false,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toStockOperationDto(inventoryDto, { movement = null, replayed = false, ...extra } = {}) {
  return {
    ...inventoryDto,
    ...extra,
    inventory: inventoryDto,
    movement: movement ? toMovementDto(movement) : null,
    replayed: Boolean(replayed),
  };
}

function toReceiptResultDto(inventoryDto, options = {}) {
  return toStockOperationDto(inventoryDto, options);
}

function toDispatchResultDto(inventoryDto, options = {}) {
  return toStockOperationDto(inventoryDto, options);
}

function toTransferResultDto({
  from = null,
  to = null,
  fromMovement = null,
  toMovement = null,
  referenceKey = null,
  replayed = false,
}) {
  return {
    referenceKey,
    replayed: Boolean(replayed),
    fromWarehouseId: from?.warehouseId ?? null,
    toWarehouseId: to?.warehouseId ?? null,
    productId: from?.productId ?? to?.productId ?? null,
    from,
    to,
    movements: [fromMovement, toMovement].filter(Boolean).map(toMovementDto),
  };
}

function roundQuantity(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function toCapacityDto({ warehouse, inventories = [], locations = [] }) {
  const onHand = inventories.reduce((total, item) => total + Number(item.quantity_on_hand), 0);
  const reserved = inventories.reduce((total, item) => total + Number(item.quantity_reserved), 0);
  const available = inventories.reduce((total, item) => total + Number(item.available_quantity), 0);
  const capacity =
    warehouse.capacity_cubic_meters === null || warehouse.capacity_cubic_meters === undefined
      ? null
      : Number(warehouse.capacity_cubic_meters);
  const usedCapacity = roundQuantity(onHand);
  return {
    warehouseId: warehouse.id,
    warehouseCode: warehouse.code,
    capacityCubicMeters: capacity,
    usedCapacity,
    usedCapacityUnits: usedCapacity,
    reservedUnits: roundQuantity(reserved),
    availableUnits: roundQuantity(available),
    utilizationPercentage:
      capacity && capacity > 0 ? roundQuantity((usedCapacity / capacity) * 100, 2) : null,
    inventoryCount: inventories.length,
    locations: locations.map((location) => ({
      ...toLocationDto(location),
      usedUnits: null,
      utilizationPercentage: null,
    })),
  };
}

function toReportDto({ warehouses = [], totals = {} }) {
  return {
    warehouses,
    totals: {
      warehouses: totals.warehouses ?? warehouses.length,
      products: totals.products ?? 0,
      onHand: roundQuantity(totals.onHand ?? 0),
      reserved: roundQuantity(totals.reserved ?? 0),
      available: roundQuantity(totals.available ?? 0),
      lowStockAlerts: totals.lowStockAlerts ?? 0,
      movements: totals.movements ?? {},
    },
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
  locationCreateSchema,
  locationUpdateSchema,
  locationParamsSchema,
  locationQuerySchema,
  receiptCreateSchema,
  allocationCreateSchema,
  transferCreateSchema,
  dispatchCreateSchema,
  conditionCreateSchema,
  conditionQuerySchema,
  reconciliationCreateSchema,
  reconciliationApproveSchema,
  reconciliationParamsSchema,
  reconciliationQuerySchema,
  staffCreateSchema,
  staffUpdateSchema,
  staffParamsSchema,
  staffQuerySchema,
  reportQuerySchema,
  toWarehouseDto,
  toInventoryDto,
  toMovementDto,
  toReservationDto,
  toAlertDto,
  toLocationDto,
  toConditionDto,
  toReconciliationDto,
  toStaffDto,
  toReceiptResultDto,
  toDispatchResultDto,
  toTransferResultDto,
  toStockOperationDto,
  toCapacityDto,
  toReportDto,
};

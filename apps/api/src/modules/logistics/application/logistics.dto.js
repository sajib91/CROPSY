const { isoDateTime, z } = require('@cropsy/validation');

const {
  DELIVERY_PHASES,
  DELIVERY_SERVICE_TYPES,
  DELIVERY_STATUSES,
  SHIPMENT_EVENT_SOURCES,
  SHIPMENT_STATUSES,
} = require('../domain/logistics.entity');

const uuid = z.string().uuid();
const nonEmptyString = z.string().trim().min(1);
const shortText = z.string().trim().min(1).max(180);
const longText = z.string().trim().max(4000);
const code = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[A-Z0-9_-]+$/i, 'Code may contain letters, digits, underscores, and hyphens.');
const referenceKey = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/, 'Reference key contains unsupported characters.');
const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);
// Query-string coordinates arrive as strings, so nearby-provider discovery
// coerces only these query fields and keeps body payloads strictly numeric.
const longitudeParam = z.coerce.number().min(-180).max(180);
const latitudeParam = z.coerce.number().min(-90).max(90);
const optionalUuid = uuid.nullable().optional();
const positiveNumber = z.number().positive().max(1e9);

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

function coordinatePair(value) {
  const hasLongitude = value.longitude !== undefined && value.longitude !== null;
  const hasLatitude = value.latitude !== undefined && value.latitude !== null;
  return hasLongitude === hasLatitude;
}

const providerCreateSchema = z
  .object({
    organizationId: optionalUuid,
    ownerUserId: optionalUuid,
    code,
    name: shortText,
    contactEmail: z.string().trim().email().nullable().optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    longitude: longitude.nullable().optional(),
    latitude: latitude.nullable().optional(),
    serviceRadiusKm: positiveNumber.nullable().optional(),
    serviceTypes: z.array(z.enum(DELIVERY_SERVICE_TYPES)).min(1).default(['STANDARD']),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine(coordinatePair, { message: 'longitude and latitude must be supplied together.' });

const providerUpdateSchema = z
  .object({
    name: shortText.optional(),
    contactEmail: z.string().trim().email().nullable().optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    longitude: longitude.nullable().optional(),
    latitude: latitude.nullable().optional(),
    serviceRadiusKm: positiveNumber.nullable().optional(),
    serviceTypes: z.array(z.enum(DELIVERY_SERVICE_TYPES)).min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(coordinatePair, { message: 'longitude and latitude must be supplied together.' });

const providerQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    isActive: z.coerce.boolean().optional(),
    search: z.string().trim().max(120).optional(),
  })
  .strict();

const nearbyProvidersQuerySchema = z
  .object({
    longitude: longitudeParam,
    latitude: latitudeParam,
    radiusKm: z.coerce.number().positive().max(1000).default(25),
    serviceType: z.enum(DELIVERY_SERVICE_TYPES).optional(),
  })
  .strict();

const serviceCreateSchema = z
  .object({
    providerId: uuid,
    code,
    name: shortText,
    serviceType: z.enum(DELIVERY_SERVICE_TYPES).default('STANDARD'),
    estimatedHours: positiveNumber.nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

const serviceUpdateSchema = z
  .object({
    name: shortText.optional(),
    serviceType: z.enum(DELIVERY_SERVICE_TYPES).optional(),
    estimatedHours: positiveNumber.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const serviceQuerySchema = z
  .object({
    providerId: uuid.optional(),
    serviceType: z.enum(DELIVERY_SERVICE_TYPES).optional(),
    isActive: z.coerce.boolean().optional(),
  })
  .strict();

const shipmentCreateSchema = z
  .object({
    orderId: uuid,
    providerId: optionalUuid,
    serviceId: optionalUuid,
    referenceKey,
    pickupAddressId: optionalUuid,
    destinationAddressId: optionalUuid,
    pickupLongitude: longitude.nullable().optional(),
    pickupLatitude: latitude.nullable().optional(),
    destinationLongitude: longitude.nullable().optional(),
    destinationLatitude: latitude.nullable().optional(),
    notes: longText.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      coordinatePair({
        longitude: value.pickupLongitude,
        latitude: value.pickupLatitude,
      }),
    { message: 'pickupLongitude and pickupLatitude must be supplied together.' },
  )
  .refine(
    (value) =>
      coordinatePair({
        longitude: value.destinationLongitude,
        latitude: value.destinationLatitude,
      }),
    { message: 'destinationLongitude and destinationLatitude must be supplied together.' },
  );

const shipmentQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    orderId: uuid.optional(),
    providerId: uuid.optional(),
    status: z.enum(SHIPMENT_STATUSES).optional(),
    referenceKey: referenceKey.optional(),
  })
  .strict();

const pickupScheduleSchema = z
  .object({
    scheduledAt: isoDateTime,
    longitude: longitude.nullable().optional(),
    latitude: latitude.nullable().optional(),
    notes: longText.nullable().optional(),
  })
  .strict()
  .refine(coordinatePair, { message: 'longitude and latitude must be supplied together.' });

const assignmentSchema = z
  .object({
    providerId: uuid,
    serviceId: optionalUuid,
    assigneeUserId: optionalUuid,
    note: longText.nullable().optional(),
  })
  .strict();

const statusUpdateSchema = z
  .object({
    status: z.enum(SHIPMENT_STATUSES),
    longitude: longitude.nullable().optional(),
    latitude: latitude.nullable().optional(),
    note: longText.nullable().optional(),
  })
  .strict()
  .refine(coordinatePair, { message: 'longitude and latitude must be supplied together.' });

const deliveryProofSchema = z
  .object({
    proofUrl: z.string().trim().url().max(2048),
    proofHash: z.string().trim().min(8).max(255).nullable().optional(),
    recipientName: z.string().trim().min(1).max(180).nullable().optional(),
    recipientPhone: z.string().trim().max(32).nullable().optional(),
    capturedAt: isoDateTime.nullable().optional(),
  })
  .strict();

const deliveryFailureSchema = z
  .object({
    reasonCode: shortText,
    note: longText.nullable().optional(),
    retryAt: isoDateTime.nullable().optional(),
  })
  .strict();

const confirmationSchema = z
  .object({
    note: longText.nullable().optional(),
  })
  .strict();

const deliveryQuerySchema = z
  .object({
    shipmentId: uuid.optional(),
    status: z.enum(DELIVERY_STATUSES).optional(),
    phase: z.enum(DELIVERY_PHASES).optional(),
  })
  .strict();

const timelineQuerySchema = z
  .object({
    since: isoDateTime.optional(),
    until: isoDateTime.optional(),
  })
  .strict();

const dashboardQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const eventSourceSchema = z.enum(SHIPMENT_EVENT_SOURCES);

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function toProviderDto(record, extra = {}) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    ownerUserId: record.owner_user_id ?? null,
    code: record.code,
    name: record.name,
    contactEmail: record.contact_email ?? null,
    phone: record.phone ?? null,
    longitude: toNumber(record.longitude),
    latitude: toNumber(record.latitude),
    serviceRadiusKm: toNumber(record.service_radius_km),
    serviceTypes: Array.isArray(record.service_types)
      ? record.service_types
      : JSON.parse(record.service_types || '[]'),
    isActive: record.is_active !== false,
    distanceKm: extra.distanceKm === undefined ? null : Number(extra.distanceKm),
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toServiceDto(record) {
  return {
    id: record.id,
    providerId: record.provider_id,
    code: record.code,
    name: record.name,
    serviceType: record.service_type,
    estimatedHours: toNumber(record.estimated_hours),
    isActive: record.is_active !== false,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toShipmentDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id ?? null,
    orderId: record.order_id,
    providerId: record.provider_id ?? null,
    serviceId: record.delivery_service_id ?? null,
    assignedUserId: record.assigned_user_id ?? null,
    referenceKey: record.reference_key,
    trackingNumber: record.tracking_number ?? null,
    status: record.status,
    pickupAddressId: record.pickup_address_id ?? null,
    destinationAddressId: record.destination_address_id ?? null,
    pickupLongitude: toNumber(record.pickup_longitude),
    pickupLatitude: toNumber(record.pickup_latitude),
    destinationLongitude: toNumber(record.destination_longitude),
    destinationLatitude: toNumber(record.destination_latitude),
    plannedDistanceKm: toNumber(record.planned_distance_km),
    notes: record.notes ?? null,
    shippedAt: toIso(record.shipped_at),
    deliveredAt: toIso(record.delivered_at),
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toDeliveryDto(record) {
  return {
    id: record.id,
    shipmentId: record.shipment_id,
    attemptNumber: Number(record.attempt_number),
    phase: record.phase,
    status: record.status,
    scheduledAt: toIso(record.scheduled_at),
    attemptedAt: toIso(record.attempted_at),
    deliveredAt: toIso(record.delivered_at),
    recipientName: record.recipient_name ?? null,
    recipientPhone: record.recipient_phone ?? null,
    proofUrl: record.proof_url ?? null,
    proofHash: record.proof_hash ?? null,
    reasonCode: record.reason_code ?? null,
    nextAttemptAt: toIso(record.next_attempt_at),
    longitude: toNumber(record.longitude),
    latitude: toNumber(record.latitude),
    confirmedAt: toIso(record.confirmed_at),
    confirmedByUserId: record.confirmed_by_user_id ?? null,
    note: record.note ?? null,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toRouteDto(record) {
  if (!record) return null;
  return {
    id: record.id,
    shipmentId: record.shipment_id,
    originLongitude: toNumber(record.origin_longitude),
    originLatitude: toNumber(record.origin_latitude),
    destinationLongitude: toNumber(record.destination_longitude),
    destinationLatitude: toNumber(record.destination_latitude),
    distanceKm: toNumber(record.distance_km),
    pathGeojson: record.path_geojson ?? null,
    source: record.source,
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

function toEventDto(record) {
  return {
    id: record.id,
    shipmentId: record.shipment_id,
    status: record.status,
    source: record.source,
    occurredAt: toIso(record.occurred_at),
    longitude: toNumber(record.longitude),
    latitude: toNumber(record.latitude),
    note: record.note ?? null,
    actorUserId: record.actor_user_id ?? null,
    createdAt: toIso(record.created_at),
  };
}

function toAuditDto(record) {
  return {
    id: record.id,
    shipmentId: record.shipment_id ?? null,
    deliveryId: record.delivery_id ?? null,
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

module.exports = {
  moduleInfoSchema,
  toModuleInfoDto,
  providerCreateSchema,
  providerUpdateSchema,
  providerQuerySchema,
  nearbyProvidersQuerySchema,
  serviceCreateSchema,
  serviceUpdateSchema,
  serviceQuerySchema,
  shipmentCreateSchema,
  shipmentQuerySchema,
  pickupScheduleSchema,
  assignmentSchema,
  statusUpdateSchema,
  deliveryProofSchema,
  deliveryFailureSchema,
  confirmationSchema,
  deliveryQuerySchema,
  timelineQuerySchema,
  dashboardQuerySchema,
  eventSourceSchema,
  toProviderDto,
  toServiceDto,
  toShipmentDto,
  toDeliveryDto,
  toRouteDto,
  toEventDto,
  toAuditDto,
  toIso,
  toNumber,
};

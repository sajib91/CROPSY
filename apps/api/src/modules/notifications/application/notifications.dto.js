const { z, isoDateTime } = require('@cropsy/validation');
const { CHANNELS, STATUSES } = require('../domain/notifications.entity');

const nonEmptyString = z.string().trim().min(1);
const uuid = z.string().uuid();

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

const channelSchema = z.enum(CHANNELS);
const statusSchema = z.enum(STATUSES);

const notificationDtoSchema = z.object({
  id: uuid,
  organizationId: uuid.nullable(),
  userId: uuid,
  channel: channelSchema,
  type: nonEmptyString.max(80),
  title: nonEmptyString.max(255),
  body: z.string(),
  data: z.record(z.unknown()),
  status: statusSchema,
  readAt: isoDateTime.nullable(),
  sentAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const listNotificationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
    channel: channelSchema.optional(),
    status: statusSchema.optional(),
    type: nonEmptyString.max(80).optional(),
    userId: uuid.optional(),
  })
  .strict();

const deliveryQuerySchema = z
  .object({
    notificationId: uuid,
  })
  .strict();

const failureQuerySchema = z
  .object({
    channel: channelSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

const createNotificationInputSchema = z
  .object({
    userId: uuid,
    organizationId: uuid.nullable().optional(),
    type: nonEmptyString.max(80),
    title: nonEmptyString.max(255),
    body: nonEmptyString.max(4000),
    data: z.record(z.unknown()).default({}),
    channels: z.array(channelSchema).min(1).max(4).default(['IN_APP']),
  })
  .strict();

const deviceTokenSchema = z
  .object({
    token: nonEmptyString.min(8).max(512),
    platform: z.enum(['IOS', 'ANDROID', 'WEB']),
    deviceId: nonEmptyString.max(128).optional(),
    organizationId: uuid.optional(),
  })
  .strict();

const preferenceSchema = z
  .object({
    channel: channelSchema,
    eventType: nonEmptyString.max(80),
    enabled: z.boolean(),
  })
  .strict();

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNotificationDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    userId: record.user_id,
    channel: record.channel,
    type: record.type,
    title: record.title,
    body: record.body,
    data: record.data || {},
    status: record.status,
    readAt: toIso(record.read_at),
    sentAt: toIso(record.sent_at),
    createdAt: toIso(record.created_at),
    updatedAt: toIso(record.updated_at),
  };
}

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

module.exports = {
  moduleInfoSchema,
  toModuleInfoDto,
  channelSchema,
  statusSchema,
  notificationDtoSchema,
  listNotificationsQuerySchema,
  deliveryQuerySchema,
  failureQuerySchema,
  createNotificationInputSchema,
  deviceTokenSchema,
  preferenceSchema,
  toNotificationDto,
};

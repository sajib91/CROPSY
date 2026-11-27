const crypto = require('node:crypto');
const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'notifications';
const MODULE_NAME = 'Notifications';

const CHANNELS = Object.freeze(['IN_APP', 'EMAIL', 'SMS', 'PUSH']);
const STATUSES = Object.freeze(['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ']);
const DELIVERY_STATES = Object.freeze(['queued', 'sent', 'delivered', 'failed', 'skipped']);

// The catalog is the only place that maps domain events to notification
// semantics. Mobile clients and other consumers receive these stable types.
const EVENT_CATALOG = Object.freeze({
  'orders.order.placed': Object.freeze({
    type: 'ORDER_PLACED',
    category: 'ORDER',
    channels: Object.freeze(['IN_APP', 'PUSH', 'EMAIL']),
  }),
  'orders.order.status-changed': Object.freeze({
    type: 'ORDER_STATUS_CHANGED',
    category: 'ORDER',
    channels: Object.freeze(['IN_APP', 'PUSH', 'EMAIL']),
  }),
  'orders.order.cancelled': Object.freeze({
    type: 'ORDER_CANCELLED',
    category: 'ORDER',
    channels: Object.freeze(['IN_APP', 'PUSH']),
  }),
  'logistics.shipment.status_updated': Object.freeze({
    type: 'SHIPMENT_STATUS_CHANGED',
    category: 'SHIPMENT',
    channels: Object.freeze(['IN_APP', 'PUSH', 'EMAIL']),
  }),
  'logistics.delivery.assigned': Object.freeze({
    type: 'DELIVERY_ASSIGNED',
    category: 'SHIPMENT',
    channels: Object.freeze(['IN_APP', 'PUSH']),
  }),
  'logistics.delivery.confirmed': Object.freeze({
    type: 'DELIVERY_CONFIRMED',
    category: 'SHIPMENT',
    channels: Object.freeze(['IN_APP', 'PUSH']),
  }),
  'logistics.delivery.failed': Object.freeze({
    type: 'DELIVERY_FAILED',
    category: 'SHIPMENT',
    channels: Object.freeze(['IN_APP', 'PUSH', 'SMS']),
  }),
  'marketplace.message.sent': Object.freeze({
    type: 'MARKETPLACE_MESSAGE',
    category: 'MARKETPLACE',
    channels: Object.freeze(['IN_APP', 'PUSH']),
  }),
  'marketplace.listing.published': Object.freeze({
    type: 'LISTING_PUBLISHED',
    category: 'MARKETPLACE',
    channels: Object.freeze(['IN_APP']),
  }),
  'intelligence.processing.completed': Object.freeze({
    type: 'AI_PROCESSING_COMPLETE',
    category: 'AI',
    channels: Object.freeze(['IN_APP', 'PUSH']),
  }),
  'market-intelligence.analysis.requested': Object.freeze({
    type: 'AI_PROCESSING_COMPLETE',
    category: 'AI',
    channels: Object.freeze(['IN_APP']),
  }),
  'iam.refresh.reuse_detected': Object.freeze({
    type: 'SECURITY_ALERT',
    category: 'SECURITY',
    channels: Object.freeze(['IN_APP', 'PUSH', 'EMAIL', 'SMS']),
  }),
  'iam.login.failed': Object.freeze({
    type: 'SECURITY_ALERT',
    category: 'SECURITY',
    channels: Object.freeze(['IN_APP', 'EMAIL']),
  }),
  'iam.password.changed': Object.freeze({
    type: 'SECURITY_ALERT',
    category: 'SECURITY',
    channels: Object.freeze(['IN_APP', 'EMAIL']),
  }),
  'iam.role.assigned': Object.freeze({
    type: 'SECURITY_ALERT',
    category: 'SECURITY',
    channels: Object.freeze(['IN_APP', 'EMAIL']),
  }),
});

const SUBSCRIBED_EVENT_TYPES = Object.freeze(Object.keys(EVENT_CATALOG));

class NotificationsEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

function newId() {
  return crypto.randomUUID();
}

function NotificationRecord({
  id = newId(),
  organizationId = null,
  userId,
  channel = 'IN_APP',
  type,
  title,
  body,
  data = {},
  status = 'PENDING',
} = {}) {
  const now = new Date();
  return {
    id,
    organization_id: organizationId,
    user_id: userId,
    channel,
    type,
    title,
    body,
    data,
    status,
    read_at: null,
    sent_at: null,
    created_at: now,
    updated_at: now,
  };
}

function DeliveryAttemptRecord({
  id = newId(),
  notificationId,
  channel,
  provider = 'in-app',
  state = 'failed',
  error = null,
  attempt = 1,
} = {}) {
  return {
    id,
    notification_id: notificationId,
    channel,
    provider,
    state,
    error,
    attempt,
    occurred_at: new Date(),
  };
}

function DeviceTokenRecord({
  id = newId(),
  userId,
  token,
  platform,
  deviceId = null,
  organizationId = null,
} = {}) {
  return {
    id,
    user_id: userId,
    token,
    token_hash: crypto.createHash('sha256').update(token).digest('hex'),
    platform,
    device_id: deviceId,
    organization_id: organizationId,
    created_at: new Date(),
  };
}

function recipientsFromEvent(event) {
  const payload = event.payload || {};
  const candidates = [
    payload.recipientUserId,
    payload.buyerUserId,
    payload.sellerUserId,
    payload.userId,
    payload.actorUserId,
    payload.ownerUserId,
    ...(Array.isArray(payload.recipientUserIds) ? payload.recipientUserIds : []),
    ...(Array.isArray(payload.userIds) ? payload.userIds : []),
  ];
  const userIdPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return [
    ...new Set(
      candidates.filter((value) => typeof value === 'string' && userIdPattern.test(value)),
    ),
  ];
}

module.exports = {
  MODULE_ID,
  MODULE_NAME,
  CHANNELS,
  STATUSES,
  DELIVERY_STATES,
  EVENT_CATALOG,
  SUBSCRIBED_EVENT_TYPES,
  NotificationsEntity,
  NotificationRecord,
  DeliveryAttemptRecord,
  DeviceTokenRecord,
  newId,
  recipientsFromEvent,
};

const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'orders';
const MODULE_NAME = 'Orders';

const CHECKOUT_STATUSES = Object.freeze(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']);

const ORDER_STATUSES = Object.freeze([
  'PENDING',
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
]);

// Domain workflow guard: transitions may not skip mandatory states. Cancellation
// is allowed only before a fulfillment becomes non-cancellable.
const ORDER_TRANSITIONS = Object.freeze({
  PENDING: Object.freeze(['PAYMENT_PENDING', 'CONFIRMED', 'CANCELLED']),
  PAYMENT_PENDING: Object.freeze(['PAYMENT_FAILED', 'CONFIRMED', 'CANCELLED']),
  PAYMENT_FAILED: Object.freeze(['PAYMENT_PENDING', 'CANCELLED']),
  CONFIRMED: Object.freeze(['PROCESSING', 'CANCELLED']),
  PROCESSING: Object.freeze(['SHIPPED', 'CANCELLED']),
  SHIPPED: Object.freeze(['DELIVERED']),
  DELIVERED: Object.freeze(['COMPLETED']),
  COMPLETED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
  REFUNDED: Object.freeze([]),
});

const CANCELLABLE_ORDER_STATUSES = Object.freeze([
  'PENDING',
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
  'CONFIRMED',
  'PROCESSING',
]);

const PRICING_RULE_TYPES = Object.freeze(['DELIVERY', 'DISCOUNT']);
const PRICING_RULE_MODES = Object.freeze(['FLAT', 'PERCENTAGE']);

const EVENTS = Object.freeze({
  INITIALIZED: 'orders.initialized',
  CART_ITEM_ADDED: 'orders.cart.item-added',
  CART_ITEM_UPDATED: 'orders.cart.item-updated',
  CART_ITEM_REMOVED: 'orders.cart.item-removed',
  CHECKOUT_CREATED: 'orders.checkout.created',
  ORDER_CREATED: 'orders.order.placed',
  ORDER_TRANSITIONED: 'orders.order.status-changed',
  ORDER_CANCELLED: 'orders.order.cancelled',
  RECEIPT_GENERATED: 'orders.receipt.generated',
});

class OrdersEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = {
  CANCELLABLE_ORDER_STATUSES,
  CHECKOUT_STATUSES,
  EVENTS,
  MODULE_ID,
  MODULE_NAME,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  PRICING_RULE_MODES,
  PRICING_RULE_TYPES,
  OrdersEntity,
};

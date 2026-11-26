const { defineRepositoryToken } = require('../../../shared/domain/repository');

const OrdersRepositoryToken = defineRepositoryToken('orders');
const OrdersStoreToken = defineRepositoryToken('orders.store');

const ORDERS_STORE_METHODS = Object.freeze([
  'getCart',
  'upsertCartItem',
  'deleteCartItem',
  'findPurchaseGroupByReference',
  'findPurchaseGroup',
  'listPurchaseGroups',
  'createCheckout',
  'findOrder',
  'listOrders',
  'transitionOrder',
  'listStatusChanges',
]);

/**
 * Repository port for the module info entity.
 * @typedef {object} OrdersRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

/**
 * Persistence port for carts, parent checkouts, seller fulfillments, and status
 * history. Adapters return plain snake_case records with Date values and
 * numeric amounts. Checkout and cancellation are single transactional writes.
 *
 * @typedef {object} OrdersStoreContract
 * @property {(filters: object) => Promise<object|null>} getCart
 * @property {(input: object) => Promise<object>} upsertCartItem
 * @property {(input: object) => Promise<object>} deleteCartItem
 * @property {(referenceKey: string) => Promise<object|null>} findPurchaseGroupByReference
 * @property {(filters: object) => Promise<object|null>} findPurchaseGroup
 * @property {(filters: object) => Promise<object[]>} listPurchaseGroups
 * @property {(input: object) => Promise<object>} createCheckout
 * @property {(filters: object) => Promise<object|null>} findOrder
 * @property {(filters: object) => Promise<object[]>} listOrders
 * @property {(input: object) => Promise<object>} transitionOrder
 * @property {(filters: object) => Promise<object[]>} listStatusChanges
 */

module.exports = {
  ORDERS_STORE_METHODS,
  OrdersRepositoryToken,
  OrdersStoreToken,
};

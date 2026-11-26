const { defineRepositoryToken } = require('../../../shared/domain/repository');

const PaymentsRepositoryToken = defineRepositoryToken('payments');
const PaymentsStoreToken = defineRepositoryToken('payments.store');

/**
 * Repository port for the module info entity.
 * @typedef {object} PaymentsRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

/**
 * Persistence port for payments, status history, webhook events, and refunds.
 * Adapters return plain snake_case records with Date values and numeric
 * amounts. Multi-row operations are atomic and duplicate keys are rejected by
 * the store, not only by application code.
 */
const PAYMENT_STORE_METHODS = Object.freeze([
  'initializePayment',
  'findPayment',
  'findPaymentByIdempotency',
  'findPaymentByReference',
  'listPayments',
  'appendPaymentStatus',
  'listPaymentStatusChanges',
  'registerWebhookEvent',
  'findWebhookEvent',
  'completeWebhookEvent',
  'failWebhookEvent',
  'recordRefund',
  'findRefundByIdempotency',
  'listRefunds',
]);

module.exports = { PaymentsRepositoryToken, PaymentsStoreToken, PAYMENT_STORE_METHODS };

const { LedgerPostingPortToken } = require('../../../shared/di/tokens');
const { assertRepository } = require('../../../shared/domain/repository');

/**
 * Consumer-side view of the shared ledger posting port. Payments declares the
 * narrow contract it needs; the ledger module supplies the implementation via
 * dependency injection. No ledger source is imported across module boundaries.
 */
const PAYMENT_LEDGER_METHODS = Object.freeze([
  'recordExpectation',
  'postJournal',
  'getBalance',
  'accountCodes',
]);

function assertPaymentLedgerPort(port) {
  return assertRepository(port, PAYMENT_LEDGER_METHODS, LedgerPostingPortToken);
}

module.exports = { PAYMENT_LEDGER_METHODS, LedgerPostingPortToken, assertPaymentLedgerPort };

const { LedgerPostingPortToken } = require('../../../shared/di/tokens');
const { assertRepository } = require('../../../shared/domain/repository');

const LEDGER_POSTING_METHODS = Object.freeze([
  'recordExpectation',
  'postJournal',
  'getBalance',
  'accountCodes',
]);

function assertLedgerPostingPort(port) {
  return assertRepository(port, LEDGER_POSTING_METHODS, LedgerPostingPortToken);
}

module.exports = { LEDGER_POSTING_METHODS, LedgerPostingPortToken, assertLedgerPostingPort };

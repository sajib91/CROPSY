const { defineRepositoryToken } = require('../../../shared/domain/repository');

const LedgerRepositoryToken = defineRepositoryToken('ledger');
const LedgerStoreToken = defineRepositoryToken('ledger.store');

/**
 * Repository port for the module info entity.
 * @typedef {object} LedgerRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

/**
 * Persistence port for immutable journals, balances, audit events, and
 * reconciliation expectations. Multi-row writes are transactional and every
 * operation rejects duplicate financial keys.
 */
const LEDGER_STORE_METHODS = Object.freeze([
  'ensureAccounts',
  'listAccounts',
  'postJournal',
  'findJournalByIdempotency',
  'getJournal',
  'listJournals',
  'getBalance',
  'listBalances',
  'recordExpectation',
  'matchExpectation',
  'listExpectations',
  'createSettlement',
  'listSettlements',
  'appendAudit',
  'listAudit',
]);

module.exports = { LedgerRepositoryToken, LedgerStoreToken, LEDGER_STORE_METHODS };

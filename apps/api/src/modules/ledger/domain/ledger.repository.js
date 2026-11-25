const { defineRepositoryToken } = require('../../../shared/domain/repository');

const LedgerRepositoryToken = defineRepositoryToken('ledger');

/**
 * Repository port for Financial Ledger.
 * @typedef {object} LedgerRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { LedgerRepositoryToken };

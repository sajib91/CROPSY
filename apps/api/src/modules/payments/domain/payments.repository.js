const { defineRepositoryToken } = require('../../../shared/domain/repository');

const PaymentsRepositoryToken = defineRepositoryToken('payments');

/**
 * Repository port for Payments.
 * @typedef {object} PaymentsRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { PaymentsRepositoryToken };

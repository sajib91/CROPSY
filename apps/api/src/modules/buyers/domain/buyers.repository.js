const { defineRepositoryToken } = require('../../../shared/domain/repository');

const BuyersRepositoryToken = defineRepositoryToken('buyers');

/**
 * Repository port for Buyer Management.
 * @typedef {object} BuyersRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { BuyersRepositoryToken };

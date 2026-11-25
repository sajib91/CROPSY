const { defineRepositoryToken } = require('../../../shared/domain/repository');

const LogisticsRepositoryToken = defineRepositoryToken('logistics');

/**
 * Repository port for Logistics.
 * @typedef {object} LogisticsRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { LogisticsRepositoryToken };

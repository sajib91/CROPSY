const { defineRepositoryToken } = require('../../../shared/domain/repository');

const AgricultureRepositoryToken = defineRepositoryToken('agriculture');

/**
 * Repository port for Agriculture and Crop Management.
 * @typedef {object} AgricultureRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { AgricultureRepositoryToken };

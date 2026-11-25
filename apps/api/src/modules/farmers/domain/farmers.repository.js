const { defineRepositoryToken } = require('../../../shared/domain/repository');

const FarmersRepositoryToken = defineRepositoryToken('farmers');

/**
 * Repository port for Farmer Management.
 * @typedef {object} FarmersRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { FarmersRepositoryToken };

const { defineRepositoryToken } = require('../../../shared/domain/repository');

const AdministrationRepositoryToken = defineRepositoryToken('administration');

/**
 * Repository port for Administration.
 * @typedef {object} AdministrationRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { AdministrationRepositoryToken };

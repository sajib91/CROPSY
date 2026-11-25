const { defineRepositoryToken } = require('../../../shared/domain/repository');

const IamRepositoryToken = defineRepositoryToken('iam');

/**
 * Repository port for Identity and Access Management.
 * @typedef {object} IamRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { IamRepositoryToken };

const { defineRepositoryToken } = require('../../../shared/domain/repository');

const UsersRepositoryToken = defineRepositoryToken('users');

/**
 * Repository port for User Management.
 * @typedef {object} UsersRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { UsersRepositoryToken };

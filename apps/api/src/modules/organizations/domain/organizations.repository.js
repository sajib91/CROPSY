const { defineRepositoryToken } = require('../../../shared/domain/repository');

const OrganizationsRepositoryToken = defineRepositoryToken('organizations');

/**
 * Repository port for Organization Management.
 * @typedef {object} OrganizationsRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { OrganizationsRepositoryToken };

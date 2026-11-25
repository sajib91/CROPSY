const { defineRepositoryToken } = require('../../../shared/domain/repository');

const IntelligenceRepositoryToken = defineRepositoryToken('intelligence');

/**
 * Repository port for Agricultural Intelligence.
 * @typedef {object} IntelligenceRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { IntelligenceRepositoryToken };

const { defineRepositoryToken } = require('../../../shared/domain/repository');

const KnowledgeRepositoryToken = defineRepositoryToken('knowledge');

/**
 * Repository port for Knowledge Management.
 * @typedef {object} KnowledgeRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { KnowledgeRepositoryToken };

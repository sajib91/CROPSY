const { defineRepositoryToken } = require('../../../shared/domain/repository');

const TraceabilityRepositoryToken = defineRepositoryToken('traceability');

/**
 * Repository port for Traceability.
 * @typedef {object} TraceabilityRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { TraceabilityRepositoryToken };

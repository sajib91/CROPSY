const { defineRepositoryToken } = require('../../../shared/domain/repository');

const QualityRepositoryToken = defineRepositoryToken('quality');

/**
 * Repository port for Quality Inspection.
 * @typedef {object} QualityRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { QualityRepositoryToken };

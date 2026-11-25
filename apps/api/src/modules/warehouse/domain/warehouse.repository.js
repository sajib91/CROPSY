const { defineRepositoryToken } = require('../../../shared/domain/repository');

const WarehouseRepositoryToken = defineRepositoryToken('warehouse');

/**
 * Repository port for Warehouse.
 * @typedef {object} WarehouseRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { WarehouseRepositoryToken };

const { defineRepositoryToken } = require('../../../shared/domain/repository');

const WarehouseRepositoryToken = defineRepositoryToken('warehouse');
const WarehouseStoreToken = defineRepositoryToken('warehouse.store');

const WAREHOUSE_STORE_METHODS = Object.freeze([
  'listWarehouses',
  'findWarehouse',
  'createWarehouse',
  'updateWarehouse',
  'findInventory',
  'findInventoryById',
  'listInventories',
  'createInventory',
  'updateInventory',
  'applyStockMovement',
  'listMovements',
  'reserveStock',
  'findReservation',
  'findReservationByReference',
  'listReservations',
  'settleReservation',
  'findOpenAlert',
  'findAlertById',
  'listAlerts',
  'updateAlert',
]);

/**
 * Repository port for the module info entity.
 * @typedef {object} WarehouseRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

/**
 * Persistence port for warehouse and inventory records. Implementations return
 * plain snake_case records with Date and number values so the service applies
 * identical rules in memory and with Prisma.
 *
 * @typedef {object} WarehouseStoreContract
 * @property {(filters?: object) => Promise<object[]>} listWarehouses
 * @property {(id: string) => Promise<object|null>} findWarehouse
 * @property {(input: object) => Promise<object>} createWarehouse
 * @property {(id: string, patch: object) => Promise<object>} updateWarehouse
 * @property {(key: object) => Promise<object|null>} findInventory
 * @property {(id: string) => Promise<object|null>} findInventoryById
 * @property {(filters?: object) => Promise<object[]>} listInventories
 * @property {(input: object) => Promise<object>} createInventory
 * @property {(id: string, patch: object) => Promise<object>} updateInventory
 * @property {(input: object) => Promise<object>} applyStockMovement
 * @property {(filters?: object) => Promise<object[]>} listMovements
 * @property {(input: object) => Promise<object>} reserveStock
 * @property {(id: string) => Promise<object|null>} findReservation
 * @property {(referenceKey: string) => Promise<object|null>} findReservationByReference
 * @property {(filters?: object) => Promise<object[]>} listReservations
 * @property {(input: object) => Promise<object>} settleReservation
 * @property {(inventoryId: string) => Promise<object|null>} findOpenAlert
 * @property {(id: string) => Promise<object|null>} findAlertById
 * @property {(filters?: object) => Promise<object[]>} listAlerts
 * @property {(id: string, patch: object) => Promise<object>} updateAlert
 */

module.exports = {
  WarehouseRepositoryToken,
  WarehouseStoreToken,
  WAREHOUSE_STORE_METHODS,
};

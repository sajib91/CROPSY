const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'warehouse';
const MODULE_NAME = 'Warehouse';

const WAREHOUSE_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE', 'MAINTENANCE']);
const INVENTORY_MOVEMENT_TYPES = Object.freeze([
  'REGISTER',
  'UPDATE',
  'RESERVE',
  'RELEASE',
  'DEDUCT',
  'ADJUSTMENT',
  'DAMAGED',
  'EXPIRED',
]);
const INVENTORY_MOVEMENT_MODES = Object.freeze([
  'ON_HAND_DELTA',
  'SET_ON_HAND',
  'RESERVE',
  'RELEASE',
  'DEDUCT_RESERVED',
  'DEDUCT_AVAILABLE',
]);
const INVENTORY_RESERVATION_STATUSES = Object.freeze([
  'ACTIVE',
  'RELEASED',
  'DEDUCTED',
  'CANCELLED',
]);
const INVENTORY_ALERT_STATUSES = Object.freeze(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']);

class WarehouseEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = {
  MODULE_ID,
  MODULE_NAME,
  WarehouseEntity,
  WAREHOUSE_STATUSES,
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_MOVEMENT_MODES,
  INVENTORY_RESERVATION_STATUSES,
  INVENTORY_ALERT_STATUSES,
};

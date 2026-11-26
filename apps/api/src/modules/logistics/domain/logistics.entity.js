const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'logistics';
const MODULE_NAME = 'Logistics';

const SHIPMENT_STATUSES = Object.freeze([
  'PENDING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'RETURNED',
  'CANCELLED',
]);
const DELIVERY_STATUSES = Object.freeze(['SCHEDULED', 'ATTEMPTED', 'DELIVERED', 'FAILED']);
const DELIVERY_PHASES = Object.freeze(['PICKUP', 'DELIVERY']);
const DELIVERY_SERVICE_TYPES = Object.freeze([
  'STANDARD',
  'EXPRESS',
  'COLD_CHAIN',
  'BULK',
  'OTHER',
]);
const SHIPMENT_EVENT_SOURCES = Object.freeze([
  'SYSTEM',
  'PROVIDER',
  'BUYER',
  'SELLER',
  'WAREHOUSE',
]);

class LogisticsEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = {
  MODULE_ID,
  MODULE_NAME,
  LogisticsEntity,
  SHIPMENT_STATUSES,
  DELIVERY_STATUSES,
  DELIVERY_PHASES,
  DELIVERY_SERVICE_TYPES,
  SHIPMENT_EVENT_SOURCES,
};

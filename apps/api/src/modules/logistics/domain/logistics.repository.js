const { defineRepositoryToken } = require('../../../shared/domain/repository');

const LogisticsRepositoryToken = defineRepositoryToken('logistics');
const LogisticsStoreToken = defineRepositoryToken('logistics.store');

const LOGISTICS_STORE_METHODS = Object.freeze([
  'listProviders',
  'findProvider',
  'createProvider',
  'updateProvider',
  'listServices',
  'findService',
  'createService',
  'updateService',
  'listShipments',
  'findShipment',
  'createShipment',
  'updateShipment',
  'listDeliveries',
  'findDelivery',
  'findDeliveryByAttempt',
  'createDelivery',
  'updateDelivery',
  'listRoutes',
  'findRouteByShipment',
  'upsertRoute',
  'listEvents',
  'createEvent',
  'listAudits',
  'createAudit',
  'distanceKm',
  'nearbyProviders',
]);

/**
 * Repository port for Logistics. The module info entity is handled by the
 * generic repository; operational records use the store port below.
 */
module.exports = {
  LogisticsRepositoryToken,
  LogisticsStoreToken,
  LOGISTICS_STORE_METHODS,
};

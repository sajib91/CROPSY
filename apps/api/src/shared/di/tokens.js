const ConfigToken = Symbol.for('cropsy.platform.config');
const LoggerToken = Symbol.for('cropsy.platform.logger');
const EventBusToken = Symbol.for('cropsy.platform.eventBus');
const ApiVersionToken = Symbol.for('cropsy.platform.apiVersion');

// Cross-module composition ports. These symbols intentionally live in the
// shared kernel so business modules can consume IAM capabilities through DI
// without importing another module's implementation.
const IdentityStoreToken = Symbol.for('cropsy.platform.identityStore');
const PlatformAuthorizationToken = Symbol.for('cropsy.platform.authorization');
const PlatformTokenManagerToken = Symbol.for('cropsy.platform.tokenManager');

// Read-only farm lookup port published by the farmers module so agriculture can
// validate farm ownership/tenant scope without importing another module.
const FarmAccessPortToken = Symbol.for('cropsy.platform.farmAccess');

// Read-only catalog lookup port published by the catalog module so marketplace
// can validate product, category, unit, and quality-grade references without
// importing another module.
const CatalogAccessPortToken = Symbol.for('cropsy.platform.catalogAccess');

// Read-only warehouse inventory lookup port published by the warehouse module
// so farmers can validate cooperative stock references without importing
// another module or gaining mutation capabilities.
const WarehouseAccessPortToken = Symbol.for('cropsy.platform.warehouseAccess');

module.exports = {
  ConfigToken,
  LoggerToken,
  EventBusToken,
  ApiVersionToken,
  IdentityStoreToken,
  PlatformAuthorizationToken,
  PlatformTokenManagerToken,
  FarmAccessPortToken,
  CatalogAccessPortToken,
  WarehouseAccessPortToken,
};

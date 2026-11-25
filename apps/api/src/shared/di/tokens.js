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

module.exports = {
  ConfigToken,
  LoggerToken,
  EventBusToken,
  ApiVersionToken,
  IdentityStoreToken,
  PlatformAuthorizationToken,
  PlatformTokenManagerToken,
  FarmAccessPortToken,
};

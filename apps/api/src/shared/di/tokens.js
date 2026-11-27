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

// Read-only listing lookup port published by the marketplace module so orders
// can validate current price, seller, and availability at checkout.
const MarketplaceAccessPortToken = Symbol.for('cropsy.platform.marketplaceAccess');

// Narrow fulfillment capability used by the orders infrastructure adapter to
// atomically decrement/restore listing availability. It exposes no listing
// management operations.
const MarketplaceListingStockToken = Symbol.for('cropsy.platform.marketplaceListingStock');

// Payment provider registry. The registry exposes only configured adapter
// capabilities; business modules never import a concrete provider SDK.
const PaymentProviderRegistryToken = Symbol.for('cropsy.platform.paymentProviderRegistry');

// Narrow ledger posting port used by payments to record financial effects
// without importing the ledger module. It exposes posting and reconciliation
// expectations only, not account or balance mutation capabilities.
const LedgerPostingPortToken = Symbol.for('cropsy.platform.ledgerPosting');

// Read-only order lookup used by logistics and traceability. It exposes only
// delivery-relevant fulfillment facts and never order mutation capabilities.
const OrderAccessPortToken = Symbol.for('cropsy.platform.orderAccess');

// Read-only authenticated bridge to the Python AI service. It lives in the
// shared kernel so advisory consumers such as market intelligence can use it
// without importing the intelligence module.
const AiGatewayToken = Symbol.for('cropsy.intelligence.aiGateway');

// Read-only marketplace price observations and demand signals. The market
// intelligence module consumes actual seller/platform observations through
// this port; it never invents live prices.
const MarketObservationPortToken = Symbol.for('cropsy.platform.marketObservation');

// Read-only cultivation facts for crop-stage-aware context composition.
const AgricultureAccessPortToken = Symbol.for('cropsy.platform.agricultureAccess');

// Read-only composition ports for linking quality, warehouse, and logistics
// facts into auditable traceability timelines. They deliberately expose no
// mutation operations.
const QualityAccessPortToken = Symbol.for('cropsy.platform.qualityAccess');
const WarehouseOperationPortToken = Symbol.for('cropsy.platform.warehouseOperation');
const LogisticsAccessPortToken = Symbol.for('cropsy.platform.logisticsAccess');
const TraceabilityBatchPortToken = Symbol.for('cropsy.platform.traceabilityBatch');

// Notification composition ports. Implementations live in the notifications
// module; application code consumes only these narrow capabilities.
const NotificationPreferencesPortToken = Symbol.for('cropsy.platform.notificationPreferences');
const NotificationAuthPortToken = Symbol.for('cropsy.platform.notificationAuth');
const NotificationQueueToken = Symbol.for('cropsy.platform.notificationQueue');
const NotificationRealtimeToken = Symbol.for('cropsy.platform.notificationRealtime');
const NotificationProvidersToken = Symbol.for('cropsy.platform.notificationProviders');

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
  MarketplaceAccessPortToken,
  MarketplaceListingStockToken,
  PaymentProviderRegistryToken,
  LedgerPostingPortToken,
  OrderAccessPortToken,
  AiGatewayToken,
  MarketObservationPortToken,
  AgricultureAccessPortToken,
  QualityAccessPortToken,
  WarehouseOperationPortToken,
  LogisticsAccessPortToken,
  TraceabilityBatchPortToken,
  NotificationPreferencesPortToken,
  NotificationAuthPortToken,
  NotificationQueueToken,
  NotificationRealtimeToken,
  NotificationProvidersToken,
};

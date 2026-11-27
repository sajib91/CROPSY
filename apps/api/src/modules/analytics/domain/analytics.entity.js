const MODULE_ID = 'analytics';
const MODULE_NAME = 'Business Intelligence and Analytics';

const ANALYTICS_EVENTS = Object.freeze({
  INITIALIZED: 'analytics.initialized',
  REPORT_REQUESTED: 'analytics.report.requested',
});

const DATA_CLASSIFICATIONS = Object.freeze(['historical', 'calculated', 'predictive']);
const TIMESTAMP_GRAINS = Object.freeze(['day', 'week', 'month']);
const DEFAULT_GRAIN = 'month';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const REPORT_DEFINITIONS = Object.freeze({
  'farmer.production': Object.freeze({
    code: 'farmer.production',
    persona: 'farmer',
    scope: 'organization',
    unit: 'kg',
    valueLabel: 'Harvest quantity in kilograms',
    sourceTables: ['harvests', 'cultivations', 'farms', 'crops'],
  }),
  'farmer.crop-yield': Object.freeze({
    code: 'farmer.crop-yield',
    persona: 'farmer',
    scope: 'organization',
    unit: 'kg_per_hectare',
    valueLabel: 'Harvested kilograms per cultivated hectare',
    sourceTables: ['harvests', 'cultivations', 'farms', 'crops'],
  }),
  'farmer.cultivation-expenses': Object.freeze({
    code: 'farmer.cultivation-expenses',
    persona: 'farmer',
    scope: 'organization',
    unit: 'BDT',
    valueLabel: 'Recorded cultivation expense in BDT',
    sourceTables: ['farm_expenses', 'farms'],
  }),
  'farmer.profitability': Object.freeze({
    code: 'farmer.profitability',
    persona: 'farmer',
    scope: 'organization',
    unit: 'BDT',
    valueLabel: 'Order revenue less recorded cultivation cost in BDT',
    sourceTables: ['orders', 'order_items', 'farm_expenses', 'farms'],
  }),
  'farmer.sales': Object.freeze({
    code: 'farmer.sales',
    persona: 'farmer',
    scope: 'organization',
    unit: 'BDT',
    valueLabel: 'Seller order total in BDT',
    sourceTables: ['orders', 'order_items'],
  }),
  'buyer.purchase-history': Object.freeze({
    code: 'buyer.purchase-history',
    persona: 'buyer',
    scope: 'organization',
    unit: 'BDT',
    valueLabel: 'Buyer order total in BDT',
    sourceTables: ['orders', 'users'],
  }),
  'buyer.spending': Object.freeze({
    code: 'buyer.spending',
    persona: 'buyer',
    scope: 'organization',
    unit: 'BDT',
    valueLabel: 'Captured payment amount in BDT',
    sourceTables: ['payments', 'orders'],
  }),
  'buyer.supplier-performance': Object.freeze({
    code: 'buyer.supplier-performance',
    persona: 'buyer',
    scope: 'organization',
    unit: 'BDT',
    valueLabel: 'Order value by supplier in BDT',
    sourceTables: ['orders', 'shipments', 'users'],
  }),
  'buyer.product-trends': Object.freeze({
    code: 'buyer.product-trends',
    persona: 'buyer',
    scope: 'organization',
    unit: 'BDT',
    valueLabel: 'Order item line total in BDT',
    sourceTables: ['order_items', 'orders', 'products'],
  }),
  'seller.sales-performance': Object.freeze({
    code: 'seller.sales-performance',
    persona: 'seller',
    scope: 'organization',
    unit: 'BDT',
    valueLabel: 'Seller order total in BDT',
    sourceTables: ['orders', 'order_items'],
  }),
  'seller.inventory': Object.freeze({
    code: 'seller.inventory',
    persona: 'seller',
    scope: 'organization',
    unit: 'stock_units',
    valueLabel: 'Currently available inventory units',
    sourceTables: ['product_inventories', 'products', 'product_listings'],
  }),
  'seller.order-fulfillment': Object.freeze({
    code: 'seller.order-fulfillment',
    persona: 'seller',
    scope: 'organization',
    unit: 'orders',
    valueLabel: 'Seller orders with shipment state',
    sourceTables: ['orders', 'shipments'],
  }),
  'seller.revenue': Object.freeze({
    code: 'seller.revenue',
    persona: 'seller',
    scope: 'organization',
    unit: 'BDT',
    valueLabel: 'Captured payment less refund in BDT',
    sourceTables: ['payments', 'orders'],
  }),
  'platform.user-growth': Object.freeze({
    code: 'platform.user-growth',
    persona: 'platform',
    scope: 'platform',
    unit: 'users',
    valueLabel: 'Registered users',
    sourceTables: ['users'],
  }),
  'platform.marketplace-activity': Object.freeze({
    code: 'platform.marketplace-activity',
    persona: 'platform',
    scope: 'platform',
    unit: 'listings',
    valueLabel: 'Created product listings',
    sourceTables: ['product_listings'],
  }),
  'platform.order-volume': Object.freeze({
    code: 'platform.order-volume',
    persona: 'platform',
    scope: 'platform',
    unit: 'orders',
    valueLabel: 'Placed seller orders',
    sourceTables: ['orders'],
  }),
  'platform.regional-activity': Object.freeze({
    code: 'platform.regional-activity',
    persona: 'platform',
    scope: 'platform',
    unit: 'records',
    valueLabel: 'Listings and farms located in a division',
    sourceTables: ['listing_locations', 'farm_locations', 'divisions'],
  }),
  'platform.product-demand': Object.freeze({
    code: 'platform.product-demand',
    persona: 'platform',
    scope: 'platform',
    unit: 'BDT',
    valueLabel: 'Order item line total by product in BDT',
    sourceTables: ['order_items', 'orders', 'products'],
  }),
  'platform.revenue': Object.freeze({
    code: 'platform.revenue',
    persona: 'platform',
    scope: 'platform',
    unit: 'BDT',
    valueLabel: 'Captured payment less refund in BDT',
    sourceTables: ['payments'],
  }),
  'platform.ai-usage': Object.freeze({
    code: 'platform.ai-usage',
    persona: 'platform',
    scope: 'platform',
    unit: 'events',
    valueLabel: 'AI recommendations, agent executions, and feedback events',
    sourceTables: ['ai_recommendations', 'agent_executions', 'ai_feedback'],
  }),
});

const REPORT_CODES = Object.freeze(Object.keys(REPORT_DEFINITIONS));

class AnalyticsEntity {
  constructor({ id = MODULE_ID, metadata, reports = REPORT_CODES } = {}) {
    this.id = id;
    this.moduleId = MODULE_ID;
    this.status = 'ACTIVE';
    this.name = metadata?.name || MODULE_NAME;
    this.description =
      metadata?.description ||
      'Read-only tenant and platform reports with explicit historical, calculated, and predictive sections.';
    this.path = metadata?.path || 'analytics';
    this.dependsOn = metadata?.dependsOn || [];
    this.publishes = metadata?.publishes || [];
    this.subscribes = metadata?.subscribes || [];
    this.reports = [...reports];
    this.dataClassifications = [...DATA_CLASSIFICATIONS];
    this.createdAt = metadata?.createdAt || new Date().toISOString();
    this.updatedAt = metadata?.updatedAt || this.createdAt;
  }

  toJSON() {
    return { ...this, dependsOn: [...this.dependsOn], publishes: [...this.publishes] };
  }
}

module.exports = {
  ANALYTICS_EVENTS,
  AnalyticsEntity,
  DATA_CLASSIFICATIONS,
  DEFAULT_GRAIN,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MODULE_ID,
  MODULE_NAME,
  REPORT_CODES,
  REPORT_DEFINITIONS,
  TIMESTAMP_GRAINS,
};

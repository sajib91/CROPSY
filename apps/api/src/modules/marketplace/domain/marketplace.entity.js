const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'marketplace';
const MODULE_NAME = 'Marketplace';

const LISTING_STATUSES = Object.freeze([
  'DRAFT',
  'ACTIVE',
  'RESERVED',
  'INACTIVE',
  'EXPIRED',
  'CANCELLED',
]);

const REPORT_REASONS = Object.freeze(['MISLEADING', 'PROHIBITED', 'DUPLICATE', 'FRAUD', 'OTHER']);
const REPORT_STATUSES = Object.freeze(['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']);
const LISTING_SORTS = Object.freeze(['newest', 'price_asc', 'price_desc', 'distance']);

class MarketplaceEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = {
  LISTING_SORTS,
  LISTING_STATUSES,
  MODULE_ID,
  MODULE_NAME,
  REPORT_REASONS,
  REPORT_STATUSES,
  MarketplaceEntity,
};

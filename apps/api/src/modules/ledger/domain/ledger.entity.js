const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'ledger';
const MODULE_NAME = 'Financial Ledger';

const BALANCE_BUCKETS = Object.freeze(['PENDING', 'AVAILABLE', 'SETTLED']);

// Structural account definitions only. Rates, settlement periods, and refund
// policies are never encoded here; they arrive as caller-supplied snapshots.
const DEFAULT_ACCOUNTS = Object.freeze([
  {
    code: 'CROPSY_BUYER_CLEARING',
    name: 'Buyer payment clearing',
    role: 'BUYER_CLEARING',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
  },
  {
    code: 'CROPSY_SELLER_PAYABLE',
    name: 'Seller payable',
    role: 'SELLER_PAYABLE',
    accountType: 'LIABILITY',
    normalBalance: 'CREDIT',
  },
  {
    code: 'CROPSY_PLATFORM_REVENUE',
    name: 'Platform commission revenue',
    role: 'PLATFORM_REVENUE',
    accountType: 'REVENUE',
    normalBalance: 'CREDIT',
  },
  {
    code: 'CROPSY_REFUND_PAYABLE',
    name: 'Buyer refund payable',
    role: 'REFUND_PAYABLE',
    accountType: 'LIABILITY',
    normalBalance: 'CREDIT',
  },
  {
    code: 'CROPSY_SETTLEMENT_CLEARING',
    name: 'Settlement clearing',
    role: 'SETTLEMENT_CLEARING',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
  },
]);

class LedgerEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = {
  MODULE_ID,
  MODULE_NAME,
  BALANCE_BUCKETS,
  DEFAULT_ACCOUNTS,
  LedgerEntity,
};

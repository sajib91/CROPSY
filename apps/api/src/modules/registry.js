const { definition: iam } = require('./iam');
const { definition: users } = require('./users');
const { definition: organizations } = require('./organizations');
const { definition: farmers } = require('./farmers');
const { definition: buyers } = require('./buyers');
const { definition: agriculture } = require('./agriculture');
const { definition: catalog } = require('./catalog');
const { definition: marketplace } = require('./marketplace');
const { definition: orders } = require('./orders');
const { definition: payments } = require('./payments');
const { definition: ledger } = require('./ledger');
const { definition: logistics } = require('./logistics');
const { definition: warehouse } = require('./warehouse');
const { definition: quality } = require('./quality');
const { definition: traceability } = require('./traceability');
const { definition: intelligence } = require('./intelligence');
const { definition: marketIntelligence } = require('./market-intelligence');
const { definition: knowledge } = require('./knowledge');
const { definition: notifications } = require('./notifications');
const { definition: billing } = require('./billing');
const { definition: administration } = require('./administration');

const modules = Object.freeze([
  iam,
  users,
  organizations,
  farmers,
  buyers,
  agriculture,
  catalog,
  marketplace,
  orders,
  payments,
  ledger,
  logistics,
  warehouse,
  quality,
  traceability,
  intelligence,
  marketIntelligence,
  knowledge,
  notifications,
  billing,
  administration,
]);

const moduleMap = new Map(modules.map((module) => [module.id, module]));

function getModule(id) {
  return moduleMap.get(id) || null;
}

module.exports = {
  modules,
  getModule,
  moduleIds: Object.freeze([
    'iam',
    'users',
    'organizations',
    'farmers',
    'buyers',
    'agriculture',
    'catalog',
    'marketplace',
    'orders',
    'payments',
    'ledger',
    'logistics',
    'warehouse',
    'quality',
    'traceability',
    'intelligence',
    'market-intelligence',
    'knowledge',
    'notifications',
    'billing',
    'administration',
  ]),
};

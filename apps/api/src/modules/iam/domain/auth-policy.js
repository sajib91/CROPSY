const ROLE_CATEGORIES = Object.freeze([
  {
    code: 'FARMER',
    name: 'Farmer',
    scope: 'PLATFORM',
    selfRegisterable: true,
    allowMultiple: true,
  },
  {
    code: 'BUYER',
    name: 'Buyer',
    scope: 'PLATFORM',
    selfRegisterable: true,
    allowMultiple: true,
  },
  {
    code: 'WHOLESALER',
    name: 'Wholesaler',
    scope: 'PLATFORM',
    selfRegisterable: true,
    allowMultiple: true,
  },
  {
    code: 'RETAILER',
    name: 'Retailer',
    scope: 'PLATFORM',
    selfRegisterable: true,
    allowMultiple: true,
  },
  {
    code: 'AGRICULTURAL_INPUT_SUPPLIER',
    name: 'Agricultural Input Supplier',
    scope: 'PLATFORM',
    selfRegisterable: true,
    allowMultiple: true,
  },
  {
    code: 'LOGISTICS_PROVIDER',
    name: 'Logistics Provider',
    scope: 'PLATFORM',
    selfRegisterable: true,
    allowMultiple: true,
  },
  {
    code: 'WAREHOUSE_OPERATOR',
    name: 'Warehouse Operator',
    scope: 'PLATFORM',
    selfRegisterable: true,
    allowMultiple: true,
  },
  {
    code: 'AGRICULTURAL_EXPERT',
    name: 'Agricultural Expert',
    scope: 'PLATFORM',
    selfRegisterable: true,
    allowMultiple: true,
  },
  {
    code: 'QUALITY_INSPECTOR',
    name: 'Quality Inspector',
    scope: 'PLATFORM',
    selfRegisterable: true,
    allowMultiple: true,
  },
  {
    code: 'ORGANIZATION_MEMBER',
    name: 'Organization Member',
    scope: 'ORGANIZATION',
    selfRegisterable: false,
    allowMultiple: true,
  },
  {
    code: 'ORGANIZATION_ADMIN',
    name: 'Organization Administrator',
    scope: 'ORGANIZATION',
    selfRegisterable: false,
    allowMultiple: true,
  },
  {
    code: 'CROPSY_SUPER_ADMIN',
    name: 'CROPSY Super Administrator',
    scope: 'PLATFORM',
    selfRegisterable: false,
    allowMultiple: false,
  },
]);

const PERMISSION_CATALOG = Object.freeze([
  ['profile.read', 'profile', 'read', 'View own profile'],
  ['profile.manage', 'profile', 'manage', 'Update own profile'],
  ['users.read', 'users', 'read', 'View users'],
  ['users.manage', 'users', 'manage', 'Create and update users'],
  ['roles.manage', 'roles', 'manage', 'Manage role permission assignments'],
  ['permissions.read', 'permissions', 'read', 'View permissions and policy matrix'],
  ['organizations.create', 'organizations', 'create', 'Register a new organization'],
  ['organizations.read', 'organizations', 'read', 'View organizations'],
  ['organizations.manage', 'organizations', 'manage', 'Manage organizations'],
  ['organizations.verify', 'organizations', 'verify', 'Verify organization identities'],
  ['members.read', 'members', 'read', 'View organization members'],
  ['members.manage', 'members', 'manage', 'Invite and remove organization members'],
  ['invitations.manage', 'invitations', 'manage', 'Manage organization invitations'],
  ['documents.manage', 'documents', 'manage', 'Manage organization documents'],
  ['sessions.read', 'sessions', 'read', 'View sessions'],
  ['sessions.manage', 'sessions', 'manage', 'Revoke sessions'],
  ['audit.read', 'audit', 'read', 'View audit logs'],
  ['settings.manage', 'settings', 'manage', 'Manage platform settings'],
  ['farms.read', 'farms', 'read', 'View farms'],
  ['farms.manage', 'farms', 'manage', 'Manage farms'],
  ['cultivations.read', 'cultivations', 'read', 'View cultivations'],
  ['cultivations.manage', 'cultivations', 'manage', 'Manage cultivations'],
  ['harvests.read', 'harvests', 'read', 'View harvests'],
  ['harvests.manage', 'harvests', 'manage', 'Manage harvests'],
  ['products.read', 'products', 'read', 'View products'],
  ['products.manage', 'products', 'manage', 'Manage products'],
  ['listings.read', 'listings', 'read', 'View listings'],
  ['listings.manage', 'listings', 'manage', 'Manage listings'],
  ['orders.read', 'orders', 'read', 'View orders'],
  ['orders.manage', 'orders', 'manage', 'Manage orders'],
  ['payments.read', 'payments', 'read', 'View payments'],
  ['payments.manage', 'payments', 'manage', 'Manage payments'],
  ['refunds.manage', 'refunds', 'manage', 'Manage refunds'],
  ['ledger.read', 'ledger', 'read', 'View ledger entries'],
  ['ledger.manage', 'ledger', 'manage', 'Post ledger adjustments'],
  ['shipments.read', 'shipments', 'read', 'View shipments'],
  ['shipments.manage', 'shipments', 'manage', 'Manage shipments'],
  ['warehouses.read', 'warehouses', 'read', 'View warehouses'],
  ['warehouses.manage', 'warehouses', 'manage', 'Manage warehouses'],
  ['quality.read', 'quality', 'read', 'View quality inspections'],
  ['quality.manage', 'quality', 'manage', 'Record quality inspections'],
  ['traceability.read', 'traceability', 'read', 'View traceability records'],
  ['ai.read', 'ai', 'read', 'View AI recommendations'],
  ['ai.feedback', 'ai', 'feedback', 'Provide AI feedback'],
  ['subscriptions.manage', 'subscriptions', 'manage', 'Manage subscriptions'],
  ['notifications.read', 'notifications', 'read', 'View notifications'],
]);

const PERMISSION_CODES = Object.freeze(PERMISSION_CATALOG.map(([code]) => code));

const PROFILE_PERMISSIONS = ['profile.read', 'profile.manage', 'notifications.read'];

// Every authenticated user category may register an organization they will
// administer. Management of an existing tenant still requires an explicit
// organization-scoped grant.
const SELF_SERVICE_PERMISSIONS = [...PROFILE_PERMISSIONS, 'organizations.create'];

const MARKETPLACE_READ_PERMISSIONS = [
  'products.read',
  'listings.read',
  'orders.read',
  'payments.read',
  'shipments.read',
];

const ROLE_PERMISSIONS = Object.freeze({
  FARMER: [
    ...SELF_SERVICE_PERMISSIONS,
    'farms.read',
    'farms.manage',
    'cultivations.read',
    'cultivations.manage',
    'harvests.read',
    'harvests.manage',
    'products.read',
    'products.manage',
    'listings.read',
    'listings.manage',
    'orders.read',
    'ai.read',
    'ai.feedback',
  ],
  BUYER: [...SELF_SERVICE_PERMISSIONS, ...MARKETPLACE_READ_PERMISSIONS, 'orders.manage', 'ai.read'],
  WHOLESALER: [
    ...SELF_SERVICE_PERMISSIONS,
    ...MARKETPLACE_READ_PERMISSIONS,
    'orders.manage',
    'traceability.read',
    'ai.read',
  ],
  RETAILER: [...SELF_SERVICE_PERMISSIONS, ...MARKETPLACE_READ_PERMISSIONS, 'orders.manage'],
  AGRICULTURAL_INPUT_SUPPLIER: [
    ...SELF_SERVICE_PERMISSIONS,
    'products.read',
    'products.manage',
    'listings.read',
    'listings.manage',
    'orders.read',
    'ai.read',
  ],
  LOGISTICS_PROVIDER: [
    ...SELF_SERVICE_PERMISSIONS,
    'orders.read',
    'shipments.read',
    'shipments.manage',
  ],
  WAREHOUSE_OPERATOR: [
    ...SELF_SERVICE_PERMISSIONS,
    'warehouses.read',
    'warehouses.manage',
    'products.read',
    'quality.read',
    'traceability.read',
    'shipments.read',
  ],
  AGRICULTURAL_EXPERT: [
    ...SELF_SERVICE_PERMISSIONS,
    'farms.read',
    'cultivations.read',
    'harvests.read',
    'traceability.read',
    'ai.read',
    'ai.feedback',
  ],
  QUALITY_INSPECTOR: [
    ...SELF_SERVICE_PERMISSIONS,
    'quality.read',
    'quality.manage',
    'traceability.read',
    'shipments.read',
    'farms.read',
  ],
  ORGANIZATION_MEMBER: [
    ...SELF_SERVICE_PERMISSIONS,
    'organizations.read',
    'members.read',
    'products.read',
    'listings.read',
    'orders.read',
    'payments.read',
    'shipments.read',
    'quality.read',
    'traceability.read',
    'ai.read',
  ],
  ORGANIZATION_ADMIN: [
    ...SELF_SERVICE_PERMISSIONS,
    'users.read',
    'users.manage',
    'roles.manage',
    'permissions.read',
    'organizations.read',
    'organizations.manage',
    'members.read',
    'members.manage',
    'invitations.manage',
    'documents.manage',
    'sessions.read',
    'audit.read',
    'farms.read',
    'farms.manage',
    'cultivations.read',
    'harvests.read',
    'products.read',
    'products.manage',
    'listings.read',
    'listings.manage',
    'orders.read',
    'orders.manage',
    'payments.read',
    'shipments.read',
    'shipments.manage',
    'warehouses.read',
    'warehouses.manage',
    'quality.read',
    'traceability.read',
    'ai.read',
  ],
  CROPSY_SUPER_ADMIN: [...PERMISSION_CODES],
});

const LEGACY_ROLE_ALIASES = Object.freeze({
  SUPER_ADMIN: 'CROPSY_SUPER_ADMIN',
  DISTRICT_ADMIN: 'ORGANIZATION_ADMIN',
  UPAZILA_COORDINATOR: 'ORGANIZATION_ADMIN',
  FARMER_GROUP_LEADER: 'FARMER',
  INSTITUTIONAL_BUYER: 'BUYER',
  CONSUMER: 'BUYER',
  TRANSPORTER: 'LOGISTICS_PROVIDER',
  WAREHOUSE_MANAGER: 'WAREHOUSE_OPERATOR',
  PAYMENT_OFFICER: 'ORGANIZATION_ADMIN',
  DISPUTE_OFFICER: 'ORGANIZATION_ADMIN',
});

function createDefaultPolicy() {
  return {
    version: 1,
    roles: ROLE_CATEGORIES.map((role) => ({ ...role })),
    permissions: PERMISSION_CATALOG.map(([code, resource, action, description]) => ({
      code,
      resource,
      action,
      description,
    })),
    rolePermissions: Object.fromEntries(
      Object.entries(ROLE_PERMISSIONS).map(([code, permissions]) => [code, [...permissions]]),
    ),
  };
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object') throw new TypeError('RBAC policy must be an object.');
  if (!Array.isArray(policy.roles) || !Array.isArray(policy.permissions)) {
    throw new TypeError('RBAC policy requires roles and permissions arrays.');
  }
  if (!policy.rolePermissions || typeof policy.rolePermissions !== 'object') {
    throw new TypeError('RBAC policy requires a rolePermissions object.');
  }

  const knownPermissions = new Set(policy.permissions.map((permission) => permission.code));
  const knownRoles = new Set(policy.roles.map((role) => role.code));

  for (const [role, permissions] of Object.entries(policy.rolePermissions)) {
    if (!knownRoles.has(role))
      throw new TypeError(`RBAC policy references unknown role '${role}'.`);
    if (!Array.isArray(permissions)) {
      throw new TypeError(`RBAC permissions for '${role}' must be an array.`);
    }
    for (const permission of permissions) {
      if (!knownPermissions.has(permission)) {
        throw new TypeError(`RBAC role '${role}' references unknown permission '${permission}'.`);
      }
    }
  }

  return policy;
}

function normalizeRoleCode(value) {
  if (typeof value !== 'string') return null;
  const code = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return code.length > 0 ? code : null;
}

module.exports = {
  LEGACY_ROLE_ALIASES,
  PERMISSION_CATALOG,
  PERMISSION_CODES,
  ROLE_CATEGORIES,
  ROLE_PERMISSIONS,
  createDefaultPolicy,
  normalizeRoleCode,
  validatePolicy,
};

const ID = 'id';
const STATUS_OPTIONS = [
  'PENDING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'RETURNED',
  'CANCELLED',
];

const section = (id, labelKey, options = {}) => ({
  id,
  labelKey,
  kind: 'records',
  ...options,
});

const overview = () => section('overview', 'overview', { kind: 'overview', permissions: [] });
const notifications = () =>
  section('notifications', 'notifications', {
    kind: 'notifications',
    endpoint: '/notifications/info',
    permissions: ['notifications.read'],
  });
const profile = () =>
  section('profile', 'profile', {
    kind: 'profile',
    permissions: ['profile.read'],
  });

const marketplaceBrowse = (options = {}) =>
  section('marketplace', 'marketplace', {
    endpoint: '/marketplace/listings',
    arrayKey: 'listings',
    columns: ['title', 'productName', 'unitPrice', 'quantityAvailable', 'status'],
    permissions: ['listings.read'],
    actions: ['favoriteListing'],
    ...options,
  });

const favorites = () =>
  section('favorites', 'favorites', {
    endpoint: '/marketplace/favorites',
    arrayKey: 'favorites',
    columns: ['title', 'listingTitle', 'unitPrice', 'status'],
    permissions: ['listings.read'],
  });

const cart = () =>
  section('cart', 'cart', {
    endpoint: '/orders/cart',
    columns: ['listingTitle', 'title', 'quantity', 'unitPrice', 'currency'],
    permissions: ['orders.read'],
    actions: ['addToCart'],
  });

const checkouts = () =>
  section('checkouts', 'checkouts', {
    endpoint: '/orders/checkouts',
    arrayKey: 'checkouts',
    columns: ['referenceKey', 'status', 'totalAmount', 'currency', 'createdAt'],
    permissions: ['orders.read'],
    actions: ['checkout'],
  });

const orders = () =>
  section('orders', 'orders', {
    endpoint: '/orders/orders',
    arrayKey: 'orders',
    columns: ['referenceKey', 'status', 'totalAmount', 'currency', 'createdAt'],
    permissions: ['orders.read'],
    actions: ['cancelOrder'],
  });

const buyerLogistics = () =>
  section('buyerLogistics', 'buyerLogistics', {
    endpoint: '/logistics/dashboard/buyer',
    permissions: ['shipments.read'],
  });

const shipments = () =>
  section('shipments', 'shipments', {
    endpoint: '/logistics/shipments',
    columns: ['referenceKey', 'status', 'providerName', 'createdAt'],
    permissions: ['shipments.read'],
  });

const traceability = () =>
  section('traceability', 'traceability', {
    endpoint: '/traceability/batches',
    columns: ['batchCode', 'productName', 'status', 'verifiedAt'],
    permissions: ['traceability.read'],
    requiresOrganization: true,
  });

const payments = () =>
  section('payments', 'payments', {
    endpoint: '/payments/payments',
    columns: ['referenceKey', 'status', 'amount', 'currency', 'createdAt'],
    permissions: ['payments.read'],
  });

const aiCapabilities = () =>
  section('aiCapabilities', 'aiCapabilities', {
    endpoint: '/intelligence/ai/capabilities',
    permissions: ['ai.read'],
  });

const profileActions = {
  favoriteListing: {
    labelKey: 'favorite',
    permission: 'listings.read',
    path: `/marketplace/favorites/{${ID}}`,
    row: true,
  },
  addToCart: {
    labelKey: 'addToCart',
    permission: 'orders.manage',
    path: '/orders/cart/items',
    fields: [
      {
        key: 'listingId',
        labelKey: 'listing',
        type: 'source',
        source: 'marketplace',
        valueKey: 'id',
        optionLabelKey: 'title',
        required: true,
      },
      {
        key: 'quantity',
        labelKey: 'quantity',
        type: 'number',
        defaultValue: 1,
        min: 1,
        required: true,
      },
    ],
  },
  checkout: {
    labelKey: 'checkout',
    permission: 'orders.manage',
    path: '/orders/checkout',
    fields: [
      {
        key: 'referenceKey',
        labelKey: 'referenceKey',
        type: 'text',
        defaultValue: () => `web-${Date.now()}`,
        required: true,
      },
    ],
  },
  cancelOrder: {
    labelKey: 'cancelOrder',
    permission: 'orders.manage',
    path: `/orders/orders/{${ID}}/cancel`,
    row: true,
  },
  createListing: {
    labelKey: 'createListing',
    permission: 'listings.manage',
    path: '/marketplace/listings',
    fields: [
      {
        key: 'productId',
        labelKey: 'product',
        type: 'source',
        source: 'catalog',
        valueKey: 'id',
        optionLabelKey: 'name',
        required: true,
      },
      { key: 'title', labelKey: 'title', type: 'text', required: true },
      { key: 'unitPrice', labelKey: 'unitPrice', type: 'number', min: 0.01, required: true },
      {
        key: 'quantityAvailable',
        labelKey: 'quantityAvailable',
        type: 'number',
        min: 0.01,
        required: true,
      },
      { key: 'availableLocation', labelKey: 'availableLocation', type: 'text', required: true },
    ],
  },
  deactivateListing: {
    labelKey: 'deactivateListing',
    permission: 'listings.manage',
    path: `/marketplace/listings/{${ID}}/deactivate`,
    row: true,
  },
  updateShipmentStatus: {
    labelKey: 'updateStatus',
    permission: 'shipments.manage',
    path: `/logistics/shipments/{${ID}}/status`,
    row: true,
    fields: [
      {
        key: 'status',
        labelKey: 'status',
        type: 'select',
        options: STATUS_OPTIONS,
        required: true,
      },
      { key: 'note', labelKey: 'notes', type: 'text' },
    ],
  },
  recordProof: {
    labelKey: 'recordProof',
    permission: 'shipments.manage',
    path: `/logistics/deliveries/{${ID}}/proof`,
    row: true,
    fields: [
      { key: 'proofUrl', labelKey: 'proofUrl', type: 'text', required: true },
      { key: 'recipientName', labelKey: 'recipientName', type: 'text' },
    ],
  },
  acknowledgeAlert: {
    labelKey: 'acknowledge',
    permission: 'warehouses.manage',
    path: `/warehouse/alerts/{${ID}}/acknowledge`,
    row: true,
  },
  resolveAlert: {
    labelKey: 'resolve',
    permission: 'warehouses.manage',
    path: `/warehouse/alerts/{${ID}}/resolve`,
    row: true,
  },
  gradeInspection: {
    labelKey: 'grade',
    permission: 'quality.manage',
    path: `/quality/inspections/{${ID}}/grade`,
    row: true,
    fields: [
      { key: 'gradeCode', labelKey: 'gradeCode', type: 'text', required: true },
      { key: 'note', labelKey: 'notes', type: 'text' },
    ],
  },
  verifyInspection: {
    labelKey: 'verify',
    permission: 'quality.manage',
    path: `/quality/inspections/{${ID}}/verify`,
    row: true,
    fields: [{ key: 'note', labelKey: 'notes', type: 'text' }],
  },
  rejectInspection: {
    labelKey: 'reject',
    permission: 'quality.manage',
    path: `/quality/inspections/{${ID}}/reject`,
    row: true,
    fields: [{ key: 'note', labelKey: 'notes', type: 'text', required: true }],
  },
  inviteMember: {
    labelKey: 'inviteMember',
    permission: 'invitations.manage',
    path: '/organizations/{organizationId}/invitations',
    fields: [
      { key: 'email', labelKey: 'email', type: 'text', required: true },
      { key: 'roleCode', labelKey: 'role', type: 'text', required: true },
    ],
  },
};

const tradeSections = (withAi) => [
  overview(),
  marketplaceBrowse(),
  favorites(),
  cart(),
  checkouts(),
  orders(),
  buyerLogistics(),
  shipments(),
  payments(),
  ...(withAi ? [aiCapabilities()] : []),
  notifications(),
  profile(),
];

const wholesaleSections = () => {
  const sections = tradeSections(false);
  return [...sections.slice(0, -2), traceability(), ...sections.slice(-2)];
};

export const ROLE_DASHBOARDS = [
  {
    roleCodes: ['BUYER'],
    slug: 'buyers',
    pageKey: 'buyersDashboard',
    sections: tradeSections(true),
    actions: profileActions,
  },
  {
    roleCodes: ['WHOLESALER'],
    slug: 'wholesalers',
    pageKey: 'wholesalersDashboard',
    sections: wholesaleSections(),
    actions: profileActions,
  },
  {
    roleCodes: ['RETAILER'],
    slug: 'retailers',
    pageKey: 'retailersDashboard',
    sections: tradeSections(false),
    actions: profileActions,
  },
  {
    roleCodes: ['AGRICULTURAL_INPUT_SUPPLIER'],
    slug: 'agricultural-input-suppliers',
    pageKey: 'inputSuppliersDashboard',
    sections: [
      overview(),
      section('catalog', 'catalog', {
        endpoint: '/catalog/products',
        columns: ['name', 'categoryName', 'unitName', 'status'],
        permissions: ['products.read'],
      }),
      section('supplierListings', 'supplierListings', {
        endpoint: '/marketplace/listings',
        arrayKey: 'listings',
        params: { sellerUserId: '{userId}' },
        columns: ['title', 'unitPrice', 'quantityAvailable', 'status'],
        permissions: ['listings.read'],
        actions: ['createListing', 'deactivateListing'],
      }),
      marketplaceBrowse({ actions: [] }),
      orders(),
      notifications(),
      profile(),
    ],
    actions: profileActions,
  },
  {
    roleCodes: ['LOGISTICS_PROVIDER'],
    slug: 'logistics-providers',
    pageKey: 'logisticsProvidersDashboard',
    sections: [
      overview(),
      section('providerDashboard', 'providerDashboard', {
        endpoint: '/logistics/dashboard/provider',
        permissions: ['shipments.read'],
      }),
      section('deliveries', 'deliveries', {
        endpoint: '/logistics/deliveries',
        columns: ['referenceKey', 'status', 'phase', 'createdAt'],
        permissions: ['shipments.read'],
        actions: ['recordProof'],
      }),
      section('providers', 'providers', {
        endpoint: '/logistics/providers',
        columns: ['displayName', 'serviceType', 'isActive'],
        permissions: ['shipments.read'],
      }),
      section('services', 'services', {
        endpoint: '/logistics/services',
        columns: ['serviceType', 'name', 'isActive'],
        permissions: ['shipments.read'],
      }),
      section('shipments', 'shipments', {
        endpoint: '/logistics/shipments',
        columns: ['referenceKey', 'status', 'providerName', 'createdAt'],
        permissions: ['shipments.read'],
        actions: ['updateShipmentStatus'],
      }),
      notifications(),
      profile(),
    ],
    actions: profileActions,
  },
  {
    roleCodes: ['WAREHOUSE_OPERATOR'],
    slug: 'warehouse-operators',
    pageKey: 'warehouseOperatorsDashboard',
    sections: [
      overview(),
      section('warehouses', 'warehouses', {
        endpoint: '/warehouse/warehouses',
        arrayKey: 'warehouses',
        columns: ['name', 'code', 'status', 'createdAt'],
        permissions: ['warehouses.read'],
        requiresOrganization: true,
      }),
      section('inventories', 'inventories', {
        endpoint: '/warehouse/inventories',
        arrayKey: 'inventories',
        columns: ['batchCode', 'productName', 'quantityAvailable', 'unitCode'],
        permissions: ['warehouses.read'],
        requiresOrganization: true,
      }),
      section('movements', 'movements', {
        endpoint: '/warehouse/movements',
        arrayKey: 'movements',
        columns: ['movementType', 'batchCode', 'quantity', 'createdAt'],
        permissions: ['warehouses.read'],
        requiresOrganization: true,
      }),
      section('alerts', 'alerts', {
        endpoint: '/warehouse/alerts',
        arrayKey: 'alerts',
        columns: ['alertType', 'severity', 'status', 'createdAt'],
        permissions: ['warehouses.read'],
        requiresOrganization: true,
        actions: ['acknowledgeAlert', 'resolveAlert'],
      }),
      section('reservations', 'reservations', {
        endpoint: '/warehouse/reservations',
        arrayKey: 'reservations',
        columns: ['referenceKey', 'status', 'quantity', 'createdAt'],
        permissions: ['warehouses.read'],
        requiresOrganization: true,
      }),
      section('conditions', 'conditions', {
        endpoint: '/warehouse/conditions',
        columns: ['warehouseName', 'temperature', 'humidity', 'recordedAt'],
        permissions: ['warehouses.read'],
        requiresOrganization: true,
      }),
      section('reconciliations', 'reconciliations', {
        endpoint: '/warehouse/reconciliations',
        columns: ['referenceKey', 'status', 'createdAt'],
        permissions: ['warehouses.read'],
        requiresOrganization: true,
      }),
      section('warehouseReport', 'warehouseReport', {
        endpoint: '/warehouse/report',
        permissions: ['warehouses.read'],
        requiresOrganization: true,
      }),
      shipments(),
      section('qualityInspections', 'qualityInspections', {
        endpoint: '/quality/inspections',
        columns: ['referenceKey', 'status', 'gradeCode', 'createdAt'],
        permissions: ['quality.read'],
        requiresOrganization: true,
      }),
      traceability(),
      notifications(),
      profile(),
    ],
    actions: profileActions,
  },
  {
    roleCodes: ['AGRICULTURAL_EXPERT'],
    slug: 'agricultural-experts',
    pageKey: 'expertsDashboard',
    sections: [
      overview(),
      section('farms', 'farms', {
        endpoint: '/farmers/farms',
        columns: ['name', 'farmType', 'area', 'status'],
        permissions: ['farms.read'],
      }),
      section('cultivations', 'cultivations', {
        endpoint: '/agriculture/cultivations',
        columns: ['cropName', 'status', 'plannedAt', 'harvestedAt'],
        permissions: ['cultivations.read'],
      }),
      section('crops', 'crops', {
        endpoint: '/agriculture/crops',
        columns: ['name', 'nameBn', 'status'],
        permissions: ['crops.read'],
      }),
      section('expenses', 'expenses', {
        endpoint: '/agriculture/expenses',
        columns: ['category', 'amount', 'currency', 'occurredAt'],
        permissions: ['expenses.read'],
      }),
      traceability(),
      aiCapabilities(),
      notifications(),
      profile(),
    ],
    actions: profileActions,
  },
  {
    roleCodes: ['QUALITY_INSPECTOR'],
    slug: 'quality-inspectors',
    pageKey: 'qualityInspectorsDashboard',
    sections: [
      overview(),
      section('inspections', 'inspections', {
        endpoint: '/quality/inspections',
        columns: ['referenceKey', 'status', 'gradeCode', 'createdAt'],
        permissions: ['quality.read'],
        requiresOrganization: true,
        actions: ['gradeInspection', 'verifyInspection', 'rejectInspection'],
      }),
      section('qualityAudits', 'qualityAudits', {
        endpoint: '/quality/audits',
        columns: ['action', 'entityType', 'createdAt'],
        permissions: ['quality.read'],
        requiresOrganization: true,
      }),
      traceability(),
      shipments(),
      section('farms', 'farms', {
        endpoint: '/farmers/farms',
        columns: ['name', 'farmType', 'area', 'status'],
        permissions: ['farms.read'],
      }),
      notifications(),
      profile(),
    ],
    actions: profileActions,
  },
  {
    roleCodes: ['ORGANIZATION_ADMIN'],
    slug: 'organizations',
    pageKey: 'organizationAdminsDashboard',
    sections: [
      overview(),
      section('organizations', 'organizations', {
        endpoint: '/organizations',
        arrayKey: 'organizations',
        columns: ['name', 'type', 'verificationStatus', 'status'],
        permissions: ['organizations.read'],
      }),
      section('members', 'members', {
        endpoint: '/organizations/{organizationId}/members',
        arrayKey: 'members',
        columns: ['email', 'displayName', 'roleCodes', 'createdAt'],
        permissions: ['members.read'],
      }),
      section('invitations', 'invitations', {
        endpoint: '/organizations/{organizationId}/invitations',
        arrayKey: 'invitations',
        columns: ['email', 'roleCode', 'status', 'expiresAt'],
        permissions: ['invitations.manage'],
        actions: ['inviteMember'],
      }),
      section('addresses', 'addresses', {
        endpoint: '/organizations/{organizationId}/addresses',
        arrayKey: 'addresses',
        columns: ['label', 'addressLine1', 'city', 'postalCode'],
        permissions: ['organizations.read'],
      }),
      section('documents', 'documents', {
        endpoint: '/organizations/{organizationId}/documents',
        arrayKey: 'documents',
        columns: ['documentType', 'title', 'status', 'createdAt'],
        permissions: ['documents.manage'],
      }),
      section('roles', 'roles', {
        endpoint: '/iam/auth/roles',
        arrayKey: 'roles',
        columns: ['code', 'scope', 'name'],
        permissions: ['permissions.read'],
      }),
      section('permissions', 'permissions', {
        endpoint: '/iam/auth/permissions',
        arrayKey: 'permissions',
        columns: ['code', 'description', 'moduleId'],
        permissions: ['permissions.read'],
      }),
      section('audit', 'audit', {
        endpoint: '/iam/auth/audit',
        arrayKey: 'events',
        columns: ['action', 'entityType', 'actorUserId', 'createdAt'],
        permissions: ['audit.read'],
      }),
      marketplaceBrowse({ actions: [] }),
      section('marketReports', 'marketReports', {
        endpoint: '/marketplace/reports',
        arrayKey: 'reports',
        columns: ['reason', 'status', 'createdAt'],
        permissions: ['listings.manage'],
      }),
      orders(),
      notifications(),
      profile(),
    ],
    actions: profileActions,
  },
];

export function getDashboardConfig(roleCodes = []) {
  return (
    ROLE_DASHBOARDS.find((config) =>
      config.roleCodes.some((roleCode) => roleCodes.includes(roleCode)),
    ) || null
  );
}

export function getDashboardConfigBySlug(slug) {
  return ROLE_DASHBOARDS.find((config) => config.slug === slug) || null;
}

/**
 * CROPSY idempotent reference-data seed.
 *
 * Deliberately excludes commission rates, payment providers, subscription
 * prices, settlement rules, users, organizations, and any other invented
 * business policy. Run after `prisma migrate deploy`.
 */
const path = require('node:path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run the CROPSY seed.');
}

const prisma = new PrismaClient();

const DIVISIONS = [
  { code: 'BD-BAR', name: 'Barishal', name_bn: 'বরিশাল' },
  { code: 'BD-CTG', name: 'Chattogram', name_bn: 'চট্টগ্রাম' },
  { code: 'BD-DHA', name: 'Dhaka', name_bn: 'ঢাকা' },
  { code: 'BD-KHU', name: 'Khulna', name_bn: 'খুলনা' },
  { code: 'BD-MYM', name: 'Mymensingh', name_bn: 'ময়মনসিংহ' },
  { code: 'BD-RAJ', name: 'Rajshahi', name_bn: 'রাজশাহী' },
  { code: 'BD-RNG', name: 'Rangpur', name_bn: 'রংপুর' },
  { code: 'BD-SYL', name: 'Sylhet', name_bn: 'সিলেট' },
];

const DISTRICTS = [
  ['BD-BAR', 'BD-BAR-BGR', 'Barguna'],
  ['BD-BAR', 'BD-BAR-BAR', 'Barishal'],
  ['BD-BAR', 'BD-BAR-BHL', 'Bhola'],
  ['BD-BAR', 'BD-BAR-JKL', 'Jhalokati'],
  ['BD-BAR', 'BD-BAR-PTK', 'Patuakhali'],
  ['BD-BAR', 'BD-BAR-PRJ', 'Pirojpur'],

  ['BD-CTG', 'BD-CTG-BDB', 'Bandarban'],
  ['BD-CTG', 'BD-CTG-BRB', 'Brahmanbaria'],
  ['BD-CTG', 'BD-CTG-CDP', 'Chandpur'],
  ['BD-CTG', 'BD-CTG-CTG', 'Chattogram'],
  ['BD-CTG', 'BD-CTG-CML', 'Cumilla'],
  ['BD-CTG', 'BD-CTG-CXB', "Cox's Bazar"],
  ['BD-CTG', 'BD-CTG-FNI', 'Feni'],
  ['BD-CTG', 'BD-CTG-KGR', 'Khagrachhari'],
  ['BD-CTG', 'BD-CTG-LKM', 'Lakshmipur'],
  ['BD-CTG', 'BD-CTG-NOK', 'Noakhali'],
  ['BD-CTG', 'BD-CTG-RGM', 'Rangamati'],

  ['BD-DHA', 'BD-DHA-DHA', 'Dhaka'],
  ['BD-DHA', 'BD-DHA-FRP', 'Faridpur'],
  ['BD-DHA', 'BD-DHA-GZP', 'Gazipur'],
  ['BD-DHA', 'BD-DHA-GPL', 'Gopalganj'],
  ['BD-DHA', 'BD-DHA-KSH', 'Kishoreganj'],
  ['BD-DHA', 'BD-DHA-MDR', 'Madaripur'],
  ['BD-DHA', 'BD-DHA-MNK', 'Manikganj'],
  ['BD-DHA', 'BD-DHA-MNS', 'Munshiganj'],
  ['BD-DHA', 'BD-DHA-NRY', 'Narayanganj'],
  ['BD-DHA', 'BD-DHA-NRS', 'Narsingdi'],
  ['BD-DHA', 'BD-DHA-RBJ', 'Rajbari'],
  ['BD-DHA', 'BD-DHA-SHP', 'Shariatpur'],
  ['BD-DHA', 'BD-DHA-TNG', 'Tangail'],

  ['BD-KHU', 'BD-KHU-BGT', 'Bagerhat'],
  ['BD-KHU', 'BD-KHU-CHD', 'Chuadanga'],
  ['BD-KHU', 'BD-KHU-JSH', 'Jashore'],
  ['BD-KHU', 'BD-KHU-JHN', 'Jhenaidah'],
  ['BD-KHU', 'BD-KHU-KHU', 'Khulna'],
  ['BD-KHU', 'BD-KHU-KST', 'Kushtia'],
  ['BD-KHU', 'BD-KHU-MAG', 'Magura'],
  ['BD-KHU', 'BD-KHU-MHP', 'Meherpur'],
  ['BD-KHU', 'BD-KHU-NRL', 'Narail'],
  ['BD-KHU', 'BD-KHU-STK', 'Satkhira'],

  ['BD-MYM', 'BD-MYM-JMP', 'Jamalpur'],
  ['BD-MYM', 'BD-MYM-MYM', 'Mymensingh'],
  ['BD-MYM', 'BD-MYM-NTR', 'Netrokona'],
  ['BD-MYM', 'BD-MYM-SHP', 'Sherpur'],

  ['BD-RAJ', 'BD-RAJ-BGR', 'Bogura'],
  ['BD-RAJ', 'BD-RAJ-JYP', 'Joypurhat'],
  ['BD-RAJ', 'BD-RAJ-NGN', 'Naogaon'],
  ['BD-RAJ', 'BD-RAJ-NAT', 'Natore'],
  ['BD-RAJ', 'BD-RAJ-CWN', 'Chapai Nawabganj'],
  ['BD-RAJ', 'BD-RAJ-PBN', 'Pabna'],
  ['BD-RAJ', 'BD-RAJ-RAJ', 'Rajshahi'],
  ['BD-RAJ', 'BD-RAJ-SJG', 'Sirajganj'],

  ['BD-RNG', 'BD-RNG-DIN', 'Dinajpur'],
  ['BD-RNG', 'BD-RNG-GBD', 'Gaibandha'],
  ['BD-RNG', 'BD-RNG-KUR', 'Kurigram'],
  ['BD-RNG', 'BD-RNG-LNM', 'Lalmonirhat'],
  ['BD-RNG', 'BD-RNG-NLP', 'Nilphamari'],
  ['BD-RNG', 'BD-RNG-PCH', 'Panchagarh'],
  ['BD-RNG', 'BD-RNG-RNG', 'Rangpur'],
  ['BD-RNG', 'BD-RNG-THG', 'Thakurgaon'],

  ['BD-SYL', 'BD-SYL-HAB', 'Habiganj'],
  ['BD-SYL', 'BD-SYL-MOU', 'Moulvibazar'],
  ['BD-SYL', 'BD-SYL-SUN', 'Sunamganj'],
  ['BD-SYL', 'BD-SYL-SYL', 'Sylhet'],
];

const ROLES = [
  ['SUPER_ADMIN', 'Super Admin', 'Platform-wide administrator'],
  ['DISTRICT_ADMIN', 'District Admin', 'District-scoped administrator'],
  ['UPAZILA_COORDINATOR', 'Upazila Coordinator', 'Upazila-scoped coordinator'],
  ['FARMER', 'Farmer', 'Producer of agricultural products'],
  ['FARMER_GROUP_LEADER', 'Farmer Group Leader', 'Leader of a farmer group'],
  ['WHOLESALER', 'Wholesaler', 'Bulk buyer'],
  ['RETAILER', 'Retailer', 'Retail buyer'],
  ['INSTITUTIONAL_BUYER', 'Institutional Buyer', 'Institutional procurement buyer'],
  ['CONSUMER', 'Consumer', 'Individual buyer'],
  ['TRANSPORTER', 'Transporter', 'Logistics provider user'],
  ['QUALITY_INSPECTOR', 'Quality Inspector', 'Quality inspection user'],
  ['WAREHOUSE_MANAGER', 'Warehouse Manager', 'Warehouse operations user'],
  ['PAYMENT_OFFICER', 'Payment Officer', 'Payment operations user'],
  ['DISPUTE_OFFICER', 'Dispute Officer', 'Dispute resolution user'],
];

const PERMISSIONS = [
  ['users.read', 'users', 'read', 'View users'],
  ['users.manage', 'users', 'manage', 'Create and update users'],
  ['roles.manage', 'roles', 'manage', 'Manage roles and permissions'],
  ['organizations.read', 'organizations', 'read', 'View organizations'],
  ['organizations.manage', 'organizations', 'manage', 'Manage organizations'],
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
  ['audit.read', 'audit', 'read', 'View audit logs'],
  ['settings.manage', 'settings', 'manage', 'Manage platform settings'],
];

const ALL_PERMISSION_CODES = PERMISSIONS.map(([code]) => code);

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ALL_PERMISSION_CODES,
  DISTRICT_ADMIN: [
    'users.read',
    'organizations.read',
    'farms.read',
    'cultivations.read',
    'harvests.read',
    'products.read',
    'listings.read',
    'orders.read',
    'shipments.read',
    'quality.read',
    'traceability.read',
    'notifications.read',
  ],
  UPAZILA_COORDINATOR: [
    'users.read',
    'farms.read',
    'cultivations.read',
    'harvests.read',
    'products.read',
    'listings.read',
    'traceability.read',
    'notifications.read',
  ],
  FARMER: [
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
    'notifications.read',
  ],
  FARMER_GROUP_LEADER: [
    'users.read',
    'farms.read',
    'cultivations.read',
    'harvests.read',
    'products.read',
    'listings.read',
    'orders.read',
    'traceability.read',
    'notifications.read',
  ],
  WHOLESALER: [
    'products.read',
    'listings.read',
    'orders.read',
    'orders.manage',
    'payments.read',
    'shipments.read',
    'ai.read',
    'notifications.read',
  ],
  RETAILER: [
    'products.read',
    'listings.read',
    'orders.read',
    'orders.manage',
    'payments.read',
    'shipments.read',
    'notifications.read',
  ],
  INSTITUTIONAL_BUYER: [
    'products.read',
    'listings.read',
    'orders.read',
    'orders.manage',
    'payments.read',
    'shipments.read',
    'traceability.read',
    'notifications.read',
  ],
  CONSUMER: [
    'products.read',
    'listings.read',
    'orders.read',
    'orders.manage',
    'payments.read',
    'shipments.read',
    'notifications.read',
  ],
  TRANSPORTER: ['shipments.read', 'shipments.manage', 'notifications.read'],
  QUALITY_INSPECTOR: [
    'quality.read',
    'quality.manage',
    'traceability.read',
    'shipments.read',
    'notifications.read',
  ],
  WAREHOUSE_MANAGER: [
    'warehouses.read',
    'warehouses.manage',
    'products.read',
    'quality.read',
    'traceability.read',
    'notifications.read',
  ],
  PAYMENT_OFFICER: [
    'payments.read',
    'payments.manage',
    'refunds.manage',
    'orders.read',
    'ledger.read',
    'notifications.read',
  ],
  DISPUTE_OFFICER: [
    'orders.read',
    'payments.read',
    'refunds.manage',
    'audit.read',
    'traceability.read',
    'notifications.read',
  ],
};

const PRODUCT_CATEGORIES = [
  ['CEREALS', 'Cereals', 'শস্য'],
  ['PULSES', 'Pulses', 'ডাল'],
  ['VEGETABLES', 'Vegetables', 'শাকসবজি'],
  ['FRUITS', 'Fruits', 'ফল'],
  ['ROOT_CROPS', 'Root Crops', 'কন্দজাতীয় ফসল'],
  ['SPICES', 'Spices', 'মসলা'],
  ['LIVESTOCK', 'Livestock Products', 'পশুজাত পণ্য'],
  ['FISHERY', 'Fishery Products', 'মৎস্যজাত পণ্য'],
  ['DAIRY', 'Dairy Products', 'দুগ্ধজাত পণ্য'],
  ['OTHER_PRODUCE', 'Other Produce', 'অন্যান্য কৃষিপণ্য'],
];

const LEDGER_ACCOUNTS = [
  ['1000', 'Cash', 'ASSET', 'DEBIT'],
  ['1100', 'Accounts Receivable', 'ASSET', 'DEBIT'],
  ['1200', 'Inventory', 'ASSET', 'DEBIT'],
  ['2000', 'Accounts Payable', 'LIABILITY', 'CREDIT'],
  ['2100', 'Seller Payables', 'LIABILITY', 'CREDIT'],
  ['3000', 'Platform Equity', 'EQUITY', 'CREDIT'],
  ['4000', 'Sales Revenue', 'REVENUE', 'CREDIT'],
  ['4100', 'Commission Revenue', 'REVENUE', 'CREDIT'],
  ['5000', 'Refunds and Returns', 'EXPENSE', 'DEBIT'],
  ['5100', 'Delivery Expense', 'EXPENSE', 'DEBIT'],
];

const PLATFORM_SETTINGS = [
  ['currency.default', { code: 'BDT', scale: 2 }, 'Default display and storage currency.'],
  ['geography.default_country', 'BD', 'Default country for administrative geography.'],
];

async function seedGeography(tx) {
  const country = await tx.country.upsert({
    where: { code: 'BD' },
    update: { name: 'Bangladesh', name_bn: 'বাংলাদেশ', is_active: true },
    create: { code: 'BD', name: 'Bangladesh', name_bn: 'বাংলাদেশ', is_active: true },
  });

  const divisionByCode = new Map();
  for (const division of DIVISIONS) {
    divisionByCode.set(
      division.code,
      await tx.division.upsert({
        where: { code: division.code },
        update: {
          country_id: country.id,
          name: division.name,
          name_bn: division.name_bn,
        },
        create: {
          country_id: country.id,
          code: division.code,
          name: division.name,
          name_bn: division.name_bn,
        },
      }),
    );
  }

  for (const [divisionCode, code, name] of DISTRICTS) {
    await tx.district.upsert({
      where: { code },
      update: { division_id: divisionByCode.get(divisionCode).id, name },
      create: { division_id: divisionByCode.get(divisionCode).id, code, name },
    });
  }

  return { countries: 1, divisions: DIVISIONS.length, districts: DISTRICTS.length };
}

async function seedAccessControl(tx) {
  const roleByCode = new Map();
  for (const [code, name, description] of ROLES) {
    roleByCode.set(
      code,
      await tx.role.upsert({
        where: { code },
        update: { name, description, scope: 'PLATFORM', is_system: true },
        create: { code, name, description, scope: 'PLATFORM', is_system: true },
      }),
    );
  }

  const permissionByCode = new Map();
  for (const [code, resource, action, description] of PERMISSIONS) {
    permissionByCode.set(
      code,
      await tx.permission.upsert({
        where: { code },
        update: { resource, action, description },
        create: { code, resource, action, description },
      }),
    );
  }

  let assignments = 0;
  for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = roleByCode.get(roleCode);
    for (const permissionCode of permissionCodes) {
      const permission = permissionByCode.get(permissionCode);
      await tx.rolePermission.upsert({
        where: {
          role_id_permission_id: {
            role_id: role.id,
            permission_id: permission.id,
          },
        },
        update: {},
        create: { role_id: role.id, permission_id: permission.id },
      });
      assignments += 1;
    }
  }

  return { roles: ROLES.length, permissions: PERMISSIONS.length, assignments };
}

async function seedCatalogAndLedger(tx) {
  for (const [code, name, name_bn] of PRODUCT_CATEGORIES) {
    await tx.productCategory.upsert({
      where: { code },
      update: { name, name_bn, is_active: true, parent_id: null },
      create: { code, name, name_bn, is_active: true },
    });
  }

  for (const [code, name, account_type, normal_balance] of LEDGER_ACCOUNTS) {
    await tx.ledgerAccount.upsert({
      where: { code },
      update: { name, account_type, normal_balance, is_active: true },
      create: { code, name, account_type, normal_balance, is_active: true },
    });
  }

  for (const [key, value, description] of PLATFORM_SETTINGS) {
    await tx.platformSetting.upsert({
      where: { key_scope_key: { key, scope_key: 'GLOBAL' } },
      update: { value, description, is_active: true },
      create: { key, scope_key: 'GLOBAL', value, description, is_active: true },
    });
  }

  return {
    productCategories: PRODUCT_CATEGORIES.length,
    ledgerAccounts: LEDGER_ACCOUNTS.length,
    platformSettings: PLATFORM_SETTINGS.length,
  };
}

async function main() {
  const summary = await prisma.$transaction(async (tx) => {
    const geography = await seedGeography(tx);
    const accessControl = await seedAccessControl(tx);
    const catalog = await seedCatalogAndLedger(tx);
    return { ...geography, ...accessControl, ...catalog };
  });

  console.log('CROPSY seed complete:', JSON.stringify(summary));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

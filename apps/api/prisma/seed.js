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

const {
  LEGACY_ROLE_ALIASES,
  PERMISSION_CATALOG,
  ROLE_CATEGORIES,
  ROLE_PERMISSIONS: DEFAULT_ROLE_PERMISSIONS,
} = require('../src/modules/iam/domain/auth-policy');

const LEGACY_ROLE_METADATA = {
  SUPER_ADMIN: ['Super Admin', 'Legacy alias for CROPSY Super Administrator'],
  DISTRICT_ADMIN: ['District Admin', 'Legacy district-scoped administrator'],
  UPAZILA_COORDINATOR: ['Upazila Coordinator', 'Legacy upazila-scoped coordinator'],
  FARMER_GROUP_LEADER: ['Farmer Group Leader', 'Legacy farmer group role'],
  INSTITUTIONAL_BUYER: ['Institutional Buyer', 'Legacy institutional procurement role'],
  CONSUMER: ['Consumer', 'Legacy individual buyer role'],
  TRANSPORTER: ['Transporter', 'Legacy logistics provider role'],
  WAREHOUSE_MANAGER: ['Warehouse Manager', 'Legacy warehouse operator role'],
  PAYMENT_OFFICER: ['Payment Officer', 'Legacy payment operations role'],
  DISPUTE_OFFICER: ['Dispute Officer', 'Legacy dispute operations role'],
};

const ROLES = [
  ...ROLE_CATEGORIES.map((role) => [role.code, role.name, role.name, role.scope]),
  ...Object.entries(LEGACY_ROLE_ALIASES).map(([code, canonical]) => {
    const [name, description] = LEGACY_ROLE_METADATA[code];
    const scope = ROLE_CATEGORIES.find((role) => role.code === canonical)?.scope || 'PLATFORM';
    return [code, name, description, scope];
  }),
];

const PERMISSIONS = PERMISSION_CATALOG;

const ROLE_PERMISSIONS = {
  ...DEFAULT_ROLE_PERMISSIONS,
  ...Object.fromEntries(
    Object.entries(LEGACY_ROLE_ALIASES).map(([code, canonical]) => [
      code,
      [...DEFAULT_ROLE_PERMISSIONS[canonical]],
    ]),
  ),
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

  const districtByCode = new Map();
  for (const [divisionCode, code, name] of DISTRICTS) {
    districtByCode.set(
      code,
      await tx.district.upsert({
        where: { code },
        update: { division_id: divisionByCode.get(divisionCode).id, name },
        create: { division_id: divisionByCode.get(divisionCode).id, code, name },
      }),
    );
  }

  // Farm locations need a complete administrative chain. Seed one Sadar
  // upazila and one union per district; tenants may add more through their own
  // reference-data workflows. Codes stay within the 16-character schema limit.
  for (const [code, district] of districtByCode) {
    const upazilaCode = `${code}-S`;
    const upazila = await tx.upazila.upsert({
      where: { code: upazilaCode },
      update: { district_id: district.id, name: `${district.name} Sadar` },
      create: {
        district_id: district.id,
        code: upazilaCode,
        name: `${district.name} Sadar`,
      },
    });
    await tx.union.upsert({
      where: { code: `${code}-U` },
      update: { upazila_id: upazila.id, name: `${upazila.name} Union` },
      create: {
        upazila_id: upazila.id,
        code: `${code}-U`,
        name: `${upazila.name} Union`,
      },
    });
  }

  return {
    countries: 1,
    divisions: DIVISIONS.length,
    districts: DISTRICTS.length,
    upazilas: DISTRICTS.length,
    unions: DISTRICTS.length,
  };
}

async function seedAccessControl(tx) {
  const roleByCode = new Map();
  for (const [code, name, description, scope] of ROLES) {
    roleByCode.set(
      code,
      await tx.role.upsert({
        where: { code },
        update: { name, description, scope, is_system: true },
        create: { code, name, description, scope, is_system: true },
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
    const permissionIds = permissionCodes.map((code) => permissionByCode.get(code).id);

    await tx.rolePermission.deleteMany({
      where: { role_id: role.id, permission_id: { notIn: permissionIds } },
    });

    for (const permissionId of permissionIds) {
      await tx.rolePermission.upsert({
        where: {
          role_id_permission_id: {
            role_id: role.id,
            permission_id: permissionId,
          },
        },
        update: {},
        create: { role_id: role.id, permission_id: permissionId },
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

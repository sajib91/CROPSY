-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'LOCKED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "PreferredLanguage" AS ENUM ('EN', 'BN');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('PLATFORM', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PHONE_VERIFICATION', 'PASSWORD_RESET', 'LOGIN');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OrganizationMemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'LEFT');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FarmType" AS ENUM ('OWNED', 'LEASED', 'SHARED', 'COMMUNITY', 'OTHER');

-- CreateEnum
CREATE TYPE "FarmStatus" AS ENUM ('ACTIVE', 'FALLBACK', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LandOwnership" AS ENUM ('OWNED', 'LEASED', 'SHARE_CROPPING', 'CUSTOM_FARMING', 'OTHER');

-- CreateEnum
CREATE TYPE "LandParcelStatus" AS ENUM ('AVAILABLE', 'CULTIVATED', 'FALLOW', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CropCategory" AS ENUM ('CEREAL', 'PULSE', 'OILSEED', 'VEGETABLE', 'FRUIT', 'ROOT_CROP', 'SPICE', 'LIVESTOCK', 'FISHERY', 'OTHER');

-- CreateEnum
CREATE TYPE "CultivationStatus" AS ENUM ('PLANNED', 'ACTIVE', 'HARVESTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FarmActivityType" AS ENUM ('PLANTING', 'IRRIGATION', 'FERTILIZATION', 'PEST_CONTROL', 'WEEDING', 'PRUNING', 'MONITORING', 'HARVEST_PREP', 'OTHER');

-- CreateEnum
CREATE TYPE "HarvestStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "AgriculturalInputCategory" AS ENUM ('SEED', 'FERTILIZER', 'PESTICIDE', 'FEED', 'TOOL', 'OTHER');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RESERVED', 'INACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('PLATFORM', 'FARMER', 'MARKET', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CHECKED_OUT', 'ABANDONED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'BANK_TRANSFER', 'MOBILE_BANKING', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('BUYER_CANCELLATION', 'SELLER_CANCELLATION', 'QUALITY_ISSUE', 'DELIVERY_FAILURE', 'DUPLICATE_PAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PAYMENT_AUTHORIZATION', 'PAYMENT_CAPTURE', 'REFUND', 'COMMISSION', 'SETTLEMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('PERCENTAGE', 'FIXED', 'TIERED', 'EXTERNAL_RULE');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('CALCULATED', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SCHEDULED', 'ATTEMPTED', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "TraceabilityEventType" AS ENUM ('PRODUCED', 'HARVESTED', 'INSPECTED', 'STORED', 'SHIPPED', 'DELIVERED', 'RECALLED');

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('DOCUMENT', 'WEBSITE', 'DATABASE', 'MANUAL', 'EXTERNAL_API');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('INGESTED', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LanguageCode" AS ENUM ('EN', 'BN', 'BOTH');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('PRICE', 'CROP', 'BUYER', 'LOGISTICS', 'RISK');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARN', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "countries" (
    "id" UUID NOT NULL,
    "code" VARCHAR(2) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_bn" VARCHAR(120),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divisions" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_bn" VARCHAR(120),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL,
    "division_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_bn" VARCHAR(120),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upazilas" (
    "id" UUID NOT NULL,
    "district_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_bn" VARCHAR(120),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "upazilas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unions" (
    "id" UUID NOT NULL,
    "upazila_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_bn" VARCHAR(120),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "unions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(32),
    "password_hash" TEXT NOT NULL,
    "account_status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(6),
    "last_login_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(120) NOT NULL,
    "last_name" VARCHAR(120) NOT NULL,
    "name_bn" VARCHAR(240),
    "avatar_url" TEXT,
    "date_of_birth" DATE,
    "gender" "Gender",
    "national_id_hash" VARCHAR(255),
    "preferred_language" "PreferredLanguage" NOT NULL DEFAULT 'EN',
    "default_currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_bn" VARCHAR(120),
    "description" TEXT,
    "scope" "RoleScope" NOT NULL DEFAULT 'PLATFORM',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "resource" VARCHAR(80) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "organization_id" UUID,
    "scope_key" VARCHAR(64) NOT NULL DEFAULT 'PLATFORM',
    "granted_by_user_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_token_hash" VARCHAR(255) NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "last_seen_at" TIMESTAMP(6),
    "revoked_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID,
    "token_hash" VARCHAR(255) NOT NULL,
    "rotated_to_id" UUID,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "revoked_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "email" VARCHAR(255),
    "phone" VARCHAR(32),
    "purpose" "OtpPurpose" NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "consumed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "legal_name" VARCHAR(255),
    "tax_id" VARCHAR(64),
    "owner_user_id" UUID NOT NULL,
    "default_currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "OrganizationMemberStatus" NOT NULL DEFAULT 'INVITED',
    "joined_at" TIMESTAMP(6),
    "left_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role_id" UUID NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(6) NOT NULL,
    "accepted_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_addresses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "address_line_1" VARCHAR(255) NOT NULL,
    "address_line_2" VARCHAR(255),
    "city" VARCHAR(120),
    "division_id" UUID,
    "district_id" UUID,
    "upazila_id" UUID,
    "union_id" UUID,
    "postal_code" VARCHAR(16),
    "location" geometry(Point, 4326),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "organization_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "address_line_1" VARCHAR(255) NOT NULL,
    "address_line_2" VARCHAR(255),
    "city" VARCHAR(120),
    "division_id" UUID,
    "district_id" UUID,
    "upazila_id" UUID,
    "union_id" UUID,
    "postal_code" VARCHAR(16),
    "location" geometry(Point, 4326),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "farmer_code" VARCHAR(64) NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "farm_size_hectares" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "experience_years" INTEGER,
    "primary_crop_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "farmer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "owner_user_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "farm_type" "FarmType" NOT NULL DEFAULT 'OTHER',
    "status" "FarmStatus" NOT NULL DEFAULT 'ACTIVE',
    "total_area_hectares" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "farmer_profile_id" UUID,

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_locations" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "address_line" VARCHAR(255) NOT NULL,
    "division_id" UUID,
    "district_id" UUID,
    "upazila_id" UUID,
    "union_id" UUID,
    "location" geometry(Point, 4326),
    "boundary" geometry(Polygon, 4326),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "farm_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "land_parcels" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "farm_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180),
    "area_hectares" DECIMAL(12,3) NOT NULL,
    "ownership_type" "LandOwnership" NOT NULL DEFAULT 'OWNED',
    "status" "LandParcelStatus" NOT NULL DEFAULT 'AVAILABLE',
    "boundary" geometry(Polygon, 4326),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "land_parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crops" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "name_bn" VARCHAR(180),
    "category" "CropCategory" NOT NULL DEFAULT 'OTHER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "crops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crop_varieties" (
    "id" UUID NOT NULL,
    "crop_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "name_bn" VARCHAR(180),
    "maturity_days" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "crop_varieties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crop_seasons" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "name_bn" VARCHAR(180),
    "start_month" INTEGER NOT NULL,
    "end_month" INTEGER NOT NULL,
    "year" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "crop_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cultivations" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "farm_id" UUID NOT NULL,
    "land_parcel_id" UUID,
    "crop_variety_id" UUID NOT NULL,
    "crop_season_id" UUID,
    "status" "CultivationStatus" NOT NULL DEFAULT 'PLANNED',
    "planted_at" TIMESTAMP(6),
    "expected_harvest_at" TIMESTAMP(6),
    "harvested_at" TIMESTAMP(6),
    "area_hectares" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "crop_id" UUID,

    CONSTRAINT "cultivations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_activities" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "farm_id" UUID NOT NULL,
    "cultivation_id" UUID,
    "land_parcel_id" UUID,
    "input_id" UUID,
    "performed_by_user_id" UUID,
    "activity_type" "FarmActivityType" NOT NULL,
    "activity_date" TIMESTAMP(6) NOT NULL,
    "quantity" DECIMAL(14,3),
    "unit_code" VARCHAR(16),
    "cost_amount" DECIMAL(14,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "farm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvests" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "cultivation_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "harvested_at" TIMESTAMP(6) NOT NULL,
    "quantity_kg" DECIMAL(14,3) NOT NULL,
    "quality_grade" VARCHAR(32),
    "status" "HarvestStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "harvests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agricultural_inputs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "name_bn" VARCHAR(180),
    "category" "AgriculturalInputCategory" NOT NULL DEFAULT 'OTHER',
    "unit_code" VARCHAR(16) NOT NULL,
    "manufacturer" VARCHAR(180),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "agricultural_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "parent_id" UUID,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "name_bn" VARCHAR(180),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "category_id" UUID NOT NULL,
    "farmer_profile_id" UUID,
    "sku" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "name_bn" VARCHAR(180),
    "unit_code" VARCHAR(16) NOT NULL,
    "description" TEXT,
    "deleted_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "alt_text" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_inventories" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID,
    "scope_key" VARCHAR(64) NOT NULL DEFAULT 'UNALLOCATED',
    "quantity_on_hand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "quantity_reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "available_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "product_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_listings" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "product_id" UUID NOT NULL,
    "seller_user_id" UUID NOT NULL,
    "inventory_id" UUID,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "quantity_available" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "min_order_quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "starts_at" TIMESTAMP(6),
    "ends_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "product_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_locations" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "division_id" UUID,
    "district_id" UUID,
    "upazila_id" UUID,
    "union_id" UUID,
    "location" geometry(Point, 4326),
    "radius_meters" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "listing_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "product_id" UUID NOT NULL,
    "listing_id" UUID,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "source" "PriceSource" NOT NULL DEFAULT 'PLATFORM',
    "observed_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "user_id" UUID NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price_snapshot" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "cart_id" UUID,
    "buyer_user_id" UUID NOT NULL,
    "seller_user_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "subtotal_amount" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "delivery_fee_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "placed_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(6),
    "completed_at" TIMESTAMP(6),
    "cancelled_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "listing_id" UUID,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider_code" VARCHAR(80),
    "provider_reference" VARCHAR(255),
    "idempotency_key" VARCHAR(255) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'OTHER',
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "amount" DECIMAL(14,2) NOT NULL,
    "captured_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refunded_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "initiated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captured_at" TIMESTAMP(6),
    "failed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "payment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "reason" "RefundReason" NOT NULL DEFAULT 'OTHER',
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "provider_reference" VARCHAR(255),
    "processed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "payment_id" UUID,
    "refund_id" UUID,
    "order_id" UUID,
    "transaction_type" "TransactionType" NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "provider_reference" VARCHAR(255),
    "posted_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "account_type" "LedgerAccountType" NOT NULL,
    "normal_balance" "NormalBalance" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "transaction_id" UUID,
    "account_id" UUID NOT NULL,
    "order_id" UUID,
    "settlement_id" UUID,
    "reversal_of_id" UUID,
    "direction" "TransactionDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "entry_date" DATE NOT NULL,
    "description" TEXT,
    "posted_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "order_id" UUID,
    "seller_user_id" UUID NOT NULL,
    "settlement_id" UUID,
    "rule_key" VARCHAR(120),
    "basis" "CommissionBasis" NOT NULL DEFAULT 'EXTERNAL_RULE',
    "rate" DECIMAL(12,4),
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "status" "CommissionStatus" NOT NULL DEFAULT 'CALCULATED',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "seller_user_id" UUID NOT NULL,
    "rule_key" VARCHAR(120),
    "period_start" TIMESTAMP(6) NOT NULL,
    "period_end" TIMESTAMP(6) NOT NULL,
    "gross_amount" DECIMAL(14,2) NOT NULL,
    "deductions_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "paid_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "order_id" UUID NOT NULL,
    "provider_id" UUID,
    "pickup_address_id" UUID,
    "destination_address_id" UUID,
    "tracking_number" VARCHAR(120),
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "shipped_at" TIMESTAMP(6),
    "delivered_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_at" TIMESTAMP(6),
    "attempted_at" TIMESTAMP(6),
    "delivered_at" TIMESTAMP(6),
    "recipient_name" VARCHAR(180),
    "recipient_phone" VARCHAR(32),
    "proof_url" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_providers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "contact_email" VARCHAR(255),
    "phone" VARCHAR(32),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "logistics_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "manager_user_id" UUID,
    "address_id" UUID,
    "division_id" UUID,
    "district_id" UUID,
    "upazila_id" UUID,
    "union_id" UUID,
    "location" geometry(Point, 4326),
    "capacity_cubic_meters" DECIMAL(14,3),
    "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_inventories" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_code" VARCHAR(80) NOT NULL DEFAULT 'NO_BATCH',
    "quantity_on_hand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "quantity_reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "available_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unit_code" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "warehouse_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_inspections" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "shipment_id" UUID,
    "warehouse_inventory_id" UUID,
    "product_id" UUID,
    "inspector_user_id" UUID NOT NULL,
    "inspected_at" TIMESTAMP(6) NOT NULL,
    "result" "InspectionResult" NOT NULL DEFAULT 'PENDING',
    "grade" VARCHAR(32),
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "quality_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "product_id" UUID,
    "harvest_id" UUID,
    "cultivation_id" UUID,
    "shipment_id" UUID,
    "batch_code" VARCHAR(120) NOT NULL,
    "event_type" "TraceabilityEventType" NOT NULL,
    "occurred_at" TIMESTAMP(6) NOT NULL,
    "location" geometry(Point, 4326),
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "traceability_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_sources" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "source_type" "KnowledgeSourceType" NOT NULL DEFAULT 'DOCUMENT',
    "uri" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "source_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "language" "LanguageCode" NOT NULL DEFAULT 'EN',
    "content_hash" VARCHAR(255),
    "status" "DocumentStatus" NOT NULL DEFAULT 'INGESTED',
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER,
    "embedding_model" VARCHAR(120),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embedding_references" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "chunk_id" UUID,
    "vector_collection" VARCHAR(120) NOT NULL,
    "vector_id" VARCHAR(255) NOT NULL,
    "embedding_model" VARCHAR(120) NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "embedding_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255),
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recommendations" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "user_id" UUID,
    "conversation_id" UUID,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(255),
    "recommendation_type" "RecommendationType" NOT NULL,
    "summary" TEXT,
    "payload" JSONB NOT NULL,
    "confidence_score" DECIMAL(5,4),
    "model_version" VARCHAR(120),
    "status" "RecommendationStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ai_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_executions" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "initiated_by_user_id" UUID,
    "conversation_id" UUID,
    "agent_name" VARCHAR(120) NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(6),
    "finished_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "agent_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_feedback" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "user_id" UUID NOT NULL,
    "recommendation_id" UUID,
    "agent_execution_id" UUID,
    "rating" INTEGER,
    "comment" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "billing_interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "price_amount" DECIMAL(14,2) NOT NULL,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "starts_at" TIMESTAMP(6) NOT NULL,
    "ends_at" TIMESTAMP(6),
    "cancelled_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "subscription_id" UUID NOT NULL,
    "invoice_number" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(6),
    "paid_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "subscription_id" UUID,
    "metric_code" VARCHAR(80) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "period_start" TIMESTAMP(6) NOT NULL,
    "period_end" TIMESTAMP(6) NOT NULL,
    "recorded_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "user_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "type" VARCHAR(80) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "read_at" TIMESTAMP(6),
    "sent_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "actor_user_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(120) NOT NULL,
    "entity_id" VARCHAR(255),
    "before" JSONB,
    "after" JSONB,
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "aggregate_type" VARCHAR(120) NOT NULL,
    "aggregate_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(120) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "key" VARCHAR(120) NOT NULL,
    "scope_key" VARCHAR(64) NOT NULL DEFAULT 'GLOBAL',
    "description" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "conditions" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "key" VARCHAR(120) NOT NULL,
    "scope_key" VARCHAR(64) NOT NULL DEFAULT 'GLOBAL',
    "value" JSONB NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "divisions_code_key" ON "divisions"("code");

-- CreateIndex
CREATE INDEX "divisions_country_id_idx" ON "divisions"("country_id");

-- CreateIndex
CREATE UNIQUE INDEX "districts_code_key" ON "districts"("code");

-- CreateIndex
CREATE INDEX "districts_division_id_idx" ON "districts"("division_id");

-- CreateIndex
CREATE UNIQUE INDEX "upazilas_code_key" ON "upazilas"("code");

-- CreateIndex
CREATE INDEX "upazilas_district_id_idx" ON "upazilas"("district_id");

-- CreateIndex
CREATE UNIQUE INDEX "unions_code_key" ON "unions"("code");

-- CreateIndex
CREATE INDEX "unions_upazila_id_idx" ON "unions"("upazila_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_account_status_idx" ON "users"("account_status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_national_id_hash_key" ON "user_profiles"("national_id_hash");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "roles_scope_idx" ON "roles"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_resource_action_idx" ON "permissions"("resource", "action");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "user_roles_organization_id_idx" ON "user_roles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_scope_key_key" ON "user_roles"("user_id", "role_id", "scope_key");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_hash_key" ON "sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE INDEX "otp_verifications_email_purpose_idx" ON "otp_verifications"("email", "purpose");

-- CreateIndex
CREATE INDEX "otp_verifications_phone_purpose_idx" ON "otp_verifications"("phone", "purpose");

-- CreateIndex
CREATE INDEX "otp_verifications_expires_at_idx" ON "otp_verifications"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_owner_user_id_idx" ON "organizations"("owner_user_id");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE INDEX "organizations_deleted_at_idx" ON "organizations"("deleted_at");

-- CreateIndex
CREATE INDEX "organization_members_user_id_status_idx" ON "organization_members"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitations_token_hash_key" ON "organization_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "organization_invitations_organization_id_email_status_idx" ON "organization_invitations"("organization_id", "email", "status");

-- CreateIndex
CREATE INDEX "organization_invitations_expires_at_idx" ON "organization_invitations"("expires_at");

-- CreateIndex
CREATE INDEX "organization_addresses_division_id_district_id_upazila_id_idx" ON "organization_addresses"("division_id", "district_id", "upazila_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_addresses_organization_id_label_key" ON "organization_addresses"("organization_id", "label");

-- CreateIndex
CREATE INDEX "user_addresses_division_id_district_id_idx" ON "user_addresses"("division_id", "district_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_addresses_user_id_label_key" ON "user_addresses"("user_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_profiles_user_id_key" ON "farmer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_profiles_farmer_code_key" ON "farmer_profiles"("farmer_code");

-- CreateIndex
CREATE INDEX "farmer_profiles_organization_id_verification_status_idx" ON "farmer_profiles"("organization_id", "verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "farms_code_key" ON "farms"("code");

-- CreateIndex
CREATE INDEX "farms_organization_id_status_idx" ON "farms"("organization_id", "status");

-- CreateIndex
CREATE INDEX "farms_owner_user_id_idx" ON "farms"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "farm_locations_farm_id_key" ON "farm_locations"("farm_id");

-- CreateIndex
CREATE INDEX "farm_locations_division_id_district_id_upazila_id_idx" ON "farm_locations"("division_id", "district_id", "upazila_id");

-- CreateIndex
CREATE INDEX "land_parcels_organization_id_status_idx" ON "land_parcels"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "land_parcels_farm_id_code_key" ON "land_parcels"("farm_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "crops_code_key" ON "crops"("code");

-- CreateIndex
CREATE INDEX "crops_category_is_active_idx" ON "crops"("category", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "crop_varieties_crop_id_code_key" ON "crop_varieties"("crop_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "crop_seasons_code_key" ON "crop_seasons"("code");

-- CreateIndex
CREATE INDEX "crop_seasons_organization_id_is_active_idx" ON "crop_seasons"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "cultivations_organization_id_status_idx" ON "cultivations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "cultivations_farm_id_crop_variety_id_idx" ON "cultivations"("farm_id", "crop_variety_id");

-- CreateIndex
CREATE INDEX "farm_activities_organization_id_activity_date_idx" ON "farm_activities"("organization_id", "activity_date");

-- CreateIndex
CREATE INDEX "farm_activities_farm_id_activity_type_idx" ON "farm_activities"("farm_id", "activity_type");

-- CreateIndex
CREATE INDEX "harvests_organization_id_status_idx" ON "harvests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "harvests_cultivation_id_harvested_at_idx" ON "harvests"("cultivation_id", "harvested_at");

-- CreateIndex
CREATE UNIQUE INDEX "agricultural_inputs_code_key" ON "agricultural_inputs"("code");

-- CreateIndex
CREATE INDEX "agricultural_inputs_organization_id_category_is_active_idx" ON "agricultural_inputs"("organization_id", "category", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_code_key" ON "product_categories"("code");

-- CreateIndex
CREATE INDEX "product_categories_organization_id_is_active_idx" ON "product_categories"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "product_categories_parent_id_idx" ON "product_categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_organization_id_category_id_idx" ON "products"("organization_id", "category_id");

-- CreateIndex
CREATE INDEX "products_deleted_at_idx" ON "products"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_product_id_sort_order_key" ON "product_images"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "product_inventories_organization_id_idx" ON "product_inventories"("organization_id");

-- CreateIndex
CREATE INDEX "product_inventories_warehouse_id_idx" ON "product_inventories"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_inventories_product_id_scope_key_key" ON "product_inventories"("product_id", "scope_key");

-- CreateIndex
CREATE INDEX "product_listings_organization_id_status_idx" ON "product_listings"("organization_id", "status");

-- CreateIndex
CREATE INDEX "product_listings_product_id_status_idx" ON "product_listings"("product_id", "status");

-- CreateIndex
CREATE INDEX "product_listings_seller_user_id_idx" ON "product_listings"("seller_user_id");

-- CreateIndex
CREATE INDEX "product_listings_ends_at_idx" ON "product_listings"("ends_at");

-- CreateIndex
CREATE INDEX "listing_locations_division_id_district_id_upazila_id_idx" ON "listing_locations"("division_id", "district_id", "upazila_id");

-- CreateIndex
CREATE INDEX "price_history_organization_id_observed_at_idx" ON "price_history"("organization_id", "observed_at");

-- CreateIndex
CREATE INDEX "price_history_product_id_observed_at_idx" ON "price_history"("product_id", "observed_at");

-- CreateIndex
CREATE INDEX "price_history_listing_id_observed_at_idx" ON "price_history"("listing_id", "observed_at");

-- CreateIndex
CREATE INDEX "carts_organization_id_status_idx" ON "carts"("organization_id", "status");

-- CreateIndex
CREATE INDEX "carts_user_id_status_idx" ON "carts"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_listing_id_key" ON "cart_items"("cart_id", "listing_id");

-- CreateIndex
CREATE INDEX "orders_organization_id_status_idx" ON "orders"("organization_id", "status");

-- CreateIndex
CREATE INDEX "orders_buyer_user_id_placed_at_idx" ON "orders"("buyer_user_id", "placed_at");

-- CreateIndex
CREATE INDEX "orders_seller_user_id_placed_at_idx" ON "orders"("seller_user_id", "placed_at");

-- CreateIndex
CREATE INDEX "orders_cart_id_idx" ON "orders"("cart_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_organization_id_status_idx" ON "payments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_code_provider_reference_key" ON "payments"("provider_code", "provider_reference");

-- CreateIndex
CREATE INDEX "refunds_organization_id_status_idx" ON "refunds"("organization_id", "status");

-- CreateIndex
CREATE INDEX "refunds_payment_id_status_idx" ON "refunds"("payment_id", "status");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE INDEX "transactions_organization_id_status_idx" ON "transactions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "transactions_payment_id_idx" ON "transactions"("payment_id");

-- CreateIndex
CREATE INDEX "transactions_refund_id_idx" ON "transactions"("refund_id");

-- CreateIndex
CREATE INDEX "transactions_order_id_idx" ON "transactions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");

-- CreateIndex
CREATE INDEX "ledger_accounts_organization_id_account_type_idx" ON "ledger_accounts"("organization_id", "account_type");

-- CreateIndex
CREATE INDEX "ledger_entries_organization_id_entry_date_idx" ON "ledger_entries"("organization_id", "entry_date");

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_entry_date_idx" ON "ledger_entries"("account_id", "entry_date");

-- CreateIndex
CREATE INDEX "ledger_entries_order_id_idx" ON "ledger_entries"("order_id");

-- CreateIndex
CREATE INDEX "ledger_entries_settlement_id_idx" ON "ledger_entries"("settlement_id");

-- CreateIndex
CREATE INDEX "commissions_organization_id_status_idx" ON "commissions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "commissions_order_id_idx" ON "commissions"("order_id");

-- CreateIndex
CREATE INDEX "commissions_seller_user_id_status_idx" ON "commissions"("seller_user_id", "status");

-- CreateIndex
CREATE INDEX "commissions_settlement_id_idx" ON "commissions"("settlement_id");

-- CreateIndex
CREATE INDEX "settlements_organization_id_status_idx" ON "settlements"("organization_id", "status");

-- CreateIndex
CREATE INDEX "settlements_seller_user_id_period_start_idx" ON "settlements"("seller_user_id", "period_start");

-- CreateIndex
CREATE INDEX "shipments_organization_id_status_idx" ON "shipments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "shipments_order_id_idx" ON "shipments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_provider_id_tracking_number_key" ON "shipments"("provider_id", "tracking_number");

-- CreateIndex
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_shipment_id_attempt_number_key" ON "deliveries"("shipment_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_providers_code_key" ON "logistics_providers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "warehouses_organization_id_status_idx" ON "warehouses"("organization_id", "status");

-- CreateIndex
CREATE INDEX "warehouses_division_id_district_id_upazila_id_idx" ON "warehouses"("division_id", "district_id", "upazila_id");

-- CreateIndex
CREATE INDEX "warehouse_inventories_product_id_idx" ON "warehouse_inventories"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_inventories_warehouse_id_product_id_batch_code_key" ON "warehouse_inventories"("warehouse_id", "product_id", "batch_code");

-- CreateIndex
CREATE INDEX "quality_inspections_organization_id_result_idx" ON "quality_inspections"("organization_id", "result");

-- CreateIndex
CREATE INDEX "quality_inspections_shipment_id_idx" ON "quality_inspections"("shipment_id");

-- CreateIndex
CREATE INDEX "quality_inspections_product_id_idx" ON "quality_inspections"("product_id");

-- CreateIndex
CREATE INDEX "traceability_records_organization_id_batch_code_occurred_at_idx" ON "traceability_records"("organization_id", "batch_code", "occurred_at");

-- CreateIndex
CREATE INDEX "traceability_records_product_id_event_type_idx" ON "traceability_records"("product_id", "event_type");

-- CreateIndex
CREATE INDEX "traceability_records_harvest_id_idx" ON "traceability_records"("harvest_id");

-- CreateIndex
CREATE INDEX "traceability_records_shipment_id_idx" ON "traceability_records"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_sources_code_key" ON "knowledge_sources"("code");

-- CreateIndex
CREATE INDEX "knowledge_sources_organization_id_is_active_idx" ON "knowledge_sources"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "knowledge_documents_organization_id_status_idx" ON "knowledge_documents"("organization_id", "status");

-- CreateIndex
CREATE INDEX "knowledge_documents_source_id_idx" ON "knowledge_documents"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_document_id_chunk_index_key" ON "knowledge_chunks"("document_id", "chunk_index");

-- CreateIndex
CREATE INDEX "embedding_references_organization_id_idx" ON "embedding_references"("organization_id");

-- CreateIndex
CREATE INDEX "embedding_references_chunk_id_idx" ON "embedding_references"("chunk_id");

-- CreateIndex
CREATE UNIQUE INDEX "embedding_references_vector_collection_vector_id_key" ON "embedding_references"("vector_collection", "vector_id");

-- CreateIndex
CREATE INDEX "conversations_organization_id_user_id_idx" ON "conversations"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversations"("status");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_recommendations_organization_id_status_idx" ON "ai_recommendations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "ai_recommendations_entity_type_entity_id_idx" ON "ai_recommendations"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ai_recommendations_conversation_id_idx" ON "ai_recommendations"("conversation_id");

-- CreateIndex
CREATE INDEX "agent_executions_organization_id_status_idx" ON "agent_executions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "agent_executions_conversation_id_idx" ON "agent_executions"("conversation_id");

-- CreateIndex
CREATE INDEX "ai_feedback_organization_id_user_id_idx" ON "ai_feedback"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "ai_feedback_recommendation_id_idx" ON "ai_feedback"("recommendation_id");

-- CreateIndex
CREATE INDEX "ai_feedback_agent_execution_id_idx" ON "ai_feedback"("agent_execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE INDEX "subscription_plans_is_active_idx" ON "subscription_plans"("is_active");

-- CreateIndex
CREATE INDEX "subscriptions_organization_id_status_idx" ON "subscriptions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_invoice_number_key" ON "subscription_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "subscription_invoices_organization_id_status_idx" ON "subscription_invoices"("organization_id", "status");

-- CreateIndex
CREATE INDEX "subscription_invoices_subscription_id_idx" ON "subscription_invoices"("subscription_id");

-- CreateIndex
CREATE INDEX "usage_records_organization_id_metric_code_idx" ON "usage_records"("organization_id", "metric_code");

-- CreateIndex
CREATE INDEX "usage_records_period_start_period_end_idx" ON "usage_records"("period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_subscription_id_metric_code_recorded_at_key" ON "usage_records"("subscription_id", "metric_code", "recorded_at");

-- CreateIndex
CREATE INDEX "notifications_organization_id_user_id_status_idx" ON "notifications"("organization_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_severity_idx" ON "audit_logs"("severity");

-- CreateIndex
CREATE INDEX "outbox_events_organization_id_status_available_at_idx" ON "outbox_events"("organization_id", "status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "feature_flags_organization_id_idx" ON "feature_flags"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_scope_key_key" ON "feature_flags"("key", "scope_key");

-- CreateIndex
CREATE INDEX "platform_settings_organization_id_is_active_idx" ON "platform_settings"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_key_scope_key_key" ON "platform_settings"("key", "scope_key");

-- AddForeignKey
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upazilas" ADD CONSTRAINT "upazilas_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unions" ADD CONSTRAINT "unions_upazila_id_fkey" FOREIGN KEY ("upazila_id") REFERENCES "upazilas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_rotated_to_id_fkey" FOREIGN KEY ("rotated_to_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_addresses" ADD CONSTRAINT "organization_addresses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_addresses" ADD CONSTRAINT "organization_addresses_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_addresses" ADD CONSTRAINT "organization_addresses_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_addresses" ADD CONSTRAINT "organization_addresses_upazila_id_fkey" FOREIGN KEY ("upazila_id") REFERENCES "upazilas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_addresses" ADD CONSTRAINT "organization_addresses_union_id_fkey" FOREIGN KEY ("union_id") REFERENCES "unions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_upazila_id_fkey" FOREIGN KEY ("upazila_id") REFERENCES "upazilas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_union_id_fkey" FOREIGN KEY ("union_id") REFERENCES "unions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_profiles" ADD CONSTRAINT "farmer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_profiles" ADD CONSTRAINT "farmer_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_profiles" ADD CONSTRAINT "farmer_profiles_primary_crop_id_fkey" FOREIGN KEY ("primary_crop_id") REFERENCES "crops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_farmer_profile_id_fkey" FOREIGN KEY ("farmer_profile_id") REFERENCES "farmer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_locations" ADD CONSTRAINT "farm_locations_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_locations" ADD CONSTRAINT "farm_locations_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_locations" ADD CONSTRAINT "farm_locations_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_locations" ADD CONSTRAINT "farm_locations_upazila_id_fkey" FOREIGN KEY ("upazila_id") REFERENCES "upazilas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_locations" ADD CONSTRAINT "farm_locations_union_id_fkey" FOREIGN KEY ("union_id") REFERENCES "unions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_parcels" ADD CONSTRAINT "land_parcels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_parcels" ADD CONSTRAINT "land_parcels_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_varieties" ADD CONSTRAINT "crop_varieties_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_seasons" ADD CONSTRAINT "crop_seasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cultivations" ADD CONSTRAINT "cultivations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cultivations" ADD CONSTRAINT "cultivations_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cultivations" ADD CONSTRAINT "cultivations_land_parcel_id_fkey" FOREIGN KEY ("land_parcel_id") REFERENCES "land_parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cultivations" ADD CONSTRAINT "cultivations_crop_variety_id_fkey" FOREIGN KEY ("crop_variety_id") REFERENCES "crop_varieties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cultivations" ADD CONSTRAINT "cultivations_crop_season_id_fkey" FOREIGN KEY ("crop_season_id") REFERENCES "crop_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cultivations" ADD CONSTRAINT "cultivations_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_activities" ADD CONSTRAINT "farm_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_activities" ADD CONSTRAINT "farm_activities_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_activities" ADD CONSTRAINT "farm_activities_cultivation_id_fkey" FOREIGN KEY ("cultivation_id") REFERENCES "cultivations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_activities" ADD CONSTRAINT "farm_activities_land_parcel_id_fkey" FOREIGN KEY ("land_parcel_id") REFERENCES "land_parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_activities" ADD CONSTRAINT "farm_activities_input_id_fkey" FOREIGN KEY ("input_id") REFERENCES "agricultural_inputs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_activities" ADD CONSTRAINT "farm_activities_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_cultivation_id_fkey" FOREIGN KEY ("cultivation_id") REFERENCES "cultivations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agricultural_inputs" ADD CONSTRAINT "agricultural_inputs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_farmer_profile_id_fkey" FOREIGN KEY ("farmer_profile_id") REFERENCES "farmer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_inventories" ADD CONSTRAINT "product_inventories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_inventories" ADD CONSTRAINT "product_inventories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_inventories" ADD CONSTRAINT "product_inventories_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "product_inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_locations" ADD CONSTRAINT "listing_locations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "product_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_locations" ADD CONSTRAINT "listing_locations_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_locations" ADD CONSTRAINT "listing_locations_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_locations" ADD CONSTRAINT "listing_locations_upazila_id_fkey" FOREIGN KEY ("upazila_id") REFERENCES "upazilas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_locations" ADD CONSTRAINT "listing_locations_union_id_fkey" FOREIGN KEY ("union_id") REFERENCES "unions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "product_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "product_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "product_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "logistics_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_pickup_address_id_fkey" FOREIGN KEY ("pickup_address_id") REFERENCES "organization_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_destination_address_id_fkey" FOREIGN KEY ("destination_address_id") REFERENCES "organization_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "organization_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_upazila_id_fkey" FOREIGN KEY ("upazila_id") REFERENCES "upazilas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_union_id_fkey" FOREIGN KEY ("union_id") REFERENCES "unions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_inventories" ADD CONSTRAINT "warehouse_inventories_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_inventories" ADD CONSTRAINT "warehouse_inventories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_warehouse_inventory_id_fkey" FOREIGN KEY ("warehouse_inventory_id") REFERENCES "warehouse_inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_inspector_user_id_fkey" FOREIGN KEY ("inspector_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_records" ADD CONSTRAINT "traceability_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_records" ADD CONSTRAINT "traceability_records_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_records" ADD CONSTRAINT "traceability_records_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_records" ADD CONSTRAINT "traceability_records_cultivation_id_fkey" FOREIGN KEY ("cultivation_id") REFERENCES "cultivations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_records" ADD CONSTRAINT "traceability_records_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embedding_references" ADD CONSTRAINT "embedding_references_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embedding_references" ADD CONSTRAINT "embedding_references_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "knowledge_chunks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "ai_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_agent_execution_id_fkey" FOREIGN KEY ("agent_execution_id") REFERENCES "agent_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Raw SQL invariants that Prisma schema syntax cannot express.
-- These constraints protect financial, inventory, and identity invariants even
-- if application code is bypassed.
-- ---------------------------------------------------------------------------

-- Identity / access invariants.
ALTER TABLE "users" ADD CONSTRAINT "users_failed_login_attempts_nonnegative_check" CHECK ("failed_login_attempts" >= 0);
ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_attempts_check" CHECK ("attempts" >= 0 AND "max_attempts" > 0);
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_scope_key_check" CHECK (
  ("organization_id" IS NULL AND "scope_key" = 'PLATFORM')
  OR ("organization_id" IS NOT NULL AND "scope_key" = "organization_id"::text)
);

-- Geography / agriculture invariants.
ALTER TABLE "farmer_profiles" ADD CONSTRAINT "farmer_profiles_farm_size_check" CHECK ("farm_size_hectares" >= 0);
ALTER TABLE "farms" ADD CONSTRAINT "farms_total_area_check" CHECK ("total_area_hectares" >= 0);
ALTER TABLE "land_parcels" ADD CONSTRAINT "land_parcels_area_positive_check" CHECK ("area_hectares" > 0);
ALTER TABLE "crop_seasons" ADD CONSTRAINT "crop_seasons_month_check" CHECK (
  "start_month" BETWEEN 1 AND 12 AND "end_month" BETWEEN 1 AND 12
);
ALTER TABLE "cultivations" ADD CONSTRAINT "cultivations_area_positive_check" CHECK ("area_hectares" > 0);
ALTER TABLE "cultivations" ADD CONSTRAINT "cultivations_dates_check" CHECK (
  "planted_at" IS NULL OR "expected_harvest_at" IS NULL OR "expected_harvest_at" >= "planted_at"
);
ALTER TABLE "farm_activities" ADD CONSTRAINT "farm_activities_cost_check" CHECK ("cost_amount" IS NULL OR "cost_amount" >= 0);
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_quantity_check" CHECK ("quantity_kg" >= 0);

-- Marketplace / inventory invariants.
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_sort_order_check" CHECK ("sort_order" >= 0);
ALTER TABLE "product_inventories" ADD CONSTRAINT "product_inventories_scope_key_check" CHECK (
  ("warehouse_id" IS NULL AND "scope_key" = 'UNALLOCATED')
  OR ("warehouse_id" IS NOT NULL AND "scope_key" = "warehouse_id"::text)
);
ALTER TABLE "product_inventories" ADD CONSTRAINT "product_inventories_quantity_check" CHECK (
  "quantity_on_hand" >= 0
  AND "quantity_reserved" >= 0
  AND "quantity_reserved" <= "quantity_on_hand"
  AND "available_quantity" = "quantity_on_hand" - "quantity_reserved"
);
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_price_check" CHECK ("unit_price" > 0);
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_quantity_check" CHECK (
  "quantity_available" >= 0 AND "min_order_quantity" > 0
);
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_window_check" CHECK (
  "starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at"
);
ALTER TABLE "listing_locations" ADD CONSTRAINT "listing_locations_radius_check" CHECK ("radius_meters" IS NULL OR "radius_meters" > 0);
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_price_check" CHECK ("price" > 0);

-- Commerce / financial invariants.
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_price_check" CHECK (
  "quantity" > 0 AND "unit_price_snapshot" > 0
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_nonnegative_check" CHECK (
  "subtotal_amount" >= 0
  AND "discount_amount" >= 0
  AND "delivery_fee_amount" >= 0
  AND "tax_amount" >= 0
  AND "total_amount" >= 0
  AND "discount_amount" <= "subtotal_amount"
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_check" CHECK (
  "total_amount" = "subtotal_amount" - "discount_amount" + "delivery_fee_amount" + "tax_amount"
);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_price_check" CHECK (
  "quantity" > 0 AND "unit_price" > 0 AND "line_total" > 0
);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_total_check" CHECK (
  "line_total" = ROUND("quantity" * "unit_price", 2)
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK (
  "amount" > 0
  AND "captured_amount" >= 0
  AND "captured_amount" <= "amount"
  AND "refunded_amount" >= 0
  AND "refunded_amount" <= "captured_amount"
);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_check" CHECK ("amount" > 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_check" CHECK ("amount" > 0);
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_check" CHECK ("amount" > 0);
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_amount_check" CHECK (
  "amount" >= 0 AND ("rate" IS NULL OR "rate" >= 0)
);
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_amount_check" CHECK (
  "gross_amount" >= 0
  AND "deductions_amount" >= 0
  AND "net_amount" >= 0
  AND "net_amount" = "gross_amount" - "deductions_amount"
  AND ("period_end" IS NULL OR "period_end" >= "period_start")
);

-- Logistics invariants.
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_capacity_check" CHECK (
  "capacity_cubic_meters" IS NULL OR "capacity_cubic_meters" > 0
);
ALTER TABLE "warehouse_inventories" ADD CONSTRAINT "warehouse_inventories_quantity_check" CHECK (
  "quantity_on_hand" >= 0
  AND "quantity_reserved" >= 0
  AND "quantity_reserved" <= "quantity_on_hand"
  AND "available_quantity" = "quantity_on_hand" - "quantity_reserved"
);

-- AI / SaaS / system invariants.
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_price_check" CHECK ("price_amount" >= 0 AND "trial_days" >= 0);
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_period_check" CHECK (
  "ends_at" IS NULL OR "ends_at" >= "starts_at"
);
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_due_date_check" CHECK (
  "due_at" IS NULL OR "due_at" >= "issued_at"
);
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_quantity_check" CHECK ("quantity" >= 0);
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_period_check" CHECK ("period_end" >= "period_start");
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_scope_key_check" CHECK (
  ("organization_id" IS NULL AND "scope_key" = 'GLOBAL')
  OR ("organization_id" IS NOT NULL AND "scope_key" = "organization_id"::text)
);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_scope_key_check" CHECK (
  ("organization_id" IS NULL AND "scope_key" = 'GLOBAL')
  OR ("organization_id" IS NOT NULL AND "scope_key" = "organization_id"::text)
);

-- Partial uniqueness that Prisma cannot model directly.
CREATE UNIQUE INDEX "carts_one_active_per_user" ON "carts" ("user_id")
  WHERE "status" = 'ACTIVE'::"CartStatus";
CREATE UNIQUE INDEX "organization_addresses_one_primary_per_org" ON "organization_addresses" ("organization_id")
  WHERE "is_primary" = true;
CREATE UNIQUE INDEX "user_addresses_one_primary_per_user" ON "user_addresses" ("user_id")
  WHERE "is_primary" = true;
CREATE UNIQUE INDEX "subscriptions_one_active_per_org" ON "subscriptions" ("organization_id")
  WHERE "status" IN ('TRIALING'::"SubscriptionStatus", 'ACTIVE'::"SubscriptionStatus", 'PAST_DUE'::"SubscriptionStatus");

-- PostGIS GiST indexes for spatial queries. Prisma maps geometry columns as
-- Unsupported, so these indexes must be managed in raw SQL migrations.
CREATE INDEX "organization_addresses_location_gix" ON "organization_addresses" USING GIST ("location") WHERE "location" IS NOT NULL;
CREATE INDEX "user_addresses_location_gix" ON "user_addresses" USING GIST ("location") WHERE "location" IS NOT NULL;
CREATE INDEX "farm_locations_location_gix" ON "farm_locations" USING GIST ("location") WHERE "location" IS NOT NULL;
CREATE INDEX "farm_locations_boundary_gix" ON "farm_locations" USING GIST ("boundary") WHERE "boundary" IS NOT NULL;
CREATE INDEX "land_parcels_boundary_gix" ON "land_parcels" USING GIST ("boundary") WHERE "boundary" IS NOT NULL;
CREATE INDEX "listing_locations_location_gix" ON "listing_locations" USING GIST ("location") WHERE "location" IS NOT NULL;
CREATE INDEX "warehouses_location_gix" ON "warehouses" USING GIST ("location") WHERE "location" IS NOT NULL;
CREATE INDEX "traceability_records_location_gix" ON "traceability_records" USING GIST ("location") WHERE "location" IS NOT NULL;

-- A processed refund must never exceed the captured amount of its payment.
CREATE FUNCTION "enforce_refund_cap"() RETURNS trigger AS $$
DECLARE
  v_captured numeric(14,2);
  v_other_refunded numeric(14,2);
BEGIN
  IF NEW."status"::text <> 'PROCESSED' THEN
    RETURN NEW;
  END IF;

  SELECT "captured_amount" INTO v_captured
  FROM "payments"
  WHERE "id" = NEW."payment_id";

  SELECT COALESCE(SUM("amount"), 0) INTO v_other_refunded
  FROM "refunds"
  WHERE "payment_id" = NEW."payment_id"
    AND "status"::text = 'PROCESSED'
    AND "id" <> NEW."id";

  IF v_other_refunded + NEW."amount" > v_captured THEN
    RAISE EXCEPTION 'Processed refunds exceed captured payment amount';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "refunds_within_captured_amount"
BEFORE INSERT OR UPDATE OF "amount", "status", "payment_id" ON "refunds"
FOR EACH ROW EXECUTE FUNCTION "enforce_refund_cap"();

-- Posted ledger entries are immutable; corrections require reversal entries.
CREATE FUNCTION "prevent_posted_ledger_mutation"() RETURNS trigger AS $$
BEGIN
  IF OLD."posted_at" IS NOT NULL THEN
    RAISE EXCEPTION 'Posted ledger entries are immutable; use a reversal entry';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_immutable"
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "prevent_posted_ledger_mutation"();

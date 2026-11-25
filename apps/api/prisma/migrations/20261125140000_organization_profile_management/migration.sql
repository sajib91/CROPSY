-- Organization management and profile follow-up. Earlier migrations remain
-- immutable. Prisma generates the DDL below; the final CHECK is deliberately
-- raw SQL because scope_key consistency cannot be expressed in the schema.

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('AGRICULTURAL_COMPANY', 'FARMER_COOPERATIVE', 'WHOLESALE_BUSINESS', 'RETAIL_BUSINESS', 'AGRICULTURAL_SUPPLIER', 'LOGISTICS_COMPANY', 'WAREHOUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "OrganizationDocumentType" AS ENUM ('REGISTRATION_CERTIFICATE', 'TAX_DOCUMENT', 'TRADE_LICENSE', 'BANK_STATEMENT', 'INSURANCE', 'OTHER');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "contact_email" VARCHAR(255),
ADD COLUMN     "contact_phone" VARCHAR(32),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "organization_type" "OrganizationType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "verification_note" TEXT,
ADD COLUMN     "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "verified_at" TIMESTAMP(6),
ADD COLUMN     "verified_by_user_id" UUID,
ADD COLUMN     "website" VARCHAR(255);

-- CreateTable
CREATE TABLE "organization_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "document_type" "OrganizationDocumentType" NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" VARCHAR(120),
    "size_bytes" INTEGER,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "organization_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_profile_extensions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_code" VARCHAR(80) NOT NULL,
    "organization_id" UUID,
    "scope_key" VARCHAR(64) NOT NULL DEFAULT 'PLATFORM',
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "role_profile_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_documents_organization_id_document_type_idx" ON "organization_documents"("organization_id", "document_type");

-- CreateIndex
CREATE INDEX "organization_documents_verification_status_idx" ON "organization_documents"("verification_status");

-- CreateIndex
CREATE INDEX "organization_documents_uploaded_by_user_id_idx" ON "organization_documents"("uploaded_by_user_id");

-- CreateIndex
CREATE INDEX "notification_preferences_user_id_enabled_idx" ON "notification_preferences"("user_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_channel_event_type_key" ON "notification_preferences"("user_id", "channel", "event_type");

-- CreateIndex
CREATE INDEX "role_profile_extensions_organization_id_idx" ON "role_profile_extensions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_profile_extensions_user_id_role_code_scope_key_key" ON "role_profile_extensions"("user_id", "role_code", "scope_key");

-- CreateIndex
CREATE INDEX "organizations_organization_type_idx" ON "organizations"("organization_type");

-- CreateIndex
CREATE INDEX "organizations_verification_status_idx" ON "organizations"("verification_status");

-- CreateIndex
CREATE INDEX "organizations_verified_by_user_id_idx" ON "organizations"("verified_by_user_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_profile_extensions" ADD CONSTRAINT "role_profile_extensions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_profile_extensions" ADD CONSTRAINT "role_profile_extensions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A platform-scoped extension has no organization; an organization-scoped one
-- must repeat its organization id in scope_key. This mirrors the scope_key
-- convention used by user_roles, feature_flags, and platform_settings.
ALTER TABLE "role_profile_extensions" ADD CONSTRAINT "role_profile_extensions_scope_key_check" CHECK (
  ("organization_id" IS NULL AND "scope_key" = 'PLATFORM')
  OR ("organization_id" IS NOT NULL AND "scope_key" = "organization_id"::text)
);


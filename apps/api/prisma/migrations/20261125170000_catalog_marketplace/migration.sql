-- CreateEnum
CREATE TYPE "AttributeValueType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'ENUM');

-- CreateEnum
CREATE TYPE "CatalogEntityType" AS ENUM ('PRODUCT', 'VARIETY');

-- CreateEnum
CREATE TYPE "ListingReportReason" AS ENUM ('MISLEADING', 'PROHIBITED', 'DUPLICATE', 'FRAUD', 'OTHER');

-- CreateEnum
CREATE TYPE "ListingReportStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "listing_locations" ADD COLUMN     "location_label" VARCHAR(180);

-- AlterTable
ALTER TABLE "product_categories" ADD COLUMN     "description" TEXT,
ADD COLUMN     "description_bn" TEXT;

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "alt_text_bn" VARCHAR(255);

-- AlterTable
ALTER TABLE "product_listings" ADD COLUMN     "available_location" VARCHAR(180),
ADD COLUMN     "harvest_date" DATE,
ADD COLUMN     "quality_grade_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "description_bn" TEXT,
ADD COLUMN     "is_available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unit_id" UUID;

-- CreateTable
CREATE TABLE "units_of_measure" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_bn" VARCHAR(120),
    "dimension" VARCHAR(64),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_varieties" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "product_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "name_bn" VARCHAR(180),
    "description" TEXT,
    "description_bn" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "product_varieties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attributes" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "category_id" UUID,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "name_bn" VARCHAR(180),
    "value_type" "AttributeValueType" NOT NULL,
    "unit_code" VARCHAR(32),
    "allowed_values" JSONB,
    "group_code" VARCHAR(64),
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attribute_values" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "attribute_id" UUID NOT NULL,
    "entity_type" "CatalogEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "value_text" TEXT,
    "value_number" DECIMAL(14,3),
    "value_boolean" BOOLEAN,
    "value_date" DATE,
    "value_json" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_grades" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "name_bn" VARCHAR(180),
    "description" TEXT,
    "min_score" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "quality_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_images" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "alt_text" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "listing_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_listings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_reports" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "reason" "ListingReportReason" NOT NULL,
    "details" TEXT,
    "status" "ListingReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "listing_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_messages" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "units_of_measure_code_key" ON "units_of_measure"("code");

-- CreateIndex
CREATE INDEX "units_of_measure_organization_id_is_active_idx" ON "units_of_measure"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "product_varieties_organization_id_is_active_idx" ON "product_varieties"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "product_varieties_product_id_idx" ON "product_varieties"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_varieties_product_id_code_key" ON "product_varieties"("product_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "product_attributes_code_key" ON "product_attributes"("code");

-- CreateIndex
CREATE INDEX "product_attributes_organization_id_is_active_idx" ON "product_attributes"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "product_attributes_category_id_idx" ON "product_attributes"("category_id");

-- CreateIndex
CREATE INDEX "product_attribute_values_organization_id_idx" ON "product_attribute_values"("organization_id");

-- CreateIndex
CREATE INDEX "product_attribute_values_entity_type_entity_id_idx" ON "product_attribute_values"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_attribute_values_attribute_id_entity_type_entity_id_key" ON "product_attribute_values"("attribute_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_grades_code_key" ON "quality_grades"("code");

-- CreateIndex
CREATE INDEX "quality_grades_organization_id_is_active_idx" ON "quality_grades"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "listing_images_listing_id_sort_order_key" ON "listing_images"("listing_id", "sort_order");

-- CreateIndex
CREATE INDEX "favorite_listings_listing_id_idx" ON "favorite_listings"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_listings_user_id_listing_id_key" ON "favorite_listings"("user_id", "listing_id");

-- CreateIndex
CREATE INDEX "listing_reports_listing_id_status_idx" ON "listing_reports"("listing_id", "status");

-- CreateIndex
CREATE INDEX "listing_reports_status_idx" ON "listing_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "listing_reports_listing_id_reporter_user_id_key" ON "listing_reports"("listing_id", "reporter_user_id");

-- CreateIndex
CREATE INDEX "listing_messages_listing_id_created_at_idx" ON "listing_messages"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_messages_sender_user_id_recipient_user_id_idx" ON "listing_messages"("sender_user_id", "recipient_user_id");

-- CreateIndex
CREATE INDEX "product_listings_quality_grade_id_idx" ON "product_listings"("quality_grade_id");

-- CreateIndex
CREATE INDEX "product_listings_harvest_date_idx" ON "product_listings"("harvest_date");

-- CreateIndex
CREATE INDEX "products_unit_id_idx" ON "products"("unit_id");

-- CreateIndex
CREATE INDEX "products_is_available_idx" ON "products"("is_available");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units_of_measure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_varieties" ADD CONSTRAINT "product_varieties_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_varieties" ADD CONSTRAINT "product_varieties_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "product_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_grades" ADD CONSTRAINT "quality_grades_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_quality_grade_id_fkey" FOREIGN KEY ("quality_grade_id") REFERENCES "quality_grades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "product_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_listings" ADD CONSTRAINT "favorite_listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_listings" ADD CONSTRAINT "favorite_listings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "product_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "product_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_messages" ADD CONSTRAINT "listing_messages_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "product_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_messages" ADD CONSTRAINT "listing_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_messages" ADD CONSTRAINT "listing_messages_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Catalog and marketplace invariants
-- ---------------------------------------------------------------------------

ALTER TABLE "listing_images"
  ADD CONSTRAINT "listing_images_sort_order_check" CHECK ("sort_order" >= 0);

ALTER TABLE "quality_grades"
  ADD CONSTRAINT "quality_grades_min_score_check" CHECK ("min_score" IS NULL OR "min_score" >= 0);

-- Existing rows predate these fields, so the checks start NOT VALID and apply
-- to new writes without rewriting historical marketplace data.
ALTER TABLE "product_listings"
  ADD CONSTRAINT "product_listings_location_check" CHECK (
    "available_location" IS NOT NULL OR "harvest_date" IS NOT NULL
  ) NOT VALID;

ALTER TABLE "listing_locations"
  ADD CONSTRAINT "listing_locations_available_location_check" CHECK (
    "location" IS NOT NULL
    OR "location_label" IS NOT NULL
    OR "division_id" IS NOT NULL
    OR "district_id" IS NOT NULL
    OR "upazila_id" IS NOT NULL
    OR "union_id" IS NOT NULL
  ) NOT VALID;

ALTER TABLE "product_attributes"
  ADD CONSTRAINT "product_attributes_allowed_values_check" CHECK (
    "value_type" <> 'ENUM'
    OR ("allowed_values" IS NOT NULL AND jsonb_typeof("allowed_values") = 'array')
  );

ALTER TABLE "listing_messages"
  ADD CONSTRAINT "listing_messages_body_check" CHECK (length(btrim("body")) > 0);

ALTER TABLE "listing_reports"
  ADD CONSTRAINT "listing_reports_pending_review_check" CHECK (
    "status" <> 'PENDING'
    OR ("reviewed_by_user_id" IS NULL AND "reviewed_at" IS NULL)
  );

-- Flexible attributes are typed. Exactly one storage column must be populated,
-- and the populated column must match the attribute definition's value type.
CREATE FUNCTION "cropsy_enforce_catalog_attribute_value_type"() RETURNS trigger AS $$
DECLARE
  v_type "AttributeValueType";
  v_allowed jsonb;
  v_populated integer;
BEGIN
  SELECT "value_type", "allowed_values" INTO v_type, v_allowed
  FROM "product_attributes" WHERE "id" = NEW."attribute_id";

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Unknown product attribute %', NEW."attribute_id"
      USING ERRCODE = '23503';
  END IF;

  v_populated :=
    (CASE WHEN NEW."value_text" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW."value_number" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW."value_boolean" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW."value_date" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW."value_json" IS NOT NULL THEN 1 ELSE 0 END);

  IF v_populated <> 1 THEN
    RAISE EXCEPTION 'Attribute value must populate exactly one typed column'
      USING ERRCODE = '23514';
  END IF;

  IF v_type = 'TEXT' AND NEW."value_text" IS NULL THEN
    RAISE EXCEPTION 'TEXT attribute values require value_text' USING ERRCODE = '23514';
  ELSIF v_type = 'NUMBER' AND NEW."value_number" IS NULL THEN
    RAISE EXCEPTION 'NUMBER attribute values require value_number' USING ERRCODE = '23514';
  ELSIF v_type = 'BOOLEAN' AND NEW."value_boolean" IS NULL THEN
    RAISE EXCEPTION 'BOOLEAN attribute values require value_boolean' USING ERRCODE = '23514';
  ELSIF v_type = 'DATE' AND NEW."value_date" IS NULL THEN
    RAISE EXCEPTION 'DATE attribute values require value_date' USING ERRCODE = '23514';
  ELSIF v_type = 'ENUM' THEN
    IF NEW."value_text" IS NULL THEN
      RAISE EXCEPTION 'ENUM attribute values require value_text' USING ERRCODE = '23514';
    END IF;
    IF v_allowed IS NULL OR NOT (v_allowed ? NEW."value_text") THEN
      RAISE EXCEPTION 'Attribute value % is not allowed', NEW."value_text"
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "product_attribute_values_type_check"
AFTER INSERT OR UPDATE OF "attribute_id", "value_text", "value_number", "value_boolean", "value_date", "value_json"
ON "product_attribute_values"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_catalog_attribute_value_type"();

-- Attribute values inherit tenant scope from both the attribute definition and
-- the product/variety they describe.
CREATE FUNCTION "cropsy_enforce_catalog_attribute_value_tenant"() RETURNS trigger AS $$
DECLARE
  v_attribute_org uuid;
  v_entity_org uuid;
  v_entity_exists boolean := false;
BEGIN
  SELECT "organization_id" INTO v_attribute_org
  FROM "product_attributes" WHERE "id" = NEW."attribute_id";

  IF NEW."entity_type" = 'PRODUCT' THEN
    SELECT "organization_id", true INTO v_entity_org, v_entity_exists
    FROM "products" WHERE "id" = NEW."entity_id";
  ELSE
    SELECT "organization_id", true INTO v_entity_org, v_entity_exists
    FROM "product_varieties" WHERE "id" = NEW."entity_id";
  END IF;

  IF NOT v_entity_exists THEN
    RAISE EXCEPTION 'Unknown catalog entity %', NEW."entity_id"
      USING ERRCODE = '23503';
  END IF;

  IF v_attribute_org IS NOT NULL AND NEW."organization_id" IS DISTINCT FROM v_attribute_org THEN
    RAISE EXCEPTION 'Attribute tenant mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF v_entity_org IS NOT NULL AND NEW."organization_id" IS DISTINCT FROM v_entity_org THEN
    RAISE EXCEPTION 'Catalog entity tenant mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "product_attribute_values_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "attribute_id", "entity_type", "entity_id"
ON "product_attribute_values"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_catalog_attribute_value_tenant"();

CREATE CONSTRAINT TRIGGER "units_of_measure_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "units_of_measure"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('products', 'unit_id');

CREATE CONSTRAINT TRIGGER "product_varieties_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "product_id" ON "product_varieties"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('products', 'product_id');

CREATE CONSTRAINT TRIGGER "product_attributes_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "category_id" ON "product_attributes"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('product_categories', 'category_id');

CREATE CONSTRAINT TRIGGER "quality_grades_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "quality_grades"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('product_listings', 'quality_grade_id');

-- Recreate existing triggers so new references participate in the same tenant
-- consistency guards.
DROP TRIGGER IF EXISTS "products_tenant_match_check" ON "products";
CREATE CONSTRAINT TRIGGER "products_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "category_id", "farmer_profile_id", "unit_id" ON "products"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('product_categories', 'category_id', 'farmer_profiles', 'farmer_profile_id', 'units_of_measure', 'unit_id');

DROP TRIGGER IF EXISTS "product_categories_tenant_immutable_check" ON "product_categories";
CREATE CONSTRAINT TRIGGER "product_categories_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "product_categories"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('products', 'category_id', 'product_categories', 'parent_id', 'product_attributes', 'category_id');

DROP TRIGGER IF EXISTS "products_tenant_immutable_check" ON "products";
CREATE CONSTRAINT TRIGGER "products_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "products"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('product_inventories', 'product_id', 'product_listings', 'product_id', 'product_varieties', 'product_id', 'price_history', 'product_id', 'quality_inspections', 'product_id', 'traceability_records', 'product_id');

DROP TRIGGER IF EXISTS "product_listings_tenant_match_check" ON "product_listings";
CREATE CONSTRAINT TRIGGER "product_listings_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "product_id", "inventory_id", "quality_grade_id" ON "product_listings"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('products', 'product_id', 'product_inventories', 'inventory_id', 'quality_grades', 'quality_grade_id');

-- Polymorphic attribute values cannot use a foreign key, so tenant immutability
-- is enforced with a dedicated trigger on each catalog entity table.
CREATE FUNCTION "cropsy_enforce_catalog_attribute_values_immutable"() RETURNS trigger AS $$
DECLARE
  v_remaining bigint;
BEGIN
  IF NEW."organization_id" IS NOT DISTINCT FROM OLD."organization_id" THEN
    RETURN NULL;
  END IF;

  EXECUTE format(
    'SELECT count(*) FROM "product_attribute_values" WHERE "entity_type" = $1 AND "entity_id" = $2 AND "organization_id" IS DISTINCT FROM $3'
  ) INTO v_remaining USING TG_ARGV[0], OLD."id", NEW."organization_id";

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Cannot change % organization_id while attribute values still reference it',
      TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "products_attribute_values_immutable_check"
AFTER UPDATE OF "organization_id" ON "products"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_catalog_attribute_values_immutable"('PRODUCT');

CREATE CONSTRAINT TRIGGER "product_varieties_attribute_values_immutable_check"
AFTER UPDATE OF "organization_id" ON "product_varieties"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_catalog_attribute_values_immutable"('VARIETY');


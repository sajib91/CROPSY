-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SEEDS', 'FERTILIZER', 'PESTICIDE', 'IRRIGATION', 'LABOR', 'MACHINERY', 'TRANSPORTATION', 'LAND_PREPARATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseSource" AS ENUM ('RECORDED', 'AI_ESTIMATED');

-- CreateEnum
CREATE TYPE "GrowthStage" AS ENUM ('NOT_SET', 'GERMINATION', 'VEGETATIVE', 'FLOWERING', 'FRUITING', 'MATURITY', 'HARVEST_READY');

-- CreateEnum
CREATE TYPE "ObservationSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RecommendationSource" AS ENUM ('CONFIGURED', 'AI_ESTIMATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FarmActivityType" ADD VALUE 'LAND_PREPARATION';
ALTER TYPE "FarmActivityType" ADD VALUE 'SOWING';
ALTER TYPE "FarmActivityType" ADD VALUE 'GROWTH_STAGE';
ALTER TYPE "FarmActivityType" ADD VALUE 'DISEASE_OBSERVATION';
ALTER TYPE "FarmActivityType" ADD VALUE 'PEST_OBSERVATION';

-- AlterTable
ALTER TABLE "cultivations" ADD COLUMN     "code" VARCHAR(64),
ADD COLUMN     "crop_calendar_id" UUID,
ADD COLUMN     "expected_yield_kg" DECIMAL(14,3),
ADD COLUMN     "growth_stage" "GrowthStage" NOT NULL DEFAULT 'NOT_SET',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "sown_at" TIMESTAMP(6);

-- AlterTable
ALTER TABLE "farm_activities" ADD COLUMN     "growth_stage" "GrowthStage" NOT NULL DEFAULT 'NOT_SET',
ADD COLUMN     "observation_severity" "ObservationSeverity";

-- CreateTable
CREATE TABLE "crop_calendars" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "scope_key" VARCHAR(64) NOT NULL DEFAULT 'GLOBAL',
    "crop_id" UUID NOT NULL,
    "crop_variety_id" UUID,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "sowing_start_month" INTEGER NOT NULL,
    "sowing_end_month" INTEGER NOT NULL,
    "harvest_days_min" INTEGER,
    "harvest_days_max" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "crop_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agronomic_recommendations" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "scope_key" VARCHAR(64) NOT NULL DEFAULT 'GLOBAL',
    "crop_id" UUID NOT NULL,
    "crop_variety_id" UUID,
    "calendar_id" UUID,
    "code" VARCHAR(64) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "body" TEXT NOT NULL,
    "source" "RecommendationSource" NOT NULL DEFAULT 'CONFIGURED',
    "confidence" DECIMAL(5,4),
    "rule_key" VARCHAR(120),
    "valid_from" TIMESTAMP(6),
    "valid_until" TIMESTAMP(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "agronomic_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_expenses" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "farm_id" UUID NOT NULL,
    "cultivation_id" UUID,
    "category" "ExpenseCategory" NOT NULL,
    "source" "ExpenseSource" NOT NULL DEFAULT 'RECORDED',
    "expense_date" TIMESTAMP(6) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "description" VARCHAR(255),
    "quantity" DECIMAL(14,3),
    "unit_code" VARCHAR(16),
    "receipt_url" VARCHAR(512),
    "receipt_note" TEXT,
    "estimate_rule_key" VARCHAR(120),
    "confidence" DECIMAL(5,4),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "farm_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crop_calendars_organization_id_is_active_idx" ON "crop_calendars"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "crop_calendars_crop_id_is_active_idx" ON "crop_calendars"("crop_id", "is_active");

-- CreateIndex
CREATE INDEX "crop_calendars_crop_variety_id_idx" ON "crop_calendars"("crop_variety_id");

-- CreateIndex
CREATE UNIQUE INDEX "crop_calendars_scope_key_code_key" ON "crop_calendars"("scope_key", "code");

-- CreateIndex
CREATE INDEX "agronomic_recommendations_organization_id_is_active_idx" ON "agronomic_recommendations"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "agronomic_recommendations_crop_id_source_idx" ON "agronomic_recommendations"("crop_id", "source");

-- CreateIndex
CREATE INDEX "agronomic_recommendations_crop_variety_id_idx" ON "agronomic_recommendations"("crop_variety_id");

-- CreateIndex
CREATE INDEX "agronomic_recommendations_calendar_id_idx" ON "agronomic_recommendations"("calendar_id");

-- CreateIndex
CREATE UNIQUE INDEX "agronomic_recommendations_scope_key_code_key" ON "agronomic_recommendations"("scope_key", "code");

-- CreateIndex
CREATE INDEX "farm_expenses_organization_id_expense_date_idx" ON "farm_expenses"("organization_id", "expense_date");

-- CreateIndex
CREATE INDEX "farm_expenses_farm_id_expense_date_idx" ON "farm_expenses"("farm_id", "expense_date");

-- CreateIndex
CREATE INDEX "farm_expenses_farm_id_category_idx" ON "farm_expenses"("farm_id", "category");

-- CreateIndex
CREATE INDEX "farm_expenses_cultivation_id_expense_date_idx" ON "farm_expenses"("cultivation_id", "expense_date");

-- CreateIndex
CREATE INDEX "farm_expenses_source_category_idx" ON "farm_expenses"("source", "category");

-- CreateIndex
CREATE INDEX "cultivations_crop_calendar_id_idx" ON "cultivations"("crop_calendar_id");

-- CreateIndex
CREATE INDEX "cultivations_sown_at_idx" ON "cultivations"("sown_at");

-- CreateIndex
CREATE UNIQUE INDEX "cultivations_farm_id_code_key" ON "cultivations"("farm_id", "code");

-- CreateIndex
CREATE INDEX "farm_activities_farm_id_activity_date_idx" ON "farm_activities"("farm_id", "activity_date");

-- CreateIndex
CREATE INDEX "farm_activities_cultivation_id_activity_date_idx" ON "farm_activities"("cultivation_id", "activity_date");

-- CreateIndex
CREATE INDEX "farm_activities_growth_stage_idx" ON "farm_activities"("growth_stage");

-- AddForeignKey
ALTER TABLE "cultivations" ADD CONSTRAINT "cultivations_crop_calendar_id_fkey" FOREIGN KEY ("crop_calendar_id") REFERENCES "crop_calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_calendars" ADD CONSTRAINT "crop_calendars_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_calendars" ADD CONSTRAINT "crop_calendars_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_calendars" ADD CONSTRAINT "crop_calendars_crop_variety_id_fkey" FOREIGN KEY ("crop_variety_id") REFERENCES "crop_varieties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agronomic_recommendations" ADD CONSTRAINT "agronomic_recommendations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agronomic_recommendations" ADD CONSTRAINT "agronomic_recommendations_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agronomic_recommendations" ADD CONSTRAINT "agronomic_recommendations_crop_variety_id_fkey" FOREIGN KEY ("crop_variety_id") REFERENCES "crop_varieties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agronomic_recommendations" ADD CONSTRAINT "agronomic_recommendations_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "crop_calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_expenses" ADD CONSTRAINT "farm_expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_expenses" ADD CONSTRAINT "farm_expenses_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_expenses" ADD CONSTRAINT "farm_expenses_cultivation_id_fkey" FOREIGN KEY ("cultivation_id") REFERENCES "cultivations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Agronomy and expense policy guards.
--
-- These rules are deliberately expressed in SQL so that direct database
-- writes cannot bypass the application's validation. Business values that are
-- tenant-configurable (for example harvest windows) are bounded here but not
-- assigned invented defaults.
-- ---------------------------------------------------------------------------

ALTER TABLE "crop_calendars" ADD CONSTRAINT "crop_calendars_month_check"
  CHECK ("sowing_start_month" BETWEEN 1 AND 12 AND "sowing_end_month" BETWEEN 1 AND 12);

ALTER TABLE "crop_calendars" ADD CONSTRAINT "crop_calendars_harvest_window_check"
  CHECK (
    ("harvest_days_min" IS NULL AND "harvest_days_max" IS NULL)
    OR (
      "harvest_days_min" > 0
      AND "harvest_days_max" > 0
      AND "harvest_days_min" <= "harvest_days_max"
    )
  );

ALTER TABLE "crop_calendars" ADD CONSTRAINT "crop_calendars_scope_check"
  CHECK (
    ("scope_key" = 'GLOBAL' AND "organization_id" IS NULL)
    OR (
      "scope_key" <> 'GLOBAL'
      AND "organization_id" IS NOT NULL
      AND "scope_key" = "organization_id"::text
    )
  );

ALTER TABLE "agronomic_recommendations" ADD CONSTRAINT "agronomic_recommendations_scope_check"
  CHECK (
    ("scope_key" = 'GLOBAL' AND "organization_id" IS NULL)
    OR (
      "scope_key" <> 'GLOBAL'
      AND "organization_id" IS NOT NULL
      AND "scope_key" = "organization_id"::text
    )
  );

ALTER TABLE "agronomic_recommendations" ADD CONSTRAINT "agronomic_recommendations_confidence_check"
  CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));

ALTER TABLE "agronomic_recommendations" ADD CONSTRAINT "agronomic_recommendations_validity_check"
  CHECK ("valid_until" IS NULL OR "valid_from" IS NULL OR "valid_until" >= "valid_from");

ALTER TABLE "agronomic_recommendations" ADD CONSTRAINT "agronomic_recommendations_rule_key_check"
  CHECK (
    "source" <> 'AI_ESTIMATED'
    OR ("rule_key" IS NOT NULL AND btrim("rule_key") <> '')
  );

ALTER TABLE "farm_expenses" ADD CONSTRAINT "farm_expenses_amount_check" CHECK ("amount" > 0);

ALTER TABLE "farm_expenses" ADD CONSTRAINT "farm_expenses_currency_check"
  CHECK (btrim("currency") ~ '^[A-Z]{3}$');

ALTER TABLE "farm_expenses" ADD CONSTRAINT "farm_expenses_confidence_check"
  CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));

-- Recorded expenses are actual costs. AI estimates are kept separate and must
-- name the rule that produced them; they must never be silently treated as
-- recorded costs by a report.
ALTER TABLE "farm_expenses" ADD CONSTRAINT "farm_expenses_source_check"
  CHECK (
    (
      "source" = 'RECORDED'
      AND "estimate_rule_key" IS NULL
      AND "confidence" IS NULL
    )
    OR (
      "source" = 'AI_ESTIMATED'
      AND "estimate_rule_key" IS NOT NULL
      AND btrim("estimate_rule_key") <> ''
    )
  );

-- A variety belongs to exactly one crop. Guard every table that stores both
-- identifiers so a calendar, recommendation, or cultivation cannot mix them.
CREATE FUNCTION "cropsy_enforce_crop_variety_match"() RETURNS trigger AS $$
BEGIN
  IF NEW."crop_id" IS NOT NULL
     AND NEW."crop_variety_id" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "crop_varieties" AS v
       WHERE v."id" = NEW."crop_variety_id"
         AND v."crop_id" = NEW."crop_id"
     )
  THEN
    RAISE EXCEPTION '% crop_variety_id does not belong to crop_id', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "crop_calendars_crop_variety_match_check"
AFTER INSERT OR UPDATE OF "crop_id", "crop_variety_id" ON "crop_calendars"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_crop_variety_match"();

CREATE CONSTRAINT TRIGGER "agronomic_recommendations_crop_variety_match_check"
AFTER INSERT OR UPDATE OF "crop_id", "crop_variety_id" ON "agronomic_recommendations"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_crop_variety_match"();

CREATE CONSTRAINT TRIGGER "cultivations_crop_variety_match_check"
AFTER INSERT OR UPDATE OF "crop_id", "crop_variety_id" ON "cultivations"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_crop_variety_match"();

-- A recommendation may only attach to a calendar from the same tenant scope
-- and for the same crop (and variety when both specify one).
CREATE FUNCTION "cropsy_enforce_recommendation_calendar_match"() RETURNS trigger AS $$
DECLARE
  v_calendar record;
BEGIN
  IF NEW."calendar_id" IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c."crop_id", c."crop_variety_id", c."organization_id"
  INTO v_calendar
  FROM "crop_calendars" AS c
  WHERE c."id" = NEW."calendar_id";

  IF v_calendar."crop_id" <> NEW."crop_id" THEN
    RAISE EXCEPTION 'Recommendation calendar must belong to the same crop'
      USING ERRCODE = '23514';
  END IF;

  IF v_calendar."crop_variety_id" IS NOT NULL
     AND NEW."crop_variety_id" IS NOT NULL
     AND v_calendar."crop_variety_id" <> NEW."crop_variety_id"
  THEN
    RAISE EXCEPTION 'Recommendation calendar must belong to the same crop variety'
      USING ERRCODE = '23514';
  END IF;

  IF v_calendar."organization_id" IS NOT NULL
     AND NEW."organization_id" IS DISTINCT FROM v_calendar."organization_id"
  THEN
    RAISE EXCEPTION 'Tenant mismatch: recommendation references a calendar owned by another organization'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "agronomic_recommendations_calendar_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "crop_id", "crop_variety_id", "calendar_id" ON "agronomic_recommendations"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_recommendation_calendar_match"();

-- Tenant-owned parents must match their children's organization_id. Platform
-- scoped calendars (organization_id IS NULL, scope_key = GLOBAL) remain
-- referenceable by every tenant.
CREATE CONSTRAINT TRIGGER "agronomic_recommendations_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "calendar_id" ON "agronomic_recommendations"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('crop_calendars', 'calendar_id');

CREATE CONSTRAINT TRIGGER "farm_expenses_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "farm_id", "cultivation_id" ON "farm_expenses"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('farms', 'farm_id', 'cultivations', 'cultivation_id');

DO $$
BEGIN
  PERFORM "cropsy_assert_tenant_match"('agronomic_recommendations', 'crop_calendars', 'calendar_id');
  PERFORM "cropsy_assert_tenant_match"('farm_expenses', 'farms', 'farm_id');
  PERFORM "cropsy_assert_tenant_match"('farm_expenses', 'cultivations', 'cultivation_id');
END;
$$;

-- A tenant parent cannot be reassigned while children still reference it.
DROP TRIGGER IF EXISTS "farms_tenant_immutable_check" ON "farms";
CREATE CONSTRAINT TRIGGER "farms_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "farms"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('land_parcels', 'farm_id', 'cultivations', 'farm_id', 'farm_activities', 'farm_id', 'harvests', 'farm_id', 'farm_soil_profiles', 'farm_id', 'farm_irrigations', 'farm_id', 'farm_expenses', 'farm_id');

DROP TRIGGER IF EXISTS "cultivations_tenant_immutable_check" ON "cultivations";
CREATE CONSTRAINT TRIGGER "cultivations_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "cultivations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('farm_activities', 'cultivation_id', 'harvests', 'cultivation_id', 'traceability_records', 'cultivation_id', 'farm_expenses', 'cultivation_id');

CREATE CONSTRAINT TRIGGER "crop_calendars_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "crop_calendars"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('cultivations', 'crop_calendar_id', 'agronomic_recommendations', 'calendar_id');

-- Cultivation calendar references must obey the same tenant-scope rules as
-- farm and land-parcel references.
DROP TRIGGER IF EXISTS "cultivations_tenant_match_check" ON "cultivations";
CREATE CONSTRAINT TRIGGER "cultivations_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "farm_id", "land_parcel_id", "crop_season_id", "crop_calendar_id" ON "cultivations"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('farms', 'farm_id', 'land_parcels', 'land_parcel_id', 'crop_seasons', 'crop_season_id', 'crop_calendars', 'crop_calendar_id');


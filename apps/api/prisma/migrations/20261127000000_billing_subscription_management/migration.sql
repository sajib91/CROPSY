-- Configurable SaaS plan policy. Prices and entitlements remain caller-supplied;
-- no commercial values are inserted by this migration.
ALTER TABLE "subscription_plans"
  ADD COLUMN "segment_codes" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "entitlements" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "usage_limits" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "provider_code" VARCHAR(80),
  ADD COLUMN "billing_cycle_months" INTEGER,
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "subscriptions"
  ADD COLUMN "provider_code" VARCHAR(80),
  ADD COLUMN "cancel_reason" TEXT,
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "subscription_invoices"
  ADD COLUMN "provider_code" VARCHAR(80),
  ADD COLUMN "period_start" TIMESTAMP(6),
  ADD COLUMN "period_end" TIMESTAMP(6),
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "usage_records"
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "subscription_plans"
  ADD CONSTRAINT "subscription_plans_cycle_check"
  CHECK ("billing_cycle_months" IS NULL OR "billing_cycle_months" > 0);

ALTER TABLE "subscription_invoices"
  ADD CONSTRAINT "subscription_invoices_period_check_v2"
  CHECK (
    "period_start" IS NULL OR
    "period_end" IS NULL OR
    "period_end" >= "period_start"
  );

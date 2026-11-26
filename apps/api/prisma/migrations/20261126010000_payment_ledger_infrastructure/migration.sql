-- CreateEnum
CREATE TYPE "LedgerBucket" AS ENUM ('PENDING', 'AVAILABLE', 'SETTLED');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "allocation_snapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "commission_rule_snapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "purchase_group_id" UUID;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "allocation_snapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "idempotency_key" VARCHAR(255);

-- AlterTable. Existing settlement rows receive a deterministic key before the
-- column is made mandatory; no settlement timing or commission policy is seeded.
ALTER TABLE "settlements" ADD COLUMN     "allocation_snapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "idempotency_key" VARCHAR(255),
ADD COLUMN     "journal_id" UUID;

UPDATE "settlements" SET "idempotency_key" = 'settlement:' || "id"::text
WHERE "idempotency_key" IS NULL;

ALTER TABLE "settlements" ALTER COLUMN "idempotency_key" SET NOT NULL;

-- CreateTable
CREATE TABLE "payment_status_changes" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "payment_id" UUID NOT NULL,
    "from_status" "PaymentStatus",
    "to_status" "PaymentStatus" NOT NULL,
    "reason" VARCHAR(255),
    "actor_user_id" UUID,
    "provider_event_id" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "provider_code" VARCHAR(80) NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "payment_id" UUID,
    "payload" JSONB NOT NULL,
    "signature" VARCHAR(512),
    "status" VARCHAR(40) NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "received_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_journals" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "reference_type" VARCHAR(80) NOT NULL,
    "reference_id" UUID,
    "description" VARCHAR(500),
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "status" VARCHAR(20) NOT NULL DEFAULT 'POSTED',
    "actor_user_id" UUID,
    "request_id" VARCHAR(255),
    "posted_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_journal_lines" (
    "id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "organization_id" UUID,
    "account_id" UUID NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "bucket" "LedgerBucket" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "owner_user_id" UUID,
    "description" VARCHAR(500),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_balances" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "account_id" UUID NOT NULL,
    "owner_key" VARCHAR(80) NOT NULL DEFAULT 'PLATFORM',
    "owner_user_id" UUID,
    "bucket" "LedgerBucket" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ledger_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "actor_user_id" UUID,
    "entity_type" VARCHAR(80),
    "entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "request_id" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_expectations" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "expectation_key" VARCHAR(255) NOT NULL,
    "reference_type" VARCHAR(80) NOT NULL,
    "reference_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "status" VARCHAR(40) NOT NULL DEFAULT 'EXPECTED',
    "journal_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matched_at" TIMESTAMP(6),

    CONSTRAINT "reconciliation_expectations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_status_changes_organization_id_created_at_idx" ON "payment_status_changes"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_status_changes_payment_id_created_at_idx" ON "payment_status_changes"("payment_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_webhook_events_organization_id_status_idx" ON "payment_webhook_events"("organization_id", "status");

-- CreateIndex
CREATE INDEX "payment_webhook_events_payment_id_received_at_idx" ON "payment_webhook_events"("payment_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_code_provider_event_id_key" ON "payment_webhook_events"("provider_code", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_journals_idempotency_key_key" ON "ledger_journals"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_journals_organization_id_posted_at_idx" ON "ledger_journals"("organization_id", "posted_at");

-- CreateIndex
CREATE INDEX "ledger_journals_reference_type_reference_id_idx" ON "ledger_journals"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "ledger_journal_lines_journal_id_idx" ON "ledger_journal_lines"("journal_id");

-- CreateIndex
CREATE INDEX "ledger_journal_lines_account_id_bucket_idx" ON "ledger_journal_lines"("account_id", "bucket");

-- CreateIndex
CREATE INDEX "ledger_journal_lines_owner_user_id_bucket_idx" ON "ledger_journal_lines"("owner_user_id", "bucket");

-- CreateIndex
CREATE INDEX "ledger_balances_organization_id_bucket_idx" ON "ledger_balances"("organization_id", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_balances_account_id_owner_key_bucket_currency_key" ON "ledger_balances"("account_id", "owner_key", "bucket", "currency");

-- CreateIndex
CREATE INDEX "ledger_audit_events_organization_id_created_at_idx" ON "ledger_audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_audit_events_entity_type_entity_id_idx" ON "ledger_audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_expectations_expectation_key_key" ON "reconciliation_expectations"("expectation_key");

-- CreateIndex
CREATE INDEX "reconciliation_expectations_organization_id_status_idx" ON "reconciliation_expectations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "payments_purchase_group_id_idx" ON "payments"("purchase_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_idempotency_key_key" ON "refunds"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_idempotency_key_key" ON "settlements"("idempotency_key");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchase_group_id_fkey" FOREIGN KEY ("purchase_group_id") REFERENCES "purchase_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_status_changes" ADD CONSTRAINT "payment_status_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_status_changes" ADD CONSTRAINT "payment_status_changes_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_status_changes" ADD CONSTRAINT "payment_status_changes_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_journals" ADD CONSTRAINT "ledger_journals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_journals" ADD CONSTRAINT "ledger_journals_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_journal_lines" ADD CONSTRAINT "ledger_journal_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_journal_lines" ADD CONSTRAINT "ledger_journal_lines_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "ledger_journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_journal_lines" ADD CONSTRAINT "ledger_journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_balances" ADD CONSTRAINT "ledger_balances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_balances" ADD CONSTRAINT "ledger_balances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_audit_events" ADD CONSTRAINT "ledger_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_audit_events" ADD CONSTRAINT "ledger_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_expectations" ADD CONSTRAINT "reconciliation_expectations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_expectations" ADD CONSTRAINT "reconciliation_expectations_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "ledger_journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "ledger_journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Financial invariants. These checks enforce the accounting rules in the
-- database so application code cannot bypass them with direct SQL.
-- ---------------------------------------------------------------------------

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_integrity_check" CHECK (
  "amount" >= 0
  AND "captured_amount" >= 0
  AND "refunded_amount" >= 0
  AND "captured_amount" <= "amount"
  AND "refunded_amount" <= "captured_amount"
);

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_integrity_check" CHECK (
  "amount" > 0
);

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_amount_integrity_check" CHECK (
  "gross_amount" >= 0
  AND "deductions_amount" >= 0
  AND "net_amount" >= 0
  AND "net_amount" <= "gross_amount"
  AND "period_end" >= "period_start"
);

ALTER TABLE "payment_status_changes" ADD CONSTRAINT "payment_status_changes_transition_check" CHECK (
  "from_status" IS DISTINCT FROM "to_status"
);

ALTER TABLE "ledger_journal_lines" ADD CONSTRAINT "ledger_journal_lines_amount_check" CHECK (
  "amount" > 0
);

ALTER TABLE "ledger_balances" ADD CONSTRAINT "ledger_balances_owner_key_check" CHECK (
  length("owner_key") > 0
);

-- Append-only financial history and posted entries.
CREATE FUNCTION "cropsy_prevent_financial_history_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Financial history is append-only'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payment_status_changes_append_only"
  BEFORE UPDATE OR DELETE ON "payment_status_changes"
  FOR EACH ROW EXECUTE FUNCTION "cropsy_prevent_financial_history_mutation"();

CREATE TRIGGER "payment_status_changes_no_truncate"
  BEFORE TRUNCATE ON "payment_status_changes"
  FOR EACH STATEMENT EXECUTE FUNCTION "cropsy_prevent_financial_history_mutation"();

CREATE TRIGGER "ledger_journals_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_journals"
  FOR EACH ROW EXECUTE FUNCTION "cropsy_prevent_financial_history_mutation"();

CREATE TRIGGER "ledger_journals_no_truncate"
  BEFORE TRUNCATE ON "ledger_journals"
  FOR EACH STATEMENT EXECUTE FUNCTION "cropsy_prevent_financial_history_mutation"();

CREATE TRIGGER "ledger_journal_lines_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_journal_lines"
  FOR EACH ROW EXECUTE FUNCTION "cropsy_prevent_financial_history_mutation"();

CREATE TRIGGER "ledger_journal_lines_no_truncate"
  BEFORE TRUNCATE ON "ledger_journal_lines"
  FOR EACH STATEMENT EXECUTE FUNCTION "cropsy_prevent_financial_history_mutation"();

CREATE TRIGGER "ledger_audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_audit_events"
  FOR EACH ROW EXECUTE FUNCTION "cropsy_prevent_financial_history_mutation"();

CREATE TRIGGER "ledger_audit_events_no_truncate"
  BEFORE TRUNCATE ON "ledger_audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "cropsy_prevent_financial_history_mutation"();

-- Deferred balance check allows a journal to be inserted line by line inside
-- one transaction, but rejects any committed unbalanced journal.
CREATE FUNCTION "cropsy_assert_journal_balanced"() RETURNS trigger AS $$
DECLARE
  v_journal uuid;
  v_debit numeric(14,2);
  v_credit numeric(14,2);
BEGIN
  v_journal := COALESCE(NEW."journal_id", OLD."journal_id");
  SELECT
    COALESCE(SUM("amount") FILTER (WHERE "direction" = 'DEBIT'), 0),
    COALESCE(SUM("amount") FILTER (WHERE "direction" = 'CREDIT'), 0)
  INTO v_debit, v_credit
  FROM "ledger_journal_lines"
  WHERE "journal_id" = v_journal;

  IF v_debit <= 0 OR v_debit <> v_credit THEN
    RAISE EXCEPTION 'Journal must balance'
      USING ERRCODE = 'check_violation', DETAIL = format('debit=%s credit=%s', v_debit, v_credit);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ledger_journal_lines_balanced_check"
  AFTER INSERT OR UPDATE OR DELETE ON "ledger_journal_lines"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "cropsy_assert_journal_balanced"();

-- Multi-tenant consistency for financial rows.
DO $$
BEGIN
  PERFORM "cropsy_assert_tenant_match"('payment_status_changes', 'payments', 'payment_id');
  PERFORM "cropsy_assert_tenant_match"('payment_webhook_events', 'payments', 'payment_id');
  PERFORM "cropsy_assert_tenant_match"('ledger_journal_lines', 'ledger_journals', 'journal_id');
  PERFORM "cropsy_assert_tenant_match"('ledger_balances', 'ledger_accounts', 'account_id');
  PERFORM "cropsy_assert_tenant_match"('reconciliation_expectations', 'ledger_journals', 'journal_id');
  PERFORM "cropsy_assert_tenant_match"('settlements', 'ledger_journals', 'journal_id');
END;
$$;

CREATE CONSTRAINT TRIGGER "payment_status_changes_tenant_match_check"
  AFTER INSERT OR UPDATE OF "organization_id", "payment_id" ON "payment_status_changes"
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('payments', 'payment_id');

CREATE CONSTRAINT TRIGGER "payment_webhook_events_tenant_match_check"
  AFTER INSERT OR UPDATE OF "organization_id", "payment_id" ON "payment_webhook_events"
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('payments', 'payment_id');

CREATE CONSTRAINT TRIGGER "ledger_journal_lines_tenant_match_check"
  AFTER INSERT OR UPDATE OF "organization_id", "journal_id" ON "ledger_journal_lines"
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('ledger_journals', 'journal_id');

CREATE CONSTRAINT TRIGGER "ledger_balances_tenant_match_check"
  AFTER INSERT OR UPDATE OF "organization_id", "account_id" ON "ledger_balances"
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('ledger_accounts', 'account_id');

CREATE CONSTRAINT TRIGGER "reconciliation_expectations_tenant_match_check"
  AFTER INSERT OR UPDATE OF "organization_id", "journal_id" ON "reconciliation_expectations"
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('ledger_journals', 'journal_id');

CREATE CONSTRAINT TRIGGER "settlements_journal_tenant_match_check"
  AFTER INSERT OR UPDATE OF "organization_id", "journal_id" ON "settlements"
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('ledger_journals', 'journal_id');


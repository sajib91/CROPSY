-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('REGISTER', 'UPDATE', 'RESERVE', 'RELEASE', 'DEDUCT', 'ADJUSTMENT', 'DAMAGED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'DEDUCTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FarmerGroupStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISSOLVED');

-- CreateEnum
CREATE TYPE "FarmerGroupMemberRole" AS ENUM ('LEADER', 'MEMBER');

-- CreateEnum
CREATE TYPE "FarmerGroupMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "CooperativeCampaignStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GroupContributionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "GroupPurchaseRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GroupAllocationStatus" AS ENUM ('PROPOSED', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GroupEarningStatus" AS ENUM ('ACCRUED', 'PAID', 'REVERSED');

-- AlterTable
ALTER TABLE "warehouse_inventories" ADD COLUMN     "low_stock_threshold" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "warehouse_inventory_id" UUID,
    "product_id" UUID NOT NULL,
    "movement_type" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "quantity_before" DECIMAL(14,3) NOT NULL,
    "quantity_after" DECIMAL(14,3) NOT NULL,
    "unit_code" VARCHAR(32) NOT NULL,
    "reason" TEXT,
    "reference_key" VARCHAR(128),
    "reference_id" UUID,
    "actor_user_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "warehouse_inventory_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "settled_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "reference_key" VARCHAR(128) NOT NULL,
    "actor_user_id" UUID,
    "expires_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_alerts" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "warehouse_inventory_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "threshold_quantity" DECIMAL(14,3) NOT NULL,
    "available_quantity" DECIMAL(14,3) NOT NULL,
    "status" "InventoryAlertStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledged_by_user_id" UUID,
    "acknowledged_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "inventory_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer_groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "owner_user_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "status" "FarmerGroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "farmer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer_group_members" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "FarmerGroupMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "FarmerGroupMemberStatus" NOT NULL DEFAULT 'PENDING',
    "joined_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "farmer_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cooperative_campaigns" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "group_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "status" "CooperativeCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "unit_code" VARCHAR(16) NOT NULL,
    "allocation_policy_code" VARCHAR(64) NOT NULL DEFAULT 'PROPORTIONAL',
    "allocation_policy_config" JSONB,
    "starts_at" TIMESTAMP(6),
    "ends_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "cooperative_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_contributions" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "group_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "contributor_user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_inventory_id" UUID,
    "quantity" DECIMAL(14,3) NOT NULL,
    "quality_grade_code" VARCHAR(32),
    "unit_code" VARCHAR(16) NOT NULL,
    "status" "GroupContributionStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reference_key" VARCHAR(128),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "group_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_purchase_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "group_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "buyer_user_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_code" VARCHAR(16) NOT NULL,
    "sales_amount" DECIMAL(14,2),
    "currency" CHAR(3),
    "status" "GroupPurchaseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reference_key" VARCHAR(128),
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "group_purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_allocations" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "group_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "purchase_request_id" UUID NOT NULL,
    "contribution_id" UUID NOT NULL,
    "contributor_user_id" UUID NOT NULL,
    "allocated_quantity" DECIMAL(14,3) NOT NULL,
    "unit_code" VARCHAR(16) NOT NULL,
    "status" "GroupAllocationStatus" NOT NULL DEFAULT 'PROPOSED',
    "policy_code" VARCHAR(64) NOT NULL,
    "policy_snapshot" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "group_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_earnings" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "group_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "allocation_id" UUID,
    "contribution_id" UUID,
    "purchase_request_id" UUID,
    "contributor_user_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "GroupEarningStatus" NOT NULL DEFAULT 'ACCRUED',
    "policy_code" VARCHAR(64) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "group_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_reference_key_key" ON "inventory_movements"("reference_key");

-- CreateIndex
CREATE INDEX "inventory_movements_organization_id_created_at_idx" ON "inventory_movements"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_warehouse_id_created_at_idx" ON "inventory_movements"("warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_warehouse_inventory_id_created_at_idx" ON "inventory_movements"("warehouse_inventory_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_product_id_created_at_idx" ON "inventory_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_movement_type_idx" ON "inventory_movements"("movement_type");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reservations_reference_key_key" ON "inventory_reservations"("reference_key");

-- CreateIndex
CREATE INDEX "inventory_reservations_organization_id_status_idx" ON "inventory_reservations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "inventory_reservations_warehouse_inventory_id_status_idx" ON "inventory_reservations"("warehouse_inventory_id", "status");

-- CreateIndex
CREATE INDEX "inventory_reservations_product_id_status_idx" ON "inventory_reservations"("product_id", "status");

-- CreateIndex
CREATE INDEX "inventory_alerts_organization_id_status_idx" ON "inventory_alerts"("organization_id", "status");

-- CreateIndex
CREATE INDEX "inventory_alerts_warehouse_inventory_id_status_idx" ON "inventory_alerts"("warehouse_inventory_id", "status");

-- CreateIndex
CREATE INDEX "inventory_alerts_product_id_status_idx" ON "inventory_alerts"("product_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_groups_code_key" ON "farmer_groups"("code");

-- CreateIndex
CREATE INDEX "farmer_groups_organization_id_status_idx" ON "farmer_groups"("organization_id", "status");

-- CreateIndex
CREATE INDEX "farmer_groups_owner_user_id_idx" ON "farmer_groups"("owner_user_id");

-- CreateIndex
CREATE INDEX "farmer_group_members_user_id_status_idx" ON "farmer_group_members"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_group_members_group_id_user_id_key" ON "farmer_group_members"("group_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cooperative_campaigns_code_key" ON "cooperative_campaigns"("code");

-- CreateIndex
CREATE INDEX "cooperative_campaigns_organization_id_status_idx" ON "cooperative_campaigns"("organization_id", "status");

-- CreateIndex
CREATE INDEX "cooperative_campaigns_group_id_status_idx" ON "cooperative_campaigns"("group_id", "status");

-- CreateIndex
CREATE INDEX "cooperative_campaigns_product_id_idx" ON "cooperative_campaigns"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_contributions_reference_key_key" ON "group_contributions"("reference_key");

-- CreateIndex
CREATE INDEX "group_contributions_organization_id_status_idx" ON "group_contributions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "group_contributions_group_id_campaign_id_idx" ON "group_contributions"("group_id", "campaign_id");

-- CreateIndex
CREATE INDEX "group_contributions_contributor_user_id_status_idx" ON "group_contributions"("contributor_user_id", "status");

-- CreateIndex
CREATE INDEX "group_contributions_product_id_idx" ON "group_contributions"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_purchase_requests_reference_key_key" ON "group_purchase_requests"("reference_key");

-- CreateIndex
CREATE INDEX "group_purchase_requests_organization_id_status_idx" ON "group_purchase_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "group_purchase_requests_group_id_status_idx" ON "group_purchase_requests"("group_id", "status");

-- CreateIndex
CREATE INDEX "group_purchase_requests_campaign_id_status_idx" ON "group_purchase_requests"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "group_allocations_organization_id_status_idx" ON "group_allocations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "group_allocations_campaign_id_status_idx" ON "group_allocations"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "group_allocations_contributor_user_id_status_idx" ON "group_allocations"("contributor_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "group_allocations_purchase_request_id_contribution_id_key" ON "group_allocations"("purchase_request_id", "contribution_id");

-- CreateIndex
CREATE INDEX "group_earnings_organization_id_status_idx" ON "group_earnings"("organization_id", "status");

-- CreateIndex
CREATE INDEX "group_earnings_group_id_contributor_user_id_idx" ON "group_earnings"("group_id", "contributor_user_id");

-- CreateIndex
CREATE INDEX "group_earnings_campaign_id_status_idx" ON "group_earnings"("campaign_id", "status");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_inventory_id_fkey" FOREIGN KEY ("warehouse_inventory_id") REFERENCES "warehouse_inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_warehouse_inventory_id_fkey" FOREIGN KEY ("warehouse_inventory_id") REFERENCES "warehouse_inventories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_warehouse_inventory_id_fkey" FOREIGN KEY ("warehouse_inventory_id") REFERENCES "warehouse_inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_groups" ADD CONSTRAINT "farmer_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_groups" ADD CONSTRAINT "farmer_groups_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_group_members" ADD CONSTRAINT "farmer_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "farmer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_group_members" ADD CONSTRAINT "farmer_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooperative_campaigns" ADD CONSTRAINT "cooperative_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooperative_campaigns" ADD CONSTRAINT "cooperative_campaigns_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "farmer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooperative_campaigns" ADD CONSTRAINT "cooperative_campaigns_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooperative_campaigns" ADD CONSTRAINT "cooperative_campaigns_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_contributions" ADD CONSTRAINT "group_contributions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_contributions" ADD CONSTRAINT "group_contributions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "farmer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_contributions" ADD CONSTRAINT "group_contributions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "cooperative_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_contributions" ADD CONSTRAINT "group_contributions_contributor_user_id_fkey" FOREIGN KEY ("contributor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_contributions" ADD CONSTRAINT "group_contributions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_contributions" ADD CONSTRAINT "group_contributions_warehouse_inventory_id_fkey" FOREIGN KEY ("warehouse_inventory_id") REFERENCES "warehouse_inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_purchase_requests" ADD CONSTRAINT "group_purchase_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_purchase_requests" ADD CONSTRAINT "group_purchase_requests_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "farmer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_purchase_requests" ADD CONSTRAINT "group_purchase_requests_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "cooperative_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_purchase_requests" ADD CONSTRAINT "group_purchase_requests_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_allocations" ADD CONSTRAINT "group_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_allocations" ADD CONSTRAINT "group_allocations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "farmer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_allocations" ADD CONSTRAINT "group_allocations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "cooperative_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_allocations" ADD CONSTRAINT "group_allocations_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "group_purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_allocations" ADD CONSTRAINT "group_allocations_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "group_contributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_allocations" ADD CONSTRAINT "group_allocations_contributor_user_id_fkey" FOREIGN KEY ("contributor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_earnings" ADD CONSTRAINT "group_earnings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_earnings" ADD CONSTRAINT "group_earnings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "farmer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_earnings" ADD CONSTRAINT "group_earnings_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "cooperative_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_earnings" ADD CONSTRAINT "group_earnings_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "group_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_earnings" ADD CONSTRAINT "group_earnings_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "group_contributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_earnings" ADD CONSTRAINT "group_earnings_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "group_purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_earnings" ADD CONSTRAINT "group_earnings_contributor_user_id_fkey" FOREIGN KEY ("contributor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Inventory invariants. Application code uses the atomic functions below;
-- these constraints are the final guarantee for any direct database writer.
-- ---------------------------------------------------------------------------

ALTER TABLE "warehouse_inventories"
  ADD CONSTRAINT "warehouse_inventories_quantity_on_hand_nonnegative" CHECK ("quantity_on_hand" >= 0),
  ADD CONSTRAINT "warehouse_inventories_quantity_reserved_nonnegative" CHECK ("quantity_reserved" >= 0),
  ADD CONSTRAINT "warehouse_inventories_reserved_not_exceed_on_hand" CHECK ("quantity_reserved" <= "quantity_on_hand"),
  ADD CONSTRAINT "warehouse_inventories_available_matches" CHECK ("available_quantity" = "quantity_on_hand" - "quantity_reserved"),
  ADD CONSTRAINT "warehouse_inventories_low_stock_threshold_nonnegative" CHECK ("low_stock_threshold" >= 0);

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "inventory_movements_quantity_before_nonnegative" CHECK ("quantity_before" >= 0),
  ADD CONSTRAINT "inventory_movements_quantity_after_nonnegative" CHECK ("quantity_after" >= 0);

ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "inventory_reservations_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "inventory_reservations_settled_nonnegative" CHECK ("settled_quantity" >= 0),
  ADD CONSTRAINT "inventory_reservations_settled_not_exceed_quantity" CHECK ("settled_quantity" <= "quantity");

ALTER TABLE "inventory_alerts"
  ADD CONSTRAINT "inventory_alerts_threshold_nonnegative" CHECK ("threshold_quantity" >= 0),
  ADD CONSTRAINT "inventory_alerts_available_nonnegative" CHECK ("available_quantity" >= 0);

ALTER TABLE "group_contributions"
  ADD CONSTRAINT "group_contributions_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "group_purchase_requests"
  ADD CONSTRAINT "group_purchase_requests_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "group_allocations"
  ADD CONSTRAINT "group_allocations_quantity_positive" CHECK ("allocated_quantity" > 0);

-- Only one open low-stock alert per warehouse inventory row.
CREATE UNIQUE INDEX "inventory_alerts_one_open_per_inventory"
  ON "inventory_alerts" ("warehouse_inventory_id")
  WHERE "status" = 'OPEN';

-- Movement history is append-only.
CREATE FUNCTION "cropsy_prevent_inventory_movement_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Inventory movement history is append-only'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_movements_append_only"
  BEFORE UPDATE OR DELETE ON "inventory_movements"
  FOR EACH ROW EXECUTE FUNCTION "cropsy_prevent_inventory_movement_mutation"();

CREATE TRIGGER "inventory_movements_no_truncate"
  BEFORE TRUNCATE ON "inventory_movements"
  FOR EACH STATEMENT EXECUTE FUNCTION "cropsy_prevent_inventory_movement_mutation"();

-- Atomic stock movement application. SELECT ... FOR UPDATE serializes all
-- movement modes for the same inventory row; the CHECK constraints remain the
-- final guarantee. Low-stock alerts are maintained inside the same transaction.
CREATE FUNCTION "cropsy_apply_warehouse_stock_movement"(
  p_inventory_id uuid,
  p_movement_type text,
  p_mode text,
  p_delta numeric(14,3),
  p_unit_code varchar(32),
  p_reason text,
  p_reference_key varchar(128),
  p_actor_user_id uuid
) RETURNS TABLE (
  movement_id uuid,
  inventory_id uuid,
  quantity_before numeric(14,3),
  quantity_after numeric(14,3),
  quantity_on_hand numeric(14,3),
  quantity_reserved numeric(14,3),
  available_quantity numeric(14,3),
  alert_id uuid
) AS $$
DECLARE
  v_inventory "warehouse_inventories"%ROWTYPE;
  v_organization_id uuid;
  v_before_available numeric(14,3);
  v_new_on_hand numeric(14,3);
  v_new_reserved numeric(14,3);
  v_movement_id uuid;
  v_alert_id uuid;
BEGIN
  IF p_inventory_id IS NULL OR p_movement_type IS NULL OR p_mode IS NULL THEN
    RAISE EXCEPTION 'Stock movement identifiers are required' USING ERRCODE = '22004';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Stock movement quantity must be non-zero' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_inventory
  FROM "warehouse_inventories" WHERE "id" = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Warehouse inventory % does not exist', p_inventory_id
      USING ERRCODE = '23503';
  END IF;
  SELECT "organization_id" INTO v_organization_id
  FROM "warehouses" WHERE "id" = v_inventory."warehouse_id";

  v_before_available := v_inventory."available_quantity";
  v_new_on_hand := v_inventory."quantity_on_hand";
  v_new_reserved := v_inventory."quantity_reserved";

  IF p_mode = 'ON_HAND_DELTA' THEN
    IF p_delta < 0 AND v_inventory."available_quantity" < -p_delta THEN
      RAISE EXCEPTION 'Insufficient available stock in warehouse inventory %', p_inventory_id
        USING ERRCODE = '23514';
    END IF;
    v_new_on_hand := v_inventory."quantity_on_hand" + p_delta;
  ELSIF p_mode = 'SET_ON_HAND' THEN
    IF p_delta < 0 THEN
      RAISE EXCEPTION 'On-hand quantity cannot be negative' USING ERRCODE = '23514';
    END IF;
    IF p_delta < v_new_reserved THEN
      RAISE EXCEPTION 'On-hand quantity cannot be below reserved stock' USING ERRCODE = '23514';
    END IF;
    v_new_on_hand := p_delta;
  ELSIF p_mode = 'RESERVE' THEN
    IF p_delta <= 0 OR v_inventory."available_quantity" < p_delta THEN
      RAISE EXCEPTION 'Insufficient available stock in warehouse inventory %', p_inventory_id
        USING ERRCODE = '23514';
    END IF;
    v_new_reserved := v_inventory."quantity_reserved" + p_delta;
  ELSIF p_mode = 'RELEASE' THEN
    IF p_delta <= 0 OR v_inventory."quantity_reserved" < p_delta THEN
      RAISE EXCEPTION 'Cannot release more than reserved stock in warehouse inventory %', p_inventory_id
        USING ERRCODE = '23514';
    END IF;
    v_new_reserved := v_inventory."quantity_reserved" - p_delta;
  ELSIF p_mode = 'DEDUCT_RESERVED' THEN
    IF p_delta <= 0 OR v_inventory."quantity_reserved" < p_delta THEN
      RAISE EXCEPTION 'Cannot deduct more than reserved stock in warehouse inventory %', p_inventory_id
        USING ERRCODE = '23514';
    END IF;
    v_new_on_hand := v_inventory."quantity_on_hand" - p_delta;
    v_new_reserved := v_inventory."quantity_reserved" - p_delta;
  ELSIF p_mode = 'DEDUCT_AVAILABLE' THEN
    IF p_delta <= 0 OR v_inventory."available_quantity" < p_delta THEN
      RAISE EXCEPTION 'Insufficient available stock in warehouse inventory %', p_inventory_id
        USING ERRCODE = '23514';
    END IF;
    v_new_on_hand := v_inventory."quantity_on_hand" - p_delta;
  ELSE
    RAISE EXCEPTION 'Unknown stock movement mode %', p_mode USING ERRCODE = '22023';
  END IF;

  UPDATE "warehouse_inventories"
  SET "quantity_on_hand" = v_new_on_hand,
      "quantity_reserved" = v_new_reserved,
      "available_quantity" = v_new_on_hand - v_new_reserved,
      "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = p_inventory_id
  RETURNING * INTO v_inventory;

  v_movement_id := gen_random_uuid();
  INSERT INTO "inventory_movements" (
    "id", "organization_id", "warehouse_id", "warehouse_inventory_id", "product_id",
    "movement_type", "quantity", "quantity_before", "quantity_after", "unit_code",
    "reason", "reference_key", "actor_user_id", "created_at"
  ) VALUES (
    v_movement_id, v_organization_id, v_inventory."warehouse_id", v_inventory."id",
    v_inventory."product_id", p_movement_type::"InventoryMovementType", abs(p_delta),
    v_before_available, v_inventory."available_quantity", p_unit_code, p_reason,
    p_reference_key, p_actor_user_id, CURRENT_TIMESTAMP
  );

  IF v_inventory."available_quantity" < v_inventory."low_stock_threshold" THEN
    SELECT "id" INTO v_alert_id
    FROM "inventory_alerts"
    WHERE "warehouse_inventory_id" = p_inventory_id AND "status" = 'OPEN'
    LIMIT 1;
    IF v_alert_id IS NULL THEN
      v_alert_id := gen_random_uuid();
      INSERT INTO "inventory_alerts" (
        "id", "organization_id", "warehouse_id", "warehouse_inventory_id", "product_id",
        "threshold_quantity", "available_quantity", "status", "created_at", "updated_at"
      ) VALUES (
        v_alert_id, v_organization_id, v_inventory."warehouse_id", v_inventory."id",
        v_inventory."product_id", v_inventory."low_stock_threshold",
        v_inventory."available_quantity", 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
    ELSE
      UPDATE "inventory_alerts"
      SET "available_quantity" = v_inventory."available_quantity",
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = v_alert_id;
    END IF;
  ELSE
    UPDATE "inventory_alerts"
    SET "status" = 'RESOLVED', "updated_at" = CURRENT_TIMESTAMP
    WHERE "warehouse_inventory_id" = p_inventory_id AND "status" = 'OPEN';
  END IF;

  RETURN QUERY SELECT
    v_movement_id,
    v_inventory."id",
    (SELECT im."quantity_before" FROM "inventory_movements" AS im WHERE im."id" = v_movement_id),
    v_inventory."available_quantity",
    v_inventory."quantity_on_hand",
    v_inventory."quantity_reserved",
    v_inventory."available_quantity",
    v_alert_id;
END;
$$ LANGUAGE plpgsql;

-- Reservation settlement is serialized per reservation row and writes both the
-- reservation state and its stock movement in one transaction.
CREATE FUNCTION "cropsy_settle_inventory_reservation"(
  p_reservation_id uuid,
  p_action text,
  p_quantity numeric(14,3),
  p_reason text,
  p_movement_reference_key varchar(128),
  p_actor_user_id uuid
) RETURNS TABLE (
  reservation_id uuid,
  status "InventoryReservationStatus",
  settled_quantity numeric(14,3),
  remaining_quantity numeric(14,3),
  movement_id uuid
) AS $$
DECLARE
  v_reservation "inventory_reservations"%ROWTYPE;
  v_unit_code varchar(16);
  v_remaining numeric(14,3);
  v_movement record;
  v_status text;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Settlement quantity must be positive' USING ERRCODE = '23514';
  END IF;
  IF p_action NOT IN ('RELEASE', 'DEDUCT') THEN
    RAISE EXCEPTION 'Unknown reservation settlement action %', p_action USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_reservation
  FROM "inventory_reservations" WHERE "id" = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory reservation % does not exist', p_reservation_id
      USING ERRCODE = '23503';
  END IF;
  IF v_reservation."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Inventory reservation % is no longer active', p_reservation_id
      USING ERRCODE = '23514';
  END IF;
  SELECT "unit_code" INTO v_unit_code
  FROM "warehouse_inventories" WHERE "id" = v_reservation."warehouse_inventory_id";

  v_remaining := v_reservation."quantity" - v_reservation."settled_quantity";
  IF p_quantity > v_remaining THEN
    RAISE EXCEPTION 'Cannot settle more than the remaining reserved quantity'
      USING ERRCODE = '23514';
  END IF;

  IF p_action = 'RELEASE' THEN
    SELECT * INTO v_movement FROM "cropsy_apply_warehouse_stock_movement"(
      v_reservation."warehouse_inventory_id", 'RELEASE', 'RELEASE', p_quantity,
      v_unit_code, p_reason, p_movement_reference_key, p_actor_user_id
    ) AS m;
  ELSE
    SELECT * INTO v_movement FROM "cropsy_apply_warehouse_stock_movement"(
      v_reservation."warehouse_inventory_id", 'DEDUCT', 'DEDUCT_RESERVED', p_quantity,
      v_unit_code, p_reason, p_movement_reference_key, p_actor_user_id
    ) AS m;
  END IF;

  v_status := CASE
    WHEN v_reservation."settled_quantity" + p_quantity >= v_reservation."quantity" THEN
      CASE WHEN p_action = 'RELEASE' THEN 'RELEASED' ELSE 'DEDUCTED' END
    ELSE 'ACTIVE'
  END;

  UPDATE "inventory_reservations" AS ir
  SET "settled_quantity" = ir."settled_quantity" + p_quantity,
      "status" = v_status::"InventoryReservationStatus",
      "updated_at" = CURRENT_TIMESTAMP
  WHERE ir."id" = p_reservation_id
  RETURNING * INTO v_reservation;

  RETURN QUERY SELECT
    v_reservation."id",
    v_reservation."status",
    v_reservation."settled_quantity",
    v_reservation."quantity" - v_reservation."settled_quantity",
    v_movement.movement_id;
END;
$$ LANGUAGE plpgsql;


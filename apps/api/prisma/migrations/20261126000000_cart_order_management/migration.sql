-- Cart and order management: parent checkout aggregate, seller-specific
-- fulfillment orders, append-only status history, and atomic listing stock
-- decrement/restore. No fee, discount, tax, or commission policy is seeded.

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "pricing_snapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "purchase_group_id" UUID;

-- CreateTable
CREATE TABLE "purchase_groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "buyer_user_id" UUID NOT NULL,
    "cart_id" UUID,
    "reference_key" VARCHAR(255) NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "subtotal_amount" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "delivery_fee_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "pricing_snapshot" JSONB NOT NULL DEFAULT '{}',
    "placed_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "purchase_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_changes" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "purchase_group_id" UUID,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_groups_reference_key_key" ON "purchase_groups"("reference_key");

-- CreateIndex
CREATE INDEX "purchase_groups_organization_id_status_idx" ON "purchase_groups"("organization_id", "status");

-- CreateIndex
CREATE INDEX "purchase_groups_buyer_user_id_placed_at_idx" ON "purchase_groups"("buyer_user_id", "placed_at");

-- CreateIndex
CREATE INDEX "purchase_groups_cart_id_idx" ON "purchase_groups"("cart_id");

-- CreateIndex
CREATE INDEX "order_status_changes_organization_id_created_at_idx" ON "order_status_changes"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "order_status_changes_purchase_group_id_created_at_idx" ON "order_status_changes"("purchase_group_id", "created_at");

-- CreateIndex
CREATE INDEX "order_status_changes_order_id_created_at_idx" ON "order_status_changes"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_purchase_group_id_idx" ON "orders"("purchase_group_id");

-- AddForeignKey
ALTER TABLE "purchase_groups" ADD CONSTRAINT "purchase_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_groups" ADD CONSTRAINT "purchase_groups_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_groups" ADD CONSTRAINT "purchase_groups_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_purchase_group_id_fkey" FOREIGN KEY ("purchase_group_id") REFERENCES "purchase_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_changes" ADD CONSTRAINT "order_status_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_changes" ADD CONSTRAINT "order_status_changes_purchase_group_id_fkey" FOREIGN KEY ("purchase_group_id") REFERENCES "purchase_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_changes" ADD CONSTRAINT "order_status_changes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_changes" ADD CONSTRAINT "order_status_changes_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Checkout totals are always derived from server-calculated line amounts.
ALTER TABLE "purchase_groups" ADD CONSTRAINT "purchase_groups_amounts_nonnegative_check" CHECK (
  "subtotal_amount" >= 0
  AND "discount_amount" >= 0
  AND "delivery_fee_amount" >= 0
  AND "tax_amount" >= 0
  AND "total_amount" >= 0
  AND "discount_amount" <= "subtotal_amount"
);
ALTER TABLE "purchase_groups" ADD CONSTRAINT "purchase_groups_total_check" CHECK (
  "total_amount" = "subtotal_amount" - "discount_amount" + "delivery_fee_amount" + "tax_amount"
);
ALTER TABLE "order_status_changes" ADD CONSTRAINT "order_status_changes_transition_check" CHECK (
  "from_status" IS DISTINCT FROM "to_status"
);
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_quantity_available_check" CHECK (
  "quantity_available" >= 0
);

-- Multi-tenant consistency for the new parent and history rows. Existing
-- tenant helper functions are defined in the review-hardening migration.
DO $$
BEGIN
  PERFORM "cropsy_assert_tenant_match"('purchase_groups', 'carts', 'cart_id');
  PERFORM "cropsy_assert_tenant_match"('orders', 'purchase_groups', 'purchase_group_id');
  PERFORM "cropsy_assert_tenant_match"('order_status_changes', 'orders', 'order_id');
  PERFORM "cropsy_assert_tenant_match"('order_status_changes', 'purchase_groups', 'purchase_group_id');
END;
$$;

CREATE CONSTRAINT TRIGGER "purchase_groups_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "cart_id" ON "purchase_groups"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('carts', 'cart_id');

CREATE CONSTRAINT TRIGGER "orders_purchase_group_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "purchase_group_id" ON "orders"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('purchase_groups', 'purchase_group_id');

CREATE CONSTRAINT TRIGGER "order_status_changes_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "purchase_group_id", "order_id" ON "order_status_changes"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('purchase_groups', 'purchase_group_id', 'orders', 'order_id');

CREATE CONSTRAINT TRIGGER "purchase_groups_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "purchase_groups"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"(
  'orders', 'purchase_group_id',
  'order_status_changes', 'purchase_group_id'
);

-- Status history is an immutable ledger of transitions.
CREATE FUNCTION "cropsy_prevent_order_status_change_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Order status history is append-only'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "order_status_changes_append_only"
  BEFORE UPDATE OR DELETE ON "order_status_changes"
  FOR EACH ROW EXECUTE FUNCTION "cropsy_prevent_order_status_change_mutation"();

CREATE TRIGGER "order_status_changes_no_truncate"
  BEFORE TRUNCATE ON "order_status_changes"
  FOR EACH STATEMENT EXECUTE FUNCTION "cropsy_prevent_order_status_change_mutation"();

-- Atomic, serialized listing availability updates. Row locks prevent two
-- concurrent checkouts from overselling the same listing.
CREATE FUNCTION "cropsy_decrement_listing_availability"(
  p_listing_id uuid,
  p_quantity numeric(14,3)
) RETURNS void AS $$
DECLARE
  v_available numeric(14,3);
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Decrement quantity must be positive'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT "quantity_available" INTO v_available
  FROM "product_listings"
  WHERE "id" = p_listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing was not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Insufficient listing availability'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE "product_listings"
  SET "quantity_available" = "quantity_available" - p_quantity,
      "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = p_listing_id;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "cropsy_restore_listing_availability"(
  p_listing_id uuid,
  p_quantity numeric(14,3)
) RETURNS void AS $$
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Restore quantity must be positive'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE "product_listings"
  SET "quantity_available" = "quantity_available" + p_quantity,
      "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = p_listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing was not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
END;
$$ LANGUAGE plpgsql;

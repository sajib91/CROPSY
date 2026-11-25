-- ---------------------------------------------------------------------------
-- Database engineering review hardening (follow-up to 20261125000000_init).
--
-- The baseline migration is intentionally left unchanged. This migration adds
-- review-driven indexes, tenant consistency guards, financial state checks,
-- ledger balance/reversal rules, audit immutability, and atomic inventory
-- reservation helpers.
-- ---------------------------------------------------------------------------

-- 1. B-tree indexes derived from the Prisma schema diff. These close FK
-- leading-column gaps and add a global outbox polling index.
-- CreateIndex
CREATE INDEX "agent_executions_initiated_by_user_id_idx" ON "agent_executions"("initiated_by_user_id");

-- CreateIndex
CREATE INDEX "ai_feedback_user_id_idx" ON "ai_feedback"("user_id");

-- CreateIndex
CREATE INDEX "ai_recommendations_user_id_idx" ON "ai_recommendations"("user_id");

-- CreateIndex
CREATE INDEX "cart_items_listing_id_idx" ON "cart_items"("listing_id");

-- CreateIndex
CREATE INDEX "conversations_user_id_idx" ON "conversations"("user_id");

-- CreateIndex
CREATE INDEX "cultivations_land_parcel_id_idx" ON "cultivations"("land_parcel_id");

-- CreateIndex
CREATE INDEX "cultivations_crop_variety_id_idx" ON "cultivations"("crop_variety_id");

-- CreateIndex
CREATE INDEX "cultivations_crop_season_id_idx" ON "cultivations"("crop_season_id");

-- CreateIndex
CREATE INDEX "cultivations_crop_id_idx" ON "cultivations"("crop_id");

-- CreateIndex
CREATE INDEX "farm_activities_cultivation_id_idx" ON "farm_activities"("cultivation_id");

-- CreateIndex
CREATE INDEX "farm_activities_land_parcel_id_idx" ON "farm_activities"("land_parcel_id");

-- CreateIndex
CREATE INDEX "farm_activities_input_id_idx" ON "farm_activities"("input_id");

-- CreateIndex
CREATE INDEX "farm_activities_performed_by_user_id_idx" ON "farm_activities"("performed_by_user_id");

-- CreateIndex
CREATE INDEX "farm_locations_district_id_idx" ON "farm_locations"("district_id");

-- CreateIndex
CREATE INDEX "farm_locations_upazila_id_idx" ON "farm_locations"("upazila_id");

-- CreateIndex
CREATE INDEX "farm_locations_union_id_idx" ON "farm_locations"("union_id");

-- CreateIndex
CREATE INDEX "farmer_profiles_primary_crop_id_idx" ON "farmer_profiles"("primary_crop_id");

-- CreateIndex
CREATE INDEX "farms_farmer_profile_id_idx" ON "farms"("farmer_profile_id");

-- CreateIndex
CREATE INDEX "harvests_farm_id_idx" ON "harvests"("farm_id");

-- CreateIndex
CREATE INDEX "ledger_entries_reversal_of_id_idx" ON "ledger_entries"("reversal_of_id");

-- CreateIndex
CREATE INDEX "listing_locations_listing_id_idx" ON "listing_locations"("listing_id");

-- CreateIndex
CREATE INDEX "listing_locations_district_id_idx" ON "listing_locations"("district_id");

-- CreateIndex
CREATE INDEX "listing_locations_upazila_id_idx" ON "listing_locations"("upazila_id");

-- CreateIndex
CREATE INDEX "listing_locations_union_id_idx" ON "listing_locations"("union_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "order_items_listing_id_idx" ON "order_items"("listing_id");

-- CreateIndex
CREATE INDEX "organization_addresses_district_id_idx" ON "organization_addresses"("district_id");

-- CreateIndex
CREATE INDEX "organization_addresses_upazila_id_idx" ON "organization_addresses"("upazila_id");

-- CreateIndex
CREATE INDEX "organization_addresses_union_id_idx" ON "organization_addresses"("union_id");

-- CreateIndex
CREATE INDEX "organization_invitations_role_id_idx" ON "organization_invitations"("role_id");

-- CreateIndex
CREATE INDEX "organization_invitations_invited_by_user_id_idx" ON "organization_invitations"("invited_by_user_id");

-- CreateIndex
CREATE INDEX "otp_verifications_user_id_idx" ON "otp_verifications"("user_id");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "payments_user_id_status_idx" ON "payments"("user_id", "status");

-- CreateIndex
CREATE INDEX "product_listings_inventory_id_idx" ON "product_listings"("inventory_id");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_farmer_profile_id_idx" ON "products"("farmer_profile_id");

-- CreateIndex
CREATE INDEX "quality_inspections_warehouse_inventory_id_idx" ON "quality_inspections"("warehouse_inventory_id");

-- CreateIndex
CREATE INDEX "quality_inspections_inspector_user_id_idx" ON "quality_inspections"("inspector_user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_rotated_to_id_idx" ON "refresh_tokens"("rotated_to_id");

-- CreateIndex
CREATE INDEX "shipments_pickup_address_id_idx" ON "shipments"("pickup_address_id");

-- CreateIndex
CREATE INDEX "shipments_destination_address_id_idx" ON "shipments"("destination_address_id");

-- CreateIndex
CREATE INDEX "traceability_records_cultivation_id_idx" ON "traceability_records"("cultivation_id");

-- CreateIndex
CREATE INDEX "user_addresses_district_id_idx" ON "user_addresses"("district_id");

-- CreateIndex
CREATE INDEX "user_addresses_upazila_id_idx" ON "user_addresses"("upazila_id");

-- CreateIndex
CREATE INDEX "user_addresses_union_id_idx" ON "user_addresses"("union_id");

-- CreateIndex
CREATE INDEX "user_roles_granted_by_user_id_idx" ON "user_roles"("granted_by_user_id");

-- CreateIndex
CREATE INDEX "warehouses_manager_user_id_idx" ON "warehouses"("manager_user_id");

-- CreateIndex
CREATE INDEX "warehouses_address_id_idx" ON "warehouses"("address_id");

-- CreateIndex
CREATE INDEX "warehouses_district_id_idx" ON "warehouses"("district_id");

-- CreateIndex
CREATE INDEX "warehouses_upazila_id_idx" ON "warehouses"("upazila_id");

-- CreateIndex
CREATE INDEX "warehouses_union_id_idx" ON "warehouses"("union_id");

-- 2. Multi-tenant consistency.
--
-- Child rows with an organization_id must match the organization_id of any
-- tenant-owned parent they reference. Platform-scoped parents (organization_id
-- IS NULL) may be referenced from any tenant. Rows that do not carry their own
-- organization_id inherit tenant scope through their parent and are excluded
-- from these guards.
CREATE FUNCTION "cropsy_assert_tenant_match"(
  p_child_table text,
  p_parent_table text,
  p_fk_column text
) RETURNS void AS $$
DECLARE
  v_bad_id uuid;
BEGIN
  EXECUTE format(
    'SELECT c."id" FROM %I c JOIN %I p ON p."id" = c.%I
     WHERE p."organization_id" IS NOT NULL
       AND c."organization_id" IS DISTINCT FROM p."organization_id"
     LIMIT 1',
    p_child_table,
    p_parent_table,
    p_fk_column
  ) INTO v_bad_id;

  -- EXECUTE ... INTO does not set FOUND; the selected id is non-null when a
  -- violating row exists.
  IF v_bad_id IS NOT NULL THEN
    RAISE EXCEPTION 'Existing tenant mismatch in %.% (row %)',
      p_child_table, p_fk_column, v_bad_id
      USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  PERFORM "cropsy_assert_tenant_match"('land_parcels', 'farms', 'farm_id');
  PERFORM "cropsy_assert_tenant_match"('cultivations', 'farms', 'farm_id');
  PERFORM "cropsy_assert_tenant_match"('cultivations', 'land_parcels', 'land_parcel_id');
  PERFORM "cropsy_assert_tenant_match"('cultivations', 'crop_seasons', 'crop_season_id');
  PERFORM "cropsy_assert_tenant_match"('farm_activities', 'farms', 'farm_id');
  PERFORM "cropsy_assert_tenant_match"('farm_activities', 'cultivations', 'cultivation_id');
  PERFORM "cropsy_assert_tenant_match"('farm_activities', 'land_parcels', 'land_parcel_id');
  PERFORM "cropsy_assert_tenant_match"('farm_activities', 'agricultural_inputs', 'input_id');
  PERFORM "cropsy_assert_tenant_match"('harvests', 'farms', 'farm_id');
  PERFORM "cropsy_assert_tenant_match"('harvests', 'cultivations', 'cultivation_id');
  PERFORM "cropsy_assert_tenant_match"('product_categories', 'product_categories', 'parent_id');
  PERFORM "cropsy_assert_tenant_match"('products', 'product_categories', 'category_id');
  PERFORM "cropsy_assert_tenant_match"('products', 'farmer_profiles', 'farmer_profile_id');
  PERFORM "cropsy_assert_tenant_match"('product_inventories', 'products', 'product_id');
  PERFORM "cropsy_assert_tenant_match"('product_inventories', 'warehouses', 'warehouse_id');
  PERFORM "cropsy_assert_tenant_match"('product_listings', 'products', 'product_id');
  PERFORM "cropsy_assert_tenant_match"('product_listings', 'product_inventories', 'inventory_id');
  PERFORM "cropsy_assert_tenant_match"('price_history', 'products', 'product_id');
  PERFORM "cropsy_assert_tenant_match"('price_history', 'product_listings', 'listing_id');
  PERFORM "cropsy_assert_tenant_match"('orders', 'carts', 'cart_id');
  PERFORM "cropsy_assert_tenant_match"('payments', 'orders', 'order_id');
  PERFORM "cropsy_assert_tenant_match"('refunds', 'payments', 'payment_id');
  PERFORM "cropsy_assert_tenant_match"('refunds', 'orders', 'order_id');
  PERFORM "cropsy_assert_tenant_match"('transactions', 'payments', 'payment_id');
  PERFORM "cropsy_assert_tenant_match"('transactions', 'refunds', 'refund_id');
  PERFORM "cropsy_assert_tenant_match"('transactions', 'orders', 'order_id');
  PERFORM "cropsy_assert_tenant_match"('ledger_entries', 'transactions', 'transaction_id');
  PERFORM "cropsy_assert_tenant_match"('ledger_entries', 'ledger_accounts', 'account_id');
  PERFORM "cropsy_assert_tenant_match"('ledger_entries', 'orders', 'order_id');
  PERFORM "cropsy_assert_tenant_match"('ledger_entries', 'settlements', 'settlement_id');
  PERFORM "cropsy_assert_tenant_match"('ledger_entries', 'ledger_entries', 'reversal_of_id');
  PERFORM "cropsy_assert_tenant_match"('commissions', 'orders', 'order_id');
  PERFORM "cropsy_assert_tenant_match"('commissions', 'settlements', 'settlement_id');
  PERFORM "cropsy_assert_tenant_match"('shipments', 'orders', 'order_id');
  PERFORM "cropsy_assert_tenant_match"('shipments', 'organization_addresses', 'pickup_address_id');
  PERFORM "cropsy_assert_tenant_match"('shipments', 'organization_addresses', 'destination_address_id');
  PERFORM "cropsy_assert_tenant_match"('warehouses', 'organization_addresses', 'address_id');
  PERFORM "cropsy_assert_tenant_match"('quality_inspections', 'shipments', 'shipment_id');
  PERFORM "cropsy_assert_tenant_match"('quality_inspections', 'products', 'product_id');
  PERFORM "cropsy_assert_tenant_match"('traceability_records', 'products', 'product_id');
  PERFORM "cropsy_assert_tenant_match"('traceability_records', 'harvests', 'harvest_id');
  PERFORM "cropsy_assert_tenant_match"('traceability_records', 'cultivations', 'cultivation_id');
  PERFORM "cropsy_assert_tenant_match"('traceability_records', 'shipments', 'shipment_id');
  PERFORM "cropsy_assert_tenant_match"('knowledge_documents', 'knowledge_sources', 'source_id');
  PERFORM "cropsy_assert_tenant_match"('ai_recommendations', 'conversations', 'conversation_id');
  PERFORM "cropsy_assert_tenant_match"('agent_executions', 'conversations', 'conversation_id');
  PERFORM "cropsy_assert_tenant_match"('ai_feedback', 'ai_recommendations', 'recommendation_id');
  PERFORM "cropsy_assert_tenant_match"('ai_feedback', 'agent_executions', 'agent_execution_id');
  PERFORM "cropsy_assert_tenant_match"('subscription_invoices', 'subscriptions', 'subscription_id');
  PERFORM "cropsy_assert_tenant_match"('usage_records', 'subscriptions', 'subscription_id');
END;
$$;

CREATE FUNCTION "cropsy_enforce_tenant_match"() RETURNS trigger AS $$
DECLARE
  v_pair_count integer := TG_NARGS / 2;
  v_index integer;
  v_parent_table text;
  v_fk_column text;
  v_parent_org uuid;
  v_child_org uuid;
BEGIN
  IF TG_NARGS = 0 OR TG_NARGS % 2 <> 0 THEN
    RAISE EXCEPTION 'Invalid tenant match trigger configuration for %', TG_TABLE_NAME;
  END IF;

  v_child_org := NEW."organization_id";

  FOR v_index IN 0..v_pair_count - 1 LOOP
    v_parent_table := TG_ARGV[v_index * 2];
    v_fk_column := TG_ARGV[v_index * 2 + 1];

    EXECUTE format(
      'SELECT "organization_id" FROM %I WHERE "id" = ($1::jsonb->>%L)::uuid',
      v_parent_table,
      v_fk_column
    ) INTO v_parent_org USING to_jsonb(NEW);

    -- A NULL parent organization means a platform-scoped parent, which any
    -- tenant may reference. EXECUTE ... INTO does not set FOUND; the FK
    -- already guarantees that a non-null parent id exists.
    IF v_parent_org IS NOT NULL AND v_child_org IS DISTINCT FROM v_parent_org THEN
      RAISE EXCEPTION 'Tenant mismatch: %.% references % owned by another organization',
        TG_TABLE_NAME, v_fk_column, v_parent_table
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "land_parcels_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "farm_id" ON "land_parcels"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('farms', 'farm_id');

CREATE CONSTRAINT TRIGGER "cultivations_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "farm_id", "land_parcel_id", "crop_season_id" ON "cultivations"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('farms', 'farm_id', 'land_parcels', 'land_parcel_id', 'crop_seasons', 'crop_season_id');

CREATE CONSTRAINT TRIGGER "farm_activities_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "farm_id", "cultivation_id", "land_parcel_id", "input_id" ON "farm_activities"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('farms', 'farm_id', 'cultivations', 'cultivation_id', 'land_parcels', 'land_parcel_id', 'agricultural_inputs', 'input_id');

CREATE CONSTRAINT TRIGGER "harvests_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "farm_id", "cultivation_id" ON "harvests"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('farms', 'farm_id', 'cultivations', 'cultivation_id');

CREATE CONSTRAINT TRIGGER "product_categories_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "parent_id" ON "product_categories"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('product_categories', 'parent_id');

CREATE CONSTRAINT TRIGGER "products_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "category_id", "farmer_profile_id" ON "products"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('product_categories', 'category_id', 'farmer_profiles', 'farmer_profile_id');

CREATE CONSTRAINT TRIGGER "product_inventories_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "product_id", "warehouse_id" ON "product_inventories"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('products', 'product_id', 'warehouses', 'warehouse_id');

CREATE CONSTRAINT TRIGGER "product_listings_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "product_id", "inventory_id" ON "product_listings"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('products', 'product_id', 'product_inventories', 'inventory_id');

CREATE CONSTRAINT TRIGGER "price_history_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "product_id", "listing_id" ON "price_history"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('products', 'product_id', 'product_listings', 'listing_id');

CREATE CONSTRAINT TRIGGER "orders_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "cart_id" ON "orders"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('carts', 'cart_id');

CREATE CONSTRAINT TRIGGER "payments_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "order_id" ON "payments"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('orders', 'order_id');

CREATE CONSTRAINT TRIGGER "refunds_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "payment_id", "order_id" ON "refunds"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('payments', 'payment_id', 'orders', 'order_id');

CREATE CONSTRAINT TRIGGER "transactions_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "payment_id", "refund_id", "order_id" ON "transactions"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('payments', 'payment_id', 'refunds', 'refund_id', 'orders', 'order_id');

CREATE CONSTRAINT TRIGGER "ledger_entries_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "transaction_id", "account_id", "order_id", "settlement_id", "reversal_of_id" ON "ledger_entries"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('transactions', 'transaction_id', 'ledger_accounts', 'account_id', 'orders', 'order_id', 'settlements', 'settlement_id', 'ledger_entries', 'reversal_of_id');

CREATE CONSTRAINT TRIGGER "commissions_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "order_id", "settlement_id" ON "commissions"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('orders', 'order_id', 'settlements', 'settlement_id');

CREATE CONSTRAINT TRIGGER "shipments_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "order_id", "pickup_address_id", "destination_address_id" ON "shipments"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('orders', 'order_id', 'organization_addresses', 'pickup_address_id', 'organization_addresses', 'destination_address_id');

CREATE CONSTRAINT TRIGGER "warehouses_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "address_id" ON "warehouses"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('organization_addresses', 'address_id');

CREATE CONSTRAINT TRIGGER "quality_inspections_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "shipment_id", "product_id" ON "quality_inspections"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('shipments', 'shipment_id', 'products', 'product_id');

CREATE CONSTRAINT TRIGGER "traceability_records_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "product_id", "harvest_id", "cultivation_id", "shipment_id" ON "traceability_records"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('products', 'product_id', 'harvests', 'harvest_id', 'cultivations', 'cultivation_id', 'shipments', 'shipment_id');

CREATE CONSTRAINT TRIGGER "knowledge_documents_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "source_id" ON "knowledge_documents"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('knowledge_sources', 'source_id');

CREATE CONSTRAINT TRIGGER "ai_recommendations_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "conversation_id" ON "ai_recommendations"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('conversations', 'conversation_id');

CREATE CONSTRAINT TRIGGER "agent_executions_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "conversation_id" ON "agent_executions"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('conversations', 'conversation_id');

CREATE CONSTRAINT TRIGGER "ai_feedback_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "recommendation_id", "agent_execution_id" ON "ai_feedback"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('ai_recommendations', 'recommendation_id', 'agent_executions', 'agent_execution_id');

CREATE CONSTRAINT TRIGGER "subscription_invoices_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "subscription_id" ON "subscription_invoices"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('subscriptions', 'subscription_id');

CREATE CONSTRAINT TRIGGER "usage_records_tenant_match_check"
AFTER INSERT OR UPDATE OF "organization_id", "subscription_id" ON "usage_records"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_match"('subscriptions', 'subscription_id');

-- A tenant-owned parent cannot be reassigned to another tenant while child
-- rows still carry the old tenant. Deferred validation allows a single
-- transaction to move the parent and all of its children together.
CREATE FUNCTION "cropsy_enforce_tenant_immutable"() RETURNS trigger AS $$
DECLARE
  v_pair_count integer := TG_NARGS / 2;
  v_index integer;
  v_child_table text;
  v_fk_column text;
  v_remaining bigint;
BEGIN
  IF TG_NARGS = 0 OR TG_NARGS % 2 <> 0 THEN
    RAISE EXCEPTION 'Invalid tenant immutable trigger configuration for %', TG_TABLE_NAME;
  END IF;

  IF NEW."organization_id" IS NOT DISTINCT FROM OLD."organization_id" THEN
    RETURN NULL;
  END IF;

  FOR v_index IN 0..v_pair_count - 1 LOOP
    v_child_table := TG_ARGV[v_index * 2];
    v_fk_column := TG_ARGV[v_index * 2 + 1];

    EXECUTE format(
      'SELECT count(*) FROM %I WHERE %I = $1 AND "organization_id" IS DISTINCT FROM $2',
      v_child_table,
      v_fk_column
    ) INTO v_remaining USING OLD."id", NEW."organization_id";

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Cannot change % organization_id while % rows still reference it',
        TG_TABLE_NAME, v_child_table
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "farms_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "farms"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('land_parcels', 'farm_id', 'cultivations', 'farm_id', 'farm_activities', 'farm_id', 'harvests', 'farm_id');

CREATE CONSTRAINT TRIGGER "land_parcels_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "land_parcels"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('cultivations', 'land_parcel_id', 'farm_activities', 'land_parcel_id');

CREATE CONSTRAINT TRIGGER "crop_seasons_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "crop_seasons"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('cultivations', 'crop_season_id');

CREATE CONSTRAINT TRIGGER "agricultural_inputs_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "agricultural_inputs"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('farm_activities', 'input_id');

CREATE CONSTRAINT TRIGGER "cultivations_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "cultivations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('farm_activities', 'cultivation_id', 'harvests', 'cultivation_id', 'traceability_records', 'cultivation_id');

CREATE CONSTRAINT TRIGGER "harvests_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "harvests"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('traceability_records', 'harvest_id');

CREATE CONSTRAINT TRIGGER "farmer_profiles_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "farmer_profiles"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('farms', 'farmer_profile_id', 'products', 'farmer_profile_id');

CREATE CONSTRAINT TRIGGER "product_categories_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "product_categories"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('products', 'category_id', 'product_categories', 'parent_id');

CREATE CONSTRAINT TRIGGER "products_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "products"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('product_inventories', 'product_id', 'product_listings', 'product_id', 'price_history', 'product_id', 'quality_inspections', 'product_id', 'traceability_records', 'product_id');

CREATE CONSTRAINT TRIGGER "warehouses_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "warehouses"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('product_inventories', 'warehouse_id');

CREATE CONSTRAINT TRIGGER "product_inventories_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "product_inventories"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('product_listings', 'inventory_id');

CREATE CONSTRAINT TRIGGER "product_listings_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "product_listings"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('price_history', 'listing_id');

CREATE CONSTRAINT TRIGGER "carts_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "carts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('orders', 'cart_id');

CREATE CONSTRAINT TRIGGER "orders_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "orders"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('payments', 'order_id', 'refunds', 'order_id', 'transactions', 'order_id', 'ledger_entries', 'order_id', 'commissions', 'order_id', 'shipments', 'order_id');

CREATE CONSTRAINT TRIGGER "payments_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "payments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('refunds', 'payment_id', 'transactions', 'payment_id');

CREATE CONSTRAINT TRIGGER "refunds_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "refunds"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('transactions', 'refund_id');

CREATE CONSTRAINT TRIGGER "transactions_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "transactions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('ledger_entries', 'transaction_id');

CREATE CONSTRAINT TRIGGER "ledger_accounts_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "ledger_accounts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('ledger_entries', 'account_id');

CREATE CONSTRAINT TRIGGER "ledger_entries_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "ledger_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('ledger_entries', 'reversal_of_id');

CREATE CONSTRAINT TRIGGER "settlements_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "settlements"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('ledger_entries', 'settlement_id', 'commissions', 'settlement_id');

CREATE CONSTRAINT TRIGGER "shipments_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "shipments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('quality_inspections', 'shipment_id', 'traceability_records', 'shipment_id');

CREATE CONSTRAINT TRIGGER "organization_addresses_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "organization_addresses"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('warehouses', 'address_id', 'shipments', 'pickup_address_id', 'shipments', 'destination_address_id');

CREATE CONSTRAINT TRIGGER "knowledge_sources_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "knowledge_sources"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('knowledge_documents', 'source_id');

CREATE CONSTRAINT TRIGGER "conversations_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "conversations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('ai_recommendations', 'conversation_id', 'agent_executions', 'conversation_id');

CREATE CONSTRAINT TRIGGER "ai_recommendations_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "ai_recommendations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('ai_feedback', 'recommendation_id');

CREATE CONSTRAINT TRIGGER "agent_executions_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "agent_executions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('ai_feedback', 'agent_execution_id');

CREATE CONSTRAINT TRIGGER "subscriptions_tenant_immutable_check"
AFTER UPDATE OF "organization_id" ON "subscriptions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_enforce_tenant_immutable"('subscription_invoices', 'subscription_id', 'usage_records', 'subscription_id');

-- 3. Financial state consistency. CHECK constraints are added NOT VALID and
-- validated explicitly so deployment fails loudly on dirty legacy data rather
-- than silently accepting it.
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_amount_check" CHECK (
  CASE "status"::text
    WHEN 'INITIATED' THEN
      "captured_amount" = 0 AND "refunded_amount" = 0 AND "captured_at" IS NULL
    WHEN 'AUTHORIZED' THEN
      "captured_amount" = 0 AND "refunded_amount" = 0 AND "captured_at" IS NULL
    WHEN 'CAPTURED' THEN
      "captured_amount" > 0 AND "refunded_amount" = 0 AND "captured_at" IS NOT NULL
    WHEN 'PARTIALLY_REFUNDED' THEN
      "captured_amount" > 0 AND "refunded_amount" > 0
      AND "refunded_amount" < "captured_amount" AND "captured_at" IS NOT NULL
    WHEN 'REFUNDED' THEN
      "captured_amount" > 0 AND "refunded_amount" = "captured_amount"
      AND "captured_at" IS NOT NULL
    WHEN 'FAILED' THEN
      "captured_amount" = 0 AND "refunded_amount" = 0 AND "captured_at" IS NULL
    WHEN 'CANCELLED' THEN
      "captured_amount" = 0 AND "refunded_amount" = 0 AND "captured_at" IS NULL
    ELSE false
  END
) NOT VALID;
ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_status_amount_check";

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_status_timestamp_check" CHECK (
  CASE "status"::text
    WHEN 'PROCESSED' THEN "processed_at" IS NOT NULL
    WHEN 'REQUESTED' THEN "processed_at" IS NULL
    WHEN 'APPROVED' THEN "processed_at" IS NULL
    WHEN 'REJECTED' THEN "processed_at" IS NULL
    WHEN 'FAILED' THEN "processed_at" IS NULL
    ELSE false
  END
) NOT VALID;
ALTER TABLE "refunds" VALIDATE CONSTRAINT "refunds_status_timestamp_check";

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_status_posted_check" CHECK (
  CASE "status"::text
    WHEN 'PENDING' THEN "posted_at" IS NULL
    WHEN 'POSTED' THEN "posted_at" IS NOT NULL
    WHEN 'REVERSED' THEN "posted_at" IS NOT NULL
    WHEN 'FAILED' THEN "posted_at" IS NULL
    ELSE false
  END
) NOT VALID;
ALTER TABLE "transactions" VALIDATE CONSTRAINT "transactions_status_posted_check";

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_status_paid_check" CHECK (
  CASE "status"::text
    WHEN 'DRAFT' THEN "paid_at" IS NULL
    WHEN 'APPROVED' THEN "paid_at" IS NULL
    WHEN 'PAID' THEN "paid_at" IS NOT NULL
    WHEN 'CANCELLED' THEN "paid_at" IS NULL
    ELSE false
  END
) NOT VALID;
ALTER TABLE "settlements" VALIDATE CONSTRAINT "settlements_status_paid_check";

-- 4. Ledger correctness.
--
-- A reversal must reference a posted entry for the same account, amount, and
-- currency, with the opposite direction. It cannot reverse itself.
CREATE FUNCTION "cropsy_check_ledger_reversal"() RETURNS trigger AS $$
DECLARE
  v_target "ledger_entries"%ROWTYPE;
BEGIN
  IF NEW."reversal_of_id" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."reversal_of_id" = NEW."id" THEN
    RAISE EXCEPTION 'A ledger entry cannot reverse itself'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_target FROM "ledger_entries" WHERE "id" = NEW."reversal_of_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reversal target % does not exist', NEW."reversal_of_id"
      USING ERRCODE = '23503';
  END IF;

  IF v_target."posted_at" IS NULL THEN
    RAISE EXCEPTION 'Only posted ledger entries can be reversed'
      USING ERRCODE = '23514';
  END IF;

  IF v_target."account_id" <> NEW."account_id"
     OR v_target."amount" <> NEW."amount"
     OR v_target."currency" <> NEW."currency"
     OR v_target."direction" = NEW."direction" THEN
    RAISE EXCEPTION 'Ledger reversal must match account, amount, currency and use the opposite direction'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_reversal_check"
BEFORE INSERT OR UPDATE OF "reversal_of_id", "account_id", "amount", "currency", "direction"
ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "cropsy_check_ledger_reversal"();

-- Posted entries for one transaction must balance. The trigger is deferred so
-- a transaction may insert both sides in any order; the check runs at COMMIT.
CREATE FUNCTION "cropsy_check_ledger_balance"(p_transaction_id uuid) RETURNS void AS $$
DECLARE
  v_debit numeric(14,2);
  v_credit numeric(14,2);
BEGIN
  IF p_transaction_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM("amount") FILTER (WHERE "direction"::text = 'DEBIT'), 0),
    COALESCE(SUM("amount") FILTER (WHERE "direction"::text = 'CREDIT'), 0)
  INTO v_debit, v_credit
  FROM "ledger_entries"
  WHERE "transaction_id" = p_transaction_id
    AND "posted_at" IS NOT NULL;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Posted ledger entries for transaction % are unbalanced (debit %, credit %)',
      p_transaction_id, v_debit, v_credit
      USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "cropsy_ledger_balance_trigger"() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM "cropsy_check_ledger_balance"(OLD."transaction_id");
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM "cropsy_check_ledger_balance"(NEW."transaction_id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ledger_entries_balanced"
AFTER INSERT OR UPDATE OR DELETE ON "ledger_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "cropsy_ledger_balance_trigger"();

-- 5. Audit logs are append-only. No UPDATE, DELETE, or TRUNCATE path is
-- permitted; corrections must be written as new audit events.
CREATE FUNCTION "cropsy_prevent_audit_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are append-only'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "cropsy_prevent_audit_mutation"();

CREATE TRIGGER "audit_logs_no_truncate"
BEFORE TRUNCATE ON "audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION "cropsy_prevent_audit_mutation"();

-- 6. Atomic inventory reservation helpers. SELECT ... FOR UPDATE serializes
-- concurrent reservations on the same row; the CHECK constraints remain the
-- final guarantee for direct writes.
CREATE FUNCTION "reserve_product_inventory"(
  p_inventory_id uuid,
  p_quantity numeric(14,3)
) RETURNS "product_inventories" AS $$
DECLARE
  v_row "product_inventories"%ROWTYPE;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Reservation quantity must be positive'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_row FROM "product_inventories" WHERE "id" = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product inventory % does not exist', p_inventory_id
      USING ERRCODE = '23503';
  END IF;

  IF v_row."available_quantity" < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock in product inventory %', p_inventory_id
      USING ERRCODE = '23514';
  END IF;

  UPDATE "product_inventories"
  SET "quantity_reserved" = "quantity_reserved" + p_quantity,
      "available_quantity" = "quantity_on_hand" - ("quantity_reserved" + p_quantity),
      "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = p_inventory_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "release_product_inventory"(
  p_inventory_id uuid,
  p_quantity numeric(14,3)
) RETURNS "product_inventories" AS $$
DECLARE
  v_row "product_inventories"%ROWTYPE;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Release quantity must be positive'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_row FROM "product_inventories" WHERE "id" = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product inventory % does not exist', p_inventory_id
      USING ERRCODE = '23503';
  END IF;

  IF v_row."quantity_reserved" < p_quantity THEN
    RAISE EXCEPTION 'Cannot release more than reserved in product inventory %', p_inventory_id
      USING ERRCODE = '23514';
  END IF;

  UPDATE "product_inventories"
  SET "quantity_reserved" = "quantity_reserved" - p_quantity,
      "available_quantity" = "quantity_on_hand" - ("quantity_reserved" - p_quantity),
      "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = p_inventory_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "reserve_warehouse_inventory"(
  p_inventory_id uuid,
  p_quantity numeric(14,3)
) RETURNS "warehouse_inventories" AS $$
DECLARE
  v_row "warehouse_inventories"%ROWTYPE;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Reservation quantity must be positive'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_row FROM "warehouse_inventories" WHERE "id" = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Warehouse inventory % does not exist', p_inventory_id
      USING ERRCODE = '23503';
  END IF;

  IF v_row."available_quantity" < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock in warehouse inventory %', p_inventory_id
      USING ERRCODE = '23514';
  END IF;

  UPDATE "warehouse_inventories"
  SET "quantity_reserved" = "quantity_reserved" + p_quantity,
      "available_quantity" = "quantity_on_hand" - ("quantity_reserved" + p_quantity),
      "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = p_inventory_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "release_warehouse_inventory"(
  p_inventory_id uuid,
  p_quantity numeric(14,3)
) RETURNS "warehouse_inventories" AS $$
DECLARE
  v_row "warehouse_inventories"%ROWTYPE;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Release quantity must be positive'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_row FROM "warehouse_inventories" WHERE "id" = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Warehouse inventory % does not exist', p_inventory_id
      USING ERRCODE = '23503';
  END IF;

  IF v_row."quantity_reserved" < p_quantity THEN
    RAISE EXCEPTION 'Cannot release more than reserved in warehouse inventory %', p_inventory_id
      USING ERRCODE = '23514';
  END IF;

  UPDATE "warehouse_inventories"
  SET "quantity_reserved" = "quantity_reserved" - p_quantity,
      "available_quantity" = "quantity_on_hand" - ("quantity_reserved" - p_quantity),
      "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = p_inventory_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- Additive composite indexes for read-only business intelligence reports.
-- Each index preserves tenant/time ordering used by the analytics SQL store.

CREATE INDEX "harvests_organization_id_harvested_at_idx" ON "harvests"("organization_id", "harvested_at");
CREATE INDEX "cultivations_organization_id_harvested_at_idx" ON "cultivations"("organization_id", "harvested_at");
CREATE INDEX "farm_expenses_organization_id_expense_date_category_idx" ON "farm_expenses"("organization_id", "expense_date", "category");
CREATE INDEX "products_organization_id_created_at_idx" ON "products"("organization_id", "created_at");
CREATE INDEX "product_inventories_organization_id_available_quantity_idx" ON "product_inventories"("organization_id", "available_quantity");
CREATE INDEX "product_listings_organization_id_created_at_status_idx" ON "product_listings"("organization_id", "created_at", "status");
CREATE INDEX "listing_locations_division_id_district_id_idx" ON "listing_locations"("division_id", "district_id");
CREATE INDEX "orders_organization_id_placed_at_status_idx" ON "orders"("organization_id", "placed_at", "status");
CREATE INDEX "orders_organization_id_buyer_user_id_placed_at_idx" ON "orders"("organization_id", "buyer_user_id", "placed_at");
CREATE INDEX "orders_organization_id_seller_user_id_placed_at_idx" ON "orders"("organization_id", "seller_user_id", "placed_at");
CREATE INDEX "order_items_order_id_product_id_idx" ON "order_items"("order_id", "product_id");
CREATE INDEX "payments_organization_id_captured_at_status_idx" ON "payments"("organization_id", "captured_at", "status");
CREATE INDEX "shipments_organization_id_status_delivered_at_idx" ON "shipments"("organization_id", "status", "delivered_at");
CREATE INDEX "warehouse_inventories_product_id_available_quantity_idx" ON "warehouse_inventories"("product_id", "available_quantity");
CREATE INDEX "farms_organization_id_owner_user_id_idx" ON "farms"("organization_id", "owner_user_id");
CREATE INDEX "ai_recommendations_organization_id_created_at_idx" ON "ai_recommendations"("organization_id", "created_at");
CREATE INDEX "agent_executions_organization_id_created_at_idx" ON "agent_executions"("organization_id", "created_at");
CREATE INDEX "ai_feedback_organization_id_created_at_idx" ON "ai_feedback"("organization_id", "created_at");

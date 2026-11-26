-- CreateEnum
CREATE TYPE "InspectionEvidenceType" AS ENUM ('IMAGE', 'DOCUMENT', 'MEASUREMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DeliveryPhase" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "DeliveryServiceType" AS ENUM ('STANDARD', 'EXPRESS', 'COLD_CHAIN', 'BULK', 'OTHER');

-- CreateEnum
CREATE TYPE "ShipmentEventSource" AS ENUM ('SYSTEM', 'PROVIDER', 'BUYER', 'SELLER', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "WarehouseLocationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StorageConditionStatus" AS ENUM ('NORMAL', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TraceabilityBatchStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SEALED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryMovementType" ADD VALUE 'RECEIPT';
ALTER TYPE "InventoryMovementType" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "InventoryMovementType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE 'DISPATCH';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TraceabilityEventType" ADD VALUE 'FARM_ORIGIN';
ALTER TYPE "TraceabilityEventType" ADD VALUE 'CULTIVATION';
ALTER TYPE "TraceabilityEventType" ADD VALUE 'WAREHOUSE_ENTRY';
ALTER TYPE "TraceabilityEventType" ADD VALUE 'STORAGE_HISTORY';
ALTER TYPE "TraceabilityEventType" ADD VALUE 'BUYER_CONFIRMED';
ALTER TYPE "TraceabilityEventType" ADD VALUE 'SELLER';

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "confirmed_at" TIMESTAMP(6),
ADD COLUMN     "confirmed_by_user_id" UUID,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "next_attempt_at" TIMESTAMP(6),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "phase" "DeliveryPhase" NOT NULL DEFAULT 'DELIVERY',
ADD COLUMN     "proof_hash" VARCHAR(255),
ADD COLUMN     "reason_code" VARCHAR(180);

-- AlterTable
ALTER TABLE "logistics_providers" ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "organization_id" UUID,
ADD COLUMN     "owner_user_id" UUID,
ADD COLUMN     "service_radius_km" DECIMAL(10,3),
ADD COLUMN     "service_types" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "quality_inspections" ADD COLUMN     "batch_code" VARCHAR(120),
ADD COLUMN     "grade_code" VARCHAR(32),
ADD COLUMN     "grade_source" VARCHAR(32) NOT NULL DEFAULT 'INSPECTOR',
ADD COLUMN     "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "verified_at" TIMESTAMP(6),
ADD COLUMN     "verified_by_user_id" UUID;

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "assigned_user_id" UUID,
ADD COLUMN     "delivery_service_id" UUID,
ADD COLUMN     "destination_latitude" DECIMAL(10,7),
ADD COLUMN     "destination_longitude" DECIMAL(10,7),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "pickup_latitude" DECIMAL(10,7),
ADD COLUMN     "pickup_longitude" DECIMAL(10,7),
ADD COLUMN     "planned_distance_km" DECIMAL(12,3),
ADD COLUMN     "reference_key" VARCHAR(128);

-- Existing shipments receive a deterministic reference key before the column
-- is made mandatory and unique; no delivery policy is seeded by this migration.
UPDATE "shipments" SET "reference_key" = 'shipment:' || "id"::text
WHERE "reference_key" IS NULL;

ALTER TABLE "shipments" ALTER COLUMN "reference_key" SET NOT NULL;

-- AlterTable
ALTER TABLE "warehouse_inventories" ADD COLUMN     "location_id" UUID;

-- CreateTable
CREATE TABLE "delivery_services" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "service_type" "DeliveryServiceType" NOT NULL DEFAULT 'STANDARD',
    "estimated_hours" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "delivery_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_routes" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "origin_longitude" DECIMAL(10,7) NOT NULL,
    "origin_latitude" DECIMAL(10,7) NOT NULL,
    "destination_longitude" DECIMAL(10,7) NOT NULL,
    "destination_latitude" DECIMAL(10,7) NOT NULL,
    "distance_km" DECIMAL(12,3),
    "path_geojson" JSONB,
    "source" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "shipment_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_events" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "status" VARCHAR(60) NOT NULL,
    "source" "ShipmentEventSource" NOT NULL DEFAULT 'SYSTEM',
    "occurred_at" TIMESTAMP(6) NOT NULL,
    "longitude" DECIMAL(10,7),
    "latitude" DECIMAL(10,7),
    "note" TEXT,
    "actor_user_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_audit_events" (
    "id" UUID NOT NULL,
    "shipment_id" UUID,
    "delivery_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(80),
    "entity_id" UUID,
    "actor_user_id" UUID,
    "organization_id" UUID,
    "before" JSONB,
    "after" JSONB NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "request_id" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_locations" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "zone" VARCHAR(80),
    "aisle" VARCHAR(80),
    "rack" VARCHAR(80),
    "shelf" VARCHAR(80),
    "capacity_units" DECIMAL(14,3),
    "status" "WarehouseLocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "warehouse_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_staff_assignments" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_code" VARCHAR(80) NOT NULL,
    "assigned_by_user_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "warehouse_staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_condition_records" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "warehouse_inventory_id" UUID,
    "recorded_at" TIMESTAMP(6) NOT NULL,
    "temperature_c" DECIMAL(8,2),
    "humidity_percent" DECIMAL(8,2),
    "condition_status" "StorageConditionStatus" NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_condition_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reconciliations" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "warehouse_inventory_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "counted_quantity" DECIMAL(14,3) NOT NULL,
    "system_quantity" DECIMAL(14,3) NOT NULL,
    "difference_quantity" DECIMAL(14,3) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "reference_key" VARCHAR(128) NOT NULL,
    "notes" TEXT,
    "counted_by_user_id" UUID,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "inventory_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_evidence" (
    "id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "evidence_type" "InspectionEvidenceType" NOT NULL DEFAULT 'OTHER',
    "uri" TEXT NOT NULL,
    "checksum" VARCHAR(255),
    "mime_type" VARCHAR(120),
    "description" TEXT,
    "captured_at" TIMESTAMP(6),
    "recorded_by_user_id" UUID,
    "public_disclosure" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_audit_events" (
    "id" UUID NOT NULL,
    "inspection_id" UUID,
    "organization_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "actor_user_id" UUID,
    "before" JSONB,
    "after" JSONB NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "request_id" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "product_id" UUID,
    "batch_code" VARCHAR(120) NOT NULL,
    "harvest_id" UUID,
    "cultivation_id" UUID,
    "farm_id" UUID,
    "farmer_user_id" UUID,
    "seller_user_id" UUID,
    "buyer_user_id" UUID,
    "shipment_id" UUID,
    "inspection_id" UUID,
    "warehouse_entry_at" TIMESTAMP(6),
    "status" "TraceabilityBatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "public_disclosure" BOOLEAN NOT NULL DEFAULT false,
    "verification_token" VARCHAR(128) NOT NULL,
    "qr_payload" TEXT,
    "created_by_user_id" UUID,
    "verified_by_user_id" UUID,
    "verified_at" TIMESTAMP(6),
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "traceability_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability_events" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "event_type" "TraceabilityEventType" NOT NULL,
    "occurred_at" TIMESTAMP(6) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "location_description" VARCHAR(255),
    "longitude" DECIMAL(10,7),
    "latitude" DECIMAL(10,7),
    "actor_user_id" UUID,
    "source_module" VARCHAR(40),
    "source_record_id" UUID,
    "public_disclosure" BOOLEAN NOT NULL DEFAULT false,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traceability_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability_audit_events" (
    "id" UUID NOT NULL,
    "batch_id" UUID,
    "organization_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "actor_user_id" UUID,
    "before" JSONB,
    "after" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traceability_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_services_provider_id_is_active_idx" ON "delivery_services"("provider_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_services_provider_id_code_key" ON "delivery_services"("provider_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_routes_shipment_id_key" ON "shipment_routes"("shipment_id");

-- CreateIndex
CREATE INDEX "shipment_routes_source_idx" ON "shipment_routes"("source");

-- CreateIndex
CREATE INDEX "shipment_events_shipment_id_occurred_at_idx" ON "shipment_events"("shipment_id", "occurred_at");

-- CreateIndex
CREATE INDEX "shipment_events_status_idx" ON "shipment_events"("status");

-- CreateIndex
CREATE INDEX "delivery_audit_events_shipment_id_created_at_idx" ON "delivery_audit_events"("shipment_id", "created_at");

-- CreateIndex
CREATE INDEX "delivery_audit_events_delivery_id_created_at_idx" ON "delivery_audit_events"("delivery_id", "created_at");

-- CreateIndex
CREATE INDEX "delivery_audit_events_organization_id_created_at_idx" ON "delivery_audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "warehouse_locations_warehouse_id_status_idx" ON "warehouse_locations"("warehouse_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_locations_warehouse_id_code_key" ON "warehouse_locations"("warehouse_id", "code");

-- CreateIndex
CREATE INDEX "warehouse_staff_assignments_user_id_is_active_idx" ON "warehouse_staff_assignments"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_staff_assignments_warehouse_id_user_id_role_code_key" ON "warehouse_staff_assignments"("warehouse_id", "user_id", "role_code");

-- CreateIndex
CREATE INDEX "storage_condition_records_warehouse_id_recorded_at_idx" ON "storage_condition_records"("warehouse_id", "recorded_at");

-- CreateIndex
CREATE INDEX "storage_condition_records_warehouse_inventory_id_recorded_a_idx" ON "storage_condition_records"("warehouse_inventory_id", "recorded_at");

-- CreateIndex
CREATE INDEX "storage_condition_records_condition_status_idx" ON "storage_condition_records"("condition_status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reconciliations_reference_key_key" ON "inventory_reconciliations"("reference_key");

-- CreateIndex
CREATE INDEX "inventory_reconciliations_organization_id_status_idx" ON "inventory_reconciliations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "inventory_reconciliations_warehouse_id_created_at_idx" ON "inventory_reconciliations"("warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_reconciliations_warehouse_inventory_id_idx" ON "inventory_reconciliations"("warehouse_inventory_id");

-- CreateIndex
CREATE INDEX "inspection_evidence_inspection_id_evidence_type_idx" ON "inspection_evidence"("inspection_id", "evidence_type");

-- CreateIndex
CREATE INDEX "inspection_evidence_public_disclosure_idx" ON "inspection_evidence"("public_disclosure");

-- CreateIndex
CREATE INDEX "quality_audit_events_inspection_id_created_at_idx" ON "quality_audit_events"("inspection_id", "created_at");

-- CreateIndex
CREATE INDEX "quality_audit_events_organization_id_created_at_idx" ON "quality_audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "traceability_batches_verification_token_key" ON "traceability_batches"("verification_token");

-- CreateIndex
CREATE INDEX "traceability_batches_organization_id_status_idx" ON "traceability_batches"("organization_id", "status");

-- CreateIndex
CREATE INDEX "traceability_batches_product_id_idx" ON "traceability_batches"("product_id");

-- CreateIndex
CREATE INDEX "traceability_batches_shipment_id_idx" ON "traceability_batches"("shipment_id");

-- CreateIndex
CREATE INDEX "traceability_batches_verification_status_idx" ON "traceability_batches"("verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "traceability_batches_organization_id_batch_code_key" ON "traceability_batches"("organization_id", "batch_code");

-- CreateIndex
CREATE INDEX "traceability_events_batch_id_occurred_at_idx" ON "traceability_events"("batch_id", "occurred_at");

-- CreateIndex
CREATE INDEX "traceability_events_event_type_idx" ON "traceability_events"("event_type");

-- CreateIndex
CREATE INDEX "traceability_events_public_disclosure_verification_status_idx" ON "traceability_events"("public_disclosure", "verification_status");

-- CreateIndex
CREATE INDEX "traceability_audit_events_batch_id_created_at_idx" ON "traceability_audit_events"("batch_id", "created_at");

-- CreateIndex
CREATE INDEX "traceability_audit_events_organization_id_created_at_idx" ON "traceability_audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "deliveries_phase_status_idx" ON "deliveries"("phase", "status");

-- CreateIndex
CREATE INDEX "logistics_providers_organization_id_is_active_idx" ON "logistics_providers"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "logistics_providers_owner_user_id_idx" ON "logistics_providers"("owner_user_id");

-- CreateIndex
CREATE INDEX "quality_inspections_verification_status_idx" ON "quality_inspections"("verification_status");

-- CreateIndex
CREATE INDEX "quality_inspections_batch_code_idx" ON "quality_inspections"("batch_code");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_reference_key_key" ON "shipments"("reference_key");

-- CreateIndex
CREATE INDEX "shipments_provider_id_status_idx" ON "shipments"("provider_id", "status");

-- CreateIndex
CREATE INDEX "shipments_delivery_service_id_idx" ON "shipments"("delivery_service_id");

-- CreateIndex
CREATE INDEX "shipments_assigned_user_id_idx" ON "shipments"("assigned_user_id");

-- CreateIndex
CREATE INDEX "warehouse_inventories_location_id_idx" ON "warehouse_inventories"("location_id");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_delivery_service_id_fkey" FOREIGN KEY ("delivery_service_id") REFERENCES "delivery_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_services" ADD CONSTRAINT "delivery_services_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "logistics_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_providers" ADD CONSTRAINT "logistics_providers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_providers" ADD CONSTRAINT "logistics_providers_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_routes" ADD CONSTRAINT "shipment_routes_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_audit_events" ADD CONSTRAINT "delivery_audit_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_audit_events" ADD CONSTRAINT "delivery_audit_events_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_audit_events" ADD CONSTRAINT "delivery_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_audit_events" ADD CONSTRAINT "delivery_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_inventories" ADD CONSTRAINT "warehouse_inventories_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_staff_assignments" ADD CONSTRAINT "warehouse_staff_assignments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_staff_assignments" ADD CONSTRAINT "warehouse_staff_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_staff_assignments" ADD CONSTRAINT "warehouse_staff_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_condition_records" ADD CONSTRAINT "storage_condition_records_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_condition_records" ADD CONSTRAINT "storage_condition_records_warehouse_inventory_id_fkey" FOREIGN KEY ("warehouse_inventory_id") REFERENCES "warehouse_inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_condition_records" ADD CONSTRAINT "storage_condition_records_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reconciliations" ADD CONSTRAINT "inventory_reconciliations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reconciliations" ADD CONSTRAINT "inventory_reconciliations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reconciliations" ADD CONSTRAINT "inventory_reconciliations_warehouse_inventory_id_fkey" FOREIGN KEY ("warehouse_inventory_id") REFERENCES "warehouse_inventories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reconciliations" ADD CONSTRAINT "inventory_reconciliations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reconciliations" ADD CONSTRAINT "inventory_reconciliations_counted_by_user_id_fkey" FOREIGN KEY ("counted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reconciliations" ADD CONSTRAINT "inventory_reconciliations_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_evidence" ADD CONSTRAINT "inspection_evidence_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "quality_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_evidence" ADD CONSTRAINT "inspection_evidence_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audit_events" ADD CONSTRAINT "quality_audit_events_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "quality_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audit_events" ADD CONSTRAINT "quality_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audit_events" ADD CONSTRAINT "quality_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_batches" ADD CONSTRAINT "traceability_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_batches" ADD CONSTRAINT "traceability_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_batches" ADD CONSTRAINT "traceability_batches_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_batches" ADD CONSTRAINT "traceability_batches_cultivation_id_fkey" FOREIGN KEY ("cultivation_id") REFERENCES "cultivations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_batches" ADD CONSTRAINT "traceability_batches_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_batches" ADD CONSTRAINT "traceability_batches_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "quality_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_events" ADD CONSTRAINT "traceability_events_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "traceability_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_audit_events" ADD CONSTRAINT "traceability_audit_events_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "traceability_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_audit_events" ADD CONSTRAINT "traceability_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


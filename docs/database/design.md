# Database design

This document describes the CROPSY PostgreSQL database. Sources of truth are [`schema.prisma`](../../apps/api/prisma/schema.prisma), the [initial migration](../../apps/api/prisma/migrations/20261125000000_init/migration.sql), the [review-hardening migration](../../apps/api/prisma/migrations/20261125120000_review_hardening/migration.sql), the [auth-identity migration](../../apps/api/prisma/migrations/20261125130000_auth_identity/migration.sql), the [organization/profile migration](../../apps/api/prisma/migrations/20261125140000_organization_profile_management/migration.sql), the [farm-management migration](../../apps/api/prisma/migrations/20261125150000_farm_management/migration.sql), the [crop/cultivation/expense migration](../../apps/api/prisma/migrations/20261125160000_crop_cultivation_expense_management/migration.sql), the [catalog/marketplace migration](../../apps/api/prisma/migrations/20261125170000_catalog_marketplace/migration.sql), the [inventory/cooperative migration](../../apps/api/prisma/migrations/20261125180000_inventory_cooperative/migration.sql), the [cart/order management migration](../../apps/api/prisma/migrations/20261126000000_cart_order_management/migration.sql), the [payment/ledger infrastructure migration](../../apps/api/prisma/migrations/20261126010000_payment_ledger_infrastructure/migration.sql), the [logistics/warehouse/quality/traceability migration](../../apps/api/prisma/migrations/20261126020000_logistics_warehouse_quality_traceability/migration.sql), and the [idempotent seed](../../apps/api/prisma/seed.js). The root baseline documents `RTB.md`, `SSD.md`, and `user-story.md` remain unchanged.

## Technology choices

| Choice | Detail |
| --- | --- |
| ORM | Prisma `6.19.3` (pinned in `apps/api/package.json`), generator `prisma-client-js`. |
| Database | PostgreSQL; all tables in the `public` schema. |
| Extension | PostGIS, declared with `previewFeatures = ["postgresqlExtensions"]` and `extensions = [postgis]`; the migration runs `CREATE EXTENSION IF NOT EXISTS "postgis"`. |
| Application | The Fastify business API consumes Prisma Client; reference data is loaded by a plain Node seed script. |
| Raw SQL | `CHECK` constraints, partial unique indexes, triggers, stored functions, and GiST indexes are applied in migrations because Prisma schema syntax cannot express them. |

## Keys and naming

- Every table has a UUID primary key (`@id @default(uuid()) @db.Uuid`).
- Every table is mapped to `snake_case` with `@@map` (for example, `ProductListing` → `product_listings`). All columns, including foreign keys, are `snake_case`.
- Most tables carry `created_at` and `updated_at` timestamps. `audit_logs` is append-only by design and has no `updated_at`.
- Natural/business keys are explicitly unique: `users.phone`, `roles.code`, `permissions.code`, `crops.code`, `products.sku`, `farmer_profiles.farmer_code`, `organizations.slug`, `subscription_invoices.invoice_number`, and others. `users.email` is nullable for phone-only accounts and unique through a partial index for non-null values.

## Money and measurement

- Monetary amounts use `Decimal(14,2)` (`NUMERIC(14,2)`), for example listing prices, order totals, payments, refunds, ledger entries, commissions, settlements, and subscription invoices.
- A `CHAR(3)` `currency` column defaults to `BDT` on monetary tables; `users` profiles and organizations also default to `BDT`.
- Quantities and areas use `Decimal(14,3)` or `Decimal(12,3)`; commission `rate` uses `Decimal(12,4)` and AI `confidence_score` uses `Decimal(5,4)`.
- No currency conversion rates, taxes, or multi-currency policies are seeded. `orders.tax_amount` and `purchase_groups.tax_amount` are storage columns written as zero by current checkout code until a tax rule is supplied; tax policy itself remains application/configuration policy.

## Bangladesh administrative geography

The hierarchy is strict and uses required `RESTRICT` foreign keys:

`countries` → `divisions` → `districts` → `upazilas` → `unions`

Addresses, farm locations, listing locations, and warehouses reference division/district/upazila/union through **optional** FKs with `ON DELETE SET NULL`, so deleting a reference row does not destroy the address record. Codes (for example `BD-DHA`, `BD-DHA-DHA`) are unique.

The seed inserts Bangladesh (`BD`), 8 divisions, 64 districts, 64 upazilas, and 64 unions. Each district gets one deterministic Sadar upazila (`<district.code>-S`) and one union (`<district.code>-U`) so farm-location validation works without inventing a full administrative census. Division and district names include Bengali text; generated upazila/union names use English labels only.

## Tenant isolation and scopes

- `organization_id` identifies tenant-owned rows. `NULL` means platform scope. It is optional on most domain tables (with `ON DELETE SET NULL`) and required on `warehouses` and `subscriptions` (with `ON DELETE RESTRICT`).
- `scope_key` is a non-null surrogate used in unique keys because PostgreSQL treats `NULL`s as distinct:
  - `user_roles` and `role_profile_extensions`: `PLATFORM` or the organization UUID.
  - `feature_flags` and `platform_settings`: `GLOBAL` or the organization UUID.
  - `product_inventories`: `UNALLOCATED` or the warehouse UUID (inventory scope, not tenant scope).
- `CHECK` constraints keep `scope_key` consistent with `organization_id` / `warehouse_id`.
- Partial unique indexes enforce the common "one active row" rules listed below. Review-hardening triggers reject child rows whose `organization_id` disagrees with a tenant-owned parent, and reject reassigning a tenant-owned parent while tenant-owned children still reference it. Rows without their own `organization_id` (for example `order_items`, `listing_locations`, `chat_messages`) inherit scope through their parent and must be queried through it. The application is still responsible for filtering reads and writes by `organization_id`; there is no row-level security policy.

## Soft deletion

Only two tables have `deleted_at`:

- `organizations`: soft deletion preserves orders, payments, ledger entries, and audit history after an organization closes.
- `products`: soft deletion preserves order and payment references after a catalog item is retired.

All other removals use hard deletes with explicit `CASCADE`, `RESTRICT`, or `SET NULL` actions from the schema. There is no global soft-delete convention.

## Status enums

PostgreSQL enum types are generated from Prisma enums. Representative groups:

| Domain | Enum types |
| --- | --- |
| Identity/access | `AccountStatus`, `Gender`, `PreferredLanguage`, `RoleScope`, `VerificationStatus`, `OtpPurpose` |
| Organization | `OrganizationStatus`, `OrganizationMemberStatus`, `InvitationStatus` |
| Agriculture | `FarmType`, `FarmStatus`, `AreaUnit`, `LandOwnership`, `LandParcelStatus`, `FarmSoilTexture`, `SoilFertility`, `IrrigationSource`, `IrrigationMethod`, `IrrigationStatus`, `CropCategory`, `CultivationStatus`, `GrowthStage`, `ObservationSeverity`, `FarmActivityType`, `HarvestStatus`, `AgriculturalInputCategory`, `ExpenseCategory`, `ExpenseSource`, `RecommendationSource` |
| Catalog | `AttributeValueType`, `CatalogEntityType` |
| Marketplace | `ListingStatus`, `PriceSource`, `ListingReportReason`, `ListingReportStatus` |
| Commerce | `CartStatus`, `CheckoutStatus`, `OrderStatus`, `PaymentMethod`, `PaymentStatus`, `RefundStatus`, `RefundReason`, `TransactionType`, `TransactionDirection`, `TransactionStatus`, `LedgerAccountType`, `NormalBalance`, `CommissionBasis`, `CommissionStatus`, `SettlementStatus` |
| Logistics | `ShipmentStatus`, `DeliveryStatus`, `WarehouseStatus`, `InspectionResult`, `TraceabilityEventType`, `DeliveryPhase`, `DeliveryServiceType`, `ShipmentEventSource`, `WarehouseLocationStatus`, `StorageConditionStatus`, `ReconciliationStatus`, `TraceabilityBatchStatus`, `InspectionEvidenceType` |
| AI | `KnowledgeSourceType`, `DocumentStatus`, `LanguageCode`, `ChatRole`, `RecommendationType`, `RecommendationStatus`, `AgentStatus` |
| SaaS | `BillingInterval`, `SubscriptionStatus`, `InvoiceStatus` |
| System | `NotificationChannel`, `NotificationStatus`, `AuditSeverity`, `OutboxStatus` |

Enum values are defined in `schema.prisma` and the migration. `OtpPurpose` includes `EMAIL_VERIFICATION`, `PHONE_VERIFICATION`, `PASSWORD_RESET`, `LOGIN`, and the follow-up `ACCOUNT_RECOVERY` value used by deactivated/locked account recovery. Enum defaults describe lifecycle state, not business pricing or settlement policy.

## Indexes and unique constraints

- Prisma-generated B-tree indexes cover FKs and common filters, typically `(organization_id, status)`, `(organization_id, created_at)`, and date/entity lookups. The review migration added 49 indexes that were missing a leading FK column (for example `products.category_id`, `conversations.user_id`, `notifications.user_id`, and Bangladesh district/upazila/union lookups) plus `outbox_events(status, available_at)` for global worker polling. The farm migration adds `farms.operator_user_id`, soil type/fertility, and irrigation source/method/status indexes, plus unique keys for one soil profile per farm and `(farm_id, code)` per irrigation record.
- Composite unique constraints cover join and scoped records, for example `(user_id, role_id, scope_key)`, `(role_id, permission_id)`, `(product_id, scope_key)`, `(cart_id, listing_id)`, `(warehouse_id, product_id, batch_code)`, `(key, scope_key)`, and `(subscription_id, metric_code, recorded_at)`. `purchase_groups.reference_key` is uniquely indexed as the checkout idempotency key.
- Partial unique indexes (not expressible in the Prisma schema):

```sql
CREATE UNIQUE INDEX "carts_one_active_per_user" ON "carts" ("user_id")
  WHERE "status" = 'ACTIVE'::"CartStatus";
CREATE UNIQUE INDEX "organization_addresses_one_primary_per_org" ON "organization_addresses" ("organization_id")
  WHERE "is_primary" = true;
CREATE UNIQUE INDEX "user_addresses_one_primary_per_user" ON "user_addresses" ("user_id")
  WHERE "is_primary" = true;
CREATE UNIQUE INDEX "subscriptions_one_active_per_org" ON "subscriptions" ("organization_id")
  WHERE "status" IN ('TRIALING'::"SubscriptionStatus", 'ACTIVE'::"SubscriptionStatus", 'PAST_DUE'::"SubscriptionStatus");
CREATE UNIQUE INDEX "users_email_not_null_key" ON "users" ("email")
  WHERE "email" IS NOT NULL;
```

The last index replaced the baseline `users_email_key` when `users.email` became
nullable. It keeps non-null emails unique while allowing many phone-only users
to store `NULL`.

## Database `CHECK` constraints and triggers

The migration adds raw SQL invariants so they hold even if application code is bypassed. By category:

- **Identity/access:** non-negative login attempts; OTP attempt bounds; `user_roles.scope_key` must match `organization_id` (`PLATFORM` when null, org UUID when set).
- **Geography/agriculture:** non-negative farm size and total area; strictly positive land-parcel and cultivation area; season months 1–12; expected harvest not before planting; non-negative activity cost and harvest quantity. Farm-management checks require farm-location points to use SRID 4326 and fall inside the Bangladesh bounding box, require valid SRID 4326 polygons for farm boundaries and parcels, bound farm/parcel areas as non-negative, bound soil pH to 0–14 and organic matter to 0–100%, and bound irrigation capacity, command area, and weekly frequency. Crop/expense checks bound calendar months and harvest windows, require `scope_key = GLOBAL` only with a null organization (otherwise the organization UUID), bound confidence to 0–1 and recommendation validity ordering, require positive expenses with uppercase three-letter currency, require AI estimates to name a rule key, and reject recorded rows carrying estimate metadata. Variety/crop match and recommendation/calendar match are constraint triggers.
- **Marketplace/inventory:** non-negative image sort order; `product_inventories.scope_key` must match `warehouse_id`; `available_quantity = quantity_on_hand - quantity_reserved` with non-negative bounds and `quantity_reserved <= quantity_on_hand`; positive listing, price-history, and cart prices; positive listing quantities and `min_order_quantity`; listing window ordering; positive location radius.
- **Catalog/marketplace fields:** attribute values populate exactly one typed column matching the definition (`TEXT`, `NUMBER`, `BOOLEAN`, `DATE`, or `ENUM`), `ENUM` definitions carry a JSON array of allowed values, and enum values must be in that array. Listings require `available_location` or `harvest_date`, listing locations require at least one point/label/administrative reference, report bodies cannot be blank, and `PENDING` reports cannot carry review metadata. Existing rows are grandfathered by `NOT VALID` checks where appropriate, so new writes are constrained without rewriting history.
- **Commerce/financial:** cart quantity/price positive; order and parent checkout amounts non-negative with `discount_amount <= subtotal_amount` and `total_amount = subtotal - discount + delivery_fee + tax`; `line_total = ROUND(quantity * unit_price, 2)`; order status history requires `from_status` to differ from `to_status`; payment amounts positive with `captured_amount <= amount` and `refunded_amount <= captured_amount`; refund/transaction/ledger amounts positive; commission amount/rate non-negative; `net_amount = gross_amount - deductions_amount` and settlement period ordering.
- **Logistics:** positive warehouse capacity when set; warehouse inventory quantity consistency mirroring product inventory.
- **AI/SaaS/system:** AI feedback rating 1–5 when present; non-negative plan price and trial days; subscription/invoice/usage period and amount rules; non-negative outbox attempts; `feature_flags` and `platform_settings` scope keys must match `organization_id`.

Triggers:

- `refunds_within_captured_amount` calls `enforce_refund_cap()` before insert or update of `amount`, `status`, or `payment_id`. For `PROCESSED` refunds, the sum of processed refunds (including the new row) must not exceed the payment's `captured_amount`.
- `ledger_entries_immutable` calls `prevent_posted_ledger_mutation()` before update or delete. Once `posted_at` is set, a ledger entry cannot be changed or removed; corrections require a reversal entry via `reversal_of_id`.
- `farm_soil_profiles_tenant_match_check` and `farm_irrigations_tenant_match_check` use the review-hardening tenant function so child tenant keys match their farm. `farms_tenant_immutable_check` was recreated to include soil profiles and irrigations alongside parcels, cultivations, activities, and harvests.
- Catalog attribute values are covered by two constraint triggers: one enforces the typed-column/allowed-value rule above, and one checks the value's tenant against both the attribute definition and its product/variety. Tenant-immutable triggers on products, varieties, categories, units, and quality grades block moving a tenant-owned parent while dependent catalog or listing rows still reference it. Product, category, and listing tenant-match triggers were recreated to include the new references.

## Engineering review hardening

The follow-up migration `20261125120000_review_hardening` was added after a full database review. The baseline migration was not edited. All new checks are derived from existing columns/enums; no commission rate, payment provider, subscription price, tax, refund, or settlement policy was introduced.

### Referential, unique, and FK behavior review

- Every mapped table keeps a UUID primary key and explicit FK actions (`CASCADE`, `RESTRICT`, `SET NULL`) chosen by domain lifetime. Natural keys and join keys remain covered by the baseline and follow-up unique indexes/constraints.
- The review did not remove any unique constraint or FK. The duplicate-record tests exercise natural keys (`roles.code`, `payments.idempotency_key`) and invalid-FK tests exercise `payments.order_id` and `ledger_entries.account_id`.

### Multi-tenant isolation

- New constraint triggers compare a child's `organization_id` with the owning parent for tenant-sensitive relations across agriculture, marketplace, commerce, logistics, AI, and SaaS. Platform-scoped parents (`organization_id IS NULL`) remain referenceable by any tenant.
- Deferred constraint triggers prevent changing a parent's `organization_id` while child rows still carry the old tenant. Because they are deferred, one transaction may move a parent and all children together.
- Before creating the triggers, a validation function scans all configured parent/child pairs and aborts the migration if existing rows are inconsistent. This keeps deployment safe on a populated database.

### Financial precision and state

- Money remains `NUMERIC(14,2)` with BDT defaults. New `CHECK` constraints align payment/refund/transaction/settlement status with their amount and timestamp fields: for example, `CAPTURED` payments require a positive captured amount and `captured_at`, and `PROCESSED` refunds require `processed_at`.
- `cropsy_check_ledger_reversal()` requires a reversal to reference a posted entry with the same account, amount, and currency and the opposite direction. Self-reversal is rejected.
- `cropsy_check_ledger_balance()` is a deferred constraint trigger: at `COMMIT`, posted ledger entries for a transaction must have equal debit and credit totals. Draft entries are ignored, and transactions without posted ledger entries are not constrained.

### Auditability and retention

- `audit_logs` is append-only. Triggers reject `UPDATE`, `DELETE`, and `TRUNCATE`; corrections must be new audit events. The existing lack of `updated_at` is intentional.

### Inventory consistency and concurrency

- Atomic helpers `reserve_product_inventory`, `release_product_inventory`, `reserve_warehouse_inventory`, and `release_warehouse_inventory` lock the target row with `SELECT ... FOR UPDATE`, validate the quantity, and update `quantity_reserved`/`available_quantity` together. The existing `CHECK` constraints remain the final guarantee for direct writes.

### Indexing and query performance

- Every reviewed FK column now has a leading B-tree index where a direct lookup is plausible. Composite geography indexes that lead with `division_id` were supplemented with district/upazila/union indexes.
- `outbox_events(status, available_at)` supports global polling; the existing `(organization_id, status, available_at)` index still supports tenant-scoped polling.
- PostGIS GiST indexes from the baseline remain unchanged.

## Authentication identity follow-up

The follow-up migration `20261125130000_auth_identity` supports the implemented
auth/RBAC layer. The initial and review-hardening migrations remain immutable.

- `users.email` is now nullable so a user can register with only a Bangladesh
  mobile number. The previous unique constraint was replaced by
  `users_email_not_null_key`, a partial unique index over non-null emails.
- `OtpPurpose` gained `ACCOUNT_RECOVERY` for deactivated/locked account recovery.
  Verification codes are stored as salted HMACs in `otp_verifications`; only
  hashes of refresh/session tokens are persisted in `refresh_tokens` and
  `sessions`.
- The production auth repository uses these Prisma tables through
  `AUTH_STORE=prisma`; development/tests can use the in-memory adapter. Role,
  permission, organization membership, and audit rows are read on every
  authorization decision so policy changes take effect without redeploying.
- The seed maps 12 canonical categories and 10 legacy aliases to 51 permissions.
  See [`../security/permission-matrix.md`](../security/permission-matrix.md)
  for the effective grid.

## Organization and profile follow-up

The follow-up migration `20261125140000_organization_profile_management` adds the
storage needed by the organization and profile APIs. Earlier migrations remain
immutable. Prisma generates the `CREATE TABLE`/`ALTER TABLE` DDL; the final
`scope_key` check is raw SQL because Prisma cannot express that invariant.

- `organizations` gains `organization_type`, `verification_status`,
  `verification_note`, `verified_at`, `verified_by_user_id`, `contact_email`,
  `contact_phone`, `description`, and `website`. `OrganizationType` covers
  agricultural companies, farmer cooperatives, wholesale and retail businesses,
  agricultural suppliers, logistics companies, warehouses, and `OTHER`.
  Filter indexes cover type, verification status, and verifier.
- `organization_documents` stores document metadata only: organization, uploader,
  document type, file name/URL, MIME type, size, verification status, and notes.
  Binary files and providers stay outside the database. FKs cascade on
  organization deletion and restrict uploader deletion.
- `notification_preferences` stores per-user channel/event toggles with a unique
  `(user_id, channel, event_type)` key. `NotificationChannel` values are
  `IN_APP`, `EMAIL`, `SMS`, and `PUSH`.
- `role_profile_extensions` stores role-specific JSON keyed by
  `(user_id, role_code, scope_key)`. `FARMER` data is deliberately excluded and
  lives in `farmer_profiles`; other roles use this table. The raw
  `role_profile_extensions_scope_key_check` requires `PLATFORM` with a null
  organization or the organization UUID repeated in `scope_key`.
- Partial unique indexes keep one primary address per user and per organization.
  No verification column was added to `user_profiles`: profile verification is
  derived from `users.is_email_verified` and `users.is_phone_verified`.

## Farm management follow-up

The follow-up migration `20261125150000_farm_management` adds the storage and
database invariants used by the farm APIs. Earlier migrations remain immutable;
Prisma generates the table/column/index DDL and the geographic checks, tenant
triggers, and trigger recreation are raw SQL.

- `farms` gains `description`, `area_unit`, `area_value`, `total_area_hectares`,
  `ownership_type`, `ownership_reference`, and operator name/contact/since
  fields. `AreaUnit` accepts only `HECTARE`, `ACRE`, and `SQUARE_METER`; the
  application converts to a canonical hectare value and does not define
  bigha/katha rates. `operator_user_id` optionally references `users`.
- `land_parcels` gains `area_unit`, `area_value`, and canonical
  `area_hectares`, mirroring farm area storage.
- `farm_soil_profiles` stores one agronomic profile per farm (unique `farm_id`)
  with soil type, texture, pH, organic matter, fertility, drainage, test date,
  lab, and notes. `farm_irrigations` stores multiple records per farm with a
  unique `(farm_id, code)` key and source/method/status/capacity/command-area/
  frequency fields.
- Both child tables repeat `organization_id` and are covered by tenant-match and
  tenant-immutable constraint triggers. Tenant reassignment of a farm is
  rejected while any parcel, cultivation, activity, harvest, soil, or
  irrigation child still references it.
- Geometry validation is enforced at the database boundary: farm-location points
  are SRID 4326 inside Bangladesh, and farm/parcel polygons are valid SRID 4326
  polygons. Raw `$queryRaw`/`$executeRaw` remains necessary for geometry reads
  and writes.
- No commission, payment, subscription, settlement, tax, or land-conversion
  policy was introduced.

## Crop, cultivation, and expense follow-up

The follow-up migration `20261125160000_crop_cultivation_expense_management`
adds the crop-cycle and expense storage used by the agriculture APIs. It is a
new migration; earlier migrations remain immutable. Prisma generates the tables,
columns, enums, indexes, and foreign keys, while scope/value checks and match
triggers are raw SQL.

- `cultivations` gains `crop_calendar_id`, `crop_id` (derived from the variety),
  `harvested_at`, `growth_stage`, and expected-yield/notes fields. Unique
  `(farm_id, code)` and indexes on dates, stage, crop, and calendar support
  cultivation history and comparisons.
- `farm_activities` gains `growth_stage`, `observation_severity`, `quantity`,
  `unit_code`, actor, and index coverage so sowing, stage changes, observations,
  and other work remain one auditable timeline per farm/cultivation.
- `crop_calendars` stores tenant or platform sowing windows, optional variety
  scoping, and configurable harvest-day bounds. `agronomic_recommendations`
  stores configured or AI guidance with confidence, rule key, and validity
  window. Both use `scope_key = GLOBAL` for platform rows and the organization
  UUID for tenant rows; global rows are referenceable by all tenants.
- `farm_expenses` records actual or AI-estimated costs with category, date,
  amount, currency, optional cultivation allocation, receipt metadata, rule key,
  and confidence. Its `source` check keeps `RECORDED` and `AI_ESTIMATED` rows
  mutually exclusive with their metadata so reports cannot silently treat an
  estimate as actual cost.
- Calendar/recommendation scopes, month/harvest bounds, confidence ranges,
  validity ordering, AI rule keys, and variety/crop matches are database
  constraints. Tenant-match triggers cover calendar references and expenses;
  farm/cultivation tenant-immutability triggers were recreated to include
  `farm_expenses`.
- Harvest windows, growth/observation vocabularies, expense categories, rule
  keys, and currencies are stored/configurable. No price, commission, payment
  provider, subscription, settlement rule, or agronomic value is invented.

`AGRICULTURE_STORE` selects the module's persistence adapter: `memory` is the
local/test default and production requires `prisma`.

## Catalog and marketplace follow-up

The follow-up migration `20261125170000_catalog_marketplace` expands the existing
catalog/marketplace tables and adds nine tables. Earlier migrations remain immutable;
Prisma generates the table/column/index DDL while typed-value checks, field checks, and
tenant triggers are raw SQL.

- `product_categories` gains English/Bengali descriptions, `products` gains
  `name_bn`, `description_bn`, `is_available`, and `unit_id`, and `product_images`
  gains `alt_text_bn`. `product_listings` gains `quality_grade_id`, `harvest_date`,
  and `available_location`; `listing_locations` gains `location_label`.
- `units_of_measure` and `quality_grades` are configurable reference records with
  unique codes, bilingual names/labels, active flags, and tenant scope. No quality
  grade, unit conversion, or price is seeded or hardcoded.
- `product_varieties` holds per-product varieties unique on `(product_id, code)`.
  `product_attributes` defines typed, optionally required attributes with optional
  category scope and `ENUM` allowed values. `product_attribute_values` stores one
  value per `(attribute_id, entity_type, entity_id)` using the matching typed column
  for products or varieties.
- `listing_images`, `favorite_listings`, `listing_reports`, and `listing_messages`
  store listing media, buyer favorites with one row per `(user_id, listing_id)`,
  suspicious-listing reports with configurable reasons/statuses, and platform-mediated
  seller/buyer messages. Favorites, reports, messages, and images cascade with their
  listing; report reviewers and message participants use explicit user FKs.
- Raw checks enforce typed attribute values, `ENUM` arrays and membership, non-negative
  image sort order, non-blank message bodies, pending-report review metadata, and the
  listing/location completeness rules. Deferred constraint triggers reject cross-tenant
  attribute values and tenant reassignment while dependent catalog/listing rows remain.
  Existing rows are grandfathered by `NOT VALID` location/listing checks.
- The 13 seeded categories include Grains, Vegetables, Fruits, Spices, Pulses, Seeds,
  Agricultural inputs, and Other approved agricultural products alongside legacy
  families. No products, listings, prices, grades, or business policies are seeded.

`CATALOG_STORE` and `MARKETPLACE_STORE` select the respective module's persistence
adapter: `memory` is the local/test default and production requires `prisma`. The
Prisma marketplace store uses PostGIS for radius/distance queries; the in-memory store
uses haversine distance only for local tests.

## Inventory and cooperative follow-up

The follow-up migration `20261125180000_inventory_cooperative` expands
`warehouse_inventories` with `low_stock_threshold`, adds eleven enum types, and creates ten tables.
Earlier migrations remain immutable; Prisma generates table/column/index DDL while checks,
partial indexes, triggers, and SQL functions are raw SQL.

- `warehouse_inventories` is unique on `(warehouse_id, product_id, batch_code)` and keeps
  `quantity_on_hand`, `quantity_reserved`, `available_quantity`, `low_stock_threshold`, and
  `unit_code` as caller-configurable stock data. Multiple warehouses, products, batches, and units
  are supported; no unit conversion or price is invented.
- `inventory_movements` is append-only history. It records movement type, positive quantity,
  before/after available quantities, unit, reason, unique `reference_key`, optional actor, and
  organization inherited from the warehouse. `BEFORE UPDATE/DELETE/TRUNCATE` triggers reject
  mutation, while checks reject negative quantities.
- `inventory_reservations` has a unique `reference_key`, `settled_quantity`, `ACTIVE`/
  `RELEASED`/`DEDUCTED`/`CANCELLED` status, and optional expiry. `inventory_alerts` has a partial
  unique index allowing only one `OPEN` alert per inventory row; `ACKNOWLEDGED` and `RESOLVED`
  states are retained with actor/timestamp where applicable.
- `cropsy_apply_warehouse_stock_movement` locks the inventory row with `SELECT ... FOR UPDATE` and
  supports `ON_HAND_DELTA`, `SET_ON_HAND`, `RESERVE`, `RELEASE`, `DEDUCT_RESERVED`, and
  `DEDUCT_AVAILABLE` in one transaction. It enforces available stock, reserved-stock, and
  on-hand bounds, updates `available_quantity`, writes a movement, and opens/updates/resolves the
  low-stock alert in the same transaction. `cropsy_settle_inventory_reservation` locks the
  reservation row, caps settlement at the remaining quantity, and calls the movement function for
  `RELEASE` or `DEDUCT`. Unique reference keys make concurrent order attempts idempotent.
- `farmer_groups` has an owner, optional tenant, code, and status. `farmer_group_members` is unique
  on `(group_id, user_id)` and adds `LEADER`/`MEMBER` roles plus `PENDING`/`ACTIVE`/`REMOVED`
  status. `cooperative_campaigns` records product/unit, dates, status, and caller-configurable
  `allocation_policy_code` plus JSON `allocation_policy_config`.
- `group_contributions` stores each contributor's quantity, quality grade code, optional warehouse
  inventory reference, notes, status, and unique reference key.
  `group_purchase_requests` stores buyer-requested quantity/unit with optional caller-supplied
  `sales_amount` and `currency`. `group_allocations` is unique per
  `(purchase_request_id, contribution_id)` and snapshots `policy_code`, config, total weight, and
  calculation time. `group_earnings` keeps amount, currency, status, policy code, metadata, and
  links to the allocation, contribution, purchase request, campaign, group, and contributor.
- No commission rate, payment provider, payout schedule, tax, fee, or settlement rule is seeded or
  stored as a default. `QUALITY_WEIGHTED` allocation requires caller-supplied weights keyed by
  contributor user id or quality grade code; `PROPORTIONAL` divides by confirmed contribution
  quantity. Earnings divide the caller-supplied sales amount by allocated quantity with
  deterministic cent remainders.

`WAREHOUSE_STORE` selects the warehouse module's persistence adapter: `memory` is the local/test
default and production requires `prisma`. Cooperative records continue to use `FARM_STORE`; all
cross-module reads use read-only DI ports rather than direct source imports.

## Cart and order management follow-up

The follow-up migration `20261126000000_cart_order_management` adds one enum, two tables, and two
atomic listing-availability helpers. Earlier migrations remain immutable; Prisma generates table,
column, index, and foreign-key DDL while checks, tenant triggers, append-only triggers, and SQL
functions are raw SQL.

- `purchase_groups` is the parent checkout for one cart submission. It repeats tenant/buyer/cart
  scope, stores a unique caller-supplied `reference_key`, `CheckoutStatus`, currency, all server
  totals, and a `pricing_snapshot`. A repeated reference key returns the original checkout instead
  of creating another one.
- `orders.purchase_group_id` links each seller-specific fulfillment to that parent, and
  `orders.pricing_snapshot` stores the per-seller rules and computed amounts. One checkout creates
  one order per distinct seller so status, receipt, and totals remain seller-specific.
- `order_status_changes` is an append-only transition ledger with previous/new `OrderStatus`,
  reason, actor, tenant, checkout, and order references. Database triggers reject update, delete,
  and truncate; the application state machine and current-status guard decide which transitions
  are legal.
- Checks require non-negative checkout amounts, `discount_amount <= subtotal_amount`, and
  `total_amount = subtotal - discount + delivery_fee + tax`. Tenant-match triggers cover
  checkout-to-cart, order-to-checkout, and history-to-order/checkout references; a deferred
  tenant-immutable trigger blocks moving a checkout while dependent order/history rows remain.
- `cropsy_decrement_listing_availability` locks the listing row with `SELECT ... FOR UPDATE`,
  rejects non-positive or unavailable quantities, and decrements `quantity_available`.
  `cropsy_restore_listing_availability` rejects non-positive quantities and restores availability.
  Both run inside the checkout/cancellation transaction so concurrent checkouts cannot oversell.
- Caller-supplied pricing rules are snapshotted, not seeded. No delivery fee, discount, tax,
  commission, payment provider, or settlement rule is introduced by this migration.

`ORDERS_STORE` selects the orders module's persistence adapter: `memory` is the local/test default
and production requires `prisma`. The Prisma adapter creates the checkout, seller orders, status
history, cart mutations, and stock changes in transactions; the in-memory adapter mirrors the
same contract for local tests.

## Payment and ledger infrastructure follow-up

The follow-up migration `20261126010000_payment_ledger_infrastructure` adds the `LedgerBucket`
enum, six tables, payment/settlement columns, indexes, foreign keys, and database financial
invariants. Earlier migrations remain immutable; Prisma generates the table/column/index DDL while
checks, functions, constraint triggers, and tenant triggers are raw SQL.

- `payments` gains `purchase_group_id`, `metadata`, `allocation_snapshot`, and
  `commission_rule_snapshot`. Provider code/reference and idempotency key remain provider-
  and caller-supplied; no provider row or credential is seeded. `captured_amount <= amount` and
  `refunded_amount <= captured_amount` are database checks, complemented by the pre-existing
  status/amount/timestamp state check.
- `payment_status_changes` is an append-only state history with previous/new status, reason,
  actor, provider event id, metadata, and timestamps. `from_status` must differ from `to_status`.
  `payment_webhook_events` stores the raw callback payload, signature, processing status/error,
  and timestamps, with a unique `(provider_code, provider_event_id)` key for callback deduplication.
- `refunds` gains a unique `idempotency_key` and an `allocation_snapshot`; `settlements` gains
  `journal_id`, an `allocation_snapshot`, and a mandatory unique `idempotency_key`. Existing
  settlement rows receive a deterministic key from their id before the column becomes required.
  No commission rate, payout period, refund policy, or provider claim is seeded.
- `ledger_journals` is an immutable header with a unique `idempotency_key`, reference metadata,
  actor/request id, currency, and status. `ledger_journal_lines` stores positive `DEBIT`/`CREDIT`
  amounts in a `LedgerBucket` (`PENDING`, `AVAILABLE`, or `SETTLED`) with optional owner user.
  This journal pair is the canonical posting record used by the ledger module; the baseline
  `ledger_entries` table remains for legacy transaction-linked entries and reversals.
- `ledger_balances` holds signed balances keyed by `(account_id, owner_key, bucket, currency)` with
  optional tenant/owner scope. `ledger_audit_events` is an append-only financial audit trail.
  `reconciliation_expectations` stores expected amounts with a unique `expectation_key`, status,
  optional reference/journal ids, and match timestamp.
- `cropsy_assert_journal_balanced()` is a deferred constraint trigger at `COMMIT`: each journal
  must have a positive debit total equal to its credit total, so a transaction can insert lines
  incrementally but cannot commit an unbalanced journal (SQLSTATE `23514`).
- `cropsy_prevent_financial_history_mutation()` rejects `UPDATE`, `DELETE`, and `TRUNCATE` on
  payment status history and on posted journals, lines, and ledger audit events. Corrections are
  new rows (reversal/adjustment journals and new audit events), not rewrites.
- Tenant-match constraint triggers compare payment history/callbacks, journal lines, balances,
  expectations, and settlement journals with their parent tenant. The pre-deployment scan rejects
  inconsistent legacy rows. Unique keys also prevent duplicate payment ids, webhook events,
  journal posts, expectations, refunds, and settlements.

`PAYMENTS_STORE`, `LEDGER_STORE`, `BILLING_STORE`, and `ANALYTICS_STORE` select their modules' persistence adapters:
`memory` is the local/test default and production requires `prisma`. The Prisma stores write status
changes, journals, lines, balances, subscriptions, invoices, and usage in transactions; the
in-memory stores mirror the same contracts for local tests. Provider adapters are configured
outside the database through `PAYMENT_PROVIDER_MODE`/`PAYMENT_PROVIDERS_JSON`, and structural
chart-of-account overrides come from `LEDGER_ACCOUNTS_JSON`.

## Logistics, warehouse, quality, and traceability follow-up

The follow-up migration `20261126020000_logistics_warehouse_quality_traceability` adds operational
records without introducing a 21st module, a new permission, or any seeded business policy. Earlier
migrations remain immutable; Prisma generates the table/column/index/foreign-key DDL while the
existing raw-SQL constraints and triggers continue to protect the inventory/ledger/audit history.

- **Logistics:** `shipments` gains a mandatory unique `reference_key` (existing rows receive a
  deterministic `shipment:<id>` value before the column is constrained), provider/service/assignee
  references, recorded pickup/destination coordinates, planned distance, and notes.
  `deliveries` gains pickup/delivery `phase`, recorded coordinates, proof hash, failure reason,
  next-attempt time, and buyer confirmation metadata. `logistics_providers` gains tenant/owner
  references, recorded longitude/latitude, service radius, and `service_types`. New tables
  `delivery_services`, `shipment_routes`, `shipment_events`, and `delivery_audit_events` store
  service definitions, recorded routes, status events, and audit context (`before`/`after`, actor,
  request id, IP, user agent). No live GPS feed is simulated; all coordinates are recorded values.
- **Expanded warehouse:** `warehouse_inventories` gains an optional `location_id`. New
  `warehouse_locations`, `warehouse_staff_assignments`, `storage_condition_records`, and
  `inventory_reconciliations` tables hold locations, staff assignments, condition readings, and
  counted/system differences. Reconciliation is unique by `reference_key`, and approval is recorded
  explicitly; receipts, transfers, dispatch, and approval write through the existing append-only
  `inventory_movements` history. `InventoryMovementType` gains `RECEIPT`, `TRANSFER_IN`,
  `TRANSFER_OUT`, and `DISPATCH`. Fixture cleanup must retain immutable movement rows and their
  inventory/parent records because the existing append-only trigger also rejects the implicit
  `ON DELETE SET NULL` update.
- **Quality:** `quality_inspections` gains `batch_code`, caller-supplied `grade_code`/`grade_source`,
  and conservative `verification_status` (`UNVERIFIED` by default), verifier, and timestamp.
  `inspection_evidence` stores caller-supplied URI/checksum/MIME metadata with
  `public_disclosure` defaulting to `false`; `quality_audit_events` stores inspection action
  history. Creating or grading an inspection does not certify it.
- **Traceability:** the baseline `traceability_records` spatial event log remains. New
  `traceability_batches` carry a unique `verification_token`, unique
  `(organization_id, batch_code)`, disclosure/verification state, participant references, and QR
  payload. `traceability_events` form the chain of custody with event type, title, description,
  location description, recorded coordinates, source module/record, disclosure, verification, and
  metadata; the `(public_disclosure, verification_status)` index supports conservative public
  queries. `traceability_audit_events` records verification and QR actions. Public verification is
  derived from a verified, publicly disclosed batch plus verified, publicly disclosed events;
  unverified claims are never presented as certified. `TraceabilityEventType` gains `FARM_ORIGIN`,
  `CULTIVATION`, `WAREHOUSE_ENTRY`, `STORAGE_HISTORY`, `BUYER_CONFIRMED`, and `SELLER`.

`LOGISTICS_STORE`, `QUALITY_STORE`, `TRACEABILITY_STORE`, `BILLING_STORE`, and `ANALYTICS_STORE`
select the corresponding modules' persistence adapters: `memory` is the local/test default and
production requires `prisma`. Traceability
QR URLs use `WEB_PUBLIC_URL` (default `http://localhost:3000`) plus `/verify/<token>`; no external QR
service or provider credential is introduced.

## PostGIS geometry and nearby listings

Geometry columns are `Unsupported("geometry(...)")` in Prisma and are created by the migration:

- `Point, 4326`: `organization_addresses.location`, `user_addresses.location`, `farm_locations.location`, `listing_locations.location`, `warehouses.location`, `traceability_records.location`.
- Logistics: `logistics_providers.longitude`/`latitude`, `deliveries.longitude`/`latitude`, `shipments.pickup_*`/`destination_*`, `shipment_events.longitude`/`latitude`, and `traceability_events.longitude`/`latitude` are recorded `DECIMAL(10,7)` columns. Nearby-provider queries build WGS84 points with `ST_MakePoint(longitude, latitude)` and cast to `geography`; no geometry column is written for a simulated live location.
- `Polygon, 4326`: `farm_locations.boundary`, `land_parcels.boundary`.

Each non-null geometry column has a partial GiST index (`*_gix`) in the migration. Queries use raw SQL because Prisma Client cannot filter or return `Unsupported` geometry fields. Cast to `geography` so `ST_DWithin` distances are in meters:

```js
const nearby = await prisma.$queryRaw`
  SELECT
    pl.id,
    pl.title,
    pl.unit_price,
    ll.location AS location,
    ST_Distance(
      ll.location::geography,
      ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
    ) AS distance_meters
  FROM product_listings pl
  JOIN listing_locations ll ON ll.listing_id = pl.id
  WHERE pl.status = 'ACTIVE'::"ListingStatus"
    AND ll.location IS NOT NULL
    AND ST_DWithin(
      ll.location::geography,
      ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
      ${radiusMeters}
    )
  ORDER BY distance_meters
  LIMIT ${limit};
`;
```

`ST_MakePoint` takes **longitude first, latitude second**; SRID 4326 is WGS84. Writes to geometry columns also require raw SQL (or a separate migration), not Prisma Client. Marketplace proximity queries add caller-visible listing ids and statuses to the same primitive and return only a `distance_meters` summary; the service never serializes stored coordinates into public DTOs. Logistics nearby-provider discovery uses the same `geography`-cast `ST_DWithin`/`ST_Distance` pattern over decimal provider coordinates, ordering by meters and returning only recorded provider facts. Traceability event coordinates are private/internal metadata and are excluded from public verification output.

Farm map and spatial queries use the same raw geometry access inside the
`farmers` module: bounding boxes use `ST_MakeEnvelope`, radius searches cast to
`geography` for meter-based `ST_DWithin`, and polygon searches use
`ST_Intersects`. The service filters database candidates by farm visibility and
private-coordinate policy before serializing any geometry.

## AI decision-support boundaries

- `knowledge_sources`, `knowledge_documents`, `knowledge_chunks`, and `embedding_references` store ingestion metadata and references to an external vector collection; embeddings themselves are not stored as a Postgres vector type.
- `ai_recommendations` stores advisory payloads with `recommendation_type`, `confidence_score`, `model_version`, and `status` (`DRAFT` → `PUBLISHED` → `ACCEPTED`/`REJECTED`/`EXPIRED`). Confidence is metadata, not a guarantee.
- `agent_executions` records queued/running/succeeded/failed/cancelled runs with input/output/error fields. `ai_feedback` records user ratings and comments.
- AI output does not autonomously create orders, move money, post ledger entries, or change settlement state. Those remain application/domain decisions; unresolved rules belong in `PlatformSetting` or `rule_key` references.

## Seed contents and policy boundaries

[`seed.js`](../../apps/api/prisma/seed.js) runs all writes in one transaction and is idempotent. It uses `upsert` for reference rows and removes stale role-permission assignments so changed policies do not leave obsolete grants. It seeds reference data only:

| Data | Contents |
| --- | --- |
| Geography | 1 country (`BD`), 8 divisions, 64 districts, 64 upazilas, 64 unions |
| Access control | 22 roles (12 canonical categories + 10 legacy aliases), 54 permissions, and 507 role-to-permission assignments |
| Catalog | 13 reference product categories |
| Ledger skeleton | 10 chart-of-accounts entries (assets, liabilities, equity, revenue, expense) |
| Platform settings | `currency.default` (`BDT`, scale 2) and `geography.default_country` (`BD`) |

It deliberately does **not** seed users, organizations, farms, products, listings, orders, payments, or any business policy. Specifically:

- No commission rates: `commissions.rule_key`/`rate` are left to application policy and `basis` defaults to `EXTERNAL_RULE`.
- No payment providers: `payments.provider_code` is nullable and no provider rows are inserted; `PaymentMethod` is only an enum of method types.
- No subscription prices, entitlements, or limits: no `subscription_plans` rows are inserted even though `price_amount` is required by the schema. Plan segment codes, entitlements, usage limits, provider codes, and cycle overrides are caller-supplied policy, never seeded.
- No settlement rules: `settlements.rule_key` is left to application policy.
- No taxes, refund policies, or fees are defined. `orders.tax_amount`/`delivery_fee_amount`/`discount_amount` and their `purchase_groups` counterparts are storage columns written from server calculations only; delivery/discount rules are supplied by the caller at checkout and snapshotted rather than seeded.

These values remain configurable via `PlatformSetting` (`key` + `scope_key`), the `rule_key` fields on `commissions`/`settlements`, and application policy. No rates, providers, prices, or settlement rules are hardcoded here.

## Database tests

[`apps/api/test/database/integrity.test.js`](../../apps/api/test/database/integrity.test.js), [`apps/api/test/database/farms.test.js`](../../apps/api/test/database/farms.test.js), [`apps/api/test/database/agriculture.test.js`](../../apps/api/test/database/agriculture.test.js), [`apps/api/test/database/catalog-marketplace.test.js`](../../apps/api/test/database/catalog-marketplace.test.js), [`apps/api/test/database/orders.test.js`](../../apps/api/test/database/orders.test.js), [`apps/api/test/database/payments.test.js`](../../apps/api/test/database/payments.test.js), [`apps/api/test/database/ledger.test.js`](../../apps/api/test/database/ledger.test.js), and [`apps/api/test/database/logistics-warehouse-quality-traceability.test.js`](../../apps/api/test/database/logistics-warehouse-quality-traceability.test.js) run only when `DATABASE_URL` is set. [`scripts/test-database.sh`](../../scripts/test-database.sh), exposed as `npm run db:test`, provides a complete self-contained check: it starts a temporary PostgreSQL 17 + PostGIS 3.5 container, validates and generates Prisma Client, deploys all migrations, checks for drift, runs the seed twice, then executes the tests. `CROPSY_RUN_DB_TESTS=1 npm run verify` includes this containerized run.

Covered cases:

| Case | Enforcement checked |
| --- | --- |
| Duplicate records | `roles.code` and `payments.idempotency_key` unique indexes |
| Invalid foreign keys | `payments.order_id` and `ledger_entries.account_id` FK constraints |
| Cross-tenant access | child/parent tenant mismatch and deferred parent reassignment guard |
| Negative inventory | `product_inventories` check constraints and over-reservation helper |
| Invalid financial transactions | payment status/amount check, refund cap trigger, balanced-ledger deferred trigger |
| Concurrent updates | two parallel `reserve_product_inventory` calls and two parallel warehouse reservation calls; only one succeeds and stock is never oversold |
| Auditability | audit log update/delete rejection |
| Organization documents | FK rejection for unknown organization/uploader and `PENDING` verification default |
| Preference uniqueness | one row per `(user_id, channel, event_type)` |
| Profile extension scope | `scope_key` check and `(user_id, role_code, scope_key)` uniqueness |
| One primary address | partial unique indexes for user and organization addresses |
| Farm bundle persistence | farm, location, parcel, soil, and irrigation round-trip through `FarmPrismaStore` |
| PostGIS queries | bounding box, meter-based radius, polygon, status, and archived-farm filters |
| Invalid farm geography | outside-Bangladesh points, wrong SRID, and self-intersecting polygons rejected by checks |
| Soil and irrigation invariants | pH/organic-matter bounds and tenant-match triggers |
| Farm tenant immutability | reassignment blocked while child rows still reference the old tenant |
| Agriculture persistence | `AgriculturePrismaStore` normalizes decimals and filters expense/calendar records |
| Crop/expense guards | calendar scope/month/harvest window, recommendation AI rule/scope/calendar match, expense amount/currency/source/confidence, and variety/tenant matches |
| Typed catalog attributes | correct typed columns, single-column enforcement, `ENUM` membership, `ENUM` definition array check, and cross-tenant value rejection |
| Catalog tenant guards | product/variety tenant mismatch, attribute tenant mismatch, and tenant reassignment blocked while dependent rows remain |
| Marketplace constraints | listing/location completeness, image/favorite/report uniqueness, blank message rejection, and pending-review metadata guard |
| Listing proximity | PostGIS radius/status filtering, meter distance, location normalization, and `MarketplacePrismaStore` listing/product normalization |
| Warehouse reservation idempotency | duplicate concurrent reservation reference keys are rejected once; one reservation and one movement remain with consistent quantities |
| Warehouse settlement concurrency | two parallel `cropsy_settle_inventory_reservation` deductions; one succeeds, settled quantity and stock stay consistent, and one movement is written |
| Append-only movement history | direct update and delete of `inventory_movements` are rejected |
| Checkout totals and idempotency | parent `total_amount` equation, non-negative amounts, and unique `reference_key` |
| Append-only order history | direct update and delete of `order_status_changes` are rejected |
| Checkout/cart tenant consistency | cross-tenant cart, checkout, order, and history references are rejected; parent tenant reassignment is blocked |
| Listing availability helpers | atomic decrement/restore, positive-quantity checks, bounded stock, and rejection of oversell |
| Payment amount/idempotency guards | captured/refunded bounds, duplicate payment id/reference/idempotency keys, append-only status history, and webhook event uniqueness/tenant match |
| Journal balance and immutability | unbalanced commits rejected by deferred trigger, duplicate journal keys rejected, positive line amounts, and update/delete of posted journals/lines/audits rejected |
| Settlement/reconciliation guards | settlement net/period checks, unique settlement and expectation keys, and cross-tenant financial references rejected |
| Logistics PostGIS proximity | `ST_DWithin`/`ST_Distance` geography casts include a nearby provider and exclude a far provider |
| Operational unique keys | duplicate shipment `reference_key`, traceability `verification_token`, and reconciliation `reference_key` are rejected |
| Conservative verification defaults | inspection verification starts `UNVERIFIED`, grade source defaults to `INSPECTOR`, and evidence disclosure defaults to `false` |
| Verified public traceability facts | a verified public batch returns only verified, publicly disclosed events |
| Operational history | `RECEIPT` movement quantity/reference and reconciliation counted/system difference are preserved |
| Migration and seed state | eleven applied migrations, no drift, logistics/warehouse/quality/traceability objects, and stable 22/51/486/13 counts |

## Validation performed

The final review run completed the following checks:

1. `prisma format` — schema formatted successfully.
2. `prisma validate` — schema valid.
3. `prisma generate` — Prisma Client generated successfully.
4. `prisma migrate deploy` on a fresh temporary PostgreSQL 17 + PostGIS 3.5 instance — all eleven migrations applied, including indexes, functions, triggers, validated checks, nullable email, the new OTP purpose, organization/profile tables, farm soil/irrigation tables, area/soil/irrigation checks, farm geometry/tenant guards, crop calendars, recommendations, expense guards, catalog attribute types, marketplace constraints, catalog/marketplace tenant guards, warehouse movement/settlement functions, append-only movement triggers, low-stock alert uniqueness, cooperative tables, parent checkouts, seller fulfillments, append-only status history, atomic listing availability helpers, payment history/callbacks, immutable journals, bucket balances, reconciliation expectations, database financial invariants, logistics providers/services/shipments/deliveries/audits, warehouse locations/staff/conditions/reconciliations, quality inspections/evidence/audits, and traceability batches/events/audits.
5. `prisma migrate diff --from-migrations --to-schema-datamodel` — empty diff; no drift between migrations and schema.
6. Idempotent seed run twice — stable counts: 1 country, 8 divisions, 64 districts, 64 upazilas, 64 unions, 22 roles (12 canonical + 10 aliases), 51 permissions, 486 assignments, 13 product categories, 10 ledger accounts, and 2 platform settings.
7. `npm run db:test` — 45/45 database tests passed (13 integrity/concurrency, 6 farm/PostGIS, 5 agriculture persistence/guards, 5 catalog/marketplace persistence/guards, 4 cart/order invariants, 4 ledger invariants, 3 payment invariants, and 5 logistics/warehouse/quality/traceability invariants).
8. `npm run test -w @cropsy/api` — 71/71 API tests passed, including default-deny, tenant scoping, conservative public verification, PostGIS-backed nearby discovery, append-only history behavior, and QR output.
9. `CROPSY_RUN_DB_TESTS=1 npm run verify` — boundary check, lint, format check, builds, API/AI tests, containerized database tests, and live health checks passed.

## Operational notes

- `DATABASE_URL` must be set. The seed throws if it is missing. [`packages/config/index.js`](../../packages/config/index.js) validates a default for the API, but Prisma reads the environment directly; use the template in [`.env.example`](../../.env.example) explicitly.
- `FARM_STORE` selects the farmers module's persistence adapter. `memory` is the local/test default; production requires `FARM_STORE=prisma` so farm bundles and PostGIS queries use the tables described here.
- `AGRICULTURE_STORE` selects the agriculture module's persistence adapter. `memory` is the local/test default; production requires `AGRICULTURE_STORE=prisma` so calendars, cultivations, activities, harvests, expenses, and reports use the tables described here.
- `CATALOG_STORE` selects the catalog module's persistence adapter. `memory` starts empty for local/tests; production requires `CATALOG_STORE=prisma` so taxonomy, units, grades, attributes, varieties, and images use the tables described here.
- `MARKETPLACE_STORE` selects the marketplace module's persistence adapter. `memory` uses haversine for local/tests; production requires `MARKETPLACE_STORE=prisma` so listings, locations, favorites, reports, messages, and PostGIS proximity use the tables described here.
- `WAREHOUSE_STORE` selects the warehouse module's persistence adapter. `memory` is the local/test default; production requires `WAREHOUSE_STORE=prisma` so warehouses, stock, reservations, movements, and alerts use the tables and SQL functions described here. Cooperative records continue to use `FARM_STORE`.
- `ORDERS_STORE` selects the orders module's persistence adapter. `memory` is the local/test default; production requires `ORDERS_STORE=prisma` so carts, parent checkouts, seller fulfillments, status history, and listing stock changes use the transactional tables and SQL functions described here.
- `PAYMENTS_STORE` selects the payments module's persistence adapter. `memory` is the local/test default; production requires `PAYMENTS_STORE=prisma`, `PAYMENT_PROVIDER_MODE=configured`, and configured providers with codes, methods, and webhook secrets. No real provider credentials are committed, and the mock adapter is accepted only in automated tests.
- `LEDGER_STORE` selects the ledger module's persistence adapter. `memory` is the local/test default; production requires `LEDGER_STORE=prisma`. `LEDGER_ACCOUNTS_JSON` may override structural accounts, but commission rates, refund policies, and settlement periods remain caller-supplied policy snapshots or external rule keys.
- `LOGISTICS_STORE` selects the logistics module's persistence adapter. `memory` is the local/test default; production requires `LOGISTICS_STORE=prisma` so providers/services/shipments/deliveries/audits and nearby PostGIS queries use these tables.
- `QUALITY_STORE` selects the quality module's persistence adapter. `memory` is the local/test default; production requires `QUALITY_STORE=prisma` so inspections, evidence, grading, verification, and audits use these tables.
- `TRACEABILITY_STORE` selects the traceability module's persistence adapter. `memory` is the local/test default; production requires `TRACEABILITY_STORE=prisma` so batches/events/audits and public verification use these tables. `WEB_PUBLIC_URL` controls the QR verification base URL and defaults to `http://localhost:3000`.
- `BILLING_STORE` selects the billing module's persistence adapter. `memory` starts empty for local/tests; production requires `BILLING_STORE=prisma` so configurable plans, tenant subscriptions, invoices, and usage records use these tables. Plan prices, billing-cycle overrides, entitlements, limits, and provider codes are always caller-supplied; the migration seeds no commercial policy.
- `ANALYTICS_STORE` selects the analytics module's persistence adapter. `memory` starts empty for local/tests; production requires `ANALYTICS_STORE=prisma` so reports read parameterized SQL aggregations from the tables below. The follow-up `20261128000000_analytics_reporting_indexes` adds tenant/time/entity composite indexes only; it seeds no facts, metrics, or predictions.
- Append-only history applies to `inventory_movements`, `order_status_changes`, payment status history, and ledger journals/lines/audits. Cleanup must retain immutable rows and avoid implicit updates from parent deletes (for example, deleting an inventory fires the movement's `ON DELETE SET NULL` update and is rejected).
- First migration needs a role that can `CREATE EXTENSION postgis`.
- `Unsupported` geometry fields are not available through Prisma Client. Use `$queryRaw` / `$executeRaw` for geometry reads and writes, and manage spatial indexes in raw SQL migrations.
- The initial migration is the immutable baseline; `20261125120000_review_hardening`, `20261125130000_auth_identity`, `20261125140000_organization_profile_management`, `20261125150000_farm_management`, `20261125160000_crop_cultivation_expense_management`, `20261125170000_catalog_marketplace`, `20261125180000_inventory_cooperative`, `20261126000000_cart_order_management`, `20261126010000_payment_ledger_infrastructure`,
`20261126020000_logistics_warehouse_quality_traceability`,
`20261127000000_billing_subscription_management`, and
`20261128000000_analytics_reporting_indexes` are follow-ups. The billing follow-up adds only
nullable/configurable columns and check constraints for caller-supplied cycle and invoice-period
policy; no plan rows, prices, entitlements, or limits are inserted. The analytics follow-up adds
composite indexes only. Future schema or invariant changes require new migrations; do not edit any
applied migration in place.

# Database design

This document describes the CROPSY PostgreSQL database. Sources of truth are [`schema.prisma`](../../apps/api/prisma/schema.prisma), the [initial migration](../../apps/api/prisma/migrations/20261125000000_init/migration.sql), the [review-hardening migration](../../apps/api/prisma/migrations/20261125120000_review_hardening/migration.sql), the [auth-identity migration](../../apps/api/prisma/migrations/20261125130000_auth_identity/migration.sql), and the [idempotent seed](../../apps/api/prisma/seed.js). The root baseline documents `RTB.md`, `SSD.md`, and `user-story.md` remain unchanged.

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
- No currency conversion rates, taxes, or multi-currency policies are seeded. An `orders.tax_amount` column exists, but the tax policy itself is application/configuration policy.

## Bangladesh administrative geography

The hierarchy is strict and uses required `RESTRICT` foreign keys:

`countries` → `divisions` → `districts` → `upazilas` → `unions`

Addresses, farm locations, listing locations, and warehouses reference division/district/upazila/union through **optional** FKs with `ON DELETE SET NULL`, so deleting a reference row does not destroy the address record. Codes (for example `BD-DHA`, `BD-DHA-DHA`) are unique.

The seed inserts Bangladesh (`BD`), 8 divisions, and 64 districts with English and Bengali names. It does **not** seed upazilas or unions.

## Tenant isolation and scopes

- `organization_id` identifies tenant-owned rows. `NULL` means platform scope. It is optional on most domain tables (with `ON DELETE SET NULL`) and required on `warehouses` and `subscriptions` (with `ON DELETE RESTRICT`).
- `scope_key` is a non-null surrogate used in unique keys because PostgreSQL treats `NULL`s as distinct:
  - `user_roles`: `PLATFORM` or the organization UUID.
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
| Agriculture | `FarmType`, `FarmStatus`, `LandOwnership`, `LandParcelStatus`, `CropCategory`, `CultivationStatus`, `FarmActivityType`, `HarvestStatus`, `AgriculturalInputCategory` |
| Marketplace | `ListingStatus`, `PriceSource` |
| Commerce | `CartStatus`, `OrderStatus`, `PaymentMethod`, `PaymentStatus`, `RefundStatus`, `RefundReason`, `TransactionType`, `TransactionDirection`, `TransactionStatus`, `LedgerAccountType`, `NormalBalance`, `CommissionBasis`, `CommissionStatus`, `SettlementStatus` |
| Logistics | `ShipmentStatus`, `DeliveryStatus`, `WarehouseStatus`, `InspectionResult`, `TraceabilityEventType` |
| AI | `KnowledgeSourceType`, `DocumentStatus`, `LanguageCode`, `ChatRole`, `RecommendationType`, `RecommendationStatus`, `AgentStatus` |
| SaaS | `BillingInterval`, `SubscriptionStatus`, `InvoiceStatus` |
| System | `NotificationChannel`, `NotificationStatus`, `AuditSeverity`, `OutboxStatus` |

Enum values are defined in `schema.prisma` and the migration. `OtpPurpose` includes `EMAIL_VERIFICATION`, `PHONE_VERIFICATION`, `PASSWORD_RESET`, `LOGIN`, and the follow-up `ACCOUNT_RECOVERY` value used by deactivated/locked account recovery. Enum defaults describe lifecycle state, not business pricing or settlement policy.

## Indexes and unique constraints

- Prisma-generated B-tree indexes cover FKs and common filters, typically `(organization_id, status)`, `(organization_id, created_at)`, and date/entity lookups. The review migration added 49 indexes that were missing a leading FK column (for example `products.category_id`, `conversations.user_id`, `notifications.user_id`, and Bangladesh district/upazila/union lookups) plus `outbox_events(status, available_at)` for global worker polling.
- Composite unique constraints cover join and scoped records, for example `(user_id, role_id, scope_key)`, `(role_id, permission_id)`, `(product_id, scope_key)`, `(cart_id, listing_id)`, `(warehouse_id, product_id, batch_code)`, `(key, scope_key)`, and `(subscription_id, metric_code, recorded_at)`.
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
- **Geography/agriculture:** non-negative farm size and total area; strictly positive land-parcel and cultivation area; season months 1–12; expected harvest not before planting; non-negative activity cost and harvest quantity.
- **Marketplace/inventory:** non-negative image sort order; `product_inventories.scope_key` must match `warehouse_id`; `available_quantity = quantity_on_hand - quantity_reserved` with non-negative bounds and `quantity_reserved <= quantity_on_hand`; positive listing, price-history, and cart prices; positive listing quantities and `min_order_quantity`; listing window ordering; positive location radius.
- **Commerce/financial:** cart quantity/price positive; order amounts non-negative with `discount_amount <= subtotal_amount` and `total_amount = subtotal - discount + delivery_fee + tax`; `line_total = ROUND(quantity * unit_price, 2)`; payment amounts positive with `captured_amount <= amount` and `refunded_amount <= captured_amount`; refund/transaction/ledger amounts positive; commission amount/rate non-negative; `net_amount = gross_amount - deductions_amount` and settlement period ordering.
- **Logistics:** positive warehouse capacity when set; warehouse inventory quantity consistency mirroring product inventory.
- **AI/SaaS/system:** AI feedback rating 1–5 when present; non-negative plan price and trial days; subscription/invoice/usage period and amount rules; non-negative outbox attempts; `feature_flags` and `platform_settings` scope keys must match `organization_id`.

Triggers:

- `refunds_within_captured_amount` calls `enforce_refund_cap()` before insert or update of `amount`, `status`, or `payment_id`. For `PROCESSED` refunds, the sum of processed refunds (including the new row) must not exceed the payment's `captured_amount`.
- `ledger_entries_immutable` calls `prevent_posted_ledger_mutation()` before update or delete. Once `posted_at` is set, a ledger entry cannot be changed or removed; corrections require a reversal entry via `reversal_of_id`.

## Engineering review hardening

The follow-up migration `20261125120000_review_hardening` was added after a full database review. The baseline migration was not edited. All new checks are derived from existing columns/enums; no commission rate, payment provider, subscription price, tax, refund, or settlement policy was introduced.

### Referential, unique, and FK behavior review

- All 73 tables keep UUID primary keys and explicit FK actions (`CASCADE`, `RESTRICT`, `SET NULL`) chosen by domain lifetime. Natural keys and join keys remain covered by the baseline unique indexes/constraints.
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
- The seed now maps the 11 canonical user categories and 10 legacy aliases to
  40 permissions. See [`../security/permission-matrix.md`](../security/permission-matrix.md)
  for the effective grid.

## PostGIS geometry and nearby listings

Geometry columns are `Unsupported("geometry(...)")` in Prisma and are created by the migration:

- `Point, 4326`: `organization_addresses.location`, `user_addresses.location`, `farm_locations.location`, `listing_locations.location`, `warehouses.location`, `traceability_records.location`.
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

`ST_MakePoint` takes **longitude first, latitude second**; SRID 4326 is WGS84. Writes to geometry columns also require raw SQL (or a separate migration), not Prisma Client.

## AI decision-support boundaries

- `knowledge_sources`, `knowledge_documents`, `knowledge_chunks`, and `embedding_references` store ingestion metadata and references to an external vector collection; embeddings themselves are not stored as a Postgres vector type.
- `ai_recommendations` stores advisory payloads with `recommendation_type`, `confidence_score`, `model_version`, and `status` (`DRAFT` → `PUBLISHED` → `ACCEPTED`/`REJECTED`/`EXPIRED`). Confidence is metadata, not a guarantee.
- `agent_executions` records queued/running/succeeded/failed/cancelled runs with input/output/error fields. `ai_feedback` records user ratings and comments.
- AI output does not autonomously create orders, move money, post ledger entries, or change settlement state. Those remain application/domain decisions; unresolved rules belong in `PlatformSetting` or `rule_key` references.

## Seed contents and policy boundaries

[`seed.js`](../../apps/api/prisma/seed.js) runs all writes in one transaction and is idempotent. It uses `upsert` for reference rows and removes stale role-permission assignments so changed policies do not leave obsolete grants. It seeds reference data only:

| Data | Contents |
| --- | --- |
| Geography | 1 country (`BD`), 8 divisions, 64 districts |
| Access control | 21 roles (11 canonical categories + 10 legacy aliases), 40 permissions, and 363 role-to-permission assignments |
| Catalog | 10 product categories |
| Ledger skeleton | 10 chart-of-accounts entries (assets, liabilities, equity, revenue, expense) |
| Platform settings | `currency.default` (`BDT`, scale 2) and `geography.default_country` (`BD`) |

It deliberately does **not** seed users, organizations, farms, products, listings, orders, payments, or any business policy. Specifically:

- No commission rates: `commissions.rule_key`/`rate` are left to application policy and `basis` defaults to `EXTERNAL_RULE`.
- No payment providers: `payments.provider_code` is nullable and no provider rows are inserted; `PaymentMethod` is only an enum of method types.
- No subscription prices: no `subscription_plans` rows are inserted even though `price_amount` is required by the schema.
- No settlement rules: `settlements.rule_key` is left to application policy.
- No taxes, refund policies, or fees are defined. `orders.tax_amount`/`delivery_fee_amount`/`discount_amount` are storage columns only.

These values remain configurable via `PlatformSetting` (`key` + `scope_key`), the `rule_key` fields on `commissions`/`settlements`, and application policy. No rates, providers, prices, or settlement rules are hardcoded here.

## Database tests

[`apps/api/test/database/integrity.test.js`](../../apps/api/test/database/integrity.test.js) runs only when `DATABASE_URL` is set. [`scripts/test-database.sh`](../../scripts/test-database.sh), exposed as `npm run db:test`, provides a complete self-contained check: it starts a temporary PostgreSQL 17 + PostGIS 3.5 container, validates and generates Prisma Client, deploys all migrations, checks for drift, runs the seed twice, then executes the tests.

Covered cases:

| Case | Enforcement checked |
| --- | --- |
| Duplicate records | `roles.code` and `payments.idempotency_key` unique indexes |
| Invalid foreign keys | `payments.order_id` and `ledger_entries.account_id` FK constraints |
| Cross-tenant access | child/parent tenant mismatch and deferred parent reassignment guard |
| Negative inventory | `product_inventories` check constraints and over-reservation helper |
| Invalid financial transactions | payment status/amount check, refund cap trigger, balanced-ledger deferred trigger |
| Concurrent updates | two parallel `reserve_product_inventory` calls; only one succeeds and stock is never oversold |
| Auditability | audit log update/delete rejection |

## Validation performed

The final review run completed the following checks:

1. `prisma format` — schema formatted successfully.
2. `prisma validate` — schema valid.
3. `prisma generate` — Prisma Client generated successfully.
4. `prisma migrate deploy` on a fresh temporary PostgreSQL 17 + PostGIS 3.5 instance — all three migrations applied, including the new indexes, functions, triggers, validated checks, nullable email, and the new OTP purpose.
5. `prisma migrate diff --from-migrations --to-schema-datamodel` — empty diff; no drift between migrations and schema.
6. Idempotent seed run twice — stable counts: 1 country, 8 divisions, 64 districts, 21 roles (11 canonical + 10 aliases), 40 permissions, 363 assignments, 10 product categories, 10 ledger accounts, and 2 platform settings.
7. `npm run db:test` — 7/7 database integrity/concurrency tests passed.
8. `npm run verify` — boundary check, lint, format check, builds, API/AI tests, and live health checks passed.

## Operational notes

- `DATABASE_URL` must be set. The seed throws if it is missing. [`packages/config/index.js`](../../packages/config/index.js) validates a default for the API, but Prisma reads the environment directly; use the template in [`.env.example`](../../.env.example) explicitly.
- First migration needs a role that can `CREATE EXTENSION postgis`.
- `Unsupported` geometry fields are not available through Prisma Client. Use `$queryRaw` / `$executeRaw` for geometry reads and writes, and manage spatial indexes in raw SQL migrations.
- The initial migration is the immutable baseline; `20261125120000_review_hardening` and `20261125130000_auth_identity` are follow-ups. Future schema or invariant changes require new migrations; do not edit any applied migration in place.

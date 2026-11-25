# Database documentation

This folder documents the CROPSY PostgreSQL/PostGIS database.

- [ERD](./erd.md) — entity-relationship diagrams grouped by domain, covering every model in `schema.prisma`.
- [Design notes](./design.md) — technology choices, invariants, PostGIS queries, seed contents, validation, and operations.

Source of truth:

- [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma)
- [`apps/api/prisma/migrations/20261125000000_init/migration.sql`](../../apps/api/prisma/migrations/20261125000000_init/migration.sql) — immutable baseline
- [`apps/api/prisma/migrations/20261125120000_review_hardening/migration.sql`](../../apps/api/prisma/migrations/20261125120000_review_hardening/migration.sql) — review-driven indexes, tenant/financial/ledger/audit invariants, and inventory helpers
- [`apps/api/prisma/migrations/20261125130000_auth_identity/migration.sql`](../../apps/api/prisma/migrations/20261125130000_auth_identity/migration.sql) — nullable `users.email`, partial unique email index, and `ACCOUNT_RECOVERY` OTP purpose
- [`apps/api/prisma/migrations/20261125140000_organization_profile_management/migration.sql`](../../apps/api/prisma/migrations/20261125140000_organization_profile_management/migration.sql) — organization profile, documents, preferences, and role extensions
- [`apps/api/prisma/migrations/20261125150000_farm_management/migration.sql`](../../apps/api/prisma/migrations/20261125150000_farm_management/migration.sql) — farm profile, soil, irrigation, and geographic guards
- [`apps/api/prisma/migrations/20261125160000_crop_cultivation_expense_management/migration.sql`](../../apps/api/prisma/migrations/20261125160000_crop_cultivation_expense_management/migration.sql) — calendars, cultivations, activities, recommendations, and expenses
- [`apps/api/prisma/migrations/20261125170000_catalog_marketplace/migration.sql`](../../apps/api/prisma/migrations/20261125170000_catalog_marketplace/migration.sql) — catalog taxonomy/attributes and marketplace listings, favorites, reports, and messages
- [`apps/api/prisma/migrations/20261125180000_inventory_cooperative/migration.sql`](../../apps/api/prisma/migrations/20261125180000_inventory_cooperative/migration.sql) — warehouse inventory movements/reservations/alerts and cooperative groups/campaigns/contributions/allocations/earnings
- [`apps/api/prisma/seed.js`](../../apps/api/prisma/seed.js)

## Quick commands

Run from the repository root with `DATABASE_URL` set (see [`.env.example`](../../.env.example)):

```bash
npm run db:format            # prisma format
npm run db:validate          # prisma validate
npm run db:generate          # prisma generate
npm run db:migrate:deploy    # prisma migrate deploy
npm run db:seed              # idempotent reference-data seed
npm run db:test              # temporary PostGIS container + migration drift check + DB tests
```

`db:generate` is required after schema changes so Prisma Client matches the schema. `db:seed` is safe to re-run; it uses `upsert` plus targeted cleanup of stale role-permission rows. `db:test` requires Docker; it starts and removes its own PostgreSQL 17 + PostGIS 3.5 container and does not need `DATABASE_URL` in advance.

## Baseline documents

The root baseline documents [`RTB.md`](../../RTB.md), [`SSD.md`](../../SSD.md), and [`user-story.md`](../../user-story.md) are intentionally unchanged by this database work.

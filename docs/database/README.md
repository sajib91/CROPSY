# Database documentation

This folder documents the CROPSY PostgreSQL/PostGIS database.

- [ERD](./erd.md) — entity-relationship diagrams grouped by domain, covering every model in `schema.prisma`.
- [Design notes](./design.md) — technology choices, invariants, PostGIS queries, seed contents, validation, and operations.

Source of truth:

- [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma)
- [`apps/api/prisma/migrations/20261125000000_init/migration.sql`](../../apps/api/prisma/migrations/20261125000000_init/migration.sql) — immutable baseline
- [`apps/api/prisma/migrations/20261125120000_review_hardening/migration.sql`](../../apps/api/prisma/migrations/20261125120000_review_hardening/migration.sql) — review-driven indexes, tenant/financial/ledger/audit invariants, and inventory helpers
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

`db:generate` is required after schema changes so Prisma Client matches the schema. `db:seed` is safe to re-run; it uses `upsert` only. `db:test` requires Docker; it starts and removes its own PostgreSQL 17 + PostGIS 3.5 container and does not need `DATABASE_URL` in advance.

## Baseline documents

The root baseline documents [`RTB.md`](../../RTB.md), [`SSD.md`](../../SSD.md), and [`user-story.md`](../../user-story.md) are intentionally unchanged by this database work.

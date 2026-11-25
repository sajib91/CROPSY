# Database infrastructure

Database assets live in [`apps/api/prisma`](../../apps/api/prisma) (schema, immutable initial migration, review-hardening follow-up migration, and idempotent seed). Design documentation lives in [`docs/database`](../../docs/database).

## Local connection

Set `DATABASE_URL` before running Prisma commands or the seed:

```bash
DATABASE_URL='postgresql://cropsy:cropsy@localhost:5432/cropsy?schema=public&connection_limit=5'
```

This is the template from [`.env.example`](../../.env.example). The database user must be able to `CREATE EXTENSION postgis` on first migration.

## Optional local PostGIS container

```bash
docker run --name cropsy-postgis \
  -e POSTGRES_DB=cropsy \
  -e POSTGRES_USER=cropsy \
  -e POSTGRES_PASSWORD=cropsy \
  -p 5432:5432 \
  -d postgis/postgis:17-3.5
```

Then apply the baseline and review-hardening migrations with `npm run db:migrate:deploy` and `npm run db:seed` from the repository root. For a fully automated check that also runs the database integrity tests, use `npm run db:test` (Docker required).

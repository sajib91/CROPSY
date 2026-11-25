# CROPSY Business API

Fastify service with validated environment configuration, security and CORS plugins, centralized
error handling, versioning, request observability, 20 explicitly bounded business modules, graceful
shutdown, and the Prisma data-layer assets for PostgreSQL/PostGIS. The module scaffolding exposes
architecture introspection only; business workflows and product policies are not implemented yet.

## Internal architecture

Each module under `src/modules/<module-id>/` owns four layers:

- `domain/` — DDD-lite entity and repository port with a DI token.
- `application/` — module-specific service, Zod DTO schema, and DTO mapper.
- `infrastructure/` — adapter implementing the repository port.
- `presentation/` — Fastify route plugin with request validation.
- `index.js` — module definition and dependency-registration seam.

Application services receive repository ports through constructor injection from the composition
root (`src/modules/index.js`). Presentation resolves its own service token; it never constructs
infrastructure. Cross-module source imports are forbidden. Dependencies between modules are
declared in `src/modules/registry.js` and integrated through the shared event bus.

See [`docs/architecture`](../../docs/architecture/README.md) for the full module catalog, dependency
direction, and ADRs.

## Endpoints

Foundation and architecture endpoints, all under `API_PREFIX` (default `/api/v1`):

- `GET /health`
- `GET /health/ready`
- `GET /`
- `GET /version`
- `GET /modules`
- `GET /modules/:moduleId`
- `GET /observability`
- `GET /<module-path>/info`
- `GET /<module-path>/info/:moduleId`

Module paths are `iam`, `users`, `organizations`, `farmers`, `buyers`, `agriculture`, `catalog`,
`marketplace`, `orders`, `payments`, `ledger`, `logistics`, `warehouse`, `quality`, `traceability`,
`intelligence`, `knowledge`, `notifications`, `billing`, and `administration`.

The health endpoints deliberately do not connect to the database. Requests may send
`x-request-id`; it is echoed and included in structured logs. `x-api-version` must match the active
version.

## Cross-cutting behavior

- Validation: Zod schemas at route boundaries and DTO outputs.
- Errors: one handler maps domain, validation, not-found, and infrastructure errors to a stable
  `{ success: false, error, meta }` envelope with a request id.
- Events: bounded in-process history available from `/observability`.
- Logging: structured request completion records with module, version, status, and duration.
- Versioning: `API_PREFIX` must end in a supported version segment, currently `v1`.

## Data layer

- `prisma/schema.prisma` — complete schema with UUID keys, BDT decimal money fields, tenant keys,
  Bangladesh geography, status enums, and PostGIS geometry columns.
- `prisma/migrations/` — initial migration, including raw SQL checks, partial unique indexes,
  triggers, and GiST indexes.
- `prisma/seed.js` — idempotent reference-data seed.

See [`docs/database`](../../docs/database/README.md) for the ERD and design documentation.

## Commands

From the repository root:

```bash
npm run dev:api
npm run start:api
npm test -w @cropsy/api
npm run check:boundaries
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run db:test
```

Workspace-local Prisma helpers are also available: `npm run prisma:format`,
`npm run prisma:validate`, and `npm run prisma:generate -w @cropsy/api`. Set `DATABASE_URL` before
running database commands; see [`.env.example`](../../.env.example).

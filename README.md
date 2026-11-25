# CROPSY Monorepo

This repository contains the CROPSY foundation: four independently startable applications, four
shared JavaScript packages, a PostgreSQL/Prisma data layer, infrastructure and documentation
folders, and tooling. It configures health checks, development workflows, the database schema, and
the 20-module Clean Architecture/DDD-lite boundary scaffolding for the business API. **Business
workflows, authentication, external integrations, and product-specific policies are not
implemented yet.**

The baseline documents `user-story.md`, `SSD.md`, and `RTB.md` are kept unchanged at the root.

## Prerequisites

- Node.js 20 or newer (see `.nvmrc`)
- npm 10 or newer
- Python 3.11 or newer
- PostgreSQL with PostGIS for database workflows (optional for health-only verification)
- `curl` for end-to-end health verification

## Quick start

```bash
npm run setup
npm run verify
```

`npm run setup` installs JavaScript workspace dependencies with npm workspaces, creates a root
`.env` from `.env.example` if one does not exist, and installs Python dependencies into `.venv`.
It never overwrites an existing `.env`.

## Repository structure

```text
.
├── apps/
│   ├── web/       # Next.js 14, JavaScript, App Router, Tailwind CSS
│   ├── mobile/    # Expo 51, React Native, JavaScript, NativeWind
│   ├── api/       # Fastify business API and Prisma schema/migrations/seed
│   └── ai/        # FastAPI AI service
├── packages/
│   ├── shared/         # Response helpers and shared constants
│   ├── api-contracts/  # Validated health response contract
│   ├── validation/     # Reusable Zod primitives
│   └── config/         # Validated environment configuration
├── infrastructure/
│   ├── database/  # Local database notes and links to Prisma assets
│   ├── redis/
│   ├── qdrant/
│   ├── neo4j/
│   ├── opensearch/
│   └── storage/
├── docs/
│   ├── architecture/  # Module boundaries, dependency matrix, and ADRs
│   ├── api/
│   ├── database/  # ERD and database design notes
│   └── security/
└── scripts/
```

## Package manager strategy

- **JavaScript:** one npm workspace at the repository root. Run npm commands from the root.
- **Python:** pip dependencies installed into the root `.venv`.

Workspace dependencies are declared with the `@cropsy/*` package names and resolved by npm
workspaces. No `pnpm` or Yarn configuration is used.

## Environment variables

Copy `.env.example` to `.env` and adjust local values if needed. The template uses safe local
defaults only.

- Business API settings, including `DATABASE_URL`, are validated with Zod in `@cropsy/config`.
- Prisma reads `DATABASE_URL` directly; the root `.env` template includes a local PostgreSQL URL.
- AI settings are validated with `pydantic-settings`.
- Web and mobile use small local URL validators (`apps/web/lib/env.js` and
  `apps/mobile/src/config/env.js`) so browser/bundle-safe code does not depend on Node-only
  configuration modules.

Key defaults:

| Variable | Default | Used by |
| --- | --- | --- |
| `PORT` | `4000` | Business API |
| `API_PREFIX` | `/api/v1` | Business API |
| `DATABASE_URL` | `postgresql://cropsy:cropsy@localhost:5432/cropsy?schema=public&connection_limit=5` | Prisma / database scripts |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | Web |
| `EXPO_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | Mobile |
| `CROPSY_AI_HOST` | `0.0.0.0` | AI service |
| `CROPSY_AI_PORT` | `4100` | AI service |

## Development scripts

| Command | Purpose |
| --- | --- |
| `npm run setup` | Install JS and Python dependencies and prepare `.env` |
| `npm run dev` | Run API, web, and AI together with concurrently |
| `npm run dev:api` | Run business API in watch mode |
| `npm run dev:web` | Run Next.js development server |
| `npm run dev:mobile` | Start Expo |
| `npm run dev:ai` | Run FastAPI with reload |
| `npm run start:api` | Start built business API |
| `npm run start:web` | Start built web app |
| `npm run start:ai` | Start FastAPI without reload |
| `npm run build` | Validate packages, API, web, mobile syntax, and AI syntax |
| `npm test` | Run API contract smoke tests and AI health tests |
| `npm run lint` | Run ESLint across JavaScript files |
| `npm run check:boundaries` | Verify module, layer, and dependency boundaries |
| `npm run format` | Format files with Prettier, excluding Markdown |
| `npm run format:check` | Check formatting |
| `npm run db:format` | Format the Prisma schema |
| `npm run db:validate` | Validate the Prisma schema |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Create and apply a development migration |
| `npm run db:migrate:deploy` | Apply checked-in migrations |
| `npm run db:seed` | Seed idempotent reference data |
| `npm run db:test` | Run migration, drift, seed, and database integrity tests in a temporary PostGIS container |
| `npm run db:studio` | Open Prisma Studio |
| `npm run verify` | Lint, format check, build, test, and start all HTTP apps for health checks |

## Starting applications independently

### Business API

```bash
npm run dev:api
```

Health endpoints:

- `http://localhost:4000/api/v1/health`
- `http://localhost:4000/api/v1/health/ready`

Architecture endpoints:

- `http://localhost:4000/api/v1/` — API index and module directory
- `http://localhost:4000/api/v1/version`
- `http://localhost:4000/api/v1/modules`
- `http://localhost:4000/api/v1/observability`
- `http://localhost:4000/api/v1/iam/info` — example module DTO; all 20 modules are mounted

See [`docs/architecture`](docs/architecture/README.md) for the module dependency matrix, layer
rules, and decision records. `npm run check:boundaries` rejects direct cross-module imports and
outward layer dependencies.

### Web

```bash
npm run dev:web
```

Health endpoint:

- `http://localhost:3000/health`

For production-style startup, run `npm run build:web` first, then `npm run start:web`.

### Mobile

```bash
npm run dev:mobile
```

Expo requires a simulator, device, or Expo Go to run the full app. Repository verification checks
Expo configuration and transforms the JavaScript with the Expo Babel preset. The foundation screen
contains an API health probe utility in `apps/mobile/src/lib/health.js`.

### AI service

```bash
npm run dev:ai
```

Health endpoints:

- `http://localhost:4100/api/v1/health`
- `http://localhost:4100/api/v1/health/ready`
- Interactive docs: `http://localhost:4100/docs`

## Database

The PostgreSQL + PostGIS schema lives in `apps/api/prisma`. It uses UUID primary keys, Decimal
money fields defaulting to BDT, organization tenant keys, Bangladesh geography tables, status
enums, and raw SQL constraints/indexes/triggers/functions that Prisma cannot express. A review-hardening
migration adds tenant consistency guards, financial state checks, deferred ledger balancing,
append-only audit logs, and atomic inventory helpers. See
[`docs/database`](docs/database/README.md) for the ERD and design notes.

```bash
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run db:test
```

The seed is idempotent and inserts only reference data (roles, permissions, Bangladesh
divisions/districts, product categories, chart-of-accounts codes, and BDT/BD settings). It does
not invent commission rates, payment providers, subscription prices, or settlement rules. The
health endpoints do not connect to the database, so `npm run verify` can run without PostgreSQL.

## Health response shape

Where practical, health endpoints return:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "cropsy-business-api",
    "timestamp": "2026-01-01T00:00:00.000Z",
    "uptimeSeconds": 0.123
  }
}
```

The readiness response adds `data.checks`. The shared response contract is defined in
`packages/api-contracts/index.js`.

## Verification

`npm run verify` performs real checks in this order:

1. Module boundary and dependency check
2. ESLint
3. Prettier check
4. JavaScript package/API syntax, Next.js production build, mobile Babel transform, Python compile
5. Fastify smoke tests using `inject`
6. FastAPI smoke tests using `TestClient`
7. Starts the API, web, and AI services and requests each health endpoint over HTTP

To avoid collisions with other local services, health verification starts each app on an ephemeral
port and asserts the expected service name in each response. It stops all started services when
finished, even if a check fails.

## Scope

Reserved for later work: business use cases beyond module introspection, authentication,
Prisma-backed module adapters, external service clients, AI graphs, and deployment configurations.
The database schema, initial migration, seed, ERD, and design notes are implemented; the module
boundaries, DI wiring, DTO validation, exception handling, versioning, and observability scaffold
are implemented. The remaining `infrastructure/` subfolders are intentional structural
placeholders.

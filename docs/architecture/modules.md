# CROPSY business API modules

The business API is a **modular monolith** under `apps/api/src`. Each bounded module owns four
explicit layers: `domain`, `application`, `infrastructure`, and `presentation`. A module's
`index.js` is its composition seam. Cross-module source imports are forbidden; integration intent
is declared in `apps/api/src/modules/registry.js` and implemented through the shared in-process
event bus, never through another module's service class.

This scaffolding establishes boundaries and service seams only. It does not implement business
workflows, commission rules, payment providers, prices, or settlement policies.

## Layer rules

| Layer | May import | Must not import |
| --- | --- | --- |
| `domain` | Its own `domain`, shared kernel | Application, infrastructure, presentation, other modules |
| `application` | Its own `domain` and `application`, shared kernel | Infrastructure, presentation, other modules |
| `infrastructure` | Its own `domain`, `application`, and `infrastructure`, shared platform | Presentation, other modules |
| `presentation` | Its own `application`, `domain`, and `presentation`, shared platform | Infrastructure, other modules |
| module `index.js` | Its own layers and shared composition helpers | Other modules |

The dependency rule points inward: domain entities and repository ports have no framework or
persistence dependencies. Presentation resolves an application service token from the container;
it never constructs infrastructure adapters.

## Module catalog

`Depends on` records permitted **conceptual/event** dependencies. It is not a list of allowed
source imports. Every module remains independently testable and deployable behind its own service
boundary.

| ID | HTTP path | Module | Depends on | Publishes | Subscribes |
| --- | --- | --- | --- | --- | --- |
| `iam` | `/iam` | Identity and Access Management | — | `iam.initialized`, `iam.role.assigned`, `iam.permission.granted` | — |
| `users` | `/users` | User Management | `iam` | `users.initialized`, `users.profile.updated` | — |
| `organizations` | `/organizations` | Organization Management | `iam`, `users` | `organizations.initialized`, `organizations.created` | — |
| `farmers` | `/farmers` | Farmer Management | `users`, `organizations` | `farmers.initialized`, `farmers.registered` | — |
| `buyers` | `/buyers` | Buyer Management | `users`, `organizations` | `buyers.initialized`, `buyers.registered` | — |
| `agriculture` | `/agriculture` | Agriculture and Crop Management | `organizations`, `farmers` | `agriculture.initialized`, `agriculture.season.created` | — |
| `catalog` | `/catalog` | Product Catalog | `organizations`, `farmers`, `agriculture` | `catalog.initialized`, `catalog.product.published` | — |
| `marketplace` | `/marketplace` | Marketplace | `catalog`, `organizations`, `buyers` | `marketplace.initialized`, `marketplace.listing.created` | — |
| `orders` | `/orders` | Orders | `marketplace`, `buyers`, `catalog` | `orders.initialized`, `orders.order.placed` | — |
| `payments` | `/payments` | Payments | `orders`, `organizations` | `payments.initialized`, `payments.payment.recorded` | — |
| `ledger` | `/ledger` | Financial Ledger | `payments`, `orders`, `organizations` | `ledger.initialized`, `ledger.entry.posted` | — |
| `logistics` | `/logistics` | Logistics | `orders`, `organizations`, `warehouse` | `logistics.initialized`, `logistics.shipment.created` | — |
| `warehouse` | `/warehouse` | Warehouse | `organizations`, `catalog`, `quality` | `warehouse.initialized`, `warehouse.stock.moved` | — |
| `quality` | `/quality` | Quality Inspection | `organizations`, `catalog`, `farmers` | `quality.initialized`, `quality.inspection.completed` | — |
| `traceability` | `/traceability` | Traceability | `agriculture`, `quality`, `logistics`, `warehouse` | `traceability.initialized`, `traceability.record.updated` | — |
| `intelligence` | `/intelligence` | Agricultural Intelligence | `agriculture`, `traceability`, `orders` | `intelligence.initialized`, `intelligence.forecast.generated` | — |
| `knowledge` | `/knowledge` | Knowledge Management | `agriculture`, `intelligence`, `organizations` | `knowledge.initialized`, `knowledge.article.published` | — |
| `notifications` | `/notifications` | Notifications | `users`, `iam` | `notifications.initialized`, `notifications.queued` | `*` |
| `billing` | `/billing` | Subscription and SaaS Billing | `organizations`, `payments`, `ledger` | `billing.initialized`, `billing.subscription.changed` | — |
| `administration` | `/administration` | Administration | `iam`, `organizations` | `administration.initialized`, `administration.audit.recorded` | `*` |

`notifications` and `administration` subscribe to the wildcard topic for cross-cutting
observability only. Their handlers log events; they do not emit new events or mutate other modules.

## Dependency direction summary

```text
iam ──> users ──> organizations ──> farmers ──> agriculture ──> catalog ──> marketplace ──> orders
  │                   │                │              │             │
  └──> notifications <┘                └──> quality ──> warehouse ──> logistics ──> traceability
                                                               │                 │
                          payments ──> ledger ──> billing       └──────────────────┴──> intelligence ──> knowledge
```

Administration observes the whole event stream for audit visibility. The arrows describe declared
knowledge/integration dependencies, not runtime method calls.

## Per-module structure

```text
apps/api/src/modules/<module-id>/
├── domain/
│   ├── <module-id>.entity.js       # DDD-lite entity
│   ├── <module-id>.repository.js   # repository port and DI token
│   └── index.js
├── application/
│   ├── <module-id>.dto.js          # Zod response DTO and mapper
│   ├── <module-id>.service.js      # module-specific application service
│   └── index.js
├── infrastructure/
│   ├── <module-id>.repository.js   # in-memory adapter; replace with Prisma adapter later
│   └── index.js
├── presentation/
│   ├── <module-id>.routes.js       # Fastify plugin, validation, response envelope
│   └── index.js
└── index.js                        # module definition and DI registration
```

Every module has its own entity class, repository token, service class, DTO schema, adapter, and
route plugin. There is no generic "business service" shared between unrelated modules.

## HTTP surface

All routes are mounted under `API_PREFIX` (default `/api/v1`).

| Endpoint | Purpose |
| --- | --- |
| `GET /` | API index and module directory |
| `GET /version` | Active version and supported versions |
| `GET /modules` | All module definitions and dependencies |
| `GET /modules/:moduleId` | One module definition; validates the path parameter |
| `GET /observability` | Uptime, request id, and bounded recent event history |
| `GET /health`, `GET /health/ready` | Foundation health endpoints |
| `GET /<module-path>/info` | Validated module DTO from the DI-resolved service |
| `GET /<module-path>/info/:moduleId` | Same DTO with validated module id matching |

Requests may send `x-request-id`; it is echoed on the response and included in structured logs.
An `x-api-version` header is accepted only when it matches the active version.

## Boundary enforcement

Run:

```bash
npm run check:boundaries
```

The checker fails the build when:

- a module file imports another module directly;
- a layer imports a layer that points outward;
- a module imports an unapproved external package;
- a required layer file is missing;
- a registry dependency, publisher, or subscriber is invalid or unknown;
- documentation is missing a registered module id.

`npm run verify` runs the boundary check before linting, building, and testing.

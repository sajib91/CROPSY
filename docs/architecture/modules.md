# CROPSY business API modules

The business API is a **modular monolith** under `apps/api/src`. Each bounded module owns four
explicit layers: `domain`, `application`, `infrastructure`, and `presentation`. A module's
`index.js` is its composition seam. Cross-module source imports are forbidden; integration intent
is declared in `apps/api/src/modules/registry.js` and implemented through the shared in-process
event bus or narrow read-only DI ports, never through another module's service class.

The scaffolding establishes boundaries and service seams; IAM authentication/RBAC and the
organization/user profile, catalog, marketplace, cart/order, provider-adapter payment,
immutable double-entry ledger, logistics, expanded warehouse, quality inspection, and
farm-to-buyer traceability workflows are implemented inside those boundaries. Commission
rates, refund policies, settlement periods, and payment provider credentials remain
caller-supplied or deployment configuration rather than seeded policy.

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
| `farmers` | `/farmers` | Farmer Management | `iam`, `users`, `organizations`, `catalog`, `warehouse` | `farmers.initialized`, `farmers.registered`, `farmers.farm.created`, `farmers.farm.updated`, `farmers.farm.archived`, `farmers.farm.location.updated`, `farmers.parcel.created`, `farmers.parcel.updated`, `farmers.soil.updated`, `farmers.irrigation.created`, `farmers.irrigation.updated`, `farmers.coordinates.read`, `farmers.coordinates.denied`, `farmers.group.created`, `farmers.group.updated`, `farmers.group.member-joined`, `farmers.group.member-decided`, `farmers.group.member-removed`, `farmers.campaign.created`, `farmers.campaign.updated`, `farmers.contribution.created`, `farmers.contribution.updated`, `farmers.contribution.confirmed`, `farmers.contribution.rejected`, `farmers.purchase-request.created`, `farmers.purchase-request.decided`, `farmers.allocations.proposed`, `farmers.allocations.finalized`, `farmers.earnings.accrued` | — |
| `buyers` | `/buyers` | Buyer Management | `users`, `organizations` | `buyers.initialized`, `buyers.registered` | — |
| `agriculture` | `/agriculture` | Agriculture and Crop Management | `organizations`, `farmers` | `agriculture.initialized`, `agriculture.season.created`, `agriculture.crop.created`, `agriculture.crop.updated`, `agriculture.variety.created`, `agriculture.variety.updated`, `agriculture.calendar.created`, `agriculture.calendar.updated`, `agriculture.recommendation.created`, `agriculture.recommendation.updated`, `agriculture.cultivation.created`, `agriculture.cultivation.updated`, `agriculture.activity.recorded`, `agriculture.harvest.recorded`, `agriculture.expense.recorded`, `agriculture.expense.updated`, `agriculture.expense.estimated` | — |
| `catalog` | `/catalog` | Product Catalog | `organizations`, `farmers` | `catalog.initialized`, `catalog.category.created`, `catalog.category.updated`, `catalog.unit.created`, `catalog.unit.updated`, `catalog.quality-grade.created`, `catalog.quality-grade.updated`, `catalog.attribute.created`, `catalog.attribute.updated`, `catalog.product.created`, `catalog.product.updated`, `catalog.product.published`, `catalog.variety.created`, `catalog.variety.updated`, `catalog.attribute-values.updated`, `catalog.image.added`, `catalog.image.removed` | — |
| `marketplace` | `/marketplace` | Marketplace | `catalog`, `organizations`, `buyers` | `marketplace.initialized`, `marketplace.listing.created`, `marketplace.listing.updated`, `marketplace.listing.published`, `marketplace.listing.deactivated`, `marketplace.listing.location-added`, `marketplace.listing.location-removed`, `marketplace.listing.image-added`, `marketplace.listing.image-removed`, `marketplace.favorite.added`, `marketplace.favorite.removed`, `marketplace.report.created`, `marketplace.report.reviewed`, `marketplace.message.sent`, `marketplace.message.read` | — |
| `orders` | `/orders` | Orders | `marketplace`, `buyers`, `catalog` | `orders.initialized`, `orders.cart.item-added`, `orders.cart.item-updated`, `orders.cart.item-removed`, `orders.checkout.created`, `orders.order.placed`, `orders.order.status-changed`, `orders.order.cancelled`, `orders.receipt.generated` | — |
| `payments` | `/payments` | Payments | `orders`, `organizations`, `ledger` | `payments.initialized`, `payments.payment.initiated`, `payments.payment.failed`, `payments.payment.captured`, `payments.webhook.received`, `payments.refund.processed` | — |
| `ledger` | `/ledger` | Financial Ledger | `orders`, `organizations` | `ledger.initialized`, `ledger.journal.posted`, `ledger.reconciliation.expected`, `ledger.settlement.recorded`, `ledger.adjustment.posted` | — |
| `logistics` | `/logistics` | Logistics | `orders`, `organizations`, `warehouse` | `logistics.initialized`, `logistics.provider.registered`, `logistics.delivery_service.created`, `logistics.shipment.created`, `logistics.pickup.scheduled`, `logistics.delivery.assigned`, `logistics.shipment.status_updated`, `logistics.delivery.proof_recorded`, `logistics.delivery.failed`, `logistics.delivery.confirmed` | — |
| `warehouse` | `/warehouse` | Warehouse | `organizations`, `catalog`, `iam` | `warehouse.initialized`, `warehouse.warehouse.created`, `warehouse.warehouse.updated`, `warehouse.stock.registered`, `warehouse.stock.updated`, `warehouse.stock.adjusted`, `warehouse.stock.damaged`, `warehouse.stock.expired`, `warehouse.stock.deducted`, `warehouse.stock.reserved`, `warehouse.reservation.released`, `warehouse.reservation.deducted`, `warehouse.alert.acknowledged`, `warehouse.alert.resolved`, `warehouse.location.created`, `warehouse.location.updated`, `warehouse.receipt.recorded`, `warehouse.stock.allocated`, `warehouse.stock.transferred`, `warehouse.stock.dispatched`, `warehouse.condition.recorded`, `warehouse.reconciliation.created`, `warehouse.reconciliation.approved`, `warehouse.staff.assigned`, `warehouse.staff.updated` | — |
| `quality` | `/quality` | Quality Inspection | `organizations`, `catalog`, `farmers` | `quality.initialized`, `quality.inspection.created`, `quality.inspection.updated`, `quality.inspection.graded`, `quality.inspection.verified`, `quality.inspection.rejected`, `quality.evidence.added`, `quality.evidence.image_attached` | — |
| `traceability` | `/traceability` | Traceability | `agriculture`, `quality`, `logistics`, `warehouse` | `traceability.initialized`, `traceability.batch.created`, `traceability.batch.updated`, `traceability.event.created`, `traceability.batch.verified`, `traceability.batch.rejected`, `traceability.batch.qr_generated` | — |
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
  │                   │                ├─────────────> catalog (read-only reference port)
  │                   │                └─────────────> warehouse (read-only inventory port)
  └──> notifications <┘                └──> quality ──> warehouse ──> logistics ──> traceability
                                                               │                 │
                          ledger ──> billing                   └──────────────────┴──> intelligence ──> knowledge
                             ^
                             │ (narrow posting port)
                          payments
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
│   ├── <module-id>.repository.js   # module adapter; IAM also exposes Prisma/in-memory stores
│   └── index.js
├── presentation/
│   ├── <module-id>.routes.js       # Fastify plugin, validation, response envelope
│   └── index.js
└── index.js                        # module definition and DI registration
```

Every module has its own entity class, repository token, service class, DTO schema, adapter, and
route plugin. There is no generic "business service" shared between unrelated modules. IAM
publishes narrow composition ports (`IdentityStoreToken`, `PlatformAuthorizationToken`, and
`PlatformTokenManagerToken`) so `users`, `organizations`, and `farmers` can share identity and
authorization without importing another module's source. The `farmers` module publishes a
read-only `FarmAccessPortToken`; agriculture consumes that port through DI to validate farm
ownership and tenant scope without importing farmer source. The `catalog` module publishes a
read-only `CatalogAccessPortToken`; marketplace consumes it through DI to validate product,
category, unit, and quality-grade references and to build public listing DTOs. The port returns
copies of available catalog records only, so marketplace cannot mutate catalog data through it.
The `warehouse` module publishes a read-only `WarehouseAccessPortToken`; farmers consumes it only
to validate cooperative stock references, and it exposes no reservation or mutation methods. It
also publishes `WarehouseOperationPortToken`, a read-only facts adapter with warehouse,
inventory, movement, condition, reconciliation, and location data for auditable traceability
timelines. The `orders` module publishes `OrderAccessPortToken` so logistics can validate an
order reference; logistics publishes `LogisticsAccessPortToken` for read-only shipment facts;
quality publishes `QualityAccessPortToken` for inspection facts with private evidence filtered;
and traceability publishes `TraceabilityBatchPortToken` for verified public facts or private
batch facts. All of these ports are read-only and carry no mutation capability.
The `marketplace` module publishes a read-only `MarketplaceAccessPortToken` for current listing
price, seller, and availability reads, plus a narrow `MarketplaceListingStockToken` that only
decrements and restores listing availability. Orders consumes both through DI, so it cannot
create, edit, or deactivate listings. The `ledger` module publishes `LedgerPostingPortToken`,
which exposes only expectation recording, journal posting, balance reads, and account-code
lookups; payments consumes it to record financial effects without importing ledger source,
changing accounts, or editing posted entries. The `payments` module publishes
`PaymentProviderRegistryToken`, whose provider adapters are supplied by deployment
configuration or DI; no provider SDK is imported from another module. The shared `ConfigToken`
supplies `FARM_STORE`, `AGRICULTURE_STORE`, `CATALOG_STORE`, `MARKETPLACE_STORE`,
`WAREHOUSE_STORE`, `ORDERS_STORE`, `PAYMENTS_STORE`, `LEDGER_STORE`, `LOGISTICS_STORE`,
`QUALITY_STORE`, and `TRACEABILITY_STORE`; each module registers its own store token and
defaults to `memory` for development/tests while production requires `prisma`. Traceability QR
URLs use `WEB_PUBLIC_URL` (default `http://localhost:3000`). Provider metadata comes from
`PAYMENT_PROVIDER_MODE` and `PAYMENT_PROVIDERS_JSON`, and
chart-of-account structure can be overridden with `LEDGER_ACCOUNTS_JSON`. Cart items, one parent checkout (`purchase_groups`), and
seller-specific fulfillment orders are methods and stores inside the existing `orders` module;
status transitions use a domain state machine, history is append-only, and a JSON receipt is
generated from stored snapshots. Provider initiation/verification, webhook authenticity and
deduplication, refunds, and status history stay inside `payments`; journals, bucket balances,
reconciliation expectations, settlements, adjustments, and ledger audits stay inside `ledger`.
Both modules keep the 20-module boundary and use the narrow posting port for financial effects.
All farm CRUD, parcel, soil, irrigation,
map, spatial, and Bangladesh geo workflows stay inside the existing 20-module `farmers`
boundary. Crop catalog, calendars, cultivations, activities, harvests, expenses, and reports stay
inside the existing `agriculture` boundary. Product taxonomy, flexible attributes, varieties, and
images stay inside `catalog`; listings, discovery, favorites, reports, and platform messages stay
inside `marketplace`. Warehouse CRUD, stock, movements, reservations, alerts, locations, capacity, receipts,
allocations, transfers, dispatch, storage conditions, reconciliations, staff assignments,
reports, and audit integration stay inside `warehouse`. Logistics providers, services,
shipments, deliveries, proofs, tracking history, dashboards, and audits stay inside
`logistics`; tracking uses recorded events and never simulates a live GPS feed. Inspections,
evidence/images, grading, verification, rejection, and quality audits stay inside `quality`.
Traceability batches, events, timelines, verification tokens, QR output, public verification,
and audits stay inside `traceability`; public verification exposes only verified public facts
and never presents unverified claims as certified. Cooperative groups, memberships, campaigns,
contributions, purchase requests, allocations, and earnings stay inside `farmers`; their
methods are composed into `FarmersService` so the module keeps one service token. No 21st
module or direct cross-module source import was added.

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

All non-public routes are default-deny. The `info` endpoints and the single narrow public
`GET /traceability/verify/:token` route are the only module routes in the public allowlist;
authenticated organization, user, farm, cooperative, agriculture, catalog, marketplace, orders,
warehouse, logistics, quality, traceability, payment, and ledger routes are documented in
[`../api/README.md`](../api/README.md). Provider callbacks remain authenticated and signature-verified;
they are never added to the public allowlist. Farm
coordinate reads enforce an additional private-data policy beyond the `farms.read` permission.
Agriculture separates catalog/calendar, cultivation, harvest, and expense permissions, and keeps
recorded costs distinct from AI estimates. Catalog management reuses `products.read`/
`products.manage`; marketplace discovery and seller workflows reuse `listings.read`/
`listings.manage`; warehouse operations reuse `warehouses.read`/`warehouses.manage`; and
cooperative reads/mutations reuse `farms.read`/`farms.manage` plus `orders.read`/`orders.manage`
for group purchase requests, and cart/checkout/order routes reuse `orders.read`/`orders.manage`.
Payment routes reuse `payments.read`/`payments.manage` and ledger routes reuse `ledger.read`/
`ledger.manage`, including provider callbacks. No permissions were added. Marketplace and cooperative public DTOs
redact exact coordinates, seller/user contact details, password hashes, and private addresses.

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

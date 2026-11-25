# Architecture decisions

## ADR-001: Modular monolith with explicit bounded modules

**Decision.** Keep all 20 business modules in the Fastify API process as a modular monolith, with
hard source-level boundaries and independent service classes.

**Reason.** The project needs clear DDD-lite seams without introducing distributed-system failure
modes before domain behavior exists. Each module can later be extracted into a separate service
because it has no direct dependency on another module's implementation.

## ADR-002: Four layers per module

**Decision.** Every module contains `domain`, `application`, `infrastructure`, and `presentation`
directories plus an `index.js` composition seam.

**Reason.** Dependencies point inward. Entities and repository ports remain framework-agnostic;
application services own use cases; infrastructure implements ports; presentation translates HTTP
concerns to and from DTOs.

## ADR-003: Repository ports and DI tokens

**Decision.** Each domain defines its own repository token and contract. Application services
receive the port through constructor injection. The container binds the token to an adapter.

**Reason.** Application and domain code never import Prisma, Fastify, or concrete storage. Prisma
adapters can replace in-memory adapters without changing services or routes.

## ADR-004: One service class per module

**Decision.** Do not provide a shared generic CRUD service for unrelated modules. Each module owns
a named application service even when current scaffolding is intentionally minimal.

**Reason.** Business invariants and policies will differ. A single generic service would blur
module boundaries and encourage cross-domain reuse of rules that should remain local.

## ADR-005: Event-based integration intent

**Decision.** Module dependencies are documented in the registry and realized through the shared
event bus. Direct module-to-module imports are rejected by the boundary checker.

**Reason.** Dependencies remain discoverable and asynchronous by default. Notifications and
Administration use wildcard subscriptions only for observability, not business orchestration.

## ADR-006: Validated DTO boundary

**Decision.** Presentation routes parse params and queries with Zod. Application services return
output validated by module-specific DTO schemas. All failures flow to one error handler.

**Reason.** Invalid input and malformed output fail at a known boundary with a stable response
envelope, request id, and structured log entry.

## ADR-007: Versioned HTTP surface

**Decision.** `API_PREFIX` must end in a supported version segment. The active version is resolved
once in the composition root, exposed by `/version`, and checked against `x-api-version`.

**Reason.** Version negotiation is explicit and central rather than duplicated in route plugins.

## ADR-008: Observability by default

**Decision.** Every request receives or echoes `x-request-id`, logs method, path, version, module,
status, and duration, and has access to bounded in-process event history.

**Reason.** Requests and domain events can be correlated without leaking internal details to
clients.

## ADR-009: No invented business policy

**Decision.** The architecture scaffolding does not seed or hardcode commission rates, payment
providers, subscription prices, settlement rules, taxes, or refund policies.

**Reason.** Those values remain application/platform configuration until product decisions are
recorded. The database model already supports configurable settings and rule keys.

## ADR-010: Read-only composition ports for same-process module reads

**Decision.** A module may publish a narrow, read-only port from `shared/di/tokens.js` when another
module needs validated reference data. `FarmAccessPortToken`, `CatalogAccessPortToken`, and
`WarehouseAccessPortToken` are the current examples; the consumer resolves the port through DI and
receives copies, never the publisher's service or store.

**Reason.** This keeps the 20-module boundary and the no-direct-cross-module-import rule intact
while avoiding duplicated persistence logic or event-carried entity snapshots. Ports expose only
the fields a consumer needs; marketplace therefore cannot mutate catalog data or read private
catalog state through `CatalogAccessPortToken`, and farmers cannot reserve or mutate warehouse
stock through `WarehouseAccessPortToken`.

## ADR-011: Expand warehouse for transactional inventory

**Decision.** Warehouse CRUD, batches, units, stock movements, reservations, alerts, and audit
events live in the existing `warehouse` module. The Prisma store applies every stock change inside
a transaction through `cropsy_apply_warehouse_stock_movement`, which locks the inventory row with
`SELECT ... FOR UPDATE`; reservation settlement locks the reservation row and writes its movement
atomically. `referenceKey` provides an idempotency guard for concurrent order attempts.

**Reason.** Inventory consistency requires one owner of on-hand/reserved/available quantities and
append-only movement history. A new module or direct cross-module calls would duplicate the same
invariants and weaken the 20-module boundary.

## ADR-012: Cooperative selling stays inside farmers with configurable allocation

**Decision.** Farmer groups, memberships, campaigns, contributions, purchase requests,
allocations, and earnings are methods composed into `FarmersService`, not a 21st module. Group
owner/leader, active-member, contribution-ownership, and tenant checks are enforced in the
service. Allocation uses the campaign's caller-supplied policy: `PROPORTIONAL` or
`QUALITY_WEIGHTED` with explicit caller-supplied weights. Earnings require caller-supplied
`salesAmount` and `currency` and keep allocation/policy references.

**Reason.** Collective selling is a farmer-domain workflow that needs the existing farm, catalog,
warehouse, and authorization seams. Keeping one service token avoids a parallel service while
configuration prevents inventing commission rates, payment providers, payout rules, taxes, fees,
or settlement policies.

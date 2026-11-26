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

**Decision.** A module may publish a narrow port from `shared/di/tokens.js` when another module
needs validated reference data or one tightly scoped capability. `FarmAccessPortToken`,
`CatalogAccessPortToken`, `WarehouseAccessPortToken`, and `MarketplaceAccessPortToken` are
read-only; `MarketplaceListingStockToken` only decrements/restores listing availability. The
consumer resolves the port through DI and receives copies or the declared capability, never the
publisher's service or full store.

**Reason.** This keeps the 20-module boundary and the no-direct-cross-module-import rule intact
while avoiding duplicated persistence logic or event-carried entity snapshots. Ports expose only
the fields or operations a consumer needs; marketplace cannot mutate catalog data through
`CatalogAccessPortToken`, farmers cannot reserve warehouse stock through
`WarehouseAccessPortToken`, and orders cannot create or edit listings through marketplace ports.

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

## ADR-013: Expand orders for cart, checkout, and seller fulfillments

**Decision.** Cart mutations, checkout, order lifecycle tracking, cancellation, history, and JSON
receipts are methods of the existing `orders` module. A `purchase_groups` row is the parent
checkout; each distinct seller in one checkout gets its own `orders` row as a seller fulfillment.
No 21st module was added, and all cross-module reads use DI ports.

**Reason.** Checkout and fulfillment are order-domain concerns that must remain behind one service
boundary. A parent aggregate preserves the buyer's single checkout while allowing seller-specific
status, totals, snapshots, and receipts. Transactional creation, unique `reference_key`
idempotency, append-only `order_status_changes`, and current-status guards keep concurrent retries
and transitions consistent.

## ADR-014: Server-calculated checkout with caller-supplied pricing rules

**Decision.** Checkout ignores client-supplied totals and recomputes line amounts from current
listing prices. Delivery and discount rules are supplied per request, may be general or
seller-specific, and support `FLAT` amounts or `PERCENTAGE` fractions of the server-calculated
seller subtotal. Rules and computed amounts are snapshotted on the checkout and seller orders;
no fee, discount, tax, or commission default is seeded.

**Reason.** Prices and money must come from trusted current data, while business policy remains
application/platform configuration. Snapshots make receipts reproducible without inventing rates
or providers. `tax_amount` persists as zero until a tax rule is explicitly supplied.

## ADR-015: Provider-adapter payments without invented credentials

**Decision.** Payment initiation, verification, webhooks, and refunds remain in the existing
`payments` module behind a domain provider contract and a DI-resolved
`PaymentProviderRegistryToken`. Providers and methods come from `PAYMENT_PROVIDERS_JSON`; the
built-in HTTP adapter uses only deployment-supplied URLs/tokens, and production requires
`PAYMENT_PROVIDER_MODE=configured`, `PAYMENTS_STORE=prisma`, and provider webhook secrets. The
mock adapter is accepted only when `NODE_ENV=test`. Provider callbacks stay default-deny with
`payments.manage`, and adapters independently verify `x-webhook-signature` as an HMAC-SHA256
digest of `${eventId}.${JSON.stringify(payload)}` unless an injected adapter overrides that
check. Idempotency keys are required for initiation/refunds, header and body values must match
when both are present, and callbacks are deduplicated by provider event id.

**Reason.** No provider credential, endpoint, or certification claim belongs in source control,
and no 21st module is needed for provider orchestration. A narrow adapter contract supports
Bangladesh-relevant methods such as mobile banking/card/bank transfer through configuration while
keeping signature verification, duplicate handling, failure persistence, and state transitions
testable without real provider access.

## ADR-016: Immutable double-entry ledger with database-enforced invariants

**Decision.** The existing `ledger` module owns journal headers/lines, signed balances in
`PENDING`/`AVAILABLE`/`SETTLED` buckets, reconciliation expectations, settlements, adjustments,
and a separate audit trail. Every journal must have positive lines with equal debit and credit
totals; posting writes journal, lines, and balance updates in one transaction and returns the
full journal. Idempotency keys make repeated posts return the original journal without new events.
Posted journals, lines, status history, and audit rows are append-only at the database boundary;
a deferred constraint trigger rejects any unbalanced journal at commit. `payments` reaches the
ledger only through `LedgerPostingPortToken`, which exposes expectation recording, journal
posting, balance reads, and account codes, never account mutation.

**Reason.** Financial correctness cannot rely only on application discipline. Database checks,
unique keys, tenant-match triggers, and append-only triggers survive direct SQL or bypassed
services, while signed balances allow legitimate negative interim states without breaking the
balanced-journal rule. Commission rates, refund policies, and settlement periods remain
caller-supplied snapshots or external rule keys, not seeded policy.

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

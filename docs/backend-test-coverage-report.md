# Backend test coverage report

Date: 2026-11-27

## Scope

This report covers the CROPSY business API (`apps/api`), its persistence layer, the backend-owned
notification pipeline, and the Python AI service test suite. The mobile apps are not a source of business
rules: checkout totals, notification eligibility, preferences, retries, and authorization remain
backend-owned, and mobile calls only `/api/v1` with `client: 'mobile'` bearer tokens.

The test strategy has four complementary layers:

1. **API/unit tests** (`apps/api/test/*.test.js`) exercise HTTP routes, authorization, DTO validation, domain
   services, in-memory stores, event subscribers, and queue/provider fakes.
2. **Database tests** (`apps/api/test/database/*.test.js`) run against a temporary PostgreSQL + PostGIS
   database and verify migrations, constraints, triggers, seeds, and concurrent writes.
3. **AI tests** (`apps/ai/tests/*.py`) exercise advisory, GraphRAG, multimodal, agentic approval, internal API,
   and hardening behavior in the Python service.
4. **Full verification** (`scripts/verify.sh`) runs boundaries, lint, format, i18n parity, builds, API/AI tests,
   optional database tests, and live service health checks.

## Commands and results

| Command | Result |
| --- | --- |
| `cd apps/api && npm test` | 118 tests, 118 pass, 0 fail |
| `npm run test:ai` | 86 Python tests passed |
| `npm run db:test` | 47 tests, 47 pass, 0 fail; 11 migrations applied, drift check clean, seed applied twice with stable 22/51/486/13 counts |
| `cd apps/api && node --test --experimental-test-coverage test/*.test.js` | 118 tests, 118 pass, 0 fail |
| Built-in coverage summary | **78.87% lines, 66.55% branches, 70.55% functions** across loaded source files |
| `CROPSY_RUN_DB_TESTS=1 npm run verify` | Exit 0: boundaries (21 modules, 881 imports), lint, format, i18n, builds, API tests, AI tests, DB tests, and API/Web/AI health checks all passed |

The raw coverage table from the last run was written to
`/private/var/folders/2l/bbcttp_514v5yslfrv3x7dlh0000gn/T/cropsy-api-coverage-final.txt`. It is an ephemeral
artifact; regenerate it with the coverage command above.

### Coverage interpretation

- Node's built-in coverage instruments the JavaScript loaded by the API test process. It does **not** count
  Python AI code, Prisma/PostgreSQL constraints, or code paths that only run in the database suites.
- Prisma adapters show low line coverage in the native report because most API tests intentionally use in-memory
  stores. The database suites now cover key payment claim/refund reservation atomicity, ledger posting/idempotency,
  tenant consistency, and append-only invariants directly against PostgreSQL.
- Several modules (`administration`, `buyers`, `knowledge`) currently expose only public module-info
  routes. They are covered generically, but have no business paths to test yet. `billing` now has a
  dedicated suite for plan configuration, lifecycle transitions, invoices, usage limits, and entitlements.
- Branch coverage remains below line coverage mainly because many success-path routes, provider failure modes,
  optional query/filter combinations, and production adapters are still untested (see Remaining gaps).

## Module-to-test map

| Area | Primary tests | What is covered |
| --- | --- | --- |
| Cross-cutting wiring | `architecture.test.js`, `backend-hardening.test.js`, `unit-invariants.test.js`, `health.test.js` | 21-module registry, module info for every module, version/observability, default-deny, stable success/error envelopes, validation details, RBAC policy consistency, repository contracts, and notification queue/catalog invariants |
| IAM / auth | `auth.test.js`, `authorization.test.js`, `backend-hardening.test.js` | Registration, password policy, OTP verification/login and replay denial, login/refresh rotation, session listing/devices/targeted revocation/logout/logout-all, RBAC reads, password reset/deactivation/recovery, cookie+CSRF, cross-user and cross-tenant denial, and XFF-derived audit metadata rejection |
| Users / organizations | `users.test.js`, `organizations.test.js`, `authorization.test.js` | Self-service profiles, addresses, preferences, role/farmer profiles, org CRUD, invitations with hashed tokens, members, addresses, documents, verification/status, tenant isolation, and socket-peer audit IP metadata |
| Farmers / cooperative | `farms.test.js`, `cooperative.test.js`, `database/farms.test.js` | Farm bundles, PostGIS queries, coordinate privacy, cooperative groups/membership/contributions/purchase requests, proportional and quality-weighted allocation, earnings, and DB farm invariants |
| Agriculture | `agriculture.test.js`, `database/agriculture.test.js` | Crops, varieties, seasons, calendars, recommendations, cultivations, activities, harvests, expenses, AI-estimated vs recorded cost separation, profitability, tenant/permission denial, and DB scope/validity guards |
| Catalog / marketplace | `catalog.test.js`, `marketplace.test.js`, `database/catalog-marketplace.test.js` | Bilingual taxonomy, typed attributes, products/varieties/images, listings, geospatial search, favorites, reports/messages, ownership/privacy, seed families, typed columns, and cross-org triggers |
| Orders | `orders.test.js`, `database/orders.test.js`, `database/integrity.test.js` | Cart validation, server-recalculated totals, seller split, checkout idempotency and repricing/stock revalidation, client discount suppression, order transitions/history/receipt, DB totals/reference/status-history constraints, and duplicate-reference concurrency |
| Payments | `payments.test.js`, `backend-hardening.test.js`, `database/payments.test.js` | Provider metadata without secrets, full-request idempotency claims before provider calls, initiation failure replay, verification/capture journal, raw-byte webhook HMAC, malformed signatures, webhook currency/amount parity, dedupe/terminal-state handling, refund reservation/finalization, concurrent refund denial, refund-key misuse conflict, client tenant field/header denial, and DB claim/reservation atomicity |
| Billing | `billing.test.js`, `backend-hardening.test.js` | Caller-configurable plans and provider validation, tenant isolation, invoice issue/payment, renewal, upgrade/downgrade, cancellation guards, entitlement checks, usage-limit/billing enforcement, and usage idempotency |
| Ledger | `ledger.test.js`, `backend-hardening.test.js`, `unit-invariants.test.js`, `database/ledger.test.js`, `database/integrity.test.js` | Balanced journals, bucket balances, expectations, settlements, reconciliation, audit, append-only rows, cross-tenant financial reference rejection, settlement rollback/retry, idempotency-key content binding, account/journal currency parity, and DB financial invariants |
| Logistics / warehouse / quality / traceability | `logistics.test.js`, `warehouse.test.js`, `warehouse-operations.test.js`, `quality.test.js`, `traceability.test.js`, `database/logistics-warehouse-quality-traceability.test.js`, `database/integrity.test.js` | Provider/services, nearby discovery, shipment lifecycle/proof/confirmation, inventory movements/reservations/adjustments/locations/receipts/transfers/dispatches/reconciliation, inspections/grading/verification, batches/events/QR/timeline/public verification, and DB concurrency/conservative-disclosure invariants |
| Intelligence / market intelligence | `ai-gateway.test.js`, `market-intelligence.test.js` | Advisory forwarding with request metadata, strict validation, 503 when unconfigured, signed HTTP gateway contract, agentic/GraphRAG/multimodal/orchestration/image/evaluation flows, client tenant stripping and forged-verification rejection, observations with provenance, price history, supply/demand, trends, and forecast absence handling |
| Python AI service | `apps/ai/tests/test_intelligence_hardening.py`, `test_agentic_rag.py`, `test_graph_rag.py`, `test_internal_api.py`, `test_unified_orchestration.py` | Claim stripping, non-citable multimodal assets, tenant-namespaced asset IDs and version cleanup, candidate-only GraphRAG validation, signed-context reviewer allowlist with fail-closed approvals, spoofed internal-context rejection, and per-user/per-org rate-limit budgets |
| Notifications | `notifications.test.js`, `unit-invariants.test.js`, `database/integrity.test.js` | Authorization-scoped feed, mark read/read-all, device token register/revoke, preferences and channel selection, realtime events, retry/backoff/failure logging, manager-only failure inspection and HTTP retry, catalog/recipient/device-token invariants, notification/outbox enum/length/FK/cascade/default constraints |

## Real bugs found and fixed

1. **Refund idempotency key reuse** — `payments.service.js` and both payment stores reject a key reused for a
   different payment, amount, tenant, or currency. Regression: `backend-hardening.test.js`.
2. **Refund double-spend race** — reservations are claimed before provider calls and pending refunds reduce the
   available balance. Regression: concurrent refund test in `backend-hardening.test.js`.
3. **Payment provider call replay** — the idempotency key is claimed, including an `INITIATED` status row, before
   the provider is called; failures are finalized on the same row. Regression: provider-call claim test and DB
   claim test.
4. **Webhook byte substitution** — signatures verify the exact raw request bytes with strict `sha256=<64 hex>`
   parsing; currency and amount must match the payment. Regression: raw-byte/malformed/currency-mismatch test.
5. **Ledger idempotency and currency mismatch** — replayed idempotency keys must describe the same journal, and a
   journal's currency must match its accounts. Regressions: `unit-invariants.test.js` and DB ledger suites.
6. **Self-certified AI evidence and approvals** — caller verification claims are stripped/rejected, GraphRAG emits
   candidates only, and agentic approval requires a server-stored run plus an allowlisted reviewer. Regressions:
   API gateway tests and `test_intelligence_hardening.py`.
7. **Cross-tenant multimodal ID collisions** — AI asset IDs are namespaced by trusted organization, asset ID, and
   version. Regression: tenant isolation and version cleanup tests.
8. **Stale RBAC seed expectations** — database integrity expects **54 permissions** and **507 assignments** and
   asserts the notification and billing permissions. This aligns tests with the real seed; it does not weaken an invariant.

## Added tests

- `apps/api/test/backend-hardening.test.js`: all-module info sweep, 400/401/403/404 envelopes, refund-key
  conflict, provider-call idempotency, concurrent refunds, raw-byte webhook authentication, settlement
  rollback/retry, concurrent stock reservations, and client tenant field/header denial.
- `apps/api/test/billing.test.js`: configurable plans without seeded prices, provider validation, tenant-isolated
  subscription creation, invoices, renewal, upgrade/downgrade, cancellation guards, entitlement decisions,
  usage-limit enforcement, overage, and idempotency.
- `apps/api/test/unit-invariants.test.js`: response/error normalization, validation details, RBAC consistency,
  repository contracts, notification catalog and recipient extraction, device-token validation, in-process queue
  behavior, and ledger idempotency content binding.
- `apps/api/test/database/payments.test.js`: Prisma payment claim/finalize and refund reserve/finalize atomicity.
- `apps/api/test/ai-gateway.test.js`: forged approver, verification claim, graph approval, and provenance rejection.
- `apps/ai/tests/test_intelligence_hardening.py`: AI claim stripping, tenant isolation, signed approval identity,
  default-deny reviewer allowlist, rate-limit keys/spoofing, and per-user/per-org budgets.
- Existing auth, notification, orders, ledger, and database suites were extended for replay denial, zero-op read-all,
  manager-only retry, repricing, and new financial invariants.

## Remaining gaps

Prioritized from highest to lowest risk:

1. **Prisma-backed end-to-end coverage.** Most API suites still use in-memory stores, while DB suites test raw SQL
   and store operations. There is no full HTTP+service test against Prisma for IAM sessions, users, organizations,
   notifications, cooperative allocation, market-intelligence persistence, or intelligence conversation/evaluation
   records. Add selected Prisma-backed route suites rather than assuming memory-store behavior transfers.

2. **Production adapters and queue drivers.** `BullMqNotificationQueue`, the real Socket.IO gateway,
   `HttpPaymentProvider`, and the real HTTP AI gateway adapter are not exercised. Add contract tests with a fake
   Redis/HTTP server, and verify production env guards (`bullmq` queue driver, real OTP provider, secure cookies).

3. **Remaining financial concurrency paths.** Cooperative `proposeAllocations` / `finalizePurchaseRequest` still
   perform multiple writes without a single `$transaction`; concurrent double-finalize and partial-failure behavior
   is untested. Multi-currency settlement, external-provider partial failure compensation, and simultaneous API
   checkout with the same `Idempotency-Key` also need additional coverage.

4. **Successful read/update route matrix.** Many routes are covered only for denial:
   - IAM: password-change with `revokeOtherSessions` and session metadata edge cases.
   - Users: admin `PATCH /:userId/contact`, admin address/preference/role-profile/farmer-profile reads and writes.
   - Agriculture: `GET/PATCH /seasons`, `PATCH /recommendations/:id`, successful expense and farm-expense reads.
   - Catalog: category/unit/quality-grade/attribute/product updates, product images, and variety attributes.
   - Marketplace: seller listing update, favorite deletion, reports listing, listing image/location writes.
   - Logistics: provider/service reads and updates, shipment/delivery list and detail reads, duplicate-proof and
     completed-shipment guards.
   - Warehouse: reservation reads, direct deductions, allocations, capacity under concurrent operations.
   - Quality: successful inspection detail and rejection; traceability: successful batch list/detail/update.
   - Intelligence: `/ai/market/forecast`, `/ai/market/explain`, and weather endpoints.
   - Market intelligence: seasonality, availability, opportunities, and selling insights.

5. **Dedicated database suites.** Add focused DB tests for IAM session/token revocation durability,
   user/organization profile uniqueness, notification preference/device-token/outbox durability, cooperative
   natural keys and append-only audit records, and market/intelligence persistence.

6. **Info-only modules.** `administration`, `buyers`, and `knowledge` only expose `/info`; once their
   business routes exist, they need their own suites. Billing is no longer info-only and is covered by
   `billing.test.js`.

7. **Device smoke verification.** Android/iOS builds export successfully, but on-device smoke tests remain
   unavailable in this environment: `adb` is not installed and `xcrun simctl` is unavailable. This is a
   verification-environment gap, not a backend test failure.

## Notes

- All changes remain uncommitted. No commit, push, or pull request was created.
- `npx expo install --check` still reports a pre-existing `react-native-reanimated` expected-version warning;
  a root override already exists and it does not affect the backend verification results.

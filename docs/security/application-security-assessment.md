# Application security assessment

Date: 2026-11-27

Status: confirmed findings remediated and regression-tested; residual risks are listed without a fix claim. All
changes remain uncommitted. No commit, push, or pull request was created.

## Scope and method

This assessment reviewed the CROPSY business API, Python AI service, shared configuration, database schema, and
backend/client contracts. The focus was the requirement that authorization, notification policy, checkout totals,
financial effects, and AI evidence trust decisions remain backend-owned; mobile must only call `/api/v1` with
`client: 'mobile'` bearer tokens and must never submit computed totals or local document bytes to non-AI endpoints.

Verification used:

- HTTP-level tests with `app.inject` and isolated in-memory stores.
- Temporary PostgreSQL + PostGIS migration, drift, seed, and database tests.
- Python pytest suites for the AI service.
- Static boundary, lint, format, syntax, build, and health checks.
- `npm audit --omit=dev` for dependency triage.

This is a source-assisted application security review, not a production penetration test. No real payment, SMS,
email, or external AI provider credentials were used. Real provider adapters and multi-replica deployments were not
available for live testing.

## Verification snapshot

| Check | Result |
| --- | --- |
| `CROPSY_RUN_DB_TESTS=1 npm run verify` | Exit 0. Boundaries: 21 modules / 881 imports. Lint, format, i18n, and builds passed. API 118/118, AI 86 passed, DB 47/47. Eleven migrations applied, drift clean, seed twice with 22/51/486/13 counts. API, Web, and AI health checks passed. |
| `cd apps/api && npm test` | 118 tests, 118 pass, 0 fail. |
| `npm run test:ai` | 86 passed. |
| `npm run db:test` | 47 tests, 47 pass, 0 fail. |
| `npm audit --omit=dev` | Exit 1: 46 advisories (9 low, 15 moderate, 21 high, 1 critical). Critical `tar`; nested `postcss` advisories remain. Unresolved. |
| Device smoke tests | Unavailable: `adb` is not installed and `xcrun simctl` is unavailable. Verification-environment gap. |

## Severity definitions

- **Critical**: direct privilege escalation or likely material financial compromise.
- **High**: authentication/authorization bypass, sensitive data exposure, or financial-integrity failure with a
  practical exploit path.
- **Medium**: meaningful abuse path that requires additional conditions or causes limited impact.
- **Low / Informational**: hardening, consistency, or test/operations gap without a direct exploit path.

## OWASP risk mapping

| Finding | OWASP API Security Top 10 (2023) | OWASP Web Top 10 (2021) |
| --- | --- | --- |
| F-01 Privilege escalation / global RBAC rewrite | API1 BOLA, API5 BFLA, API6 Business Flow | A01 Broken Access Control |
| F-02 Forwarded-header spoofing | API4 Resource Consumption, API8 Misconfiguration | A05 Misconfiguration, A09 Logging Failures |
| F-03 OTP enumeration / preview leakage | API2 Authentication, API8 Misconfiguration | A07 Auth Failures, A05 Misconfiguration |
| F-04 Observability event leakage | API3 Data Exposure, API8 Misconfiguration | A01 Broken Access Control, A05 Misconfiguration |
| F-05 Buyer-controlled checkout pricing | API5 BFLA, API6 Business Flow | A04 Insecure Design, A01 Broken Access Control |
| F-06 Invitation binding | API1 BOLA, API5 BFLA | A01 Broken Access Control |
| F-07 Payment replay / refund double-spend | API5 BFLA, API10 Unsafe Consumption | A08 Data Integrity Failures, A04 Insecure Design |
| F-08 Webhook authenticity / parity | API10 Unsafe Consumption, API8 Misconfiguration | A08 Data Integrity Failures |
| F-09 Ledger idempotency / currency | API5 BFLA, API10 Unsafe Consumption | A08 Data Integrity Failures |
| F-10 AI self-certification / approval | API5 BFLA, API10 Unsafe Consumption | A08 Data Integrity Failures, A03 Injection |
| F-11 Cross-tenant AI asset IDs | API1 BOLA | A01 Broken Access Control, A08 Data Integrity Failures |
| F-12 AI rate-limit identity spoofing | API4 Resource Consumption | A04 Insecure Design, A05 Misconfiguration |
| R-01/R-02 Cookie CSRF / `SameSite=none` | API2 Authentication, API8 Misconfiguration | A01 Broken Access Control, A05 Misconfiguration |
| R-05 Dependency advisories | API8 Misconfiguration | A06 Vulnerable Components |

API7 (SSRF) was not assigned a confirmed finding: provider URLs and the AI gateway base URL are configuration-driven
and no user-supplied outbound URL was found. The real HTTP adapters remain untested, so this is not a claim that
all SSRF paths are impossible.

## Confirmed findings and verified fixes

### F-01 — Self-granted platform role and global permission rewrite

- **Severity**: Critical
- **Affected component**: IAM application service and routes
  (`apps/api/src/modules/iam/application/auth.service.js`,
  `apps/api/src/modules/iam/presentation/auth.routes.js`).
- **Reproduction**:
  1. Register as a normal user, create an organization, and obtain `roles.manage` as an organization admin.
  2. `POST /api/v1/iam/auth/users/:userId/roles` with `roleCode: "CROPSY_SUPER_ADMIN"` previously returned 200
     and granted a global role.
  3. `PUT /api/v1/iam/auth/roles/FARMER/permissions` with a tenant admin token previously rewrote the global
     permission catalog for every tenant.
- **Root cause**: role assignment checked role existence and the caller's `roles.manage` permission but did not
  distinguish platform roles from organization roles. Permission mutation checked `roles.manage` only, even
  though it changes a global policy.
- **Remediation**: added `AUTH_SELF_REGISTERABLE_ROLE_CODES` allowlisting; platform roles outside that allowlist
  require `context.isSuperAdmin`; global role-permission mutation is super-admin-only. Both denials return typed
  error codes.
- **Verification test**:
  - `auth.test.js` → `registration enforces password policy and rejects privileged self-assignment`.
  - `authorization.test.js` → `tenant admins cannot grant privileged platform roles` (asserts 403 and
    `privileged_role_assignment_denied`).
  - `authorization.test.js` → `role permissions are configurable by super admins and take effect on the next
    request` (asserts tenant admin 403 with `global_role_mutation_denied` and super-admin 200).
- **Verified**: yes. Full verify passed after the change.

### F-02 — Client-controlled forwarding headers selected rate-limit and audit identity

- **Severity**: High
- **Affected component**: Fastify app, IAM rate limiter, and audit metadata in users, organizations, farmers,
  and agriculture services.
- **Reproduction**:
  1. Send repeated OTP/login requests with rotating `X-Forwarded-For` values. Before the fix, each value selected a
     fresh rate-limit bucket.
  2. Perform an audited write with a forged `X-Forwarded-For`. Audit `ipAddress` could be attacker-controlled.
- **Root cause**: `request.headers['x-forwarded-for']` was preferred over `request.ip`; Fastify's trust boundary
  was not pinned explicitly.
- **Remediation**: `Fastify({ trustProxy: false })`; `request.ip` used for rate-limit keys and audit metadata.
  Cookie `Secure` derivation still treats `X-Forwarded-Proto` as a deployment hint, not an authorization input.
- **Verification test**: `auth.test.js` → `auth rate limits ignore client-supplied forwarding headers`.
- **Verified**: yes for rate limiting. Audit metadata derivation was corrected in all four services but has no
  dedicated spoof assertion yet (see R-09).

### F-03 — Account enumeration and OTP preview-code exposure

- **Severity**: High
- **Affected component**: IAM authentication service, auth routes, and shared configuration.
- **Reproduction**:
  1. `POST /api/v1/iam/auth/otp/request` for an unknown email returned `No matching account was found.`
  2. With the preview OTP provider in any non-production environment, the response included `previewCode`,
     allowing an attacker with response access to complete OTP login.
- **Root cause**: verification-purpose OTP requests threw a user-not-found error; preview-code inclusion was
  gated only on `NODE_ENV !== 'production'`.
- **Remediation**: unknown accounts receive the same generic accepted response and a dummy password verification
  for timing consistency. Preview codes require `NODE_ENV=test` **and**
  `AUTH_OTP_PREVIEW_CODE_IN_RESPONSE=true`; production config rejects the flag. Reset/reactivate flows use the
  same gate.
- **Verification test**:
  - `auth.test.js` → `verification OTP requests do not reveal whether an account exists`.
  - `auth.test.js` → `OTP preview codes are returned only when explicitly enabled for tests`.
- **Verified**: yes.

### F-04 — Public observability exposed domain-event payloads

- **Severity**: High
- **Affected component**: `apps/api/src/routes/platform.js`.
- **Reproduction**: `GET /api/v1/observability` without authentication returned `events.recent`, which could
  include audit entries and business/financial metadata from the in-process event bus.
- **Root cause**: a deliberately public diagnostic route returned raw event payloads.
- **Remediation**: the route now returns only the aggregate `events.recorded` count; no event bodies are exposed.
  The existing limit query remains validated for contract stability but is not used to return data.
- **Verification test**:
  - `backend-hardening.test.js` → `public observability does not expose domain-event payloads`.
  - `architecture.test.js` → `GET /api/v1/observability validates its limit query`.
- **Verified**: yes.

### F-05 — Buyer-controlled checkout discounts and delivery fees

- **Severity**: High
- **Affected component**: orders DTO and checkout service
  (`apps/api/src/modules/orders/application/orders.dto.js`, `orders.service.js`).
- **Reproduction**: submit checkout with `pricingRules: [{ type: "DISCOUNT", mode: "PERCENTAGE",
  percentage: 1 }]`. Base prices were recomputed, but the client-supplied discount was applied to the seller
  subtotal and reduced the payable total.
- **Root cause**: checkout accepted client-authored pricing rules as business policy. Discounts and delivery fees
  are pricing decisions, not client assertions.
- **Remediation**: removed `pricingRules` from the checkout contract; the service uses an empty trusted policy
  list. Unknown fields, including client totals, are stripped, and all amounts are recomputed from current
  listing prices. Server-owned discount/delivery policy can be added later without trusting the client.
- **Verification test**:
  - `orders.test.js` → `checkout splits sellers, ignores client totals, and is idempotent` (asserts submitted
    discount/delivery rules produce zero effect).
  - `orders.test.js` → `checkout revalidates current listing prices and stock`.
  - `database/orders.test.js` → `checkout totals and reference keys are enforced by the database`.
- **Verified**: yes.

### F-06 — Invitation acceptance was not bound to the authenticated invitee

- **Severity**: High
- **Affected component**: `apps/api/src/modules/organizations/application/organizations.service.js`.
- **Reproduction**: with a valid invitation token for email A, an authenticated caller B could supply email A and
  drive acceptance through the invited identifier rather than the authenticated principal.
- **Root cause**: the service compared the supplied email with the invitation email and looked up the user by
  invitation email; the authenticated context was not the binding constraint.
- **Remediation**: normalize and compare the invitation email with `context.user.email`; resolve the accepting
  user by `context.user.id`; the supplied email can no longer redirect the operation.
- **Verification test**: `organizations.test.js` → `invitation acceptance is bound to the authenticated invitee`.
- **Verified**: yes.

### F-07 — Payment replay and refund double-spend around provider calls

- **Severity**: Critical
- **Affected component**: payment service, in-memory and Prisma stores, and repository contract.
- **Reproduction**:
  1. Two concurrent initiation requests with the same idempotency key could both pass a pre-provider duplicate
     check and create two provider payments. A failed provider call followed by a replay could create another
     payment instead of returning the failed row.
  2. Two concurrent refunds with different keys both observed the full refundable balance and called the provider,
     allowing the same captured amount to be refunded twice.
- **Root cause**: durable claims and refund reservations were created only after external provider calls; checks
  were read-then-write without row locks or pending-refund accounting.
- **Remediation**: `claimPayment` writes a full-request-bound `INITIATED` row before the provider call;
  `finalizePayment` writes provider outcome and status history. `reserveRefund` locks the payment, counts
  `REQUESTED`/`APPROVED` pending refunds, and reserves the amount; `finalizeRefund` atomically updates refund and
  payment balances. Prisma uses row locks and the in-memory store uses synchronous claim semantics. Event
  webhook completion uses compare-and-set on the expected from-status.
- **Verification test**:
  - `backend-hardening.test.js` → `payment idempotency keys are bound to the full request before provider calls`.
  - `backend-hardening.test.js` → `concurrent refunds with different keys cannot double-spend a captured payment`.
  - `database/payments.test.js` → `payment store claims and refund reservations are atomic`.
  - `payments.test.js` → `initiation is idempotent and verification posts one capture journal` and
    `refunds run through the adapter, post reversals, and are idempotent`.
- **Verified**: yes.

### F-08 — Webhook authenticity and payload parity gaps

- **Severity**: High
- **Affected component**: payment routes, DTOs, service, and provider adapters.
- **Reproduction**:
  1. Sign a minified JSON body, then send the same semantic payload pretty-printed. Before the fix, verification
     recomputed the signature from parsed JSON, so the byte-substituted body was accepted.
  2. Send a validly signed callback with a different currency or amount; the payment status and ledger effects
     could be driven by untrusted callback metadata.
  3. A processing failure after event registration left the webhook event without a `FAILED` outcome.
- **Root cause**: HMAC was computed over `JSON.stringify(payload)` rather than exact request bytes; signature
  parsing was length-based rather than format-based; webhook normalization did not require currency parity;
  failure paths did not persist event errors.
- **Remediation**: raw JSON buffer capture (`request.rawBody`), strict `^sha256=[0-9a-f]{64}$` parsing with
  timing-safe comparison, BDT/USD allowlist, webhook currency and amount parity checks, `FAILED` event persistence
  on processing errors, and CAS status transition on webhook completion.
- **Verification test**:
  - `backend-hardening.test.js` → `webhooks authenticate exact raw bytes and reject malformed or mismatched
    callbacks`.
  - `payments.test.js` → `webhooks require authenticity, deduplicate callbacks, and reject unknown references`.
  - `database/payments.test.js` → `webhook callbacks are unique and tenant consistent`.
- **Verified**: yes.

### F-09 — Ledger idempotency aliases and account-currency mismatch

- **Severity**: High
- **Affected component**: in-memory and Prisma ledger stores.
- **Reproduction**:
  1. Post journal with idempotency key `K` for reference `payment-A`; replay `K` with `payment-B` returned the
     original journal, hiding the conflicting reference.
  2. A journal denominated in one currency could be posted to accounts configured in another currency.
- **Root cause**: replay handling checked only the idempotency key; account resolution did not compare account
  currency with journal currency.
- **Remediation**: replay must match reference type, reference id, currency, and organization; account resolution
  rejects currency mismatch in both stores.
- **Verification test**: `unit-invariants.test.js` → `ledger idempotency keys cannot be reused for a different
  journal` (also asserts currency mismatch rejection); `database/ledger.test.js` → `journals must balance and
  cannot be posted twice`.
- **Verified**: yes for in-memory idempotency and currency checks; Prisma currency parity is implemented but has
  no dedicated isolated assertion beyond the database ledger invariants.

### F-10 — AI caller self-certification of evidence and approvals

- **Severity**: High
- **Affected component**: API intelligence DTO/gateway, Python multimodal, GraphRAG, and agentic workflow.
- **Reproduction**:
  1. Submit a multimodal asset declaring `status: VERIFIED`, `license.verified: true`, and source authority. It
     was treated as verified/citable.
  2. Submit GraphRAG relationships with `verified: 1` or inline approval fields; relationships could be promoted
     and self-approved.
  3. Submit an agentic approval body with a caller-chosen `approvedBy`; the name was trusted.
- **Root cause**: request DTOs and AI models accepted trust assertions from the caller and used them to set
  evidence class, verification state, and approver identity.
- **Remediation**: strict API DTOs reject approval and verification-claim fields; multimodal records are forced
  `UNVERIFIED`, `verified=false`, empty authority, non-citable; GraphRAG validation emits only candidate
  extractions with zero verified/validated counts; inline graph approval removed; agentic resume requires a
  server-stored pending run, matching trace/user/org, an allowlisted reviewer from
  `CROPSY_AI_APPROVAL_REVIEWER_IDS`, and server-populated `approvedBy`/`approvedAt`.
- **Verification test**:
  - `ai-gateway.test.js` → `AI inputs reject tenant, business, approval, and verification assertions` and
    `AI agentic and GraphRAG routes forward strict advisory requests with tenant metadata`.
  - `test_intelligence_hardening.py` → `test_multimodal_input_strips_self_certification`,
    `test_internal_dtos_reject_verification_and_inline_graph_approval`,
    `test_agentic_approval_identity_comes_from_signed_context_only`, and
    `test_agentic_approval_is_default_denied_without_reviewer_allowlist`.
  - Updated `test_graph_rag.py` and `test_unified_orchestration.py` assert candidate-only/no-attribution behavior.
- **Verified**: yes. The reviewer allowlist defaults empty, so approvals fail closed until configured.

### F-11 — Cross-tenant multimodal asset ID collisions

- **Severity**: High
- **Affected component**: `apps/ai/app/modules/multimodal_rag.py`.
- **Reproduction**: organization A and organization B both submitted an asset with `assetId: "shared"` and the
  same version. The raw asset ID was used as the index/document key, so org B could overwrite or read org A's
  chunks and points.
- **Root cause**: tenant scope was stored as metadata but not included in the index identity.
- **Remediation**: IDs are namespaced by a hash of trusted `organizationId`, `assetId`, and version; old chunks
  and vector points are deleted when the version changes; empty trusted scope is rejected.
- **Verification test**: `test_intelligence_hardening.py` →
  `test_multimodal_assets_are_namespaced_by_trusted_organization`,
  `test_multimodal_version_change_removes_old_index_entries`, `test_multimodal_service_rejects_empty_trusted_scope`,
  and `test_namespaced_multimodal_id_is_not_the_caller_asset_id`.
- **Verified**: yes.

### F-12 — AI rate-limit identity spoofing

- **Severity**: Medium
- **Affected component**: `apps/ai/app/middleware.py`, configuration, and container wiring.
- **Reproduction**: an unsigned caller could set `x-user-id` / `x-organization-id` headers and select or reset a
  different per-user rate-limit bucket; one organization could also evade a shared budget by rotating identities.
- **Root cause**: rate-limit keys were derived from unverified internal identity headers.
- **Remediation**: the middleware verifies the whole internal request signature before trusting identity headers;
  signed contexts use `org:<id>:user:<id>:<path>` keys, unsigned callers use a conservative gateway-IP fallback,
  and a separate per-organization cap is enforced.
- **Verification test**: `test_intelligence_hardening.py` →
  `test_rate_limit_keys_use_verified_identity_and_reject_spoofing` and
  `test_rate_limits_enforce_per_user_and_per_organization_budgets`.
- **Verified**: yes within one AI process. Multi-replica enforcement remains unresolved (R-03).

## Verified fixes summary

| ID | Fix | Verification | Status |
| --- | --- | --- | --- |
| F-01 | Platform-role allowlist and super-admin-only global RBAC mutation | `auth.test.js`, `authorization.test.js`, full verify | Fixed and verified |
| F-02 | Trusted socket IP for rate limits and audit metadata | `auth rate limits ignore client-supplied forwarding headers`, full verify | Fixed and verified; audit-spoof assertion still missing |
| F-03 | Generic OTP response and test-only preview gate | `verification OTP requests...`, `OTP preview codes...` | Fixed and verified |
| F-04 | Public observability emits aggregate count only | `public observability does not expose domain-event payloads` | Fixed and verified |
| F-05 | Checkout ignores client pricing rules | Checkout API and DB totals tests | Fixed and verified |
| F-06 | Invitation bound to authenticated invitee | `invitation acceptance is bound to the authenticated invitee` | Fixed and verified |
| F-07 | Payment claims and refund reservations before provider calls | API hardening + DB payment atomicity tests | Fixed and verified |
| F-08 | Raw-byte webhook HMAC, strict format, currency/amount parity | API + DB webhook tests | Fixed and verified |
| F-09 | Ledger idempotency content binding and currency parity | Unit + DB ledger tests | Fixed; in-memory paths verified, Prisma currency parity implemented without an isolated assertion |
| F-10 | AI trust assertions rejected/stripped; approvals fail closed | API gateway + Python AI hardening tests | Fixed and verified |
| F-11 | Tenant-namespaced AI asset IDs with version cleanup | Python tenant isolation tests | Fixed and verified |
| F-12 | Signed AI identity keys and org-wide cap | Python rate-limit tests | Fixed and verified within one process |

## Unresolved risks

Nothing in this section is claimed as fixed.

| ID | Title | Severity | Affected component | Evidence / root cause | Required remediation |
| --- | --- | --- | --- | --- | --- |
| R-01 | CSRF on public cookie-auth mutation routes | High | `shared/http/authorization.js`, auth routes | `PUBLIC_ROUTE_PATTERNS` includes login, refresh, forgot/reset, reactivate, and logout. The public branch returns before the cookie-CSRF check; only logout has a special case. Cookie-authenticated refresh and password-state mutations can be cross-site triggered. | Require a CSRF token or origin check for all cookie-based state-changing auth routes; add cross-site regression tests. |
| R-02 | `AUTH_COOKIE_SAMESITE=none` permitted | Medium | `packages/config/index.js` | Config enum allows `none`; if deployed with cross-site cookies it removes a browser CSRF barrier. | Restrict to `lax`/`strict` unless a documented cross-site flow has origin/CSRF protections, or enforce those protections when `none` is selected. |
| R-03 | Process-local rate limiters | Medium | API `InMemoryRateLimiter`, AI `SlidingWindowRateLimiter` | Counters live in each process. Multiple replicas multiply the effective limit. | Use a shared Redis/DB-backed limiter with atomic consume, and test replica semantics. |
| R-04 | Mobile bearer tokens in `AsyncStorage` | Medium | `apps/mobile/src/lib/auth/session.js` | Tokens are stored in JS-accessible app storage; a compromised JS context or backup can expose them. | Use platform secure storage (Keychain/Keystore) for access/refresh tokens. |
| R-05 | Dependency advisories remain | High / Critical | Root lockfile and nested dependencies | `npm audit --omit=dev` reports 46 advisories: 9 low, 15 moderate, 21 high, 1 critical (`tar`). Nested `postcss` advisories remain after the Next upgrade and overrides. | Upgrade/patch with compatibility testing; force-fix only after resolving breaking changes; verify with `npm audit`. |
| R-06 | Generic prompt injection and unverified AI content | Medium | AI orchestration | Advisory output can still be influenced by untrusted text; no trusted source registry exists. | Add trusted provenance, output policy checks, and adversarial prompt-injection tests. |
| R-07 | External provider/ledger atomicity | Medium | Payment provider adapters and ledger posting | Provider calls and database writes cannot share one transaction. Claim/reservation rows reduce but do not eliminate compensation states such as provider success with local failure. | Add an outbox/saga with idempotent reconciliation and failure-injection tests. |
| R-08 | No trusted multimodal source registry | Medium | AI multimodal RAG | Caller-uploaded assets are forced unverified and non-citable; this is safe but limits legitimate evidence use. | Build a signed source/authority registry with independent review before allowing citation. |
| R-09 | No dedicated audit-IP spoof regression | Low | Auth/users/organizations/farmers/agriculture audit metadata | F-02 fixed the derivation by code review and the rate-limit test proves the socket-IP key, but no test asserts forged `X-Forwarded-For` is ignored in `audit_logs.ipAddress`. | Add an audited action with a forged forwarding header and assert the stored IP is the socket peer. |
| R-10 | Graph capability metadata names legacy evidence classes | Low / Informational | AI graph capability metadata | Metadata still lists evidence classes that the hardened validation path can no longer emit. | Update metadata to match candidate-only behavior. |
| R-11 | Device smoke verification unavailable | Informational | Mobile test environment | `adb` and `xcrun simctl` are unavailable here. | Run Android/iOS smoke tests in an environment with SDK tooling. |

## Conclusion

Twelve confirmed findings were remediated and covered by regression tests; the full verification pipeline passes after
the final edits. The most significant residual risks are deployment-level (shared rate limiting, cookie CSRF policy,
secure mobile token storage), dependency advisories, and external-provider compensation. Those are explicitly
unresolved and must not be treated as certified fixes.

# Security

CROPSY now has an implemented authentication and authorization layer in the IAM
module. This document summarizes the controls; the client contracts and policy
detail live in the API docs. The independent assessment and verified remediation
record is in [`application-security-assessment.md`](./application-security-assessment.md).

- Environment variables are validated at startup through `@cropsy/config` for the business API and
  `pydantic-settings` for the AI service. Web and mobile use local URL validators.
- `.env` is ignored by Git; [`.env.example`](../../.env.example) documents local defaults and production requirements.
- The business API registers Helmet and CORS plugins and rejects unsupported API versions centrally.

## Authentication

- Email and Bangladesh phone registration, email/SMS OTP verification, password login, OTP login,
  logout, access/refresh token rotation, device/session listing and revocation, change password,
  forgot/reset password, deactivation, and recovery are implemented. See
  [`../api/authentication.md`](../api/authentication.md).
- Passwords use scrypt with a unique salt and constant-time verification. OTPs, refresh tokens,
  session tokens, and purpose tokens are stored only as salted hashes or HMACs; plaintext OTP codes
  are never persisted.
- Access tokens are short-lived HMAC-signed JWTs checked against a live server-side session on every
  request. Refresh tokens are opaque, rotate on use, and a replay revokes the whole session.
- Login failures, OTP requests/verification, registration, recovery, and refresh are rate limited.
  OTPs have TTLs, attempt caps, resend cooldowns, and single-use state. Accounts lock after a
  configurable number of failed logins.
- Web clients receive HttpOnly `cropsy_access` and `cropsy_refresh` cookies with `SameSite=Lax` and
  `Secure` in production/HTTPS. Cookie-authenticated mutations require a matching `x-csrf-token`;
  mobile clients use bearer tokens returned in the JSON body.
- Production requires `AUTH_STORE=prisma`, `FARM_STORE=prisma`, `AGRICULTURE_STORE=prisma`, `CATALOG_STORE=prisma`, `MARKETPLACE_STORE=prisma`, `WAREHOUSE_STORE=prisma`, `ORDERS_STORE=prisma`, `PAYMENTS_STORE=prisma`, `LEDGER_STORE=prisma`, `BILLING_STORE=prisma`, `ANALYTICS_STORE=prisma`, a strong `AUTH_JWT_SECRET`, and HTTP OTP provider URLs.
  It also requires `PAYMENT_PROVIDER_MODE=configured` and a non-empty `PAYMENT_PROVIDERS_JSON`
  whose entries define a code, supported methods, and a webhook secret. The preview OTP provider
  and mock payment adapter exist only for local/test use and are disabled by production config;
  no provider credentials or endpoints are committed.

## Authorization

- Twelve canonical user categories (including organization-scoped member and admin roles),
  multiple roles per user, multiple organizations per user, and 54 granular permissions are
  supported. The matrix is documented in [`permission-matrix.md`](./permission-matrix.md) and
  exposed at `GET /api/v1/iam/auth/matrix`.
- Every non-public route is default-deny. Route handlers receive a verified context built from the
  database on each request; client-supplied role codes and organization ids are never trusted as
  proof of access.
- Platform permissions combine with active-organization role permissions. User and resource checks
  verify the target's tenant membership, so a user with `users.read` in one organization cannot
  read a user belonging only to another. Super admins bypass tenant scope but are audited.
- Farm coordinates are private even for most `farms.read` holders. Raw points/boundaries are
  available only to the farm owner, an active member/admin of the farm's organization, or a super
  admin; other reads are redacted (`coordinatesAccess: "REDACTED"`), map/spatial output is filtered,
  and denied direct coordinate access is audited as `farmers.coordinates.denied`.
- Agriculture routes are default-deny with split read/manage permissions for crops, cultivations,
  harvests, and expenses. Cultivation/activity/harvest/expense access requires farm ownership or an
  active organization membership, and cross-tenant references are rejected. Only super admins may
  create platform-scoped calendars or recommendations.
- Catalog and marketplace routes are default-deny and reuse the existing `products.*` and
  `listings.*` permissions; no permission was added. Catalog writes require matching tenant scope,
  and marketplace listing writes require seller ownership, super admin, or same-tenant
  `listings.manage`. Buyer DTOs expose only public seller/location summaries; exact coordinates,
  email, phone, password hashes, and private addresses are redacted.
- Cart, checkout, and order routes are default-deny and reuse the existing `orders.read`/
  `orders.manage` permissions; no permission was added. Listing, product, seller-account, tenant,
  price, stock, and availability-window checks are revalidated at cart mutation and checkout.
  Client-supplied totals and currency are ignored; checkout totals are recomputed from current
  listing prices and caller-supplied pricing rules are snapshotted rather than seeded as policy.
  Unique `reference_key` values prevent duplicate submissions, status transitions follow a domain
  state machine with current-status guards, cancellation restores availability, and history is
  append-only. Seller users may view their own fulfillments; parent checkout details and receipts
  are limited to the buyer, a same-tenant `orders.manage` holder, or a super admin.
- Warehouse routes are default-deny and reuse `warehouses.read`/`warehouses.manage`. Warehouses,
  inventory batches, reservations, movements, and alerts require the active tenant to match or a
  super admin. Product and unit references are validated through read-only catalog data, stock
  changes are transactional and audited, movement history is append-only, and reservation
  `referenceKey` values guard concurrent order attempts against duplicate reservations.
- Cooperative routes are default-deny and reuse `farms.read`/`farms.manage` plus `orders.read`/
  `orders.manage` for group purchase requests; no permission was added. Group owner/leader status,
  active membership, and tenant scope are checked before group/campaign mutations, contribution
  decisions, purchase decisions, allocation, or finalization. A contribution may be updated only
  by its own contributor or a super admin; other farmers cannot change its quantity, quality, or
  status. Catalog and warehouse references are read-only, and cooperative DTOs expose ids and
  business fields only, never user contact details, private addresses, coordinates, or password
  hashes. Allocation policies and weights are caller-configurable; earnings require caller-supplied
  sales amount/currency and retain allocation/policy traceability rather than applying invented
  commission or settlement rules.
- Payment routes are default-deny and reuse `payments.read`/`payments.manage`; no permission was
  added. Provider codes/methods are checked against deployment configuration, buyers can view only
  their own payments, and initiation/refund idempotency keys plus payment state transitions guard
  duplicate financial effects. Provider callbacks are never publicly allowlisted: the ingress must
  map the request to a `payments.manage` principal, and the adapter verifies
  `x-webhook-signature` as `sha256=<hex>` HMAC-SHA256 over
  `${eventId}.${JSON.stringify(payload)}` using the configured webhook secret. Duplicate provider
  event ids are stored, flagged, and skipped without a second status or ledger posting; secret
  material is never returned by `GET /payments/providers`.
- Billing adds tenant-scoped `subscriptions.read`, `subscriptions.manage`, and `invoices.read` for
  organization administrators, while `plans.manage` is reserved for `CROPSY_SUPER_ADMIN`. Plan
  prices, entitlements, limits, provider codes, and cycle overrides are caller-supplied and stored;
  no commercial policy or paid-plan requirement is seeded. Subscription, invoice, and usage access
  is restricted to the active tenant unless the caller is a super admin. Provider codes are checked
  against deployment configuration, and feature gating is opt-in through `auth.features` so ordinary
  roles and routes remain usable without a subscription.
- Ledger routes are default-deny and reuse `ledger.read`/`ledger.manage`; no permission was added.
  Journals require positive balanced lines and a unique idempotency key, posted journals/lines/
  audits are append-only by database trigger, and duplicate keys return the original journal
  without another audit or event. Balances are signed by account/owner/bucket/currency; ledger
  reads are tenant-filtered, and payments reach posting only through the narrow
  `LedgerPostingPortToken` (expectations, postings, balance reads, account codes), not by editing
  accounts or balances directly. Commission rates, refund policies, and settlement periods stay
  caller-supplied snapshots or external rule keys.
- `AI_ESTIMATED` expenses and recommendations require a rule key plus `ai.feedback` (or super
  admin). Reports keep these estimates separate from `RECORDED` production costs; profitability
  uses a caller-supplied `pricePerKg` and never invents market prices.
- The policy can be replaced with `AUTHZ_POLICY_JSON` or changed through
  `PUT /roles/:roleCode/permissions`. The HTTP contract and isolation rules are in
  [`../api/authorization.md`](../api/authorization.md).
- Allow and deny decisions are appended to `audit_logs` and published on the in-process event bus.

## Automated coverage

`npm run test -w @cropsy/api` includes auth integration tests for password policy, OTP limits and
single-use behavior, refresh reuse revocation, password reset/recovery, cookie CSRF, and
default-deny. Authorization tests cover cross-organization denial, forged tenant headers, audit
events, super-admin access, and runtime permission reconfiguration. Organization and profile
suites cover registration, invitations, switching, tenant isolation, reusable profile APIs,
role-specific storage, verification restrictions, and audit events. Farm suites
cover tenant-scoped farm CRUD, coordinate redaction, spatial/map privacy, soil
and irrigation validation, and audited coordinate denials. Agriculture API suites
cover catalog/calendar configuration, tenant and farm isolation, cultivation
history, harvests, recorded-vs-AI expenses, and cost/profitability reports. Catalog
suites cover bilingual taxonomy, typed attributes, tenant isolation, and default-deny;
marketplace suites cover seller/buyer flows, filters, proximity, ownership, favorite/report rules,
and DTO privacy. Orders suites cover default-deny, cart availability and tenant checks, seller
splitting, server-calculated totals, idempotency, pricing rules, visibility, cancellation/restock,
status transitions, history, JSON receipts, and stale price/stock rejection. Warehouse suites cover registration, reservation idempotency/oversell prevention,
adjustments, damaged/expired stock, alerts, movement history, and default-deny/tenant checks;
cooperative suites cover group ownership, membership, contribution ownership, configurable
allocation policies, earnings, tenant isolation, and authorization. Database suites check
crop/expense and catalog/marketplace constraints, PostGIS proximity, Prisma adapter normalization,
warehouse reservation/settlement concurrency, duplicate reference keys, append-only movements, and
final stock consistency. Order database suites check checkout total equations, unique reference
keys, append-only status history, tenant guards, and atomic listing availability decrement/restore.
Payment API suites cover default-deny, provider metadata redaction, header/body idempotency matching,
initiation idempotency, allocation validation, verification/capture posting once, webhook signature
rejection, duplicate callbacks, amount mismatch, failure handling, and refund reversals. Ledger API
suites cover default-deny, balanced posting with full journal lines, duplicate posting, bucket
balances, expectations/reconciliation, settlements, adjustments, and audit events. Payment database
suites check amount bounds, unique references/idempotency keys, append-only status history, and
unique/tenant-safe webhook events. Ledger database suites check deferred balance enforcement,
unique journal keys, append-only journals/lines/audits, tenant consistency, settlement invariants,
and expectation uniqueness. Database verification runs all eleven migrations, checks drift, and runs
the seed twice with stable 22/51/486/13 counts.

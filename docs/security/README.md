# Security

CROPSY now has an implemented authentication and authorization layer in the IAM
module. This document summarizes the controls; the client contracts and policy
detail live in the API docs.

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
- Production requires `AUTH_STORE=prisma`, `FARM_STORE=prisma`, `AGRICULTURE_STORE=prisma`, `CATALOG_STORE=prisma`, `MARKETPLACE_STORE=prisma`, `WAREHOUSE_STORE=prisma`, a strong `AUTH_JWT_SECRET`, and HTTP OTP provider URLs.
  The preview provider exists only for local/test use; it is disabled by production config and
  never accepts a client-supplied code as proof of verification.

## Authorization

- Twelve canonical user categories (including organization-scoped member and admin roles),
  multiple roles per user, multiple organizations per user, and 50 granular permissions are
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
and DTO privacy. Warehouse suites cover registration, reservation idempotency/oversell prevention,
adjustments, damaged/expired stock, alerts, movement history, and default-deny/tenant checks;
cooperative suites cover group ownership, membership, contribution ownership, configurable
allocation policies, earnings, tenant isolation, and authorization. Database suites check
crop/expense and catalog/marketplace constraints, PostGIS proximity, Prisma adapter normalization,
warehouse reservation/settlement concurrency, duplicate reference keys, append-only movements, and
final stock consistency.

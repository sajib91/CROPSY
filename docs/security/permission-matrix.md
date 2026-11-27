# Permission matrix

CROPSY uses granular, dot-separated permission codes. The grid below is the default
policy in [`auth-policy.js`](../../apps/api/src/modules/iam/domain/auth-policy.js),
which is also loaded by the seed and exposed through
`GET /api/v1/iam/auth/matrix`. `✓` means the canonical role receives the
permission; `—` means it does not.

The runtime store is authoritative. Deployments can replace the defaults with
`AUTHZ_POLICY_JSON`, and an authorized administrator can change one role with
`PUT /api/v1/iam/auth/roles/:roleCode/permissions`. Changes apply to the next
request because the authorization context is rebuilt from the store each time.
Re-running the seed removes stale role-permission rows and restores the
configured default policy.

Catalog and marketplace reuse the existing `products.read`, `products.manage`,
`listings.read`, and `listings.manage` codes; neither module introduced a new
permission. The current seed has 56 permissions and 531 role-to-permission assignments. Warehouse
routes reuse `warehouses.read`/`warehouses.manage`, and cooperative routes reuse
`farms.read`/`farms.manage` plus `orders.read`/`orders.manage` for group purchase
requests. Cart, checkout, order lifecycle, cancellation, history, and receipt
routes also reuse `orders.read`/`orders.manage`. Payment routes reuse
`payments.read`/`payments.manage` (including provider callbacks), and ledger
routes reuse `ledger.read`/`ledger.manage`. Logistics reuses `shipments.read`/
`shipments.manage`; quality reuses `quality.read`/`quality.manage`; traceability
private reads reuse `traceability.read`, while its mutations accept any of the
existing manage permissions `farms.manage`, `harvests.manage`, `quality.manage`,
`warehouses.manage`, `shipments.manage`, or `organizations.manage`. The expanded
warehouse operations continue to reuse `warehouses.read`/`warehouses.manage`.
Billing adds tenant-scoped `subscriptions.read`, `subscriptions.manage`, and
`invoices.read` grants for organization administrators. Only the super admin
receives `plans.manage`; plan configuration is never a tenant capability.
Analytics gives every authenticated role `analytics.read` for organization-scoped
reports; `analytics.platform.read` is reserved for `CROPSY_SUPER_ADMIN`.

## Canonical role metadata

| Role code | Scope | Self-registerable | Multiple grants allowed |
| --- | --- | --- | --- |
| `FARMER` | Platform | Yes | Yes |
| `BUYER` | Platform | Yes | Yes |
| `WHOLESALER` | Platform | Yes | Yes |
| `RETAILER` | Platform | Yes | Yes |
| `AGRICULTURAL_INPUT_SUPPLIER` | Platform | Yes | Yes |
| `LOGISTICS_PROVIDER` | Platform | Yes | Yes |
| `WAREHOUSE_OPERATOR` | Platform | Yes | Yes |
| `AGRICULTURAL_EXPERT` | Platform | Yes | Yes |
| `QUALITY_INSPECTOR` | Platform | Yes | Yes |
| `ORGANIZATION_MEMBER` | Organization | No | Yes |
| `ORGANIZATION_ADMIN` | Organization | No | Yes |
| `CROPSY_SUPER_ADMIN` | Platform | No | No |

Platform role grants apply globally. Organization role grants apply only when
the organization is the active tenant; a caller must also be an active member
of that tenant. Super admin bypasses tenant scoping but is still audited.
`ORGANIZATION_MEMBER` is the non-admin grant issued by invitations; it can read
organization, member, and farm data but cannot manage members, documents, or
organizations. `ORGANIZATION_ADMIN` adds tenant management permissions.
`organizations.verify` is reserved for `CROPSY_SUPER_ADMIN` by default.

## Default role/permission grid

| Permission | FARMER | BUYER | WHOLESALER | RETAILER | AGRICULTURAL_INPUT_SUPPLIER | LOGISTICS_PROVIDER | WAREHOUSE_OPERATOR | AGRICULTURAL_EXPERT | QUALITY_INSPECTOR | ORGANIZATION_MEMBER | ORGANIZATION_ADMIN | CROPSY_SUPER_ADMIN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `profile.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `profile.manage` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `users.read` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `users.manage` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `roles.manage` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `permissions.read` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `organizations.create` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `organizations.read` | — | — | — | — | — | — | — | — | — | ✓ | ✓ | ✓ |
| `organizations.manage` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `organizations.verify` | — | — | — | — | — | — | — | — | — | — | — | ✓ |
| `members.read` | — | — | — | — | — | — | — | — | — | ✓ | ✓ | ✓ |
| `members.manage` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `invitations.manage` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `documents.manage` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `sessions.read` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `sessions.manage` | — | — | — | — | — | — | — | — | — | — | — | ✓ |
| `audit.read` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `settings.manage` | — | — | — | — | — | — | — | — | — | — | — | ✓ |
| `farms.read` | ✓ | — | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| `farms.manage` | ✓ | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `cultivations.read` | ✓ | — | — | — | — | — | — | ✓ | — | — | ✓ | ✓ |
| `cultivations.manage` | ✓ | — | — | — | — | — | — | — | — | — | — | ✓ |
| `harvests.read` | ✓ | — | — | — | — | — | — | ✓ | — | — | ✓ | ✓ |
| `harvests.manage` | ✓ | — | — | — | — | — | — | — | — | — | — | ✓ |
| `crops.read` | ✓ | — | — | — | — | — | — | ✓ | — | ✓ | ✓ | ✓ |
| `crops.manage` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `expenses.read` | ✓ | — | — | — | — | — | — | ✓ | — | ✓ | ✓ | ✓ |
| `expenses.manage` | ✓ | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `products.read` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | ✓ | ✓ |
| `products.manage` | ✓ | — | — | — | ✓ | — | — | — | — | — | ✓ | ✓ |
| `listings.read` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | ✓ | ✓ | ✓ |
| `listings.manage` | ✓ | — | — | — | ✓ | — | — | — | — | — | ✓ | ✓ |
| `orders.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ |
| `orders.manage` | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | ✓ | ✓ |
| `payments.read` | — | ✓ | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | ✓ |
| `payments.manage` | — | — | — | — | — | — | — | — | — | — | — | ✓ |
| `refunds.manage` | — | — | — | — | — | — | — | — | — | — | — | ✓ |
| `ledger.read` | — | — | — | — | — | — | — | — | — | — | — | ✓ |
| `ledger.manage` | — | — | — | — | — | — | — | — | — | — | — | ✓ |
| `shipments.read` | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| `shipments.manage` | — | — | — | — | — | ✓ | — | — | — | — | ✓ | ✓ |
| `warehouses.read` | — | — | — | — | — | — | ✓ | — | — | — | ✓ | ✓ |
| `warehouses.manage` | — | — | — | — | — | — | ✓ | — | — | — | ✓ | ✓ |
| `quality.read` | — | — | — | — | — | — | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| `quality.manage` | — | — | — | — | — | — | — | — | ✓ | — | — | ✓ |
| `traceability.read` | — | — | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ai.read` | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | — | ✓ | ✓ | ✓ |
| `ai.feedback` | ✓ | — | — | — | — | — | — | ✓ | — | — | — | ✓ |
| `analytics.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `analytics.platform.read` | — | — | — | — | — | — | — | — | — | — | — | ✓ |
| `subscriptions.read` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `subscriptions.manage` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `plans.manage` | — | — | — | — | — | — | — | — | — | — | — | ✓ |
| `invoices.read` | — | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `notifications.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Legacy role aliases

The seed retains ten historical role codes for existing data. Each alias
inherits the mapped canonical role's permission set; it does not add a new
permission level. Role codes are normalized by trimming, uppercasing, and
converting spaces/hyphens to underscores before lookup.

| Legacy code | Canonical role |
| --- | --- |
| `SUPER_ADMIN` | `CROPSY_SUPER_ADMIN` |
| `DISTRICT_ADMIN` | `ORGANIZATION_ADMIN` |
| `UPAZILA_COORDINATOR` | `ORGANIZATION_ADMIN` |
| `FARMER_GROUP_LEADER` | `FARMER` |
| `INSTITUTIONAL_BUYER` | `BUYER` |
| `CONSUMER` | `BUYER` |
| `TRANSPORTER` | `LOGISTICS_PROVIDER` |
| `WAREHOUSE_MANAGER` | `WAREHOUSE_OPERATOR` |
| `PAYMENT_OFFICER` | `ORGANIZATION_ADMIN` |
| `DISPUTE_OFFICER` | `ORGANIZATION_ADMIN` |

Self-registration accepts only roles marked self-registerable above. A client
cannot obtain a privileged role by sending it in `requestedRoleCodes`, and a
role assignment requires `roles.manage` plus a verified shared organization.
Permission codes are case-sensitive; role codes are uppercased during
normalization.

## Verification

`apps/api/test/authorization.test.js` covers same-tenant access, cross-tenant
denial, forged tenant headers, ordinary-role privilege denial, audit records,
super-admin access, and live permission reconfiguration.
`apps/api/test/organizations.test.js` and `apps/api/test/users.test.js` cover
organization registration, membership, invitations, switching, tenant
isolation, reusable profile APIs, role-specific profile storage, verification
restrictions, and audit events. `apps/api/test/farms.test.js` covers farm
registration, tenant isolation, coordinate privacy, map/spatial filtering, and
soil/irrigation validation. `apps/api/test/agriculture.test.js` covers crop and
calendar configuration, tenant/farm isolation, cultivation activity, harvests,
expense sources, and cost/profitability reports. `apps/api/test/catalog.test.js`
and `apps/api/test/marketplace.test.js` cover taxonomy/attribute validation,
listing CRUD and discovery, proximity, ownership, favorites, reports, messages,
and private-data redaction. `apps/api/test/orders.test.js` covers cart validation,
seller splitting, ignored client totals, pricing rules, idempotency, visibility,
cancellation/restock, transitions, history, and receipts. `apps/api/test/payments.test.js`
covers provider metadata redaction, idempotency, webhook authenticity/deduplication, capture
posting, failure handling, and refund reversals; `apps/api/test/ledger.test.js` covers balanced
journals, duplicate posting, bucket balances, expectations, settlements, and audit events.
`apps/api/test/logistics.test.js` covers nearby-provider coordinate validation, shipment
lifecycle/audits/dashboards, proof, buyer confirmation, and failed attempts;
`apps/api/test/warehouse-operations.test.js` covers locations, receipts, transfers, dispatch,
conditions, reconciliation, staff, and capacity; `apps/api/test/quality.test.js` covers
tenant scoping, evidence disclosure, grading, explicit verification, and audit records;
`apps/api/test/traceability.test.js` covers default-deny, conservative public verification, QR
output, audits, enriched private timelines, and verified-only public facts.
`apps/api/test/warehouse.test.js` covers stock
registration, idempotent reservations, oversell prevention, adjustments, damaged
and expired stock, low-stock alerts, history, and authorization;
`apps/api/test/cooperative.test.js` covers group ownership, membership,
contribution ownership, allocation policies, earnings, tenant isolation, and
authorization. Database integrity and migration tests live in
`apps/api/test/database/integrity.test.js`; farm persistence and PostGIS tests
live in `apps/api/test/database/farms.test.js`; crop/expense guard tests live in
`apps/api/test/database/agriculture.test.js`; catalog/marketplace typed values,
tenant triggers, constraints, proximity, and adapter normalization live in
`apps/api/test/database/catalog-marketplace.test.js`, and warehouse concurrency, settlement,
idempotency, append-only movement, and final-consistency checks live in
`apps/api/test/database/integrity.test.js`; checkout totals, unique reference keys,
append-only order status history, tenant guards, and listing availability helpers
live in `apps/api/test/database/orders.test.js`.

The generated matrix contains 51 permissions and 12 canonical roles; the seed
creates 22 role rows (12 canonical plus 10 legacy aliases) and 486
role-permission assignments.

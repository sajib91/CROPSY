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
organization and member data but cannot manage members, documents, or
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
| `farms.read` | ✓ | — | — | — | — | — | — | ✓ | ✓ | — | ✓ | ✓ |
| `farms.manage` | ✓ | — | — | — | — | — | — | — | — | — | ✓ | ✓ |
| `cultivations.read` | ✓ | — | — | — | — | — | — | ✓ | — | — | ✓ | ✓ |
| `cultivations.manage` | ✓ | — | — | — | — | — | — | — | — | — | — | ✓ |
| `harvests.read` | ✓ | — | — | — | — | — | — | ✓ | — | — | ✓ | ✓ |
| `harvests.manage` | ✓ | — | — | — | — | — | — | — | — | — | — | ✓ |
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
| `subscriptions.manage` | — | — | — | — | — | — | — | — | — | — | — | ✓ |
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
restrictions, and audit events. Database integrity and migration tests live in
`apps/api/test/database/integrity.test.js`.

The generated matrix contains 46 permissions and 12 canonical roles; the seed
creates 22 role rows (12 canonical plus 10 legacy aliases) and 428
role-permission assignments.

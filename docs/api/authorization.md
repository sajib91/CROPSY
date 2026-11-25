# Authorization API

Authentication answers *who* is calling; authorization answers *what they may
do* and *in which tenant*. All routes below are under `/api/v1/iam/auth` and
require a valid access token. The complete role/permission grid lives in
[`../security/permission-matrix.md`](../security/permission-matrix.md).

## Model

- **11 canonical role categories**: `FARMER`, `BUYER`, `WHOLESALER`, `RETAILER`,
  `AGRICULTURAL_INPUT_SUPPLIER`, `LOGISTICS_PROVIDER`, `WAREHOUSE_OPERATOR`,
  `AGRICULTURAL_EXPERT`, `QUALITY_INSPECTOR`, `ORGANIZATION_ADMIN`, and
  `CROPSY_SUPER_ADMIN`. Legacy seed roles remain as aliases mapped to canonical
  permissions for existing data.
- **Multiple roles**: a user may hold several platform roles. Super admin is
  exclusive (`allowMultiple: false`). Organization roles are scoped to one
  organization.
- **Multiple organizations**: `organization_memberships` plus organization-scoped
  `user_roles` grants give a user access to more than one tenant. The active
  tenant is selected by `x-organization-id`, `?organizationId=`, or a route
  `:organizationId` parameter, and is verified server-side against the user's
  memberships before the handler runs.
- **Granular permissions**: dot-separated codes such as `orders.read` and
  `ledger.manage`. Platform role permissions always apply; organization role
  permissions apply only when they belong to the active organization.
- **Default deny**: public routes are an explicit allowlist. Every other route
  must authenticate, validate the session, enforce declared permissions, and
  check tenant/ownership constraints before returning data.

Client-supplied role codes and organization ids are never trusted as proof of
access. `requestedRoleCodes` during registration are filtered by
`AUTH_SELF_REGISTERABLE_ROLE_CODES`; role assignment requires `roles.manage` and
a verified shared organization; and an organization id chosen by a client is
checked against the authenticated user's memberships.

## Endpoints

| Method | Path | Required permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/me` | authenticated | Effective roles, organizations, `organizationId`, and permissions |
| `GET` | `/access/check?permission=<code>&organizationId=<uuid>` | authenticated | Non-mutating decision probe for a permission/tenant |
| `GET` | `/roles` | `permissions.read` | Role catalog with scope and current permissions |
| `GET` | `/permissions` | `permissions.read` | Permission catalog |
| `GET` | `/matrix` | `permissions.read` | Full role-to-permission matrix |
| `GET` | `/users/:userId` | `users.read` or `profile.read` + verified shared tenant/ownership | User summary |
| `POST` | `/users/:userId/roles` | `roles.manage` + verified shared tenant | Assign a role (organization roles need `organizationId`) |
| `GET` | `/organizations/:organizationId/members` | `organizations.read` + active tenant match | Tenant member list |
| `PUT` | `/roles/:roleCode/permissions` | `roles.manage` | Replace a role's permission set |
| `GET` | `/audit?organizationId=&actorUserId=&action=&limit=` | `audit.read` | Scoped authorization/audit events |

`GET /access/check` returns a decision instead of throwing:

```json
{ "success": true, "data": { "allowed": false, "reason": "permission_denied", "permission": "roles.manage" } }
```

Other denials return HTTP `403` with `error: "forbidden"` and a structured reason
such as `cross_organization_access_denied`, `resource_access_denied`, or
`missing permission`.

## Tenant isolation rules

1. A requested organization must exist and not be soft-deleted.
2. Non-super-admins must be an active member of that organization.
3. The active context must match the organization being read or mutated; a
   client cannot switch context by adding a header or query parameter.
4. User resources are checked against the *target user's* organizations, not
   only the caller's permission string. A user with `users.read` in tenant A
   cannot read a user who belongs only to tenant B.
5. Super admins bypass tenant scoping but every decision is still audited.

## Configurable policy

The default matrix is in code (`apps/api/src/modules/iam/domain/auth-policy.js`)
and seeded into `roles`, `permissions`, and `role_permissions`. Deployments may
provide `AUTHZ_POLICY_JSON` (inline JSON or a repo-relative file path) to replace
the matrix at startup. Authorized administrators can also call
`PUT /roles/:roleCode/permissions`; changes take effect on the next request
because the auth context is rebuilt from the store each time. The seed removes
stale role-permission rows so re-running it restores the configured policy.

Every allow and deny is appended to `audit_logs` with actor, organization,
permission, reason, and role snapshot, and published on the in-process event bus
as `iam.authz.allowed` / `iam.authz.denied`.

## Automated coverage

`apps/api/test/authorization.test.js` verifies:

- same-tenant user lookup and role assignment succeed;
- cross-tenant user lookup and role assignment are denied even with
  `users.read` / `roles.manage`;
- a forged `x-organization-id` cannot switch tenants;
- ordinary roles cannot read the matrix or grant permissions;
- denials appear in `/audit`;
- super admins can inspect every tenant;
- changing a role's permissions changes the next request's effective permissions.

# API

The business API uses the `/api/v1` prefix. Health endpoints currently available:

| Service | Endpoint |
| --- | --- |
| Business API | `GET /api/v1/health` |
| Business API | `GET /api/v1/health/ready` |
| Web | `GET /health` |
| AI service | `GET /api/v1/health` |
| AI service | `GET /api/v1/health/ready` |

The business API also exposes versioned architecture introspection:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/` | API index and module directory |
| `GET /api/v1/version` | Active and supported API versions |
| `GET /api/v1/modules` | Registered modules and declared dependencies |
| `GET /api/v1/modules/:moduleId` | One registered module definition |
| `GET /api/v1/observability` | Uptime, request id, and bounded recent events |
| `GET /api/v1/<module-path>/info` | Validated module DTO from its application service |

Authentication and authorization are implemented in the IAM module:

| Topic | Documentation |
| --- | --- |
| Registration, OTP, login, tokens, sessions, password/recovery flows | [`authentication.md`](./authentication.md) |
| Roles, tenants, permission checks, configurable policy, audit | [`authorization.md`](./authorization.md) |

Auth endpoints are under `/api/v1/iam/auth`. All routes outside the explicit
public allowlist require a valid access token; cookie clients must also send a
matching `x-csrf-token` for mutations.

All 20 module paths and their dependency direction are documented in
[`../architecture/modules.md`](../architecture/modules.md). Failures return
`{ "success": false, "error": "<code>", "meta": { ... } }` with a request id.

Service responses use the standard envelope where practical:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "cropsy-business-api",
    "timestamp": "2026-01-01T00:00:00.000Z",
    "uptimeSeconds": 0.123
  }
}
```

Shared health response contracts live in `packages/api-contracts`. The `/info`
endpoints expose validated architecture DTOs. The IAM, organization, and user
workflows described below are implemented; product-specific commercial policies
remain outside this scaffold.

## Organization routes

All routes below are under `/api/v1/organizations`. Only `/info` is public; every
other route requires a valid access token and is default-deny. Tenant-scoped
routes also require the target organization to match the active tenant selected
by `x-organization-id`, `?organizationId=`, or the route parameter, unless the
caller is a super admin. `POST /organizations/switch` validates membership and
issues a replacement access token carrying the selected `org` claim; its response
contains `accessToken`, `csrfToken`, and `organizationId`.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /organizations/types` | Authenticated | List supported organization type codes |
| `POST /organizations/switch` | Authenticated | Switch active tenant and reissue tokens |
| `POST /organizations/invitations/accept` | Authenticated | Accept a hashed invitation token |
| `GET /organizations` | Authenticated | List organizations visible to the caller |
| `POST /organizations` | `organizations.create` | Register an organization and owner membership |
| `GET /organizations/:organizationId` | `organizations.read` | Read organization profile |
| `PATCH /organizations/:organizationId` | `organizations.manage` | Update organization profile |
| `PATCH /organizations/:organizationId/status` | `organizations.manage` | Change lifecycle status |
| `PATCH /organizations/:organizationId/verification` | `organizations.verify` | Record verification decision; super admin by default |
| `GET /organizations/:organizationId/members` | `members.read` | List active members |
| `DELETE /organizations/:organizationId/members/:userId` | `members.manage` | Remove a member |
| `POST /organizations/:organizationId/invitations` | `invitations.manage` | Invite a member; issues `ORGANIZATION_MEMBER` by default |
| `GET /organizations/:organizationId/invitations` | `invitations.manage` | List invitations |
| `DELETE /organizations/:organizationId/invitations/:invitationId` | `invitations.manage` | Cancel an invitation |
| `GET /organizations/:organizationId/addresses` | `organizations.read` | List organization addresses |
| `POST /organizations/:organizationId/addresses` | `organizations.manage` | Create an address |
| `PATCH /organizations/:organizationId/addresses/:addressId` | `organizations.manage` | Update an address |
| `GET /organizations/:organizationId/documents` | `documents.manage` | List document metadata |
| `POST /organizations/:organizationId/documents` | `documents.manage` | Store document metadata |
| `PATCH /organizations/:organizationId/documents/:documentId` | `documents.manage` | Update document metadata |

Document routes store metadata only (`file_url`, type, size, verification
status); file upload and storage providers remain external. Organization
invitations use hashed tokens with a configurable TTL
(`ORGANIZATION_INVITATION_TTL_HOURS`, default `72`) and are audited.

## User and profile routes

All routes below are under `/api/v1/users`. Only `/info` is public; every other
route requires a valid access token and is default-deny. `/me` routes use
`profile.read`/`profile.manage`; the `/:userId` routes reuse the same service
with `users.read`/`users.manage` and additionally require a shared active
organization with the target user. Super admins bypass tenant scoping but are
audited.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /users/me` | `profile.read` | Read the caller's profile, roles, and organizations |
| `PATCH /users/me/profile` | `profile.manage` | Update personal information, photo, birth date, gender, language, and currency |
| `PATCH /users/me/contact` | `profile.manage` | Change phone/email and reset verification for the changed channel |
| `GET /users/me/addresses` | `profile.read` | List the caller's addresses |
| `POST /users/me/addresses` | `profile.manage` | Create a Bangladesh administrative address |
| `PATCH /users/me/addresses/:addressId` | `profile.manage` | Update one address |
| `GET /users/me/preferences` | `profile.read` | List language/notification preferences |
| `PUT /users/me/preferences` | `profile.manage` | Replace notification preferences |
| `GET /users/me/role-profiles` | `profile.read` | List role extensions and the farmer profile |
| `PUT /users/me/roles/:roleCode/profile` | `profile.manage` | Upsert a non-farmer role extension |
| `GET /users/me/farmer-profile` | `profile.read` | Read the caller's agricultural profile |
| `PUT /users/me/farmer-profile` | `profile.manage` | Upsert agricultural information; verification is admin-only |
| `GET /users/:userId` | `users.read` | Read another user's profile in the active tenant |
| `PATCH /users/:userId/profile` | `users.manage` | Update another user's profile |
| `PATCH /users/:userId/contact` | `users.manage` | Update another user's contact information |
| `GET /users/:userId/addresses` | `users.read` | List another user's addresses |
| `GET /users/:userId/preferences` | `users.read` | List another user's preferences |
| `GET /users/:userId/role-profiles` | `users.read` | List another user's role extensions |
| `GET /users/:userId/farmer-profile` | `users.read` | Read another user's agricultural profile |
| `PATCH /users/:userId/farmer-profile` | `users.manage` | Update agricultural profile, including verification by authorized admins |
| `PUT /users/:userId/roles/:roleCode/profile` | `users.manage` | Upsert another user's role extension |

Profile `verificationStatus` is derived from `is_email_verified` and
`is_phone_verified`; `UserProfile` has no separate verification column. Farmer
agricultural information always lives in `FarmerProfile` and is never written to
the generic `User` row or a role extension. The full permission grid is in
[`../security/permission-matrix.md`](../security/permission-matrix.md).

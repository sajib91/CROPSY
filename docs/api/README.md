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
endpoints expose validated architecture DTOs. The IAM, organization, user, farm,
and agriculture workflows described below are implemented; product-specific
commercial policies remain outside this scaffold.

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

## Farm routes

All routes below are under `/api/v1/farmers`. Only `/info` and
`/info/:moduleId` are public; every other route requires a valid access token
and is default-deny. Reads require `farms.read`, mutations require
`farms.manage`, and Bangladesh reference-data routes require authentication
only. Tenant-scoped farms require the farm's organization to match the active
tenant unless the caller is a super admin. A farm may also be personal
(`organizationId` omitted), in which case only its owner may manage it.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /farmers/geo/divisions` | Authenticated | List Bangladesh divisions |
| `GET /farmers/geo/divisions/:divisionId/districts` | Authenticated | List districts in a division |
| `GET /farmers/geo/districts/:districtId/upazilas` | Authenticated | List upazilas in a district |
| `GET /farmers/geo/upazilas/:upazilaId/unions` | Authenticated | List unions in an upazila |
| `GET /farmers/farms` | `farms.read` | List farms visible to the caller |
| `POST /farmers/farms` | `farms.manage` | Register a farm with optional location, parcels, soil, and irrigation |
| `GET /farmers/farms/map` | `farms.read` | GeoJSON `FeatureCollection` of authorized farm locations |
| `GET /farmers/farms/spatial` | `farms.read` | Query farms by `bbox`, `near`, or `within` geometry |
| `GET /farmers/farms/:farmId` | `farms.read` | Read one farm bundle |
| `PATCH /farmers/farms/:farmId` | `farms.manage` | Update farm metadata |
| `DELETE /farmers/farms/:farmId` | `farms.manage` | Archive a farm (excluded from default lists) |
| `PUT /farmers/farms/:farmId/location` | `farms.manage` | Upsert point and/or boundary in Bangladesh |
| `GET /farmers/farms/:farmId/coordinates` | `farms.read` | Read raw coordinates when coordinate policy allows it |
| `GET /farmers/farms/:farmId/parcels` | `farms.read` | List parcels |
| `POST /farmers/farms/:farmId/parcels` | `farms.manage` | Add a parcel |
| `PATCH /farmers/farms/:farmId/parcels/:parcelId` | `farms.manage` | Update a parcel |
| `GET /farmers/farms/:farmId/soil` | `farms.read` | Read the farm's one soil profile |
| `POST /farmers/farms/:farmId/soil` | `farms.manage` | Create the farm's soil profile |
| `PATCH /farmers/farms/:farmId/soil` | `farms.manage` | Update the farm's soil profile |
| `GET /farmers/farms/:farmId/irrigations` | `farms.read` | List irrigation records |
| `POST /farmers/farms/:farmId/irrigations` | `farms.manage` | Add an irrigation record |
| `PATCH /farmers/farms/:farmId/irrigations/:irrigationId` | `farms.manage` | Update an irrigation record |

Raw coordinates are private. They are returned only to the farm owner, an
active member/admin of the farm's organization, or a super admin. Other
authorized `farms.read` holders receive metadata with coordinates and
boundaries redacted and `coordinatesAccess: "REDACTED"`; denied direct
coordinate reads are audited as `farmers.coordinates.denied`. The map endpoint
includes only farms whose coordinates the caller may see, and spatial results
are redacted by default.

Area input accepts only `HECTARE`, `ACRE`, and `SQUARE_METER`; the API stores a
canonical hectare value alongside the original value/unit. Bigha/katha
conversions are deliberately not invented. Each farm has at most one soil
profile and multiple irrigation records. Spatial queries accept
`mode=bbox|near|within`, `includeArchived`, and mode-specific bounds/origin/
JSON polygon parameters; all coordinates must be inside Bangladesh.

## Agriculture routes

All routes below are under `/api/v1/agriculture`. Only `/info` and
`/info/:moduleId` are public; every other route requires a valid access token
and is default-deny. Permissions are split by resource: crop catalog, varieties,
seasons, calendars, and recommendations use `crops.*`; cultivations and their
activity logs use `cultivations.*`; harvests use `harvests.*`; expenses and the
production-cost reports use `expenses.*`. Mutations require the matching
`*.manage` permission, and reads require the matching `*.read` permission.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /agriculture/crops` | `crops.read` | List the crop catalog |
| `POST /agriculture/crops` | `crops.manage` | Add a crop |
| `PATCH /agriculture/crops/:cropId` | `crops.manage` | Update a crop |
| `GET /agriculture/varieties` | `crops.read` | List varieties, optionally by crop |
| `POST /agriculture/crops/:cropId/varieties` | `crops.manage` | Add a variety to a crop |
| `PATCH /agriculture/crops/:cropId/varieties/:varietyId` | `crops.manage` | Update a variety |
| `GET /agriculture/seasons` | `crops.read` | List agronomic seasons |
| `POST /agriculture/seasons` | `crops.manage` | Create a season |
| `PATCH /agriculture/seasons/:seasonId` | `crops.manage` | Update a season |
| `GET /agriculture/calendars` | `crops.read` | List sowing/harvest calendars |
| `POST /agriculture/calendars` | `crops.manage` | Create a calendar |
| `PATCH /agriculture/calendars/:calendarId` | `crops.manage` | Update a calendar |
| `GET /agriculture/recommendations` | `crops.read` | List configured or AI recommendations |
| `POST /agriculture/recommendations` | `crops.manage` | Create a recommendation |
| `PATCH /agriculture/recommendations/:recommendationId` | `crops.manage` | Update a recommendation |
| `GET /agriculture/cultivations` | `cultivations.read` | List cultivations by farm/variety/season |
| `POST /agriculture/cultivations` | `cultivations.manage` | Start a cultivation |
| `GET /agriculture/cultivations/:cultivationId` | `cultivations.read` | Read one cultivation |
| `PATCH /agriculture/cultivations/:cultivationId` | `cultivations.manage` | Update status, dates, yield, or growth stage |
| `GET /agriculture/cultivations/:cultivationId/activities` | `cultivations.read` | List growth-stage, observation, and work events |
| `POST /agriculture/cultivations/:cultivationId/activities` | `cultivations.manage` | Record an activity on a cultivation |
| `GET /agriculture/farms/:farmId/activities` | `cultivations.read` | List all farm activities |
| `POST /agriculture/farms/:farmId/activities` | `cultivations.manage` | Record a farm-level activity |
| `GET /agriculture/cultivations/:cultivationId/harvests` | `harvests.read` | List harvest records for a cultivation |
| `POST /agriculture/cultivations/:cultivationId/harvests` | `harvests.manage` | Record a harvest and actual yield |
| `GET /agriculture/farms/:farmId/harvests` | `harvests.read` | List harvest records for a farm |
| `GET /agriculture/expenses` | `expenses.read` | List visible expenses |
| `POST /agriculture/expenses` | `expenses.manage` | Record or estimate an expense |
| `PATCH /agriculture/expenses/:expenseId` | `expenses.manage` | Update an expense |
| `GET /agriculture/farms/:farmId/expenses` | `expenses.read` | List farm expenses |
| `GET /agriculture/farms/:farmId/reports/expenses` | `expenses.read` | Expense totals and category breakdown |
| `GET /agriculture/farms/:farmId/reports/production-cost` | `expenses.read` | Per-cultivation costs and unallocated farm costs |
| `GET /agriculture/farms/:farmId/reports/yield-cost` | `expenses.read` | Expected vs actual yield and cost per kg |
| `GET /agriculture/farms/:farmId/reports/profitability` | `expenses.read` | Harvest profitability using a supplied price |
| `GET /agriculture/cultivations/:cultivationId/cost` | `expenses.read` | Read one cultivation's cost summary |

Cultivations, activities, harvests, and expenses are checked against farm
ownership or active-tenant membership. Calendars and recommendations may be
tenant-scoped (`organizationId`) or platform-scoped (`scope=GLOBAL`); creating
platform-scoped records requires a super admin, and reads include global records
by default unless `includeGlobal=false`. Varieties must match their
crop, and a recommendation's calendar must match its crop, variety, and tenant.

Recorded expenses are actual production costs. `AI_ESTIMATED` expenses and
recommendations are kept separate: they require `estimateRuleKey`/`ruleKey` and
`ai.feedback` (or super admin), and reports never fold them into recorded cost.
`pricePerKg` is caller-supplied for profitability; when it is omitted, revenue
and profit are `null`. Farm-level expenses that cannot be attributed to a
cultivation are reported as `unallocatedFarmCost` rather than double-counted. No
commission rates, payment providers, subscription prices, settlement rules, or
land-conversion policies are invented here.

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

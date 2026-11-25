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
agriculture, catalog, marketplace, warehouse, and cooperative workflows described
below are implemented; product-specific commercial policies remain outside this
scaffold.

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

## Farmer cooperative routes

All routes below are under `/api/v1/farmers`. Only `/info` and
`/info/:moduleId` are public; every other route requires a valid access token
and is default-deny. Group, campaign, contribution, allocation, and earnings
routes reuse `farms.read` for reads and `farms.manage` for mutations. Purchase
request reads reuse `orders.read`, creation reuses `orders.manage`, and group
decisions/finalization reuse `farms.manage`. Tenant-scoped records require the
active tenant to match unless the caller is a super admin.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /farmers/groups` | `farms.read` | List groups visible to the caller |
| `POST /farmers/groups` | `farms.manage` | Create a group; the creator becomes owner/leader |
| `GET /farmers/groups/:groupId` | `farms.read` | Read one group |
| `PATCH /farmers/groups/:groupId` | `farms.manage` | Update a group owned/led by the caller |
| `GET /farmers/groups/:groupId/members` | `farms.read` | List group members |
| `POST /farmers/groups/:groupId/members` | `farms.manage` | Join a group, or add another user as leader |
| `PATCH /farmers/groups/:groupId/members/:userId` | `farms.manage` | Accept or reject a pending member as leader |
| `DELETE /farmers/groups/:groupId/members/:userId` | `farms.manage` | Remove a member as leader |
| `GET /farmers/groups/:groupId/campaigns` | `farms.read` | List a group's campaigns |
| `POST /farmers/groups/:groupId/campaigns` | `farms.manage` | Create a campaign as leader |
| `GET /farmers/campaigns` | `farms.read` | List visible campaigns |
| `GET /farmers/campaigns/:campaignId` | `farms.read` | Read one campaign |
| `PATCH /farmers/campaigns/:campaignId` | `farms.manage` | Update a campaign as leader |
| `GET /farmers/campaigns/:campaignId/contributions` | `farms.read` | List campaign contributions |
| `POST /farmers/campaigns/:campaignId/contributions` | `farms.manage` | Contribute product, quantity, and quality as an active member |
| `GET /farmers/contributions` | `farms.read` | List visible contributions |
| `GET /farmers/contributions/:contributionId` | `farms.read` | Read one contribution |
| `PATCH /farmers/contributions/:contributionId` | `farms.manage` | Update the caller's own contribution |
| `POST /farmers/contributions/:contributionId/confirm` | `farms.manage` | Confirm a pending contribution as leader |
| `POST /farmers/contributions/:contributionId/reject` | `farms.manage` | Reject a pending contribution as leader |
| `GET /farmers/campaigns/:campaignId/purchase-requests` | `orders.read` | List a campaign's purchase requests |
| `POST /farmers/campaigns/:campaignId/purchase-requests` | `orders.manage` | Create a group purchase request |
| `GET /farmers/purchase-requests` | `orders.read` | List visible purchase requests |
| `GET /farmers/purchase-requests/:requestId` | `orders.read` | Read one purchase request |
| `PATCH /farmers/purchase-requests/:requestId` | `farms.manage` | Accept, reject, or cancel as leader |
| `POST /farmers/purchase-requests/:requestId/allocations` | `farms.manage` | Propose transparent allocations as leader |
| `GET /farmers/allocations` | `farms.read` | List visible allocations |
| `POST /farmers/purchase-requests/:requestId/finalize` | `farms.manage` | Finalize allocations and accrue earnings |
| `GET /farmers/earnings/me` | `farms.read` | List the caller's individual earnings |
| `GET /farmers/earnings` | `farms.read` | List visible group earnings |

A group owner or an active `LEADER` member manages the group and its campaigns,
membership decisions, contribution decisions, purchase-request decisions,
allocations, and finalization. Active members may contribute to `OPEN` campaigns;
a contribution may be updated only by its contributor or a super admin. Joining
creates a `PENDING` membership until a leader accepts it. Contribution product,
unit, quality grade, and optional warehouse inventory references are validated
through read-only catalog/warehouse ports, and `referenceKey` is idempotent for
the contributor.

Campaign allocation is caller-configurable: `PROPORTIONAL` divides by confirmed
quantity, while `QUALITY_WEIGHTED` requires `allocationPolicyConfig.weights`
keyed by contributor user id or quality grade code. Remainders are assigned
deterministically. Finalization requires caller-supplied `salesAmount` and
`currency`; earnings are split by allocated quantity and retain the allocation,
purchase-request, contributor, policy, and policy-snapshot references. No
commission rate, payment provider, payout rule, tax, or settlement policy is
invented. Cooperative DTOs expose ids and business fields only; user contact
details, private addresses, coordinates, and password hashes are never returned.

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

## Catalog routes

All routes below are under `/api/v1/catalog`. Only `/info` and
`/info/:moduleId` are public; every other route requires a valid access token
and is default-deny. Reads require `products.read`; mutations require
`products.manage`. Tenant-scoped rows require the active tenant to match unless
the caller is a super admin. Platform-scoped reference rows are visible by
default (`includeGlobal=true`).

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /catalog/categories` | `products.read` | List categories and subcategories |
| `POST /catalog/categories` | `products.manage` | Create a category |
| `PATCH /catalog/categories/:id` | `products.manage` | Update a category |
| `GET /catalog/units` | `products.read` | List configurable units of measure |
| `POST /catalog/units` | `products.manage` | Create a unit |
| `PATCH /catalog/units/:id` | `products.manage` | Update a unit |
| `GET /catalog/quality-grades` | `products.read` | List configurable quality grades |
| `POST /catalog/quality-grades` | `products.manage` | Create a quality grade |
| `PATCH /catalog/quality-grades/:id` | `products.manage` | Update a quality grade |
| `GET /catalog/attributes` | `products.read` | List flexible attribute definitions |
| `POST /catalog/attributes` | `products.manage` | Create an attribute definition |
| `PATCH /catalog/attributes/:id` | `products.manage` | Update an attribute definition |
| `GET /catalog/products` | `products.read` | Search products |
| `POST /catalog/products` | `products.manage` | Create a product with attributes/images |
| `GET /catalog/products/:productId` | `products.read` | Read one product bundle |
| `PATCH /catalog/products/:productId` | `products.manage` | Update a product |
| `PUT /catalog/products/:productId/attributes` | `products.manage` | Replace a product's attribute values |
| `POST /catalog/products/:productId/images` | `products.manage` | Add a product image |
| `DELETE /catalog/products/:productId/images/:imageId` | `products.manage` | Remove a product image |
| `GET /catalog/products/:productId/varieties` | `products.read` | List varieties |
| `POST /catalog/products/:productId/varieties` | `products.manage` | Create a variety with attribute values |
| `PATCH /catalog/products/:productId/varieties/:varietyId` | `products.manage` | Update a variety |
| `PUT /catalog/products/:productId/varieties/:varietyId/attributes` | `products.manage` | Replace a variety's attribute values |

List queries accept `organizationId`, `includeGlobal`, `search`, and
`isActive`; categories also accept `parentId` and `code`, attributes accept
`categoryId` and `valueType`, and products accept `categoryId`,
`categoryCode`, `unitCode`, `isAvailable`, and `attributeCode` plus
`attributeValue`. Attribute values are typed as `TEXT`, `NUMBER`, `BOOLEAN`,
`DATE`, or `ENUM`; `ENUM` definitions require `allowedValues`, and required
definitions are validated on product/variety writes. Image URLs must use
`http`/`https` and sort order cannot be negative. Names and descriptions may
be supplied in English and Bengali (`nameBn`, `descriptionBn`, `altTextBn`).
The seed contains 13 reference categories covering Grains, Vegetables,
Fruits, Spices, Pulses, Seeds, Agricultural inputs, and Other approved
agricultural products plus legacy produce families; it does not seed products.

## Marketplace routes

All routes below are under `/api/v1/marketplace`. Only `/info` and
`/info/:moduleId` are public; every other route requires a valid access token
and is default-deny. Discovery, favorites, seller profiles, reports, and
messages require `listings.read`; listing mutations and report review require
`listings.manage`. `ACTIVE` listings are visible to every `listings.read`
holder. A non-active listing is visible only to its seller, a super admin, or
a caller with `listings.manage` in the listing's active tenant.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /marketplace/listings` | `listings.read` | Search listings with filters and sorting |
| `POST /marketplace/listings` | `listings.manage` | Create a seller listing |
| `GET /marketplace/listings/:listingId` | `listings.read` | Read one listing bundle |
| `PATCH /marketplace/listings/:listingId` | `listings.manage` | Edit quantity, price, grade, dates, or location |
| `POST /marketplace/listings/:listingId/deactivate` | `listings.manage` | Deactivate a listing |
| `POST /marketplace/listings/:listingId/locations` | `listings.manage` | Add a listing location |
| `DELETE /marketplace/listings/:listingId/locations/:locationId` | `listings.manage` | Remove a listing location |
| `POST /marketplace/listings/:listingId/images` | `listings.manage` | Add a listing image |
| `DELETE /marketplace/listings/:listingId/images/:imageId` | `listings.manage` | Remove a listing image |
| `GET /marketplace/favorites` | `listings.read` | List the caller's favorites |
| `POST /marketplace/favorites/:listingId` | `listings.read` | Favorite a listing |
| `DELETE /marketplace/favorites/:listingId` | `listings.read` | Remove a favorite |
| `GET /marketplace/sellers/:sellerId` | `listings.read` | Read a public seller profile |
| `POST /marketplace/listings/:listingId/reports` | `listings.read` | Report a suspicious listing |
| `GET /marketplace/reports` | `listings.read` | List reports visible to the caller |
| `PATCH /marketplace/reports/:reportId/review` | `listings.manage` | Review a report |
| `POST /marketplace/listings/:listingId/messages` | `listings.read` | Send a platform-mediated message |
| `GET /marketplace/messages` | `listings.read` | List messages involving the caller |
| `PATCH /marketplace/messages/:messageId/read` | `listings.read` | Mark a received message as read |

`GET /marketplace/listings` accepts `search`, `productId`, `categoryId`,
`categoryCode`, `sellerUserId`, `organizationId`, `status`, `minPrice`,
`maxPrice`, `location`, `latitude`, `longitude`, `radiusMeters`,
`sort=newest|price_asc|price_desc|distance`, `limit`, and `offset`.
`latitude`, `longitude`, and `radiusMeters` must be supplied together. The
Prisma store uses PostGIS `ST_DWithin`/`ST_Distance` for meter-based proximity;
the in-memory store uses haversine for local tests. Report reasons are
`MISLEADING`, `PROHIBITED`, `DUPLICATE`, `FRAUD`, and `OTHER`; review moves a
report to `UNDER_REVIEW`, `RESOLVED`, or `DISMISSED`.

Listing and seller DTOs expose only public data: display name, Bengali display
name, avatar, organization id/name/slug, farmer verification status,
location label/administrative ids/radius, and optional distance. Exact
coordinates, email addresses, phone numbers, password hashes, and private
addresses are never returned. Messages are restricted to the listing's buyer
and seller, and send/read events are audited. No listings are seeded: sellers
create them from catalog products, and price, quantity, grade, harvest date,
and location are caller-supplied. Commission, payment, and settlement rules
remain unimplemented policy.

## Warehouse and inventory routes

All routes below are under `/api/v1/warehouse`. Only `/info` and
`/info/:moduleId` are public; every other route requires a valid access token
and is default-deny. Reads require `warehouses.read`; mutations require
`warehouses.manage`. Warehouse, inventory, reservation, movement, and alert rows
are tenant-scoped and require the active tenant to match unless the caller is a
super admin.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /warehouse/warehouses` | `warehouses.read` | List warehouses by tenant/status/search |
| `POST /warehouse/warehouses` | `warehouses.manage` | Register a warehouse |
| `GET /warehouse/warehouses/:warehouseId` | `warehouses.read` | Read one warehouse |
| `PATCH /warehouse/warehouses/:warehouseId` | `warehouses.manage` | Update a warehouse |
| `GET /warehouse/inventories` | `warehouses.read` | List stock by warehouse/product/batch/status |
| `POST /warehouse/inventories` | `warehouses.manage` | Register a product batch in a warehouse |
| `GET /warehouse/inventories/:inventoryId` | `warehouses.read` | Read one inventory row with related warehouse/product/alert |
| `PATCH /warehouse/inventories/:inventoryId` | `warehouses.manage` | Set on-hand quantity or low-stock threshold |
| `POST /warehouse/inventories/:inventoryId/adjustments` | `warehouses.manage` | Apply a signed stock adjustment |
| `POST /warehouse/inventories/:inventoryId/damaged` | `warehouses.manage` | Deduct damaged stock |
| `POST /warehouse/inventories/:inventoryId/expired` | `warehouses.manage` | Deduct expired stock |
| `POST /warehouse/inventories/:inventoryId/deductions` | `warehouses.manage` | Deduct available stock |
| `POST /warehouse/inventories/:inventoryId/reservations` | `warehouses.manage` | Reserve available stock with a caller reference key |
| `GET /warehouse/reservations` | `warehouses.read` | List reservations by tenant/warehouse/product/status |
| `GET /warehouse/reservations/:reservationId` | `warehouses.read` | Read one reservation |
| `POST /warehouse/reservations/:reservationId/release` | `warehouses.manage` | Release all or part of a reservation |
| `POST /warehouse/reservations/:reservationId/deduct` | `warehouses.manage` | Deduct all or part of a reservation |
| `GET /warehouse/movements` | `warehouses.read` | Query append-only stock movement history |
| `GET /warehouse/alerts` | `warehouses.read` | List low-stock alerts |
| `POST /warehouse/alerts/:alertId/acknowledge` | `warehouses.manage` | Acknowledge an alert |
| `POST /warehouse/alerts/:alertId/resolve` | `warehouses.manage` | Resolve an alert |

Warehouses may hold multiple product batches and units; batch rows are unique
per `(warehouseId, productId, batchCode)`, and unit codes are validated against
configurable catalog units. `quantityOnHand`, `quantityReserved`, and
`availableQuantity` are maintained together with `available = on hand -
reserved`. Every movement records its type (`REGISTER`, `UPDATE`, `RESERVE`,
`RELEASE`, `DEDUCT`, `ADJUSTMENT`, `DAMAGED`, `EXPIRED`), before/after
quantities, unit, reason, reference, actor, and timestamp. Reserve, release, and
deduct operations run in transactions that lock the inventory/reservation row,
prevent overselling, and maintain at most one open low-stock alert per batch.
Reservation `referenceKey` values are idempotent for concurrent order attempts;
partial release/deduction updates `settledQuantity` and finalizes status when
the reservation is exhausted. Movement history is append-only, and every stock
or alert mutation is audited. No price, commission, or settlement rule is added.

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

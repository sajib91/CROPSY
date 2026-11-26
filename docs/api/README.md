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

All 21 module paths and their dependency direction are documented in
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
agriculture, catalog, marketplace, orders, warehouse, logistics, quality,
traceability, and cooperative workflows described below are implemented;
product-specific commercial policies remain outside this scaffold.

## AI gateway routes

All routes below are under `/api/v1/intelligence`. They require normal user authentication and
the existing `ai.read` or `ai.feedback` permission. The business API signs each internal call
to the FastAPI AI service with HMAC-SHA256; frontend applications never receive provider
credentials and cannot call the Python service directly.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /intelligence/ai/capabilities` | `ai.read` | AI module and policy metadata |
| `POST /intelligence/ai/ask` | `ai.read` | Evidence-grounded advisory answer |
| `POST /intelligence/ai/retrieve` | `ai.read` | Hybrid verified evidence with fusion/filter overrides |
| `POST /intelligence/ai/recommendations` | `ai.read` | Evidence-grounded recommendation |
| `POST /intelligence/ai/chat` | `ai.read` | Conversational assistant answer with citations and claims |
| `POST /intelligence/ai/conversations` | `ai.read` | Create a conversation for follow-up questions |
| `GET /intelligence/ai/conversations/:conversationId` | `ai.read` | Read conversation history |
| `POST /intelligence/ai/evaluation/retrieval` | `ai.read` | Offline retrieval metrics |
| `POST /intelligence/ai/feedback` | `ai.feedback` | Record advisory feedback |

AI output is advisory only. Citations are limited to documents ingested with complete,
verified provenance and licensing metadata. The service returns
`status: "insufficient_evidence"` with an empty citation list when no eligible source
evidence exists. Assistant answers separate `established_fact` from `prediction`, mark every
prediction `uncertain`, and attach mandatory safety notes for pesticide, fertilizer, chemical,
and diagnosis questions. Retrieval evaluation reports Recall@K, Precision@K, MRR, and nDCG@K
with `accuracyClaimed: false` for the small offline fixture dataset. See
[`apps/ai/README.md`](../../apps/ai/README.md) for the internal pipeline and configuration.

### Market intelligence gateway routes

These routes are also under `/api/v1/intelligence` and require `ai.read`. They forward only
caller-supplied observations to the AI service and keep evidence classes separate.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `POST /intelligence/ai/market/forecast` | `ai.read` | Time-validated price forecast with MAE/RMSE/MAPE where applicable |
| `POST /intelligence/ai/market/explain` | `ai.read` | Isolated LLM explanation of supplied market facts |

### Weather intelligence gateway routes

Farm context is resolved from stored farm and cultivation records before any provider call.
The caller must be the farm owner, a super admin, or an active member of the farm's organization
with `farms.read`. A farm without usable coordinates or region is rejected explicitly.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `POST /intelligence/ai/weather/observations` | `ai.read` | Provider-observed weather history |
| `POST /intelligence/ai/weather/forecasts` | `ai.read` | Provider forecasts, always `uncertain` |
| `POST /intelligence/ai/weather/alerts` | `ai.read` | Provider-issued alerts, including severe alerts |
| `POST /intelligence/ai/weather/advisory` | `ai.read` | Crop-stage-aware advisory with separated evidence |

No mock weather provider exists. When weather is unconfigured or unavailable, these routes
return an explicit error instead of inventing conditions. AI recommendations are advisory and
carry their evidence references; advisory thresholds are deployment configuration, not verified
crop requirements.

### Agricultural market intelligence module

Read-only routes under `/api/v1/market-intelligence` require `ai.read` or `listings.read`
(except the public `/info` endpoints). All figures come from collected marketplace observations
carrying a source, source reference, collection method, and `historical_observation` evidence
class; no live quote is claimed.

| Endpoint | Purpose |
| --- | --- |
| `GET /market-intelligence/observations` | Collected price observations and provenance |
| `GET /market-intelligence/prices/history` | Price history summary |
| `GET /market-intelligence/prices/regions` | Regional comparison of observed prices |
| `GET /market-intelligence/supply-demand` | Listing-based supply and demand signals |
| `GET /market-intelligence/trends` | Observation-based trend series |
| `GET /market-intelligence/seasonality` | Observed monthly patterns |
| `GET /market-intelligence/availability` | Observed listing availability |
| `GET /market-intelligence/opportunities` | Observed price dispersion signals |
| `GET /market-intelligence/selling-insights` | Observed price context for selling decisions |
| `POST /market-intelligence/forecast` | Forward collected observations to the AI forecast pipeline |

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
and location are caller-supplied. Commission rules remain caller-supplied
snapshots; payment attempts and callbacks are handled by the `payments` module
and financial effects are posted through the `ledger` posting port.

## Orders routes

All routes below are under `/api/v1/orders`. Only `/info` and `/info/:moduleId`
are public; every other route requires a valid access token and is default-deny.
Reads reuse `orders.read`; cart, checkout, cancellation, and lifecycle mutations
reuse `orders.manage`. No permission was added. Tenant-scoped records require the
active tenant to match the selected organization unless the caller is a super
admin. Seller-fulfillment order routes are nested under the module path, so their
full paths begin `/api/v1/orders/orders`.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /orders/cart` | `orders.read` | Read the caller's active cart with current listing summaries |
| `POST /orders/cart/items` | `orders.manage` | Add a listing and quantity to the cart |
| `PATCH /orders/cart/items/:listingId` | `orders.manage` | Change a cart item's quantity |
| `DELETE /orders/cart/items/:listingId` | `orders.manage` | Remove a cart item |
| `POST /orders/checkout` | `orders.manage` | Convert the cart into a parent checkout and seller fulfillments |
| `GET /orders/checkouts` | `orders.read` | List checkouts visible to the caller |
| `GET /orders/checkouts/:checkoutId` | `orders.read` | Read one parent checkout with its seller orders |
| `GET /orders/orders` | `orders.read` | List seller orders visible to the caller |
| `GET /orders/orders/:orderId` | `orders.read` | Read one seller fulfillment |
| `POST /orders/orders/:orderId/cancel` | `orders.manage` | Cancel an eligible order and restore listing availability |
| `POST /orders/orders/:orderId/transitions` | `orders.manage` | Apply an allowed lifecycle transition |
| `GET /orders/orders/:orderId/history` | `orders.read` | Read append-only order status history |
| `GET /orders/orders/:orderId/receipt` | `orders.read` | Generate a JSON receipt for one seller order |

Cart mutations require an `ACTIVE` listing whose seller account is `ACTIVE`, a
current listing/product tenant match, a quantity at or above the listing minimum
and at or below available stock, and a read-through catalog product reference.
Checkout revalidates all of those conditions and reads current listing prices
again; client-supplied `subtotalAmount`, `discountAmount`, `deliveryFeeAmount`,
`taxAmount`, `totalAmount`, and `currency` fields are ignored and never stored as
authoritative values.

A caller may pass `Idempotency-Key` or body `referenceKey`; if both are present
they must match. A repeated key returns the original checkout instead of creating
a second one. One checkout creates a `purchase_groups` parent and exactly one
seller-specific `orders` row per distinct seller; the whole write and listing
availability decrement are transactional. At most one `DELIVERY` and one
`DISCOUNT` rule may apply to a seller. A rule may be seller-specific or general
and uses `FLAT` `amount` or `PERCENTAGE` `percentage` (0–1) against the
server-calculated seller subtotal. Rules and computed amounts are snapshotted on
both the checkout and each seller order. There is no seeded fee, discount, tax,
or commission; when no rule is supplied, fee and discount are zero. `taxAmount`
remains zero until a tax policy is supplied.

Seller orders can transition `PENDING → PAYMENT_PENDING → PAYMENT_FAILED →
CONFIRMED → PROCESSING → SHIPPED → DELIVERED → COMPLETED` according to the domain
state machine; invalid or skipped transitions return `409`. Cancellation is
allowed from `PENDING`, `PAYMENT_PENDING`, `PAYMENT_FAILED`, `CONFIRMED`, and
`PROCESSING`, is guarded by the order's current status, and restores listing
availability. Every transition writes an append-only history row and an audit
event. A seller may view their own seller fulfillment; parent checkout details
and JSON receipts are limited to the buyer, a same-tenant `orders.manage` holder
or super admin. Order checkout does not call a payment provider or post money;
those effects belong to the payment and ledger flows below.

## Payment routes

All routes below are under `/api/v1/payments`. Only `/info` and
`/info/:moduleId` are public; every other route requires a valid access token
and is default-deny. Reads require `payments.read`; initiation, verification,
refunds, and provider callbacks require `payments.manage`. No permission was
added. Tenant-scoped records require the active tenant to match unless the
caller is a super admin; buyers may view their own payments.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /payments/providers` | `payments.read` | List configured provider codes, methods, and capabilities |
| `POST /payments` | `payments.manage` | Initiate a payment through a configured provider adapter |
| `GET /payments` | `payments.read` | List payments visible to the caller |
| `GET /payments/:paymentId` | `payments.read` | Read one payment |
| `GET /payments/:paymentId/history` | `payments.read` | Read append-only payment status history |
| `POST /payments/:paymentId/verify` | `payments.manage` | Verify a payment with its provider adapter |
| `POST /refunds` | `payments.manage` | Request/process a refund through the provider adapter |
| `GET /refunds` | `payments.read` | List refunds visible to the caller |
| `POST /webhooks/:providerCode` | `payments.manage` | Receive and authenticate a provider callback |

Initiation accepts `orderId`, optional `purchaseGroupId`, `providerCode`,
`method`, `amount`, optional `currency`/`idempotencyKey`, `allocation`, optional
`commissionRule`, and `providerOptions`. `allocation` must contain
`sellerUserId`, `sellerNetAmount`, and `commissionAmount` whose sum equals the
payment amount. That allocation and the commission rule are validated and
snapshotted; no fee or commission rate is seeded or calculated by the API.
`Idempotency-Key` (header) or `idempotencyKey` (body) is required, and if both
are present they must match. A repeated key returns the original payment. A
provider failure is persisted as `FAILED` with a failure code instead of
throwing away the attempt.

Verification calls the configured adapter and applies the payment state machine:
`INITIATED → AUTHORIZED → CAPTURED`, `AUTHORIZED → FAILED/CANCELLED`, and no
transitions out of terminal states. A first capture writes one
`PAYMENT_CAPTURE` journal through the ledger posting port: buyer clearing is
debited `PENDING`, seller payable is credited `PENDING` for the seller owner,
and platform revenue is credited `AVAILABLE` when a commission snapshot is
non-zero. The journal idempotency key is derived from the payment id, so
repeated verification, a duplicate callback, or a concurrent retry cannot post
a second capture. Status history is append-only.

Refunds require `paymentId`, `amount`, `reason`, an idempotency key, and an
`allocation` with `sellerUserId`, `sellerNetAmount`, and
`commissionReversalAmount` summing to the refund amount. The refund cannot
exceed the payment's refundable balance. The provider adapter processes it,
and a processed refund posts one `REFUND` journal that debits seller payable
(and platform revenue for a commission reversal) and credits buyer clearing.
Failed refunds do not post a journal.

Provider configuration is deployment-owned. `PAYMENT_PROVIDER_MODE=configured`
is required in production, along with `PAYMENTS_STORE=prisma`,
`LEDGER_STORE=prisma`, and a non-empty `PAYMENT_PROVIDERS_JSON` array whose
entries contain `code`, `methods`, and `webhookSecret`. The built-in
`HttpPaymentProvider` also accepts configured initiate/verify/refund URLs and
an auth token; no credentials, endpoints, or provider certifications are
committed. `PaymentProviderRegistryToken` may be overridden with a custom
adapter contract. `PAYMENT_PROVIDER_MODE=mock` is accepted only when
`NODE_ENV=test` and is used solely by automated tests. `GET /providers` exposes
safe metadata only, never secrets.

Webhook requests are not publicly allowlisted: the deployment ingress must map
a provider callback to an authenticated `payments.manage` principal. The
provider's adapter must first verify authenticity. Built-in adapters expect
`x-webhook-signature: sha256=<hex>`, an HMAC-SHA256 of
`${eventId}.${JSON.stringify(payload)}` using the configured provider
`webhookSecret`; custom adapters may override `verifyWebhook`. Accepted event
payloads contain `eventId`, `paymentReference`, `status`, optional `amount`,
`currency`, and `failureCode`. Events are deduplicated by
`(provider_code, provider_event_id)` before any state or ledger change; a
duplicate returns the stored event with `duplicate: true` and posts nothing.
Mismatched amounts, unknown references, and terminal-state callbacks are
recorded without a second posting.

## Ledger routes

All routes below are under `/api/v1/ledger`. Only `/info` and
`/info/:moduleId` are public; every other route requires a valid access token
and is default-deny. Reads require `ledger.read`; postings, expectations, and
settlements require `ledger.manage`. No permission was added. Ledger records
are tenant-scoped unless platform-scoped, and super admins bypass tenant scope
but are audited.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /ledger/accounts` | `ledger.read` | List structural chart-of-accounts accounts |
| `GET /ledger/balances` | `ledger.read` | List balances by account, owner, bucket, and currency |
| `POST /ledger/journals` | `ledger.manage` | Post a balanced double-entry journal |
| `GET /ledger/journals` | `ledger.read` | List posted journals |
| `GET /ledger/journals/:journalId` | `ledger.read` | Read one journal with its lines |
| `POST /ledger/expectations` | `ledger.manage` | Record an expected financial amount for reconciliation |
| `POST /ledger/settlements` | `ledger.manage` | Record a seller settlement with its journal |
| `GET /ledger/settlements` | `ledger.read` | List settlements |
| `GET /ledger/audit` | `ledger.read` | Read the append-only ledger audit trail |
| `GET /ledger/reconciliation` | `ledger.read` | Compare expectations with matched journals |

A journal body contains `idempotencyKey`, `referenceType`, optional
`referenceId`/`description`/`currency`/`expectationKey`, and at least two
`lines`. Each line has `accountCode`, `direction` (`DEBIT` or `CREDIT`),
`bucket` (`PENDING`, `AVAILABLE`, or `SETTLED`), `amount`, and optional
`ownerUserId`/`description`. Every amount is positive, debits must equal
credits, and the response includes the persisted `lines`. A repeated
idempotency key returns the original journal without a second posting, audit
event, or domain event. Adjustment journals use `referenceType: "ADJUSTMENT"`.

Balances are signed and keyed by account, owner key/user, bucket, and currency,
so a temporarily credit-heavy asset account may be negative until funded. The
structural chart of accounts is seeded (or overridden with
`LEDGER_ACCOUNTS_JSON`) with account codes/roles only; commission rates, refund
policies, and settlement periods are never stored as defaults. Reconciliation
expectations are created explicitly, linked by `expectationKey`, and reported
as `matched`, `missing`, and `balanced`. Settlement requests carry a caller's
`ruleKey`, period, gross/deductions/net amounts, allocation snapshot, and a
balanced journal; they do not apply a seeded payout rule. Posted journals,
lines, status history, and audit events are append-only in the database, while
the payment module reaches the ledger only through a narrow posting port.

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

## Logistics routes

All routes below are under `/api/v1/logistics`. Only `/info` and
`/info/:moduleId` are public; every other route requires a valid access token
and is default-deny. Reads require `shipments.read`; provider/service/shipment/
delivery mutations require `shipments.manage`. Buyer confirmation uses
`shipments.read` because it is an action by the buyer named on the delivery.
Shipments, providers, services, deliveries, proofs, and audits are tenant-scoped
and require the active tenant to match unless the caller is a super admin.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /logistics/providers/nearby` | `shipments.read` | Discover active providers with PostGIS `ST_DWithin` using supplied `longitude`, `latitude`, and `radiusKm` |
| `GET /logistics/providers` | `shipments.read` | List providers by tenant/status/search |
| `POST /logistics/providers` | `shipments.manage` | Register a logistics provider with point coordinates |
| `GET /logistics/providers/:providerId` | `shipments.read` | Read one provider |
| `PATCH /logistics/providers/:providerId` | `shipments.manage` | Update a provider |
| `GET /logistics/services` | `shipments.read` | List delivery services |
| `POST /logistics/services` | `shipments.manage` | Add a delivery service |
| `PATCH /logistics/services/:serviceId` | `shipments.manage` | Update a delivery service |
| `GET /logistics/shipments` | `shipments.read` | List shipments by tenant/status/provider |
| `POST /logistics/shipments` | `shipments.manage` | Create a shipment from a tracked order reference |
| `GET /logistics/shipments/:shipmentId` | `shipments.read` | Read one shipment |
| `POST /logistics/shipments/:shipmentId/pickup` | `shipments.manage` | Record pickup time and evidence metadata |
| `POST /logistics/shipments/:shipmentId/assignment` | `shipments.manage` | Assign or reassign a provider/service |
| `POST /logistics/shipments/:shipmentId/status` | `shipments.manage` | Apply an explicit shipment status transition |
| `GET /logistics/shipments/:shipmentId/tracking` | `shipments.read` | Read recorded tracking events; `liveLocation` is always `null` |
| `GET /logistics/shipments/:shipmentId/history` | `shipments.read` | Read append-only shipment status history |
| `GET /logistics/deliveries` | `shipments.read` | List deliveries by tenant/status |
| `GET /logistics/deliveries/:deliveryId` | `shipments.read` | Read one delivery |
| `POST /logistics/deliveries/:deliveryId/proof` | `shipments.manage` | Attach proof metadata without uploading a file |
| `POST /logistics/deliveries/:deliveryId/failure` | `shipments.manage` | Record a failed attempt and reason |
| `POST /logistics/deliveries/:deliveryId/confirm` | `shipments.read` | Confirm delivery as the named buyer |
| `GET /logistics/audits` | `shipments.read` | Query logistics audit records |
| `GET /logistics/dashboard/buyer` | `shipments.read` | Buyer-facing shipment summary |
| `GET /logistics/dashboard/seller` | `shipments.read` | Seller-facing shipment summary |
| `GET /logistics/dashboard/provider` | `shipments.read` | Provider-facing shipment summary |

Nearby-provider discovery casts provider points and the caller's supplied point
to `geography`, orders by `ST_Distance` in meters, and filters by
`ST_DWithin`. Partial or non-numeric coordinate pairs are rejected. The API
never invents or simulates a live GPS feed: tracking returns only recorded
events and an explicit `liveLocation: null` with a no-simulated-GPS policy.
Proofs, confirmations, failures, and status changes are audited; no delivery
fee, insurance rate, or refund policy is seeded.

## Expanded warehouse operations

The following routes are additional `/api/v1/warehouse` endpoints. They reuse
`warehouses.read` for reads and `warehouses.manage` for mutations; `/info`
remains the only public warehouse surface.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /warehouse/warehouses/:warehouseId/capacity` | `warehouses.read` | Report used capacity, recorded capacity, utilization, and locations |
| `GET /warehouse/locations` | `warehouses.read` | List storage locations |
| `POST /warehouse/locations` | `warehouses.manage` | Create a storage location |
| `PATCH /warehouse/locations/:locationId` | `warehouses.manage` | Update a storage location |
| `POST /warehouse/receipts` | `warehouses.manage` | Post an idempotent `RECEIPT` movement |
| `POST /warehouse/allocations` | `warehouses.manage` | Record a stock allocation reference |
| `POST /warehouse/transfers` | `warehouses.manage` | Post paired `TRANSFER_OUT`/`TRANSFER_IN` movements |
| `POST /warehouse/dispatches` | `warehouses.manage` | Post an idempotent `DISPATCH` deduction |
| `GET /warehouse/conditions` | `warehouses.read` | List storage-condition readings |
| `POST /warehouse/conditions` | `warehouses.manage` | Record temperature, humidity, and condition status |
| `GET /warehouse/reconciliations` | `warehouses.read` | List inventory reconciliations |
| `POST /warehouse/reconciliations` | `warehouses.manage` | Create a reconciliation with counted/system difference |
| `POST /warehouse/reconciliations/:reconciliationId/approve` | `warehouses.manage` | Approve and post the balancing adjustment once |
| `GET /warehouse/staff` | `warehouses.read` | List warehouse staff assignments |
| `POST /warehouse/staff` | `warehouses.manage` | Assign a user to a warehouse role |
| `PATCH /warehouse/staff/:staffId` | `warehouses.manage` | Update or deactivate a staff assignment |
| `GET /warehouse/report` | `warehouses.read` | Aggregate warehouses, stock, movements, alerts, and conditions |

Receipts, transfers, dispatches, and reconciliation approvals run through the
inventory service's movement path, carry caller-supplied `referenceKey` values,
and replay idempotently. Capacity utilization is computed from recorded
capacity and on-hand totals; no location-level quantity is invented where the
schema has no inventory/location link. A read-only
`WarehouseOperationPortToken` publishes warehouse, inventory, movement,
condition, reconciliation, and location facts to traceability; it exposes no
mutations and performs no cross-module authorization.

## Quality inspection routes

All routes below are under `/api/v1/quality`. Only `/info` and
`/info/:moduleId` are public; every other route requires a valid access token
and is default-deny. Reads require `quality.read`; mutations require
`quality.manage`. Inspections, evidence, images, grades, verification decisions,
and audits are tenant-scoped.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /quality/inspections` | `quality.read` | List inspections by tenant/product/batch/result/verification |
| `POST /quality/inspections` | `quality.manage` | Create an inspection; verification starts `UNVERIFIED` |
| `GET /quality/inspections/:inspectionId` | `quality.read` | Read one inspection |
| `PATCH /quality/inspections/:inspectionId` | `quality.manage` | Update inspection fields; changing `result` resets verification |
| `GET /quality/inspections/:inspectionId/evidence` | `quality.read` | List evidence, optionally filtered by public disclosure |
| `POST /quality/inspections/:inspectionId/evidence` | `quality.manage` | Attach document evidence with explicit disclosure |
| `POST /quality/inspections/:inspectionId/images` | `quality.manage` | Attach image evidence with MIME type and disclosure |
| `POST /quality/inspections/:inspectionId/grade` | `quality.manage` | Record caller-supplied grade code and source |
| `POST /quality/inspections/:inspectionId/verify` | `quality.manage` | Explicitly verify an inspected, graded result |
| `POST /quality/inspections/:inspectionId/reject` | `quality.manage` | Reject with a required note |
| `GET /quality/audits` | `quality.read` | Query inspection and evidence audits |

Verification is explicit: creating or grading an inspection never certifies it,
and re-verifying or rejecting a resolved inspection conflicts. The narrow
`QualityAccessPortToken` publishes inspection facts to traceability and filters
out private evidence unless the inspection is verified and the evidence is
explicitly disclosed. Grade codes, grade sources, and evidence URIs are
caller-supplied; no grade or certificate is invented.

## Traceability routes and public verification

Private routes below are under `/api/v1/traceability`. `/info` and
`/info/:moduleId` are public, and `GET /traceability/verify/:token` is the only
other public route. Private reads require `traceability.read`; batch mutations
require any one of `farms.manage`, `harvests.manage`, `quality.manage`,
`warehouses.manage`, `shipments.manage`, or `organizations.manage`. Batches,
events, and audits are tenant-scoped.

| Endpoint | Required permission | Purpose |
| --- | --- | --- |
| `GET /traceability/batches` | `traceability.read` | List batches by tenant/product/status/verification |
| `POST /traceability/batches` | Any listed manage permission | Create a batch with a private verification token |
| `GET /traceability/batches/:batchId` | `traceability.read` | Read one batch |
| `PATCH /traceability/batches/:batchId` | Any listed manage permission | Update disclosure, participants, shipment, or notes |
| `GET /traceability/batches/:batchId/timeline` | `traceability.read` | Private timeline with best-effort quality/warehouse/logistics enrichment |
| `POST /traceability/batches/:batchId/events` | Any listed manage permission | Append a chain-of-custody event |
| `POST /traceability/batches/:batchId/verify` | Any listed manage permission | Verify only after a verified, publicly disclosed event exists |
| `POST /traceability/batches/:batchId/reject` | Any listed manage permission | Reject with a required note |
| `POST /traceability/batches/:batchId/qr` | Any listed manage permission | Generate a verification URL and terminal QR payload |
| `GET /traceability/audits` | `traceability.read` | Query batch/event/verification/QR audits |
| `GET /traceability/verify/:token` | Public | Return verified public facts only |

Public verification is deliberately conservative. If the token is unknown, the
batch is not `VERIFIED`, the batch is not publicly disclosed, or no event is
both `VERIFIED` and publicly disclosed, the response contains no batch code,
product id, verified timestamp, or facts and returns a notice that no verified
public facts are available. Even when facts are returned, actor ids, internal
record ids, coordinates, private notes, and enrichment metadata are omitted and
the disclaimer states that unverified claims are not represented as certified.
QR URLs use `WEB_PUBLIC_URL` (default `http://localhost:3000`) plus
`/verify/<token>`; no external QR service is called.

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

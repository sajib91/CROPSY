# Role dashboards

CROPSY provides one shared dashboard shell for nine non-farmer roles. Each dashboard is a localized
client workspace under the `(site)` layout and is guarded by `AuthGate`, `AuthProvider`, and a
fail-closed role check.

| Role code | Slug |
| --- | --- |
| `BUYER` | `buyers` |
| `WHOLESALER` | `wholesalers` |
| `RETAILER` | `retailers` |
| `AGRICULTURAL_INPUT_SUPPLIER` | `agricultural-input-suppliers` |
| `LOGISTICS_PROVIDER` | `logistics-providers` |
| `WAREHOUSE_OPERATOR` | `warehouse-operators` |
| `AGRICULTURAL_EXPERT` | `agricultural-experts` |
| `QUALITY_INSPECTOR` | `quality-inspectors` |
| `ORGANIZATION_ADMIN` | `organizations` |

Every page exists as `/en/<slug>/dashboard` and `/bn/<slug>/dashboard`. The farmer dashboard is a
separate workspace documented in [`farmer-dashboard.md`](farmer-dashboard.md). The authenticated
buyer and seller marketplace flows are documented in [`marketplace.md`](marketplace.md).

## Architecture

- `apps/web/lib/dashboards/roles.js` declares each role's sections, data sources, columns, and
  actions. Business logic lives in this registry, not in shared UI components.
- `apps/web/components/dashboard/role-dashboard.jsx` is the shared shell: role guard, organization
  switcher, hash-based section navigation, permission filtering, and source loading.
- `apps/web/components/dashboard/role-dashboard-sections.jsx` renders overview cards, data tables,
  action dialogs, notification module metadata, and profile settings from API responses.
- `apps/web/components/dashboard/dashboard-primitives.jsx` and `apps/web/components/ui` remain
  generic and contain no role-specific rules.

A session must include the dashboard's canonical role code. Super-admin sessions are allowed by the
API's `serializeContext` behavior. Sections are shown only when the session's `permissions` array
contains one of the section's required permissions; a missing permission list grants no sections.

## Data sources

All reads go through the same-origin `/api/dashboard/[...path]` route handler, which forwards to the
authenticated Fastify API. No dashboard value is generated from a fixture, sample row, or invented
forecast. Overview cards are counts of rows returned by an API endpoint or numeric fields returned
by a dashboard summary endpoint. Empty states, loading states, and API errors are rendered instead
of fabricated values.

| Role | Primary API sources |
| --- | --- |
| Buyer | `/marketplace/listings`, `/marketplace/favorites`, `/orders/cart`, `/orders/checkouts`, `/orders/orders`, `/logistics/dashboard/buyer`, `/logistics/shipments`, `/payments/payments`, `/intelligence/ai/capabilities` |
| Wholesaler | Buyer sources without AI capabilities, plus `/traceability/batches` |
| Retailer | Buyer sources without `/intelligence/ai/capabilities` |
| Agricultural input supplier | `/catalog/products`, seller-filtered `/marketplace/listings`, `/orders/orders` |
| Logistics provider | `/logistics/dashboard/provider`, `/logistics/deliveries`, `/logistics/providers`, `/logistics/services`, `/logistics/shipments` |
| Warehouse operator | `/warehouse/warehouses`, `/warehouse/inventories`, `/warehouse/movements`, `/warehouse/alerts`, `/warehouse/reservations`, `/warehouse/conditions`, `/warehouse/reconciliations`, `/warehouse/report`, `/logistics/shipments`, `/quality/inspections`, `/traceability/batches` |
| Agricultural expert | `/farmers/farms`, `/agriculture/cultivations`, `/agriculture/crops`, `/agriculture/expenses`, `/traceability/batches`, `/intelligence/ai/capabilities` |
| Quality inspector | `/quality/inspections`, `/quality/audits`, `/traceability/batches`, `/logistics/shipments`, `/farmers/farms` |
| Organization administrator | `/organizations`, organization-scoped members/invitations/addresses/documents, `/iam/auth/roles`, `/iam/auth/permissions`, `/iam/auth/audit`, marketplace and order records |

All roles can read `/notifications/info` with `notifications.read` and profile data from
`/users/me` and `/users/me/role-profiles` with `profile.read`. The notifications API exposes module
metadata, not a private feed; the UI says so explicitly and does not imply unread counts.

## Mutation allowlist

New read modules added for these dashboards are restricted with path patterns in
`apps/web/app/api/dashboard/[...path]/route.js`. Mutations use explicit POST, PATCH, and DELETE
allowlists; the API still enforces permissions. Exposed actions include:

- Buyer/retailer/wholesaler: save favorite, add to cart, update or remove a cart item, checkout,
  cancel order.
- Input supplier: create listing, update own listing, deactivate own listing, and manage listing
  images and locations.
- Logistics provider: update shipment status and record delivery proof.
- Warehouse operator: acknowledge or resolve stock alerts.
- Quality inspector: grade, verify, or reject inspections.
- Organization administrator: invite a member.

Every action is filtered by the matching session permission (`orders.manage`, `listings.manage`,
`shipments.manage`, `warehouses.manage`, `quality.manage`, or `invitations.manage`). Form values are
sent to the API unchanged except for cleaned empty fields and documented numeric coercion; the UI
does not invent server-computed totals.

## Organization context

When a session reports multiple organization memberships, the dashboard header shows an active
organization selector. It calls `POST /api/organizations/switch`, which forwards to
`POST /api/v1/organizations/switch` with `{ "organizationId": "<uuid>" }`, then refreshes the
session. The API validates membership before setting the new active organization cookie. Sections
that require an organization context remain idle until one is active. Sections backed by APIs that
reject requests without an active tenant are marked `requiresOrganization` in the role registry and
are hidden until a context exists, instead of rendering a predictable authorization error.

Authentication tokens continue to live only in HttpOnly cookies routed through same-origin Next.js
handlers. No access, refresh, CSRF, purpose, or reset token is written to `localStorage` or
`sessionStorage`.

## Localization and verification

EN and BN dictionaries must have identical leaf keys. `npm run check:i18n` enforces this and runs as
part of `npm run verify`. Dashboard metadata, navigation labels, tables, actions, errors, and empty
states all come from those dictionaries.

Known limitation: unknown localized paths render the localized not-found UI while returning HTTP
200; a root-level `app/not-found.js` must not be reintroduced.

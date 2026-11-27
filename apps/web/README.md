# CROPSY Web

Next.js 14 JavaScript workspace using the App Router and Tailwind CSS.

## Public site

The public site is localized at `/en` and `/bn`; `/` redirects to `/en`. It contains the home,
about, how-it-works, farmer, buyer, business, agricultural intelligence, pricing, contact, FAQ,
terms, and privacy pages. Each page uses localized metadata and the shared components in
`components/ui`.

Live public data is limited to public API endpoints: health, version, module metadata, module
`/info`, and `GET /traceability/verify/:token`. No private listings, prices, testimonials, customer
counts, or partnerships are fabricated. See [`docs/public-website.md`](../../docs/public-website.md)
for the full data policy and route list.

## Account pages

Localized account pages provide registration, login, email/phone verification, password recovery,
session management, and role-profile onboarding. They call only same-origin Next.js route handlers,
which forward to the Fastify IAM and users APIs. Access, refresh, purpose, and CSRF values remain in
HttpOnly cookies and are never placed in browser storage or browser-readable JSON. See
[`docs/web-authentication.md`](../../docs/web-authentication.md) for the token policy, proxy map,
configuration, and validation responsibilities.

## Farmer dashboard

The localized farmer workspace at `/en/farmers/dashboard` and `/bn/farmers/dashboard` provides 17
sections for farms, land, crops, activities, expenses, harvests, listings, orders, earnings, market
data, weather, AI assistance, notifications, and profile settings. Every statistic, chart, table,
and map feature comes from authenticated API responses; there are no sample records. See
[`docs/farmer-dashboard.md`](../../docs/farmer-dashboard.md) for the API source map, role gating,
and honesty policy.

## Role dashboards

Nine shared-shell workspaces are available in English and Bengali for buyers, wholesalers,
retailers, agricultural input suppliers, logistics providers, warehouse operators, agricultural
experts, quality inspectors, and organization administrators. Sections and actions are declared in
`lib/dashboards/roles.js`, loaded through the allowlisted `/api/dashboard/[...path]` proxy, and
filtered by session permissions. See [`docs/role-dashboards.md`](../../docs/role-dashboards.md) for
the complete API, permission, action, and organization-switch map.

## Marketplace

The authenticated marketplace at `/en/marketplace` and `/bn/marketplace` provides listing discovery,
search and filters, categories, listing details with galleries and quality information, seller
profiles, a server-persisted cart, checkout, order confirmation, tracking, buyer order history, and
seller listing management. All data comes from the business API through the allowlisted dashboard
proxy. Checkout submits only a `referenceKey`; prices, stock, discounts, fees, taxes, and totals are
validated and calculated by the backend. See [`docs/marketplace.md`](../../docs/marketplace.md) for
routes, API sources, permissions, geolocation policy, and validation rules.

## AI Agricultural Assistant

The authenticated assistant at `/en/ai-assistant` and `/bn/ai-assistant` provides chat, saved
conversation history, follow-up questions, citations, image analysis, document indexing, feedback,
and uncertainty states. It reads and writes only through the allowlisted
`/api/dashboard/intelligence/ai/...` proxy; the Fastify API signs requests to the FastAPI service.
See [`docs/ai-assistant.md`](../../docs/ai-assistant.md) for routes, permissions, uploads, and the
data-honesty policy.

## Endpoints

- `GET /health`
- `GET /design-system`
- `GET /verify/:token`
- `GET /api/auth/session`
- `GET /api/auth/purpose`
- `/api/auth/[...path]` proxy to `/iam/auth/[...path]`
- `/api/users/[...path]` proxy to `/users/[...path]`
- `/api/organizations/[...path]` proxy to `/organizations/[...path]` (currently only `POST /switch`)
- `/api/dashboard/[...path]` allowlisted proxy to authenticated business modules

## Commands

From the repository root:

```bash
npm run dev:web
npm run start:web
npm run build:web
```

The API base URL, canonical site URL, and optional public support email are validated from
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, and `NEXT_PUBLIC_SUPPORT_EMAIL` in `lib/env.js`. The
local validator keeps browser-safe code free of Node-only configuration modules. Server-side auth
proxy requests use `CROPSY_API_PROXY_URL` when set and otherwise fall back to `NEXT_PUBLIC_API_URL`.

## Design system

The reusable component library lives in `components/ui` and is documented in
[`docs/design-system.md`](../../docs/design-system.md). Tokens are defined in
`app/globals.css` and mapped to Tailwind in `tailwind.config.mjs`. View the interactive gallery at
`/design-system` while the dev server is running.

Feature code should import shared primitives from `@/components/ui` instead of duplicating colors,
spacing, borders, or interaction behavior. Root layouts mount `ThemeProvider`, `ToastProvider`, and
the skip link.

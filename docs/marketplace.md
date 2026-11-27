# Marketplace

CROPSY's marketplace is an authenticated, API-backed area under the localized `(site)` layout. Every
route exists at `/en/marketplace/...` and `/bn/marketplace/...`; `/` redirects to `/en`. The
marketplace home is discovery, not a public marketing page. Prices, availability, seller details,
quality grades, orders, and tracking are read from the business API only.

## Routes

| Path after `/en` or `/bn` | Purpose |
| --- | --- |
| `/marketplace` | Listing discovery with search, filters, categories, sorting, and optional location |
| `/marketplace/categories` | Category directory with links into filtered discovery |
| `/marketplace/search` | Search-focused discovery |
| `/marketplace/filters` | Full filter form with URL-synced state |
| `/marketplace/listings/:listingId` | Listing detail, image gallery, quality grade, availability, and locations |
| `/marketplace/sellers/:sellerId` | Seller profile and seller-filtered listings |
| `/marketplace/cart` | Server-persisted cart with quantity edits and availability checks |
| `/marketplace/checkout` | Idempotent checkout submission and server-calculated summary |
| `/marketplace/orders/:orderId/confirmation` | Order confirmation from the returned order |
| `/marketplace/orders/:orderId/tracking` | Order and shipment tracking lookup |
| `/marketplace/orders` | Buyer order history |
| `/marketplace/seller/listings` | Seller listing management |

## Architecture

- `apps/web/components/marketplace/marketplace-frame.jsx` and `marketplace-nav.jsx` provide the
  shared localized shell and navigation.
- `AuthGate` requires an authenticated session. `MarketplaceAccessGate` checks the session's
  `permissions` with the fail-closed `canAccess` helper and renders a permission empty state when a
  required permission is missing.
- `apps/web/lib/marketplace/client.js` is the only marketplace data client. It calls the same-origin,
  allowlisted `/api/dashboard/[...path]` proxy; the Fastify API remains the authority for tenant
  scope, ownership, permissions, prices, and stock.
- `apps/web/lib/marketplace/format.js` formats API values for display. It does not calculate
  authoritative totals, discounts, fees, taxes, or stock.
- Copy lives in the identical-key EN/BN dictionaries. `npm run check:i18n` enforces leaf-key parity.

## API source map

| Feature | API sources |
| --- | --- |
| Discovery | `GET /marketplace/listings` with `search`, `categoryId`, `productId`, `sellerUserId`, `minPrice`, `maxPrice`, `location`, `sort`, `limit`, `offset`, and optional proximity fields |
| Detail and seller | `GET /marketplace/listings/:listingId`, `GET /marketplace/sellers/:sellerId` |
| Categories and quality | `GET /catalog/categories`, `GET /catalog/products`, `GET /catalog/quality-grades` |
| Favorites | `GET /marketplace/favorites`, `POST` and `DELETE /marketplace/favorites/:listingId` |
| Cart | `GET /orders/cart`, `POST /orders/cart/items`, `PATCH` and `DELETE /orders/cart/items/:listingId` |
| Checkout | `POST /orders/checkout` |
| Orders | `GET /orders/orders`, `GET /orders/orders/:orderId`, `GET /orders/orders/:orderId/history` |
| Tracking | `GET /logistics/shipments?orderId=...`, `GET /logistics/shipments/:shipmentId/tracking` |
| Seller listings | `GET /marketplace/listings?sellerUserId=...`, `POST /marketplace/listings`, `PATCH /marketplace/listings/:listingId`, `POST /marketplace/listings/:listingId/deactivate`, `POST .../images`, `DELETE .../images/:imageId`, `POST .../locations`, `DELETE .../locations/:locationId` |

Discovery requests use `status=ACTIVE`. Listing DTOs expose location labels and radius metadata, not
exact coordinates. A seller profile exposes the profile name, avatar, organization, and any farmer
verification status returned by the API.

## Permissions

| Permission | Marketplace capability |
| --- | --- |
| `listings.read` | Listing detail and seller profile |
| `listings.manage` | Seller listing management, including create, update, deactivate, image, and location changes |
| `orders.read` | Cart view, order history, confirmation, and tracking |
| `orders.manage` | Cart mutations and checkout |
| `shipments.read` | Backend tracking reads used by the tracking page |

The UI gate is not an authorization bypass: the API independently enforces permissions, tenant
ownership, and active seller/listing status. A session without the required permission sees the
localized permission empty state instead of a fabricated data view.

## Tenant, geolocation, and cart policy

- The active organization is resolved server-side from `x-organization-id`, `?organizationId=`, or
  the session context. Membership is validated by the API before tenant-scoped data is returned.
- Browser geolocation is optional. `latitude`, `longitude`, and `radiusMeters` are sent only when all
  three values are available; a partial result is omitted rather than sent as a broken query.
- The cart is persisted by `/orders/cart`. The browser never stores cart contents, auth tokens, or
  sensitive session values in `localStorage` or `sessionStorage`.
- Checkout submits a locally generated `referenceKey`, optional organization context, and optional
  server-interpreted pricing rules. It does not submit `subtotalAmount`, `discountAmount`,
  `deliveryFeeAmount`, `taxAmount`, `totalAmount`, or an authoritative `currency`.
- The API recomputes line prices from current listing records, validates tenant scope, minimum order
  quantity, stock, and active status, and returns the final amounts. A successful checkout marks the
  cart `CHECKED_OUT`; reusing the same `referenceKey` returns the same checkout for that buyer and
  organization.
- Loading, empty, denied, and API error states are rendered from real request state. The UI does not
  invent listings, sellers, prices, testimonials, or delivery progress.

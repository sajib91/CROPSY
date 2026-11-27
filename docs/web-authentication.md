# Web authentication

The Next.js web app implements account flows against the existing Fastify IAM API. The web layer
does not validate credentials, issue tokens, decide roles, or enforce password policy; the API in
`apps/api/src/modules/iam` remains the only authority for those rules.

## Localized pages

Every page below exists at both `/en/...` and `/bn/...` and uses the dictionaries in
`apps/web/lib/i18n`.

| Route | Purpose |
| --- | --- |
| `/login` | Password sign-in and login OTP sign-in |
| `/register` | Email or phone registration with role selection |
| `/verify/email` | Email verification OTP |
| `/verify/phone` | Phone verification OTP |
| `/forgot-password` | Request and verify a password reset OTP |
| `/reset-password` | Set a new password after a verified reset OTP |
| `/account/sessions` | List/revoke sessions, sign out everywhere, change password |
| `/onboarding` | Save farmer or role-specific profile data |
| `/farmers/dashboard` | Farmer workspace built from authenticated business API data |
| `/buyers/dashboard` | Buyer workspace built from authenticated business API data |
| `/wholesalers/dashboard` | Wholesaler workspace built from authenticated business API data |
| `/retailers/dashboard` | Retailer workspace built from authenticated business API data |
| `/agricultural-input-suppliers/dashboard` | Input supplier workspace built from authenticated business API data |
| `/logistics-providers/dashboard` | Logistics provider workspace built from authenticated business API data |
| `/warehouse-operators/dashboard` | Warehouse operator workspace built from authenticated business API data |
| `/agricultural-experts/dashboard` | Agricultural expert workspace built from authenticated business API data |
| `/quality-inspectors/dashboard` | Quality inspector workspace built from authenticated business API data |
| `/organizations/dashboard` | Organization administrator workspace built from authenticated business API data |

Guarded pages (`/account/sessions`, `/onboarding`, all dashboards) render a localized sign-in prompt
until the session bootstrap reports an authenticated user. The farmer dashboard requires the
`FARMER` role; the nine role dashboards require their canonical role code and filter sections and
actions by session permissions. See [`docs/farmer-dashboard.md`](farmer-dashboard.md) and
[`docs/role-dashboards.md`](role-dashboards.md).

## Same-origin proxy

Browser code calls only same-origin Next.js route handlers. Those handlers forward to the Fastify
API and rewrite cookies to the web origin.

| Web endpoint | Upstream |
| --- | --- |
| `/api/auth/session` | Reads auth cookies, then `/iam/auth/me` when an access cookie exists |
| `/api/auth/purpose` | Reports presence of purpose cookies; never returns token values |
| `/api/auth/[...path]` | `/iam/auth/[...path]` |
| `/api/users/[...path]` | `/users/[...path]` |
| `/api/organizations/[...path]` | `/organizations/[...path]` (only `POST /switch`) |
| `/api/dashboard/[...path]` | Allowlisted authenticated business modules |

`POST /refresh` sends `client: "web"` so Fastify sets HttpOnly cookies. Registration, login, OTP
login, and refresh also send `client: "web"`.

## Token policy

- Access, refresh, purpose, and CSRF values are kept in short-lived HttpOnly cookies. Browser
  JavaScript never reads them and never writes them to `localStorage` or `sessionStorage`.
- Upstream `Set-Cookie` values are rewritten by `apps/web/lib/auth/server.js`. Cookies stay
  HttpOnly, receive `Secure` when the request is HTTPS, and keep a first-party `Path=/`.
  Upstream `Domain` attributes are dropped.
- The CSRF header is derived server-side from the access JWT `csrf` claim. It is injected into
  mutations forwarded to Fastify; the client never receives a CSRF value.
- Purpose tokens from `otp/verify` are stored only in `cropsy_purpose_reset`,
  `cropsy_purpose_login`, and `cropsy_purpose_recovery` cookies with `SameSite=Strict` and a 15-minute
  lifetime. The proxy injects them into `/reset-password`, `/login/otp`, and `/reactivate` bodies and
  clears them after success.
- Proxy JSON responses strip token and secret-shaped keys, including `accessToken`, `refreshToken`,
  `csrfToken`, `csrf`, `resetToken`, `loginToken`, `recoveryToken`, `password_hash`, and
  session/token hashes. This also covers fields that the API serializes from raw user records.
- `/logout`, `/logout-all`, `/deactivate`, `/reset-password`, and purpose-token exchanges clear the
  relevant cookies on success.
- The only browser storage used by the website is the `cropsy-theme` localStorage preference.

## Validation and errors

Client forms perform light input-shape checks (email/phone format, code digits, password
confirmation, required fields, non-negative numbers). The API enforces the actual password minimum,
OTP expiry and attempts, rate limits, self-registerable roles, permissions, and profile schemas.
Field errors and retry hints from the API envelope are normalized by `AuthError` and rendered in an
accessible, focused error summary with inline field messages.

## Role profiles

`/onboarding` reads `GET /users/me` and `GET /users/me/role-profiles`. A `FARMER` assignment uses
`GET`/`PUT /users/me/farmer-profile`; every other role uses
`PUT /users/me/roles/:roleCode/profile` with `{ "data": { ... } }`. Optional fields left blank are
omitted so persisted verification state is not reset.

## Organization switching

Role dashboards with multiple memberships call `POST /api/organizations/switch` with
`{ "organizationId": "<uuid>" }`. The same-origin handler forwards to
`POST /api/v1/organizations/switch`; the API validates membership and rewrites the active
organization cookie. The client then calls `GET /api/auth/session` to refresh roles and permissions.
No token value is exposed to browser JavaScript during the switch. See
[`docs/role-dashboards.md`](role-dashboards.md) for the dashboard behavior.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | Browser/public API base URL and proxy fallback |
| `CROPSY_API_PROXY_URL` | unset | Server-only override when Next.js reaches the API at a different URL |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical origin for SEO metadata |
| `AUTH_COOKIE_ACCESS_NAME` | `cropsy_access` | Access cookie name shared with the API |
| `AUTH_COOKIE_REFRESH_NAME` | `cropsy_refresh` | Refresh cookie name shared with the API |

Cookie names must match the API configuration for the proxy to derive CSRF and detect sessions.
Preview OTP codes appear only when the API is configured with the preview provider and not in
production.

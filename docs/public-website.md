# Public CROPSY website

The public website is served by the Next.js App Router in `apps/web`. It is localized, responsive,
and built from the shared primitives in `apps/web/components/ui`.

## Routes

`/` redirects to `/en`. Every page below exists at both `/en/...` and `/bn/...`:

| English | Bengali |
| --- | --- |
| `/en` | `/bn` |
| `/en/about` | `/bn/about` |
| `/en/how-it-works` | `/bn/how-it-works` |
| `/en/farmers` | `/bn/farmers` |
| `/en/buyers` | `/bn/buyers` |
| `/en/businesses` | `/bn/businesses` |
| `/en/agricultural-intelligence` | `/bn/agricultural-intelligence` |
| `/en/pricing` | `/bn/pricing` |
| `/en/contact` | `/bn/contact` |
| `/en/faq` | `/bn/faq` |
| `/en/terms` | `/bn/terms` |
| `/en/privacy` | `/bn/privacy` |

Non-localized tools remain at `/design-system`, `/verify/:token`, and `/health`.

Account flows are also localized at `/en` and `/bn`: `/login`, `/register`, `/verify/email`,
`/verify/phone`, `/forgot-password`, `/reset-password`, `/account/sessions`, and `/onboarding`. They
use authenticated API routes through a same-origin proxy and are documented separately in
[`docs/web-authentication.md`](web-authentication.md). The `/marketplace` route is now an
authenticated marketplace workspace documented in [`marketplace.md`](marketplace.md), not a public
marketing page.

## Data policy

The site fetches only endpoints that the API explicitly allows without authentication:

- `GET /health` and `GET /version` for the live status panel.
- `GET /modules` for the registered module directory and filtered role panels.
- `GET /modules/:moduleId` is available to the API, but pages use the public module summary and
  module `/info` endpoints.
- `GET /:moduleId/info` for the billing module callout on the pricing page.
- `GET /traceability/verify/:token` for the public batch lookup on the home page.

Listings, seller details, prices, messages, authenticated AI routes, and internal AI configuration
are not rendered as public data. The site does not publish testimonials, customer counts,
partnerships, price tiers, or capabilities that the backend does not define.

Every public fetch has a timeout and an explicit error state. Streaming `Suspense` fallbacks show
skeletons while data loads; failed requests render an inline error rather than a cached success
story.

## Localization and SEO

- Dictionaries live in `apps/web/lib/i18n/en.js` and `bn.js`.
- `apps/web/lib/i18n/index.js` selects the dictionary, builds localized paths, and detects the
  locale from the pathname.
- `apps/web/lib/seo.js` creates localized titles, descriptions, canonical URLs, `hreflang`
  alternates, Open Graph, and Twitter metadata.
- Each root layout sets the correct `<html lang>` value. The locale switcher preserves the current
  page path.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | Public business API base URL. |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical origin used in SEO metadata. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | unset | Optional public contact address. No address is invented when unset. |

All values are validated by `apps/web/lib/env.js`. Only `NEXT_PUBLIC_*` values are exposed to the
browser, and the batch form receives the API URL as a prop from the server component.

## States and accessibility

- A skip link targets `#main-content`.
- Primary and mobile navigation labels are localized; theme and language controls have accessible
  names.
- `loading.js`, `error.js`, and `not-found.js` provide localized page-level states with a retry or
  home action.
- Theme preference is stored locally in `localStorage` under `cropsy-theme`; it is never sent to the
  backend.

## Verification behavior

Unknown or incomplete tokens return the API's conservative `UNVERIFIED` result. No public facts are
shown for those tokens, and unverified claims are never presented as certified.

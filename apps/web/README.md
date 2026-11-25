# CROPSY Web

Next.js 14 JavaScript workspace using the App Router and Tailwind CSS.

## Endpoints

- `GET /health`

## Commands

From the repository root:

```bash
npm run dev:web
npm run start:web
npm run build:web
```

The API base URL is validated from `NEXT_PUBLIC_API_URL` in `lib/env.js`. The local validator keeps
browser-safe code free of Node-only configuration modules. No product pages or business features
are implemented yet.

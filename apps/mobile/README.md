# CROPSY Mobile

React Native Expo JavaScript workspace using NativeWind for styling.

## Commands

From the repository root:

```bash
npm run dev:mobile
npm run build:mobile
```

The Expo entry point is `index.js`. The API base URL is validated from
`EXPO_PUBLIC_API_URL` in `src/config/env.js`, and `src/lib/health.js` contains the
API health probe used by the foundation screen.

A simulator or device is required to start the full app. Repository verification checks
the Expo configuration and JavaScript transform instead. No business screens are implemented yet.

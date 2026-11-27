# CROPSY Mobile

React Native (Expo SDK 51) app for Android and iOS using NativeWind, React Navigation, and the shared
`@cropsy/api-contracts` package.

## Commands

From the repository root:

```bash
npm run dev:mobile          # Expo dev server
npm run build:mobile        # JavaScript syntax check
npm run check:i18n          # EN/BN dictionary parity

# Stronger bundle checks (from this directory)
npx expo export --platform android --output-dir /tmp/cropsy-android
npx expo export --platform ios --output-dir /tmp/cropsy-ios
```

Use `npm run android` / `npm run ios` from `apps/mobile` when an emulator or paired device is available.
A simulator or device is required for a true runtime smoke test; `build:mobile` and `expo export` only
validate syntax and bundling.

## Configuration

Copy the root `.env.example` to `.env`. Mobile reads only `EXPO_PUBLIC_*` values:

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | Business API base URL |
| `EXPO_PUBLIC_SOCKET_URL` | derived from API URL | Socket.IO origin for realtime notifications |
| `EXPO_PUBLIC_REALTIME_ENABLED` | `true` | Enables the notification socket |
| `EXPO_PUBLIC_PUSH_ENABLED` | `true` | Enables push permission/token registration |
| `EXPO_PUBLIC_DEFAULT_LANGUAGE` | `en` | Initial language (`en` or `bn`) |
| `EXPO_PUBLIC_CACHE_TTL_MS` | `600000` | Offline read-cache lifetime |

Use a LAN-reachable API host on a physical device (for example `http://192.168.1.10:4000/api/v1`).
Use `http://localhost:4000/api/v1` only on an Android emulator with port forwarding.

## Auth and API

- Mobile uses bearer tokens from `/api/v1/iam/auth/*` with `client: 'mobile'`. It does not use web
  cookies.
- Access/refresh tokens are stored in Expo SecureStore, with AsyncStorage fallback.
- `src/lib/api/client.js` refreshes once on a 401 and clears the session on refresh failure.
- All endpoints are centralized in `src/lib/api/endpoints.js`.

## Notifications

The backend owns notification eligibility, preferences, retries, and delivery logs. The app only:

- registers/removes device tokens through `/notifications/device-tokens`;
- renders records from `/notifications`;
- subscribes to authenticated Socket.IO `notification` events;
- updates read state through `/notifications/:id/read` and `/notifications/read-all`;
- shows preferences from `/users/me/preferences` and submits changes there.

Realtime events are emitted to `user:<userId>` and `organization:<organizationId>` rooms. Push
credentials (SMTP, SMS, Expo/FCM) are API-only and must never be added to `EXPO_PUBLIC_*` values.

## Permissions and uploads

`app.json` declares camera, photo library, document picker, and notification plugins. On Android it
requests `CAMERA`, storage read/write, `POST_NOTIFICATIONS`, `VIBRATE`, and boot-receiver permissions.
On iOS it declares camera/photo usage strings and remote-notification background mode.

Images are compressed by the native picker (JPEG quality 0.7) and sent as base64 where the API DTO
accepts image fields. Documents are limited to 10 MB locally before upload. For production builds,
large file uploads should move to backend-issued signed upload URLs rather than embedding large
base64 bodies.

## Structure

- `src/navigation/AppNavigator.jsx` — auth gate, onboarding gate, tab and stack navigators
- `src/screens/` — auth, onboarding, dashboard, farms, crops, marketplace, listings, cart, orders,
  delivery, assistant, notifications, profile, settings
- `src/state/AppContext.jsx` — session, profile, language, notifications, push, realtime wiring
- `src/lib/api/client.js`, `src/lib/api/endpoints.js` — transport and route map
- `src/lib/hooks/useResource.js` — cached read with offline fallback
- `src/lib/media/` — image and document pickers
- `src/lib/notifications/` — Socket.IO and Expo push helpers
- `src/lib/i18n/index.js` — English and Bangla dictionaries
- `src/lib/ui/components.jsx` — shared NativeWind UI kit

## Known limitations

- `client: 'mobile'` write payloads are validated by the backend; cached data is read-only fallback.
- Push delivery needs valid Expo/FCM provider credentials configured on the API and a compatible
  native build. Expo Go cannot fully validate remote push or all native plugins.
- Device testing is not included in repository CI; emulator/device smoke tests must be run manually.

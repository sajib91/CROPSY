# Authentication API

All auth routes live under `/api/v1/iam/auth`. Requests and responses use the
standard envelope (`{ "success": true, "data": ..., "meta": ... }`); errors use
`{ "success": false, "error": "<code>", "meta": { message, details, requestId } }`.
Clients may send `x-request-id` to correlate logs.

The same endpoints serve web and mobile. `client: "web"` additionally sets
HttpOnly cookies; `client: "mobile"` returns tokens in the JSON body only. The
`client` field is always required on login/registration/refresh.

## Public endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/register/email` | Email/password registration with email OTP |
| `POST` | `/register/phone` | Phone/password registration with SMS OTP |
| `POST` | `/otp/request` | Request an OTP for verification, reset, login, or recovery |
| `POST` | `/otp/verify` | Submit an OTP and receive a purpose token or verification result |
| `POST` | `/login` | Password login; issues access + refresh tokens and a server session |
| `POST` | `/login/otp` | Exchange a verified `LOGIN` purpose token for tokens |
| `POST` | `/refresh` | Rotate a refresh token and issue a new access token |
| `POST` | `/forgot-password` | Send a `PASSWORD_RESET` OTP (generic response when the account is absent) |
| `POST` | `/reset-password` | Consume a reset token and set a new password |
| `POST` | `/reactivate/request` | Send an `ACCOUNT_RECOVERY` OTP for a deactivated/locked account |
| `POST` | `/reactivate` | Consume a recovery token and optionally set a new password |
| `POST` | `/logout` | Revoke the current session and refresh token; works with stale access tokens |

### Registration

```json
{
  "email": "farmer@example.com",
  "password": "StrongPass123!",
  "profile": { "firstName": "Amina", "lastName": "Begum", "preferredLanguage": "BN" },
  "requestedRoleCodes": ["FARMER"],
  "client": "mobile",
  "deviceName": "Pixel 8"
}
```

Use `phone` instead of `email` for `/register/phone`; phone numbers must be valid
Bangladesh mobile numbers. Password policy is configurable
(`AUTH_PASSWORD_MIN_LENGTH`, default 12). `requestedRoleCodes` are validated
server-side against `AUTH_SELF_REGISTERABLE_ROLE_CODES`; privileged roles such as
`CROPSY_SUPER_ADMIN` and `ORGANIZATION_ADMIN` cannot be self-assigned. A response
is `201` with the created user id, assigned role codes, and OTP delivery metadata.

### OTP request and verification

`POST /otp/request` body:

```json
{
  "channel": "email",
  "purpose": "PASSWORD_RESET",
  "destination": "farmer@example.com"
}
```

Supported purposes: `EMAIL_VERIFICATION`, `PHONE_VERIFICATION`,
`PASSWORD_RESET`, `LOGIN`, `ACCOUNT_RECOVERY`. Email verification requires the
`email` channel; phone verification requires the `phone` channel. Re-requests
are bounded by `AUTH_OTP_RESEND_COOLDOWN_SECONDS`.

`POST /otp/verify` adds `code`. Codes are six digits by default and are never
stored in plaintext: the server stores a salted HMAC and compares in constant
time. Each OTP has a TTL (`AUTH_OTP_TTL_SECONDS`), an attempt cap
(`AUTH_OTP_MAX_ATTEMPTS`), and single-use state. Verification of verification /
reset / login / recovery purposes returns a short-lived purpose token
(`resetToken`, `loginToken`, or `recoveryToken`).

In local/test environments `AUTH_OTP_PROVIDER_MODE=preview` returns
`previewCode` so clients can complete a flow. Production requires
`AUTH_OTP_PROVIDER_MODE=http` with real `AUTH_SMS_PROVIDER_URL` and
`AUTH_EMAIL_PROVIDER_URL` adapters; preview codes are never returned in
production and no OTP is ever accepted by comparing against a client value.

### Login, tokens, and refresh

```json
{
  "identifier": "farmer@example.com",
  "password": "StrongPass123!",
  "client": "mobile"
}
```

Successful login returns:

```json
{
  "accessToken": "<HMAC-signed JWT>",
  "refreshToken": "<opaque token>",
  "csrfToken": "<opaque token>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "sessionId": "<uuid>"
}
```

- Send `Authorization: Bearer <accessToken>` on every protected request.
- For `client: "web"`, the API also sets `cropsy_access` and `cropsy_refresh`
  HttpOnly cookies (`SameSite=Lax`, `Secure` on HTTPS/production) and clients
  may omit tokens from JSON. Cookie-authenticated mutations require matching
  `x-csrf-token`.
- Access tokens are short-lived (`AUTH_ACCESS_TOKEN_TTL_SECONDS`) and carry the
  session id, session hash, CSRF value, and roles version. They are verified
  against a live server-side session on every request.
- Refresh tokens are opaque; only their SHA-256 hashes are persisted. Each
  refresh rotates the token and revokes the predecessor. Reusing a rotated
  token revokes the entire session and returns `401`
  `Refresh token reuse detected. Session revoked.`
- Failed logins increment a counter and lock the account after
  `AUTH_MAX_FAILED_LOGINS` attempts for `AUTH_LOCKOUT_MINUTES`. Missing accounts
  run the same password-hash work to avoid timing-based account enumeration.

## Authenticated endpoints

| Method | Path | Permission / rule |
| --- | --- | --- |
| `GET` | `/me` | Current user, roles, organizations, permissions, session |
| `GET` | `/sessions` | Own sessions/devices |
| `GET` | `/devices` | Alias of `/sessions` for mobile device lists |
| `DELETE` | `/sessions/:sessionId` | Revoke one own session (or any, for super admin) |
| `POST` | `/logout-all` | Revoke every session for the current user |
| `POST` | `/change-password` | Verify current password; optionally revoke other sessions |
| `POST` | `/deactivate` | Deactivate own account and revoke all sessions |
| `GET` | `/organizations` | Organizations the authenticated user belongs to |

`GET /me` is the recommended way for web and mobile clients to discover the
effective permission set and active `organizationId`. See
[`authorization.md`](./authorization.md) for tenant context and RBAC routes.

## Security controls

- Passwords use scrypt (`N=16384, r=8, p=1`, 64-byte output) with a unique salt;
  verification is constant-time and unknown hashes still perform work.
- OTPs, refresh tokens, session tokens, and purpose tokens are never stored in
  a reversible form. Purpose tokens are HMAC-signed and single-use.
- Per-IP rate limiting applies to registration, login, OTP request/verify,
  forgot-password, recovery, and refresh. Exceeded limits return `429
  rate_limited` with `retryAfterSeconds`.
- All routes outside the explicit public allowlist are default-deny: a valid
  session and access token are required before route handlers execute.
- Audit entries are appended for registration, OTP events, login success/failure,
  refresh rotation and reuse, password changes/resets, deactivation, recovery,
  logout, and authorization decisions.

Production startup rejects unsafe configuration: `AUTH_STORE=prisma`, a strong
`AUTH_JWT_SECRET`, and HTTP OTP providers are mandatory, and cookies must not be
explicitly insecure. See [`.env.example`](../../.env.example) for every setting.

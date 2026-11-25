# Security

CROPSY now has an implemented authentication and authorization layer in the IAM
module. This document summarizes the controls; the client contracts and policy
detail live in the API docs.

- Environment variables are validated at startup through `@cropsy/config` for the business API and
  `pydantic-settings` for the AI service. Web and mobile use local URL validators.
- `.env` is ignored by Git; [`.env.example`](../../.env.example) documents local defaults and production requirements.
- The business API registers Helmet and CORS plugins and rejects unsupported API versions centrally.

## Authentication

- Email and Bangladesh phone registration, email/SMS OTP verification, password login, OTP login,
  logout, access/refresh token rotation, device/session listing and revocation, change password,
  forgot/reset password, deactivation, and recovery are implemented. See
  [`../api/authentication.md`](../api/authentication.md).
- Passwords use scrypt with a unique salt and constant-time verification. OTPs, refresh tokens,
  session tokens, and purpose tokens are stored only as salted hashes or HMACs; plaintext OTP codes
  are never persisted.
- Access tokens are short-lived HMAC-signed JWTs checked against a live server-side session on every
  request. Refresh tokens are opaque, rotate on use, and a replay revokes the whole session.
- Login failures, OTP requests/verification, registration, recovery, and refresh are rate limited.
  OTPs have TTLs, attempt caps, resend cooldowns, and single-use state. Accounts lock after a
  configurable number of failed logins.
- Web clients receive HttpOnly `cropsy_access` and `cropsy_refresh` cookies with `SameSite=Lax` and
  `Secure` in production/HTTPS. Cookie-authenticated mutations require a matching `x-csrf-token`;
  mobile clients use bearer tokens returned in the JSON body.
- Production requires `AUTH_STORE=prisma`, a strong `AUTH_JWT_SECRET`, and HTTP OTP provider URLs.
  The preview provider exists only for local/test use; it is disabled by production config and
  never accepts a client-supplied code as proof of verification.

## Authorization

- Twelve canonical user categories (including organization-scoped member and admin roles),
  multiple roles per user, multiple organizations per user, and 46 granular permissions are
  supported. The matrix is documented in [`permission-matrix.md`](./permission-matrix.md) and
  exposed at `GET /api/v1/iam/auth/matrix`.
- Every non-public route is default-deny. Route handlers receive a verified context built from the
  database on each request; client-supplied role codes and organization ids are never trusted as
  proof of access.
- Platform permissions combine with active-organization role permissions. User and resource checks
  verify the target's tenant membership, so a user with `users.read` in one organization cannot
  read a user belonging only to another. Super admins bypass tenant scope but are audited.
- The policy can be replaced with `AUTHZ_POLICY_JSON` or changed through
  `PUT /roles/:roleCode/permissions`. The HTTP contract and isolation rules are in
  [`../api/authorization.md`](../api/authorization.md).
- Allow and deny decisions are appended to `audit_logs` and published on the in-process event bus.

## Automated coverage

`npm run test -w @cropsy/api` includes auth integration tests for password policy, OTP limits and
single-use behavior, refresh reuse revocation, password reset/recovery, cookie CSRF, and
default-deny. Authorization tests cover cross-organization denial, forged tenant headers, audit
events, super-admin access, and runtime permission reconfiguration. Organization and profile
suites cover registration, invitations, switching, tenant isolation, reusable profile APIs,
role-specific storage, verification restrictions, and audit events.

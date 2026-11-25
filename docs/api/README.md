# API

The business API uses the `/api/v1` prefix. Health endpoints currently available:

| Service | Endpoint |
| --- | --- |
| Business API | `GET /api/v1/health` |
| Business API | `GET /api/v1/health/ready` |
| Web | `GET /health` |
| AI service | `GET /api/v1/health` |
| AI service | `GET /api/v1/health/ready` |

The business API also exposes versioned architecture introspection:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/` | API index and module directory |
| `GET /api/v1/version` | Active and supported API versions |
| `GET /api/v1/modules` | Registered modules and declared dependencies |
| `GET /api/v1/modules/:moduleId` | One registered module definition |
| `GET /api/v1/observability` | Uptime, request id, and bounded recent events |
| `GET /api/v1/<module-path>/info` | Validated module DTO from its application service |

Authentication and authorization are implemented in the IAM module:

| Topic | Documentation |
| --- | --- |
| Registration, OTP, login, tokens, sessions, password/recovery flows | [`authentication.md`](./authentication.md) |
| Roles, tenants, permission checks, configurable policy, audit | [`authorization.md`](./authorization.md) |

Auth endpoints are under `/api/v1/iam/auth`. All routes outside the explicit
public allowlist require a valid access token; cookie clients must also send a
matching `x-csrf-token` for mutations.

All 20 module paths and their dependency direction are documented in
[`../architecture/modules.md`](../architecture/modules.md). Failures return
`{ "success": false, "error": "<code>", "meta": { ... } }` with a request id.

Service responses use the standard envelope where practical:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "cropsy-business-api",
    "timestamp": "2026-01-01T00:00:00.000Z",
    "uptimeSeconds": 0.123
  }
}
```

Shared health response contracts live in `packages/api-contracts`. The `/info`
endpoints expose validated architecture DTOs; domain business workflows and
product-specific commercial policies remain outside this scaffold.

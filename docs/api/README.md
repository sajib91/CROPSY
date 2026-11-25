# API

Health endpoints currently available:

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

Shared health response contracts live in `packages/api-contracts`. Business workflows and
product-specific policies are not defined yet; the `/info` endpoints expose architecture DTOs only.

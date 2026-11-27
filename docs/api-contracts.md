# CROPSY API contracts

`packages/api-contracts/openapi.json` is the canonical OpenAPI 3.1 contract for the CROPSY HTTP API. It is generated from the Fastify route registry and the Zod DTOs that the backend actually enforces, then checked in so clients and CI can validate against a stable artifact.

## What the contract documents

- Every `/api/v1` operation and HTTP method, excluding framework-generated `HEAD` and `OPTIONS` routes.
- Request bodies converted from enforced Zod DTOs, plus standard success and error envelopes.
- Bearer and cookie security schemes, route authentication mode, required permissions, organization scope, and CSRF expectations.
- Standard error responses for validation, authentication, authorization, missing resources, conflicts, rate limits, and server failures.
- Offset pagination metadata, filtering parameters, sorting parameters, and API versioning (`/api/v1` plus optional `X-API-Version`).
- Web and mobile transport rules: mobile uses bearer tokens with `client: 'mobile'`; web uses cookie sessions with CSRF on mutations.

## Generated artifacts

- `packages/api-contracts/openapi.json`: canonical OpenAPI 3.1 document.
- `packages/api-contracts/contract-baseline.json`: accepted breaking-change baseline.
- `packages/api-contracts/generated/operations.json`: compact operation inventory used by clients.
- `packages/api-contracts/generated/client.js`: runtime path resolver; unknown paths or methods throw.
- `packages/api-contracts/generated/client.d.ts`: generated operation types.

Never hand-edit generated artifacts.

## Workflow

```bash
# Regenerate after route or DTO changes.
npm run contracts:generate

# Accept a reviewed intentional breaking change.
npm run contracts:baseline

# CI/build gates.
npm run contracts:check    # spec and generated artifacts are current
npm run contracts:breaking # no unreviewed breaking change vs baseline
npm run contracts:clients  # web/mobile paths resolve to published operations
npm run test:contracts     # automated contract tests
```

`npm run build` and `npm run verify` run the contract gates. The breaking check compares authentication mode, permissions, path and query parameters, request bodies, success statuses, supported versions, and servers.

## Client rules

Web and mobile resolve paths through `@cropsy/api-contracts`. Request helpers validate the method and path against the generated inventory before sending traffic, so a renamed or removed backend route fails fast. Backend-owned rules—authorization, notification policy, checkout totals, and domain validation—remain in the API; clients only address capabilities and validate transport envelopes.

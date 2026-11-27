# Performance and scalability audit

Date: 2026-11-27

Status: measured locally with a reproducible API-layer load harness. All changes remain uncommitted; no commit,
push, or pull request was created.

## Scope and method

This audit reviewed the Fastify business API, Prisma adapters, Redis/BullMQ usage, marketplace and geospatial paths,
image delivery, the Python AI/RAG service, and mobile/web network behavior. It covers all twelve requested areas:
API response time, database queries, database connections, Redis caching, background jobs, marketplace search,
geospatial queries, image delivery, AI inference, RAG retrieval, mobile network performance, and concurrent users.

Load measurements used `scripts/load-test.mjs` (`npm run test:load`) with Node built-ins only. The harness starts a
real Fastify listener on `127.0.0.1:0`, issues real HTTP requests, uses deterministic fixtures, and reports warmup
separately from measured samples. It ran six scenarios: authentication login, marketplace search, product listing,
cart add plus checkout, inventory reservation, and an AI ask forwarded through a fake in-process gateway.

Configuration used for both baseline and final runs:

- `NODE_ENV=test`, `LOG_LEVEL=silent`
- All module stores `memory`; notification queue `memory`; realtime disabled
- Test rate limits raised to 1000 attempts per 60 seconds to avoid harness 429s
- `AUTH_OTP_PREVIEW_CODE_IN_RESPONSE=true`; fake AI gateway; loopback HTTP
- Concurrency 8, duration 5000 ms per scenario, warmup 1000 ms, `seedCount=200`

Raw data:

- Pre-optimization baseline: `docs/performance/load-baseline.json`
- Post-optimization final: `docs/performance/load-results.json`
- Additional auth-only repeats: `docs/performance/load-auth-repeat-1.json` and
  `docs/performance/load-auth-repeat-2.json`

No performance numbers are reported for paths the harness did not exercise. Database, Redis, real AI inference,
external providers, image delivery, and real mobile devices were reviewed statically only.

## Verification snapshot

| Check | Result |
| --- | --- |
| `CROPSY_RUN_DB_TESTS=1 npm run verify` | Exit 0. Boundaries 21 modules / 881 imports; lint, format, i18n, builds; API 118/118, AI 86 passed, DB 47/47; 11 migrations, drift clean, seed twice; API/Web/AI health checks passed. |
| `npm run test -w @cropsy/api` | 118 tests, 118 pass, 0 fail. |
| `npm run test:ai` | 86 passed. |
| `npm run db:test` | 47 tests, 47 pass, 0 fail. |
| Coverage refresh | 78.87% lines, 66.55% branches, 70.55% functions from Node built-in coverage. |
| Load runs | All six scenarios returned only expected status codes and zero errors in both baseline and final runs. |

`SSD.md` section 15.1 defines design targets of standard API p95 below 500 ms and listing search below 1 second
under an agreed normal-load profile. The harness below is **not** that production profile, so the measured values
are evidence for this local configuration only, not a production capacity guarantee.

## Hardware and software environment

| Item | Value |
| --- | --- |
| Platform | Darwin 25.3.0, arm64 |
| CPU | Apple M4, 10 logical CPUs |
| Memory | 17179869184 bytes total; baseline free ≈ 754 MB; final free ≈ 745 MB |
| Node | v25.9.0 |
| npm | 11.13.0 |
| Python | 3.14.0 (pytest suites) |
| Docker | 29.2.1; daemon running, no application containers during load |
| API process model | Single Fastify process, in-process event bus, in-memory stores, in-memory notification queue |
| External dependencies | No Redis server/client tools, no external AI provider, no CDN or object storage exercised |
| Load tooling | Custom Node harness; `autocannon`, `k6`, `hey`, and `wrk` were unavailable |

## Measured baseline versus final

Latencies are milliseconds. RPS is requests per second. Deltas are computed from the raw JSON. Percentiles use
linear interpolation over sorted measured samples; warmup samples are excluded.

| Scenario | Requests base → final | RPS base → final | p50 base → final | p95 base → final | p99 base → final | Status histogram | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth login | 792 → 690 | 157.1 → 136.5 | 50.59 → 58.14 | 51.89 → 64.71 | 57.42 → 69.06 | `200` only | 0 → 0 |
| Marketplace search | 2525 → 3022 | 503.7 → 603.5 | 15.52 → 12.93 | 16.81 → 14.49 | 23.29 → 19.69 | `200` only | 0 → 0 |
| Product listing | 4670 → 4727 | 932.8 → 944.5 | 8.20 → 8.14 | 10.62 → 10.81 | 18.30 → 12.02 | `200` only | 0 → 0 |
| Orders (cart + checkout) | 10636 → 11788 | 2123.3 → 2355.5 | 3.52 → 3.22 | 5.78 → 5.20 | 7.69 → 6.75 | `201` only | 0 → 0 |
| Inventory reservation | 10588 → 11791 | 2116.9 → 2354.7 | 3.58 → 3.19 | 6.08 → 5.41 | 7.66 → 7.51 | `201` only | 0 → 0 |
| AI ask (fake gateway) | 32858 → 32712 | 6570.7 → 6541.7 | 1.05 → 1.04 | 1.49 → 1.62 | 4.17 → 4.23 | `200` only | 0 → 0 |

Orders contains two requests per operation. The per-operation final results were cart-add p50/p95/p99
3.17/5.09/6.55 ms and checkout 3.28/5.25/6.82 ms, versus baseline cart-add 3.36/5.58/7.50 ms and checkout
3.74/6.00/8.03 ms.

Interpretation of the matched run:

- Marketplace search improved by 19.8% RPS, with p50 -16.6%, p95 -13.8%, and p99 -15.5%.
- Orders improved by 10.9% RPS, with p95 -10.1% and p99 -12.1%.
- Inventory improved by 11.2% RPS, with p95 -11.0%; p99 changed only -2.0%.
- Product listing changed by +1.3% RPS; p50 and p95 were essentially unchanged and p99 improved from 18.30 ms
  to 12.02 ms. The tail improvement is measured, but a single run cannot isolate it from scheduling variance.
- AI changed by -0.4% RPS with small p95/p99 increases; no AI-path optimization was made in this pass.
- Auth showed higher latency and lower RPS in the matched run, but no auth optimization was intended and the result
  is not reproducible. Two additional auth-only samples were taken:

| Auth sample | Requests | RPS | p50 | p95 | p99 | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline full run | 792 | 157.1 | 50.59 | 51.89 | 57.42 | 0 |
| Final full run | 690 | 136.5 | 58.14 | 64.71 | 69.06 | 0 |
| Auth repeat 1 | 758 | 150.3 | 50.45 | 65.86 | 93.42 | 0 |
| Auth repeat 2 | 775 | 153.5 | 51.35 | 54.17 | 70.92 | 0 |

Auth p50 stayed near 50.51 ms in the repeats while p95 ranged from 54.17 ms to 65.86 ms. The single full-run
auth delta is therefore treated as run-to-run variance, not a verified regression or improvement.

All measured p95 values are below the SSD design targets for this harness, but the harness excludes the database,
Redis, external AI providers, image delivery, and wide-area network behavior.

## Optimizations applied and why

| Change | Location | Reason | Measured outcome |
| --- | --- | --- | --- |
| One lazy process-wide `PrismaClient`, disconnected on close | `apps/api/src/shared/database/prisma.js`, `apps/api/src/app.js`, module `index.js` factories | Twelve module-local clients could open up to roughly 12 × `connection_limit` connections per process. One client preserves the intended pool and avoids any DB connection in memory-store runs. | Structural only; load used memory stores, so no DB connection count was measured. All DB tests and verify passed. |
| Reuse listings' product/category/location data for related DTO hydration | `apps/api/src/modules/marketplace/application/marketplace.service.js` | `listListings` loaded products, categories, and locations, then `relatedForMany` loaded them again. | Marketplace RPS +19.8%, p95 -13.8%, p99 -15.5% in the matched run. |
| Lookup maps for product DTO serialization | `apps/api/src/modules/catalog/application/catalog.dto.js`, `catalog.service.js` | `toProductDto` used repeated `.find()` across categories, units, and attribute definitions, O(P × C + A × D). | Product p99 18.30 → 12.02 ms; p50/p95 essentially unchanged. |
| Indexed order checkout reference lookup | `apps/api/src/modules/orders/infrastructure/orders.store.js` | Duplicate detection scanned all purchase groups linearly per checkout. | Orders RPS +10.9%, checkout p95 6.00 → 5.25 ms. |
| Indexed warehouse reservation reference lookup | `apps/api/src/modules/warehouse/infrastructure/warehouse.store.js` | Reservation reference checks scanned all reservations linearly. | Inventory RPS +11.2%, p95 -11.0%. |
| `anyPermissions` short-circuit | `apps/api/src/modules/iam/presentation/http-authorization.js` | Any one grant is sufficient; extra checks caused unnecessary lookups and audit writes. | Not isolated in load; covered by a new 118th API test asserting one grant decision. |
| Removed invalid `limit=100` from web seller catalog query | `apps/web/components/marketplace/seller-listings.jsx` | The strict catalog product schema has no `limit`, so the request was a guaranteed 400 and wasted round trip. | Static fix; not re-measured in browser/device tests. |
| Fresh mobile cache short-circuit and stale-response generation guard | `apps/mobile/src/lib/hooks/useResource.js` | Fresh cache still triggered a network load, and a slow response for old filters could overwrite newer results. | Static fix; device smoke tests were unavailable. |

No optimization weakened a test, moved business rules into a client, or changed backend-owned totals/authorization
semantics.

## Audit findings by required area

| Area | Finding | Status / evidence |
| --- | --- | --- |
| 1. API response time | Manual Zod validation, no Fastify response schema, default `info` logging with one structured completion log per request, and per-permission audit writes add fixed cost. Auth context performs session, user, last-seen write, role, and membership work before handlers. | Measured under `LOG_LEVEL=silent`: final p95 ranges 3.20 ms (orders) to 64.71 ms (auth full run; repeats 54.17–65.86 ms). All below 500 ms in this harness. `anyPermissions` short-circuit and regression test applied. |
| 2. Database queries | Many Prisma list helpers use unbounded `findMany`; services filter/sort/paginate in JS. Marketplace, farms, favorites, reports, and messages have N+1/full-scan patterns. Catalog DTO lookup maps removed repeated scans. | Database tests pass; real query counts were not instrumented. SQL pushdown, `take`, and `EXPLAIN ANALYZE` remain unresolved. |
| 3. Database connections | Previously 12 module-local Prisma clients multiplied the configured pool by 12. | One shared lazy client and `onClose` disconnect applied. No connection count measured because load used memory stores. Readiness still checks only process status. |
| 4. Redis caching | No Redis cache layer exists. `ioredis` and `REDIS_URL` are used only for BullMQ. Config files disagree on Redis variable names. | Not measured; no Redis server in PATH. Caching remains unresolved. |
| 5. Background jobs | Production requires BullMQ; dev/test uses an in-process queue. BullMQ uses `attempts: 1` with application-level retries. A worker starts in every API process; the in-memory queue clears pending jobs on close; notification repository is process-local. | Not measured by load. Queue depth, latency, failure counts, and dedicated-worker isolation remain unresolved. |
| 6. Marketplace search | Pre-optimization path loaded all listings/products/categories/locations, filtered and sorted in JS, then reloaded related data for the page. | Optimized and measured: p95 16.81 → 14.49 ms, p99 23.29 → 19.69 ms, RPS 503.7 → 603.5. Deep pagination and seller/grade N+1 remain. |
| 7. Geospatial queries | PostGIS GiST indexes exist for geometry columns, but marketplace and farm `near` queries cast to `geography` while indexes are on `geometry`; SQL lacks `LIMIT` and some filters happen after full fetches. Logistics provider coordinates are plain decimals with no spatial index. | Marketplace harness uses a memory store, so PostGIS was not measured. Index/query-shape risks remain unresolved. |
| 8. Image delivery | No bucket/CDN, upload, resize, thumbnail, or cache-header implementation exists. Listing images are raw URLs; web uses plain `<img>`, mobile renders no listing images. Mobile base64 can reach ~6 MB while Fastify's default body limit is 1 MB. | Not measured. Real image delivery and payload compatibility remain unresolved. |
| 9. AI inference | The AI scenario used a fake gateway, so the measured 1.04/1.62 ms p50/p95 is API orchestration only. Real service stages are sequential and include sync Qdrant/OpenSearch clients, per-call `httpx.AsyncClient` creation, and CPU-bound PDF/OCR/Pillow work. | No real inference benchmark was run. API timeout is 10 s; long workflows may truncate. |
| 10. RAG retrieval | Hybrid retrieval fans out over expanded variants; candidate dedup is approximately O(C²); in-memory vector/keyword search scans all entries; reranker sends all documents in one request and ignores configured batch size; graph traversal has N+1 lookups. | Not measured with real Qdrant/OpenSearch/Neo4j. Unresolved. |
| 11. Mobile network performance | Client has timeout/abort, single-flight 401 refresh, one retry, and stale-while-revalidate caching. Fresh cache previously still hit the network; stale responses could overwrite newer filters. Web had a guaranteed 400 catalog query. | Cache/generation and web query fixes applied. No retry/backoff for network/5xx, no ETag/coalescing/offline writes, no pagination/virtualization. Device smoke unavailable. |
| 12. Concurrent users | Harness ran 8 concurrent workers across six scenarios with zero errors and expected status codes only. One API process was used. | Multi-replica behavior untested. Process-local rate limiting, event bus, notifications, and queue state diverge across replicas. |

## Unresolved performance and scalability risks

1. **Database query shape is the largest remaining scaling risk.** Push marketplace/farm/logistics filters, sorting,
   radius, and pagination into SQL; add `take`/`skip`; verify `EXPLAIN ANALYZE` and add expression GiST indexes for
   `::geography` predicates. Also check OTP and audit sort/index behavior and the farm `findFarmById` N+1.
2. **No Redis cache layer.** After fixing query shapes, consider caching auth context, catalog lookups, and listing
   detail with explicit TTLs, invalidation, and hit-ratio/latency metrics. Reconcile `REDIS_URL` with
   `NOTIFICATION_REDIS_URL` and the ESM config.
3. **Background workers are coupled to API replicas.** Move BullMQ workers to an isolated deployment, configure
   concurrency, and expose queue depth, age, failed/retried jobs, and Redis health.
4. **Readiness is shallow.** `/health/ready` does not check PostgreSQL or Redis. Add dependency checks and pool
   utilization metrics so orchestration can stop routing to an unhealthy instance.
5. **Image delivery is absent and base64 conflicts with the body limit.** Add signed asset uploads, resizing, CDN
   delivery, cache headers, and responsive web images; align mobile payload size with API limits or replace base64
   with asset references.
6. **Real AI/RAG paths are unmeasured.** Replace blocking sync clients in async endpoints, reuse HTTP clients,
   offload CPU-bound ingest, cap/parallelize sequential stages where safe, and instrument provider latency and event
   loop delay before setting AI latency targets.
7. **Multi-replica correctness and limits.** Process-local rate limiters and in-memory notification state do not
   scale consistently. Use Redis-backed rate limiting and shared notification storage before horizontal scaling.
8. **Client payload and rendering growth.** Add pagination/cursors, `FlatList` virtualization, conditional requests,
   backoff with jitter, and bounded mobile cache serialization.

## Limitations

- Single developer machine, one API process, 8 simulated clients, and 5 seconds of measured traffic per scenario.
- One measured full run for all scenarios, plus two auth-only repeats; other scenarios were not repeated, so small
  deltas should not be treated as statistically robust.
- In-memory stores, in-memory queue, silent logs, raised rate limits, and a fake AI gateway do not represent
  production configuration.
- No PostgreSQL/PostGIS, Redis/BullMQ, Qdrant, OpenSearch, Neo4j, external payment/SMS/email, image provider, or CDN
  involvement in the load numbers.
- No wide-area network, packet loss, mobile radio, app startup, rendering, or device performance measurement.
  `adb` and `xcrun simctl` were unavailable.
- Seed cardinality was 200 for marketplace/products; deep pagination, large tenants, and production data skew were
  not tested.
- No CPU profile, event-loop lag metric, Prisma query count, `EXPLAIN ANALYZE`, `pg_stat_activity`, or queue metric
  was collected during the load runs.
- The harness's API p95 results are below the SSD design targets, but the SSD explicitly calls those targets subject
  to validation under an agreed normal-load profile. This audit does not claim that profile was reproduced.

## Reproduction

```bash
npm run test:load -- --scenario all --concurrency 8 --duration 5000 \
  --warmup 1000 --seedCount 200 --out docs/performance/load-results.json

CROPSY_RUN_DB_TESTS=1 npm run verify
```

Auth-only variance check:

```bash
npm run test:load -- --scenario auth --concurrency 8 --duration 5000 \
  --warmup 1000 --seedCount 200 --out docs/performance/load-auth-repeat-2.json
```

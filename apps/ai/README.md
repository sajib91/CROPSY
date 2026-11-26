# CROPSY AI Service

FastAPI microservice implementing twelve modular AI capabilities and a provenance-gated
agricultural knowledge base. It is internal-only: every route except health checks requires
HMAC service-to-service authentication. Provider credentials are read from server-side
environment variables and are never returned to clients.

## Capabilities

1. LLM provider management (`mock`, HTTP OpenAI-compatible)
2. Model configuration and selection
3. Versioned prompt management (English and Bengali)
4. Embedding generation (deterministic dev adapter, HTTP provider)
5. Document ingestion, Docling PDF extraction, OCR adapter, text/table/metadata extraction,
   classification, and chunking
6. Hybrid retrieval: Qdrant dense vectors + OpenSearch keyword search, metadata/source filters,
   deterministic Bengali/English query expansion, configurable weighted or RRF fusion,
   authority/jurisdiction boosts, near-duplicate suppression, and per-document caps
7. Reranking: local lexical baseline for development/tests and an HTTP BGE cross-encoder
   adapter (`BAAI/bge-reranker-v2-m3`) for production
8. Versioned agricultural knowledge base with source tracking, licensing, and citations
9. Evidence-first agent orchestration
10. Multimodal processing
11. Advisory AI recommendations and a conversational agricultural assistant with bounded
    history, follow-up resolution, fact/prediction separation, and safety policy checks
12. Execution tracing, retrieval logging, token/cost monitoring, feedback, and offline
    retrieval evaluation (Recall@K, Precision@K, MRR, nDCG@K)

Supported agricultural sources include research papers, government publications, crop
cultivation guidelines, fertilizer recommendations, pest and disease management documents,
manuals, weather guidance, soil resources, and market intelligence reports.

## Authentication

Clients call the business API; the business API calls this service. Internal requests must send:

- `x-cropsy-service-id`
- `x-cropsy-timestamp` (Unix seconds, within `CROPSY_AI_INTERNAL_SIGNATURE_TOLERANCE_SECONDS`)
- `x-cropsy-signature`: HMAC-SHA256 hex of
  `METHOD\nPATH\nTIMESTAMP\nSHA256(raw_body)` using `CROPSY_AI_INTERNAL_SERVICE_SECRET`
- `x-request-id`, `x-organization-id`, `x-user-id`

`/api/v1/health` and `/api/v1/health/ready` are unauthenticated. OpenAPI UI routes are disabled.

## Internal endpoints

All endpoints below are under `/api/v1/internal` and require the HMAC headers above.

| Endpoint | Purpose |
| --- | --- |
| `GET /capabilities` | List modules, source types, languages, and policies |
| `GET /models` | Model/provider metadata (no credentials) |
| `GET /prompts` | Prompt keys and versions |
| `POST /documents/ingest` | Ingest, extract, embed, classify, chunk, and index a document |
| `GET /documents` | List documents and version history |
| `GET /documents/{documentId}` | Read one document record |
| `GET /documents/{documentId}/citations` | Citation metadata for eligible versions |
| `POST /retrieve` | Hybrid retrieval with diagnostics and per-request filter/fusion overrides |
| `POST /ask` | Evidence-grounded advisory answer |
| `POST /assistant/chat` | Conversational answer with citations, claims, safety notes, and follow-ups |
| `POST /conversations` | Create a tenant/user-scoped conversation |
| `GET /conversations` | List conversations for the active tenant/user |
| `GET /conversations/{conversationId}` | Read one conversation and its message history |
| `POST /recommend` | Evidence-grounded agricultural recommendation |
| `POST /multimodal/process` | OCR/extract images, PDFs, and text payloads |
| `POST /feedback` | Record advisory feedback |
| `GET /traces/{traceId}` | Execution spans and usage for a trace |
| `GET /evaluation` | Retrieval, token, cost, latency, and feedback aggregates |
| `POST /evaluation/retrieval` | Offline retrieval metrics on the versioned evaluation dataset |

## Citation policy

A document becomes citation-eligible only when all of the following are supplied and explicit:

- status is `VERIFIED`
- license `verified` is `true`, with license code and URL
- source name, publisher, publication date, and URL
- ingested chunk text

Draft, unverified, unlicensed, or incomplete records return `citationEligible: false` and
produce **empty citation lists**. An answer with no eligible evidence returns
`status: "insufficient_evidence"`. The service never generates bibliographic references,
author names, agency claims, URLs, dosages, or study results that were not supplied in an
ingested, eligible source.

## Hybrid retrieval pipeline

Every retrieval runs the following stages, all visible in `POST /retrieve` diagnostics:

1. Query understanding: language/intent detection, bounded lexicon-based expansion, and
   follow-up anchoring to the previous user turn.
2. Query transformation: at most `CROPSY_AI_RETRIEVAL_MAX_QUERY_VARIANTS` auditable variants.
3. Parallel vector and keyword search against Qdrant and OpenSearch (in-memory adapters in
   development/tests), with eligibility, type, language, source, publisher, jurisdiction,
   and authority filters.
4. Fusion via configurable weighted scores or reciprocal rank fusion.
5. Reranking via the configured BGE HTTP endpoint (production) or the deterministic lexical
   baseline (development/tests).
6. Context selection: near-duplicate suppression, per-document caps, minimum score, and
   authority/jurisdiction boosts for safety-sensitive topics.

Every query is logged with a hashed query, language, intent, backend mix, hit counts,
deduplication count, selected count, and latency. Raw queries and credentials are never logged.

The assistant (`POST /assistant/chat`) adds citations validation, mandatory chemical/diagnosis
safety notes, and a strict `established_fact` versus `prediction` split. Predictions are always
`uncertain`. Pesticide, fertilizer, chemical, and diagnosis answers never supply an unverified
dosage or an unconfirmed diagnosis; they direct the user to registered products, current local
rules, and local agronomist verification.

## Evaluation and metrics

`POST /evaluation/retrieval` runs `evaluation/datasets/hybrid-retrieval-v1.json` through the
live retrieval path and reports macro-averaged Recall@K, Precision@K, MRR, and nDCG@K with
per-query details. Results explicitly set `accuracyClaimed: false` because the dataset is a
small offline fixture set, not a representative production sample. `GET /evaluation` reports
operational retrieval counts, insufficient-evidence rate, deduplication rate, and latency.

## Production requirements

With `CROPSY_AI_ENVIRONMENT=production` and `CROPSY_AI_ALLOW_MOCK_PROVIDER=false`, startup
fails unless all of the following are configured:

- `CROPSY_AI_VECTOR_BACKEND=qdrant` and `CROPSY_AI_QDRANT_URL`
- `CROPSY_AI_KEYWORD_BACKEND=opensearch` and `CROPSY_AI_OPENSEARCH_URL`
- `CROPSY_AI_RERANKER_PROVIDER=http` and `CROPSY_AI_RERANKER_BASE_URL`

Missing Qdrant, OpenSearch, Docling, OCR, or BGE integrations fail explicitly; they are never
silently replaced with fabricated content or citations.

## Optional integrations

Core tests run without external systems. Real integrations are lazy and fail explicitly when
the dependency is missing:

```bash
.venv/bin/pip install -r apps/ai/requirements.txt
# Optional, install only what your deployment needs:
.venv/bin/pip install docling qdrant-client opensearch-py pytesseract Pillow
```

Set `CROPSY_AI_VECTOR_BACKEND=qdrant` and `CROPSY_AI_KEYWORD_BACKEND=opensearch` to enable
real indexes, and `CROPSY_AI_RERANKER_PROVIDER=http` with `CROPSY_AI_RERANKER_BASE_URL` for BGE
reranking. The BGE adapter posts `{model, query, documents, return_documents}` to `/rerank`
and accepts either `results[].relevance_score` or `scores`. PDF processing requires Docling.
OCR requires rendered page images plus `pytesseract`/Pillow. Missing adapters return
`integration_unavailable`; they never fabricate text or citations.

## Commands

From the repository root after `npm run setup`:

```bash
npm run dev:ai
npm run start:ai
npm run test:ai
npm run build:ai
```

Environment variables are documented in `apps/ai/.env.example`.

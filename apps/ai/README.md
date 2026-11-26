# CROPSY AI Service

FastAPI microservice implementing twenty-two modular AI capabilities, including a LangGraph-based
Agentic RAG workflow, a tenant-scoped GraphRAG layer, Multimodal RAG, rule-based unified
orchestration, advisory agricultural image analysis, and a nine-suite evaluation framework over a
provenance-gated agricultural knowledge base. It is internal-only: every
route except health checks requires HMAC service-to-service authentication. Provider credentials
are read from server-side environment variables and are never returned to clients.

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
13. Agentic RAG: a LangGraph `StateGraph` supervisor selecting a query-understanding agent,
    agricultural-knowledge retrieval, market intelligence, crop advisory, document analysis,
    evidence verification, and response generation, with conditional routing, bounded read-only
    tools, retries/fallbacks, resumable human approval, tracing, and usage/cost accounting
14. GraphRAG: agricultural entities/relationships, deterministic or LLM extraction, entity
    resolution, validation, provenance-carrying graph construction, communities, bounded
    traversal, vector+graph context fusion, and tenant-scoped retrieval across `memory`, `none`,
    or Neo4j backends
15. Multimodal RAG: PDF/image/chart/table/text/research-material ingestion, image preprocessing,
    OCR, layout analysis, text and deterministic image-signature indexing, cross-modal retrieval,
    metadata preservation, evidence retrieval, and source attribution
16. Configurable, advisory-only vision observations for plant images, explicitly not a confirmed
    plant diagnosis
17. Unified RAG orchestration: deterministic intent/complexity routing, hybrid/graph/multimodal/
    agentic strategies, bounded fallbacks, multi-source fusion, deduplication, citation
    preservation, rule-based confidence, and execution monitoring
18. Separate text-retrieval, image-retrieval, and multimodal-QA evaluation datasets
19. Advisory agricultural image analysis with honest quality checks, replaceable model adapters,
    confidence only when reported, reference retrieval, safe next steps, feedback, and expert review
20. Nine-suite evaluation framework with versioned datasets, human feedback, regression checks,
    model comparison, prompt versions, agent monitoring, retrieval diagnostics, and failure dashboards

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
| `POST /agentic/run` | Run the supervised LangGraph workflow, optionally pausing for approval |
| `POST /agentic/approve` | Resume a pending run with a matching, tenant-scoped human approval |
| `POST /graph/extract` | Extract agricultural entity/relationship candidates with provenance |
| `POST /graph/build` | Build idempotent graph evidence; verified relationships require approval |
| `POST /graph/retrieve` | Tenant-scoped graph traversal with evidence class and candidate controls |
| `POST /graph/context` | Build combined vector/graph context with limitations and provenance |
| `GET /graph/capabilities` | Graph backend, entity/relationship vocabulary, and evidence policy |
| `POST /multimodal/assets` | Ingest/preprocess/index a PDF, image, chart, table, text, or research material |
| `POST /multimodal/retrieve` | Cross-modal retrieval with tenant scope and citation policy diagnostics |
| `POST /orchestration/run` | Run rule-routed unified retrieval, fusion, advisory answer, and confidence |
| `GET /orchestration/capabilities` | Router, multimodal pipeline, vision, evaluation, and policy metadata |
| `POST /orchestration/evaluation` | Evaluate text retrieval, image retrieval, or multimodal QA datasets |
| `POST /image-analysis/analyze` | Advisory image observation, quality report, references, and safe next steps |
| `GET /image-analysis/capabilities` | Image model/provider metadata, quality thresholds, and advisory policy |
| `POST /image-analysis/feedback` | Attach rated human feedback to a stored analysis |
| `POST /image-analysis/reviews` | Request expert review of a stored analysis |
| `POST /image-analysis/reviews/decide` | Record an expert review decision (`ai.feedback` on the public gateway) |
| `GET /image-analysis/reviews/{reviewId}` | Read a tenant-scoped expert review |
| `GET /evaluation/framework/capabilities` | Suites, datasets, prompt versions, and monitoring metadata |
| `POST /evaluation/framework/runs` | Execute versioned datasets through real service callbacks |
| `GET /evaluation/framework/runs/{runId}` | Read a completed run from the tenant-scoped store |
| `POST /evaluation/framework/feedback` | Attach human judgments to traces, cases, or runs |
| `GET /evaluation/framework/baselines` | List baselines derived from recorded runs |
| `POST /evaluation/framework/baselines` | Create a baseline from an existing recorded run |
| `POST /evaluation/framework/regression` | Compare a recorded run against a baseline |
| `POST /evaluation/framework/comparison` | Compare two or more recorded runs |
| `GET /evaluation/framework/diagnostics` | Retrieval diagnostics from recorded retrievals |
| `GET /evaluation/framework/dashboards/failures` | Failure dashboard built only from recorded events |
| `GET /evaluation/framework/monitoring` | Agent execution monitoring from real workflow results |
| `GET /evaluation/framework/prompts` | Registered prompt versions used to attribute runs |

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

## Agentic RAG and GraphRAG

`POST /agentic/run` starts a supervised LangGraph workflow. The supervisor chooses among the
seven agents from the query: query understanding, agricultural knowledge retrieval, market
intelligence, crop advisory, document analysis, evidence verification, and response generation.
Graph retrieval is optional per request. Every agent/tool span is traced, retries and fallbacks
are bounded, and usage and estimated cost are accumulated on the result. A run with
`requireApproval: true` returns `status: "awaiting_approval"` with an `approvalId`; only a
matching `traceId`, `approvalId`, and organization may resume it through
`POST /agentic/approve`.

Agent tools are an allowlist of read-only advisory operations. The policy denies payments, order
or listing mutations, ledger posting, deletes, and any autonomous financial or destructive
business action. Agentic and GraphRAG request bodies are strict: they reject `farmId`,
`farmerId`, `organizationId`, and similar identifiers. The only trusted tenant comes from the
signed internal headers; cross-organization graph scopes are denied.

GraphRAG models agricultural entities (crops, varieties, diseases, pests, soils, fertilizers,
nutrients, practices, weather conditions, regions, research, and expert recommendations) and
allowlisted predicates with source, source reference, evidence snippet, and evidence class.
Deterministic extraction is the default; `graph_extraction_provider=llm` requires an HTTP LLM.
LLM-extracted relationships remain `candidate_extraction` or `validated_extraction` until
validation and explicit human approval promote them to `verified_relationship`. Retrieval
supports communities, bounded multi-hop traversal, tenant scope, and vector+graph context fusion
that reports limitations as well as evidence. Graph writes are idempotent and never create
prices, weather, citations, dosages, regulations, or business transactions.

## Multimodal RAG

`POST /multimodal/assets` ingests PDFs, images, agricultural charts, tables, plain text, and
research materials. The pipeline decodes and validates file bytes, applies EXIF-aware image
preprocessing where Pillow is available, runs OCR through the lazy Tesseract adapter, records
document layout regions, embeds text through the configured text provider, and creates an
explicit deterministic **image signature** for visual similarity and deduplication. Image
signatures are not semantic embeddings and are not described as learned visual understanding.
Text and visual payloads share the configured vector/keyword indexes, are filtered by the trusted
organization from signed headers, and preserve source, license, version, processor, hash, page,
layout, and vision metadata. `POST /multimodal/retrieve` searches with text, an image, or both and
returns only citation-eligible evidence with explicit diagnostics.

The vision adapter is configured with `CROPSY_AI_VISION_PROVIDER=none|http`. `none` generates no
observation. HTTP responses are labeled advisory model observations, never diagnoses; plant-image
responses always carry the disclaimer that they are **not a confirmed plant diagnosis** and
require local agronomist or laboratory confirmation. Missing OCR, PDF, or vision integrations fail
explicitly and are never simulated.

## Unified orchestration

`POST /orchestration/run` starts with a deterministic `QueryRouter`. Intent classification and
complexity estimation use transparent rules: simple agricultural questions route to `hybrid`,
multi-hop relationships to `graph_hybrid`, image/document questions to `multimodal`, and
approval-required complex workflows to `agentic`. The LLM does not select the strategy. The
router returns matched rules, a rule-coverage confidence (not a calibrated probability), and
configured fallbacks.

Executed strategies produce ranked evidence that is fused by chunk identity, deduplicated, capped,
and converted into a citation-preserving context with source attribution. Hybrid and graph
retrieval can be combined; an explicitly supplied `assetIds` filter keeps multimodal retrieval
scoped to those assets. Failed or empty strategies fall back in configured order. Answer synthesis
uses only supplied evidence and strips unverified URLs/citation labels. When generation fails, the
response falls back to retrieved evidence rather than invented text.

Every result records executed strategies, attempted fallbacks, limitations, trace id, usage, and
`confidence.basis = "rule_based_retrieval_evidence"`. Confidence is derived from retrieval scores
and citation eligibility; it is not a probability and is not scientific validation. Plant-image
responses also carry the visual advisory disclaimer. Capabilities and monitoring data are exposed
through `GET /orchestration/capabilities`; no credentials are returned.

## Evaluation and metrics

`POST /evaluation/retrieval` runs `evaluation/datasets/hybrid-retrieval-v1.json` through the
live retrieval path and reports macro-averaged Recall@K, Precision@K, MRR, and nDCG@K with
per-query details. `POST /orchestration/evaluation` selects one of three separate datasets:
`text-retrieval-v1.json` (text retrieval), `image-retrieval-v1.json` (image retrieval), or
`multimodal-qa-v1.json` (multimodal QA). The multimodal QA metrics check citation attribution,
required terms, absence of forbidden claims, and advisory disclaimers. Results explicitly set
`accuracyClaimed: false` because these are small offline fixture sets, not representative
production samples or independent scientific validation. `GET /evaluation` reports operational
retrieval counts, insufficient-evidence rate, deduplication rate, and latency.

## Advisory image analysis

`POST /image-analysis/analyze` accepts an image plus advisory context, never a tenant or farmer
identifier. Preprocessing verifies magic bytes, hashes the bytes, and applies EXIF-aware
normalization only when Pillow is installed; absent image libraries are reported as unknown, never
simulated. Quality checks reject unsupported formats/oversized files, and any failed critical
check stops model inference. The configured model is selected through
`ImageAnalysisModelRegistry.register`; the default `none` provider returns an explicit
unavailable result with no candidate and no confidence. When an HTTP vision-language model
returns a numeric value in `0..1`, it is stored as uncalibrated `model_reported_uncalibrated`
confidence; otherwise `confidence` is `null` and `confidenceBasis` is `not_reported`.

Restricted prescription/definitive sentences are screened from model observations and reported as
`restrictedContentRemoved`. Explanations combine visible evidence with tenant-scoped,
citation-eligible reference matches from deterministic image signatures; signatures are not
semantic embeddings. Next steps come from a fixed safe allowlist (better images, field context,
verified local guidance, expert review, and laboratory confirmation where relevant). Every result
records model version, prompt version, inference metadata, and limitations, and sets
`advisory: true`, `diagnosisClaimed: false`, and `hazardousChemicalPrescription: false`.
Feedback and expert review records use `ai.feedback` on the public gateway and remain
tenant-scoped.

## Evaluation framework

`POST /evaluation/framework/runs` runs nine suites — `retrieval`, `answer_relevance`,
`factual_correctness`, `citation_correctness`, `groundedness`, `language_quality`,
`multimodal_retrieval`, `agent_reliability`, and `performance` — against versioned datasets with
real retrieval, answer, multimodal, and agent callbacks supplied by the composition root. Every
case result records observed values and limitations; aggregate metrics are calculated only from
that execution. Runs set `scoresManufactured: false` and `accuracyClaimed: false`. No endpoint
accepts scores or callback implementations from callers.

Baselines can only be created from an existing recorded run. Regression, comparison, diagnostics,
prompt-version, agent-monitoring, and failure-dashboard outputs are derived from stored runs,
recorded retrievals, human feedback, and real workflow executions. The framework never seeds,
estimates, interpolates, or manufactures a score, and its lexical checks are explicitly not
semantic judgments, scientific validation, or production accuracy claims.

## Production requirements

With `CROPSY_AI_ENVIRONMENT=production` and `CROPSY_AI_ALLOW_MOCK_PROVIDER=false`, startup
fails unless all of the following are configured:

- `CROPSY_AI_VECTOR_BACKEND=qdrant` and `CROPSY_AI_QDRANT_URL`
- `CROPSY_AI_KEYWORD_BACKEND=opensearch` and `CROPSY_AI_OPENSEARCH_URL`
- `CROPSY_AI_RERANKER_PROVIDER=http` and `CROPSY_AI_RERANKER_BASE_URL`
- `CROPSY_AI_GRAPH_BACKEND=neo4j`, `CROPSY_AI_NEO4J_URI`, `CROPSY_AI_NEO4J_USER`, and
  `CROPSY_AI_NEO4J_PASSWORD` when `CROPSY_AI_AGENTIC_RAG_ENABLED=true`
- `CROPSY_AI_VISION_BASE_URL` and `CROPSY_AI_VISION_MODEL` when
  `CROPSY_AI_VISION_PROVIDER=http`
- `CROPSY_AI_IMAGE_ANALYSIS_BASE_URL` and `CROPSY_AI_IMAGE_ANALYSIS_MODEL` when
  `CROPSY_AI_IMAGE_ANALYSIS_MODEL_PROVIDER=http`

`CROPSY_AI_GRAPH_EXTRACTION_PROVIDER=llm` additionally requires `CROPSY_AI_LLM_PROVIDER=http`.
Missing Qdrant, OpenSearch, Docling, OCR, BGE, or Neo4j integrations fail explicitly; they are
never silently replaced with fabricated content or citations.

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
OCR requires rendered page images plus `pytesseract`/Pillow. Image preprocessing uses Pillow when
installed and otherwise preserves original bytes. A configured HTTP vision model must be supplied
by deployment; the service never invents a vision provider. Missing adapters return
`integration_unavailable`; they never fabricate text or citations.

LangGraph and the Neo4j driver are installed from `requirements.txt`. Set
`CROPSY_AI_GRAPH_BACKEND=neo4j` with the `CROPSY_AI_NEO4J_*` credentials for production;
`memory` is an in-process development/test adapter and `none` explicitly disables graph
retrieval. Graph approval and build operations require `ai.feedback` at the business gateway;
run/retrieval/context operations require only `ai.read`. Multimodal ingestion/retrieval and all
unified orchestration/evaluation routes also require only `ai.read`; no permission codes were
added.

## Commands

From the repository root after `npm run setup`:

```bash
npm run dev:ai
npm run start:ai
npm run test:ai
npm run build:ai
```

Environment variables are documented in `apps/ai/.env.example`.

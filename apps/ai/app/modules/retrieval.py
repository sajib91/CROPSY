"""Production-oriented hybrid retrieval for verified agricultural evidence."""

import asyncio
import hashlib
import logging
import time
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.config import Settings, get_settings
from app.errors import ConfigurationError
from app.infrastructure.keyword_index import KeywordIndex, tokenize
from app.infrastructure.vector_store import VectorIndex
from app.models import Citation, EvidenceChunk, Language
from app.modules.embeddings import EmbeddingService
from app.modules.query_understanding import (
    QueryUnderstanding,
    QueryUnderstandingService,
)

logger = logging.getLogger("cropsy.ai.retrieval")

FusionMethod = Literal["weighted", "rrf"]

SAFETY_DOCUMENT_TYPES = {
    "fertilizer_recommendation",
    "pest_management",
    "disease_management",
    "government_publication",
}

AUTHORITY_TERMS = (
    "government",
    "ministry",
    "department",
    "university",
    "research",
    "extension",
    "authority",
    "publication",
)

SAFETY_TEXT_TERMS = (
    "safety",
    "protective",
    "ppe",
    "label",
    "regulation",
    "dosage",
    "apply",
    "নিরাপত্তা",
    "লেবেল",
    "বিধি",
    "মাত্রা",
)


class RetrievalOptions(BaseModel):
    """Per-request overrides; unset values come from validated service settings."""

    documentTypes: list[str] = Field(default_factory=list, max_length=20)
    languages: list[str] = Field(default_factory=list, max_length=3)
    sources: list[str] = Field(default_factory=list, max_length=20)
    publishers: list[str] = Field(default_factory=list, max_length=20)
    jurisdictions: list[str] = Field(default_factory=list, max_length=20)
    authorities: list[str] = Field(default_factory=list, max_length=20)
    region: str = Field(default="", max_length=200)
    fetchK: int | None = Field(default=None, ge=1, le=200)
    fusionMethod: FusionMethod | None = None
    vectorWeight: float | None = Field(default=None, ge=0.0, le=1.0)
    keywordWeight: float | None = Field(default=None, ge=0.0, le=1.0)
    rrfK: int | None = Field(default=None, ge=1, le=500)
    enableQueryExpansion: bool | None = None
    maxQueryVariants: int | None = Field(default=None, ge=1, le=8)
    deduplicationThreshold: float | None = Field(default=None, ge=0.5, le=1.0)
    maxChunksPerDocument: int | None = Field(default=None, ge=1, le=20)
    minScore: float | None = Field(default=None, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def weights_must_sum_to_one(self) -> "RetrievalOptions":
        if self.vectorWeight is not None and self.keywordWeight is not None:
            if abs(self.vectorWeight + self.keywordWeight - 1.0) > 1e-6:
                raise ValueError("vectorWeight and keywordWeight must sum to 1.0")
        return self


class RetrievalQuery(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    language: Language = "en"
    topK: int = Field(default=5, ge=1, le=20)
    documentTypes: list[str] = Field(default_factory=list, max_length=20)
    languages: list[str] = Field(default_factory=list, max_length=3)
    options: RetrievalOptions = Field(default_factory=RetrievalOptions)


@dataclass
class ScoredChunk:
    chunk_id: str
    score: float
    payload: dict[str, Any]


class RetrievalDiagnostics(BaseModel):
    queryUnderstanding: dict[str, Any] = Field(default_factory=dict)
    searchQueries: list[str] = Field(default_factory=list)
    filters: dict[str, Any] = Field(default_factory=dict)
    fetchK: int = 0
    fusionMethod: FusionMethod = "weighted"
    weights: dict[str, float] = Field(default_factory=dict)
    vectorHits: int = 0
    keywordHits: int = 0
    fusedCandidates: int = 0
    deduplicatedCandidates: int = 0
    deduplicationRemoved: int = 0
    selectedCandidates: int = 0
    rerankedCount: int = 0
    backends: dict[str, str] = Field(default_factory=dict)
    topScores: list[dict[str, Any]] = Field(default_factory=list)
    latencyMs: float = 0.0
    insufficientEvidence: bool = True


class HybridRetrievalResult(BaseModel):
    evidence: list[EvidenceChunk] = Field(default_factory=list)
    diagnostics: RetrievalDiagnostics = Field(default_factory=RetrievalDiagnostics)


class RetrievalEngine:
    """Hybrid vector + keyword retrieval over verified, indexed chunks."""

    def __init__(
        self,
        *,
        vector_index: VectorIndex,
        keyword_index: KeywordIndex,
        embeddings: EmbeddingService,
        settings: Settings | None = None,
        query_understanding: QueryUnderstandingService | None = None,
    ) -> None:
        self.vector_index = vector_index
        self.keyword_index = keyword_index
        self.embeddings = embeddings
        self.settings = settings or get_settings()
        self.query_understanding = (
            query_understanding or QueryUnderstandingService()
        )
        self._payloads: dict[str, dict[str, Any]] = {}

    def register_payloads(self, payloads: dict[str, dict[str, Any]]) -> None:
        self._payloads.update(payloads)

    async def retrieve(self, value: RetrievalQuery) -> list[EvidenceChunk]:
        result = await self.retrieve_detailed(value)
        return result.evidence

    async def retrieve_detailed(
        self,
        value: RetrievalQuery,
        *,
        trace_id: str = "",
    ) -> HybridRetrievalResult:
        started = time.perf_counter()
        options = value.options
        settings = self.settings

        understanding = self.query_understanding.understand(
            value.query,
            language=value.language,
            region=options.region,
            document_types=options.documentTypes or value.documentTypes,
            max_variants=(
                options.maxQueryVariants or settings.retrieval_max_query_variants
            ),
        )
        document_types = options.documentTypes or value.documentTypes
        languages = (
            options.languages
            or value.languages
            or understanding.queryLanguages
        )
        filters: dict[str, Any] = {"citationEligible": True}
        if document_types:
            filters["documentType"] = document_types
        if languages:
            filters["language"] = languages
        for key in ("sources", "publishers", "jurisdictions", "authorities"):
            values = getattr(options, key)
            if values:
                filters[key.rstrip("s") if key != "authorities" else "authority"] = values

        enable_expansion = (
            settings.retrieval_enable_query_expansion
            if options.enableQueryExpansion is None
            else options.enableQueryExpansion
        )
        max_variants = (
            options.maxQueryVariants or settings.retrieval_max_query_variants
        )
        search_queries = understanding.expandedQueries[:max_variants] if enable_expansion else []
        if not search_queries or search_queries[0] != understanding.resolvedQuery:
            search_queries.insert(0, understanding.resolvedQuery)
        search_queries = search_queries[:max_variants]

        fetch_k = options.fetchK or settings.retrieval_fetch_k
        fetch_k = max(fetch_k, value.topK)
        fusion_method = options.fusionMethod or settings.retrieval_fusion_method
        vector_weight = (
            settings.retrieval_vector_weight
            if options.vectorWeight is None
            else options.vectorWeight
        )
        keyword_weight = (
            settings.retrieval_keyword_weight
            if options.keywordWeight is None
            else options.keywordWeight
        )
        if options.vectorWeight is None and options.keywordWeight is not None:
            vector_weight = max(0.0, 1.0 - keyword_weight)
        if options.keywordWeight is None and options.vectorWeight is not None:
            keyword_weight = max(0.0, 1.0 - vector_weight)
        rrf_k = options.rrfK or settings.retrieval_rrf_k
        dedup_threshold = (
            options.deduplicationThreshold or settings.retrieval_deduplication_threshold
        )
        max_per_document = (
            options.maxChunksPerDocument or settings.retrieval_max_chunks_per_document
        )
        min_score = (
            settings.retrieval_min_score
            if options.minScore is None
            else options.minScore
        )

        vectors, _ = await self.embeddings.embed(search_queries)

        async def search(query: str, vector: list[float]) -> tuple[list[Any], list[Any]]:
            return await asyncio.gather(
                self.vector_index.query(vector, fetch_k, filters),
                self.keyword_index.search(query, fetch_k, filters),
            )

        pairs = await asyncio.gather(
            *(search(query, vector) for query, vector in zip(search_queries, vectors))
        )

        keyword_max = max(
            (float(score) for _, keyword_hits in pairs for _, score in keyword_hits),
            default=0.0,
        )
        query_count = max(1, len(search_queries))
        raw_scores: dict[str, float] = {}
        vector_hit_count = 0
        keyword_hit_count = 0

        for vector_hits, keyword_hits in pairs:
            vector_hit_count += len(vector_hits)
            keyword_hit_count += len(keyword_hits)
            for chunk_id, score, _payload in vector_hits:
                contribution = (
                    max(0.0, min(1.0, float(score)))
                    if fusion_method == "weighted"
                    else vector_weight / (rrf_k + 1)
                )
                raw_scores[chunk_id] = raw_scores.get(chunk_id, 0.0) + contribution
            for rank, (chunk_id, score) in enumerate(keyword_hits, start=1):
                normalized = float(score) / keyword_max if keyword_max > 0 else 0.0
                contribution = (
                    keyword_weight * normalized
                    if fusion_method == "weighted"
                    else keyword_weight / (rrf_k + rank)
                )
                raw_scores[chunk_id] = raw_scores.get(chunk_id, 0.0) + contribution

        if fusion_method == "rrf" and raw_scores:
            peak = max(raw_scores.values())
            if peak > 0:
                raw_scores = {
                    chunk_id: score / peak / query_count
                    for chunk_id, score in raw_scores.items()
                }
        elif raw_scores:
            raw_scores = {
                chunk_id: score / query_count for chunk_id, score in raw_scores.items()
            }

        query_tokens = set(tokenize(understanding.originalQuery))
        region = options.region.strip().lower()
        candidates: list[tuple[float, dict[str, Any]]] = []
        for chunk_id, fused in sorted(
            raw_scores.items(), key=lambda item: (-item[1], item[0])
        ):
            payload = self._payloads.get(chunk_id)
            if not payload or not payload.get("citation"):
                continue
            text = str(payload.get("text", ""))
            overlap = len(query_tokens & set(tokenize(text)))
            final_score = fused + min(0.1, overlap * 0.01)
            final_score += self._source_boost(
                payload,
                understanding=understanding,
                region=region,
            )
            final_score = min(1.0, final_score)
            if final_score < min_score:
                continue
            candidates.append((final_score, payload))

        deduplicated: list[tuple[float, dict[str, Any]]] = []
        signatures: list[set[str]] = []
        per_document: dict[str, int] = {}
        for score, payload in candidates:
            document_id = str(payload.get("documentId", ""))
            if per_document.get(document_id, 0) >= max_per_document:
                continue
            signature = set(tokenize(str(payload.get("text", ""))))
            if any(self._similarity(signature, other) >= dedup_threshold for other in signatures):
                continue
            signatures.append(signature)
            per_document[document_id] = per_document.get(document_id, 0) + 1
            deduplicated.append((score, payload))

        candidate_limit = min(fetch_k, max(value.topK * 4, 10))
        selected = deduplicated[:candidate_limit]
        evidence = [
            self._to_evidence(chunk_id, score, payload)
            for score, payload in selected
            if (chunk_id := str(payload.get("chunkId", "")))
        ]
        evidence = [item for item in evidence if item is not None]

        latency_ms = (time.perf_counter() - started) * 1000
        diagnostics = RetrievalDiagnostics(
            queryUnderstanding=understanding.model_dump(mode="json"),
            searchQueries=search_queries,
            filters=filters,
            fetchK=fetch_k,
            fusionMethod=fusion_method,  # type: ignore[arg-type]
            weights={"vector": round(vector_weight, 4), "keyword": round(keyword_weight, 4)},
            vectorHits=vector_hit_count,
            keywordHits=keyword_hit_count,
            fusedCandidates=len(candidates),
            deduplicatedCandidates=len(deduplicated),
            deduplicationRemoved=len(candidates) - len(deduplicated),
            selectedCandidates=len(selected),
            backends=self.backend_names(),
            topScores=[
                {
                    "chunkId": str(payload.get("chunkId", "")),
                    "documentId": str(payload.get("documentId", "")),
                    "score": round(score, 4),
                    "sourceName": str(payload.get("sourceName", "")),
                    "jurisdiction": str(payload.get("jurisdiction", "")),
                }
                for score, payload in selected[:10]
            ],
            latencyMs=round(latency_ms, 3),
            insufficientEvidence=not evidence,
        )
        logger.info(
            "hybrid retrieval completed",
            extra={
                "extra_fields": {
                    "traceId": trace_id,
                    "queryHash": hashlib.sha256(value.query.encode("utf-8")).hexdigest()[:16],
                    "language": understanding.language,
                    "intent": understanding.intent,
                    "fusion": fusion_method,
                    "backends": diagnostics.backends,
                    "vectorHits": vector_hit_count,
                    "keywordHits": keyword_hit_count,
                    "fused": len(candidates),
                    "dedupRemoved": diagnostics.deduplicationRemoved,
                    "selected": len(selected),
                    "latencyMs": round(latency_ms, 3),
                }
            },
        )
        return HybridRetrievalResult(evidence=evidence, diagnostics=diagnostics)

    @staticmethod
    def _similarity(left: set[str], right: set[str]) -> float:
        if not left or not right:
            return 0.0
        intersection = len(left & right)
        return intersection / len(left | right)

    def _source_boost(
        self,
        payload: dict[str, Any],
        *,
        understanding: QueryUnderstanding,
        region: str,
    ) -> float:
        boost = 0.0
        authority = " ".join(
            str(payload.get(key, "")) for key in ("authority", "publisher", "sourceName")
        ).lower()
        if any(term in authority for term in AUTHORITY_TERMS):
            boost += 0.04
        jurisdiction = str(payload.get("jurisdiction", "")).lower()
        if region and jurisdiction and region in jurisdiction:
            boost += 0.06
        elif jurisdiction and jurisdiction == self.settings.retrieval_default_jurisdiction.lower():
            boost += 0.02
        if understanding.safetyCategories:
            document_type = str(payload.get("documentType", ""))
            if document_type in SAFETY_DOCUMENT_TYPES:
                boost += 0.04
            text = str(payload.get("text", "")).lower()
            if any(term in text for term in SAFETY_TEXT_TERMS):
                boost += 0.03
        return min(0.2, boost)

    @staticmethod
    def _to_evidence(
        chunk_id: str,
        score: float,
        payload: dict[str, Any],
    ) -> EvidenceChunk | None:
        citation_data = dict(payload.get("citation") or {})
        if not citation_data:
            return None
        citation_data.pop("score", None)
        return EvidenceChunk(
            chunkId=chunk_id,
            documentId=str(payload["documentId"]),
            version=str(payload["version"]),
            text=str(payload.get("text", "")),
            section=str(payload.get("section", "")),
            page=payload.get("page"),
            language=payload.get("language", "en"),
            score=round(score, 4),
            citation=Citation(**citation_data, score=round(score, 4)),
        )

    def backend_names(self) -> dict[str, str]:
        return {
            "vector": getattr(self.vector_index, "backend_name", "unknown"),
            "keyword": getattr(self.keyword_index, "backend_name", "unknown"),
        }


def require_production_retrieval(engine: RetrievalEngine, settings: Settings) -> None:
    """Fail startup loudly rather than silently using local mock retrieval in production."""
    if settings.environment != "production" or settings.allow_mock_provider:
        return
    requirements: list[str] = []
    if settings.vector_backend != "qdrant" or not settings.qdrant_url:
        requirements.append("CROPSY_AI_VECTOR_BACKEND=qdrant and CROPSY_AI_QDRANT_URL")
    if settings.keyword_backend != "opensearch" or not settings.opensearch_url:
        requirements.append("CROPSY_AI_KEYWORD_BACKEND=opensearch and CROPSY_AI_OPENSEARCH_URL")
    if settings.reranker_provider != "http" or not settings.reranker_base_url:
        requirements.append("CROPSY_AI_RERANKER_PROVIDER=http and CROPSY_AI_RERANKER_BASE_URL")
    if requirements:
        raise ConfigurationError(
            "Production retrieval requires Qdrant, OpenSearch, and HTTP BGE reranking.",
            details={"requirements": requirements},
        )
    names = engine.backend_names()
    unsupported = [name for name, backend in names.items() if backend == "unknown"]
    if unsupported:
        raise ConfigurationError(
            "Configured retrieval backend does not expose a backend name.",
            details={"backends": unsupported},
        )

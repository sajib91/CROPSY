import logging
from typing import Any

from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.errors import NotFoundError
from app.infrastructure.keyword_index import KeywordIndex
from app.infrastructure.vector_store import VectorIndex, VectorPoint
from app.models import (
    Citation,
    DocumentChunk,
    DocumentRecord,
    EvidenceChunk,
    Language,
)
from app.modules.documents import DocumentProcessingInput, DocumentProcessingService
from app.modules.embeddings import EmbeddingService
from app.modules.evaluation import EvaluationMonitoringService
from app.modules.reranking import RerankingService
from app.modules.retrieval import (
    HybridRetrievalResult,
    RetrievalEngine,
    RetrievalOptions,
    RetrievalQuery,
)
from app.tracing import Tracer

logger = logging.getLogger("cropsy.ai.knowledge")


class IngestionResult(BaseModel):
    documentId: str
    version: str
    status: str
    chunkCount: int
    citationEligible: bool
    citationEligibilityReason: str
    processor: str
    vectorBackend: str
    keywordBackend: str
    advisory: bool = True


def eligibility_check(record: DocumentRecord) -> tuple[bool, str]:
    """Strict gate: only complete, supplied, verified provenance may be cited."""
    if record.status != "VERIFIED":
        return False, "document_status_not_verified"
    if not record.provenance.license.verified:
        return False, "license_not_verified"
    source = record.provenance.source
    license_data = record.provenance.license
    if not source.name.strip() or not source.publisher.strip():
        return False, "source_identity_incomplete"
    if not source.publishedAt.strip() or not source.url.strip():
        return False, "source_date_or_url_missing"
    if not license_data.code.strip() or not license_data.url.strip():
        return False, "license_terms_missing"
    return True, "verified_provenance_and_license"


def build_citation(
    record: DocumentRecord,
    chunk: DocumentChunk,
    score: float,
) -> Citation:
    source = record.provenance.source
    license_data = record.provenance.license
    return Citation(
        documentId=record.documentId,
        version=record.version,
        chunkId=chunk.chunkId,
        title=record.title,
        section=chunk.section,
        excerpt=chunk.text[:500],
        sourceName=source.name,
        sourceUrl=source.url,
        publisher=source.publisher,
        publishedAt=source.publishedAt,
        jurisdiction=source.jurisdiction,
        authority=source.authority,
        licenseCode=license_data.code,
        licenseUrl=license_data.url,
        page=chunk.page,
        language=chunk.language,
        score=max(0.0, min(1.0, score)),
    )


class KnowledgeBaseService:
    """Versioned agricultural knowledge with strict provenance-based citations."""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        processing: DocumentProcessingService | None = None,
        embeddings: EmbeddingService | None = None,
        retrieval: RetrievalEngine | None = None,
        reranking: RerankingService | None = None,
        vector_index: VectorIndex | None = None,
        keyword_index: KeywordIndex | None = None,
        monitoring: EvaluationMonitoringService | None = None,
        tracer: Tracer | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.processing = processing or DocumentProcessingService(self.settings)
        self.embeddings = embeddings or EmbeddingService(self.settings)
        self.reranking = reranking or RerankingService(self.settings)
        self.monitoring = monitoring
        self.tracer = tracer
        self.vector_index = vector_index
        self.keyword_index = keyword_index
        self.retrieval = retrieval or RetrievalEngine(
            vector_index=vector_index,  # type: ignore[arg-type]
            keyword_index=keyword_index,  # type: ignore[arg-type]
            embeddings=self.embeddings,
            settings=self.settings,
        )
        self._documents: dict[str, DocumentRecord] = {}
        self._versions: dict[tuple[str, str], DocumentRecord] = {}
        self._chunks: dict[str, DocumentChunk] = {}
        self._version_history: dict[str, list[str]] = {}

    async def ingest(self, value: DocumentProcessingInput) -> IngestionResult:
        record, chunks = await self.processing.process(value)
        eligible, reason = eligibility_check(record)
        for chunk in chunks:
            chunk.citationEligible = eligible
        vectors, usage = await self.embeddings.embed([chunk.text for chunk in chunks])

        payloads: dict[str, dict[str, Any]] = {}
        points: list[VectorPoint] = []
        for chunk, vector in zip(chunks, vectors):
            payload = {
                "chunkId": chunk.chunkId,
                "documentId": chunk.documentId,
                "version": chunk.version,
                "text": chunk.text,
                "section": chunk.section,
                "page": chunk.page,
                "language": chunk.language,
                "documentType": record.documentType,
                "citationEligible": chunk.citationEligible,
                "title": record.title,
                "source": record.provenance.source.name,
                "sourceName": record.provenance.source.name,
                "publisher": record.provenance.source.publisher,
                "jurisdiction": record.provenance.source.jurisdiction,
                "authority": record.provenance.source.authority,
                "sourceUrl": record.provenance.source.url,
                "citation": (
                    build_citation(record, chunk, 0.0).model_dump(mode="json")
                    if eligible
                    else None
                ),
            }
            payloads[chunk.chunkId] = payload
            points.append(VectorPoint(id=chunk.chunkId, vector=vector, payload=payload))

        previous = self._versions.get((record.documentId, record.version))
        if previous is not None:
            for chunk_id in set(previous.chunkIds):
                self._chunks.pop(chunk_id, None)
                self._payloads.pop(chunk_id, None)
            if hasattr(self.keyword_index, "delete_document"):
                await self.keyword_index.delete_document(record.documentId)  # type: ignore[attr-defined]
            if hasattr(self.vector_index, "delete_document"):
                await self.vector_index.delete_document(record.documentId)  # type: ignore[attr-defined]
        await self._index(points, payloads)

        self._documents[record.documentId] = record
        self._versions[(record.documentId, record.version)] = record
        self._chunks.update({chunk.chunkId: chunk for chunk in chunks})
        self._version_history.setdefault(record.documentId, [])
        if record.version not in self._version_history[record.documentId]:
            self._version_history[record.documentId].append(record.version)
        self.retrieval.register_payloads(payloads)
        logger.info(
            "agricultural document ingested",
            extra={
                "extra_fields": {
                    "documentId": record.documentId,
                    "version": record.version,
                    "chunkCount": len(chunks),
                    "citationEligible": eligible,
                    "embeddingProvider": usage.get("provider"),
                }
            },
        )
        return IngestionResult(
            documentId=record.documentId,
            version=record.version,
            status=record.status,
            chunkCount=len(chunks),
            citationEligible=eligible,
            citationEligibilityReason=reason,
            processor=record.processor,
            vectorBackend=self.retrieval.backend_names()["vector"],
            keywordBackend=self.retrieval.backend_names()["keyword"],
        )

    @property
    def _payloads(self) -> dict[str, dict[str, Any]]:
        return self.retrieval._payloads

    async def _index(
        self,
        points: list[VectorPoint],
        payloads: dict[str, dict[str, Any]],
    ) -> None:
        await self.vector_index.upsert(points)  # type: ignore[union-attr]
        for point in points:
            await self.keyword_index.upsert(  # type: ignore[union-attr]
                point.id,
                point.payload["text"],
                point.payload,
            )

    def get_document(self, document_id: str, version: str | None = None) -> DocumentRecord:
        record = (
            self._versions.get((document_id, version))
            if version
            else self._documents.get(document_id)
        )
        if record is None:
            raise NotFoundError(f"Document '{document_id}' was not found.")
        return record

    def list_documents(self) -> list[dict[str, Any]]:
        return [
            {
                "documentId": record.documentId,
                "title": record.title,
                "version": record.version,
                "documentType": record.documentType,
                "classifiedType": record.classifiedType,
                "classificationConfidence": record.classificationConfidence,
                "language": record.language,
                "status": record.status,
                "chunkCount": len(record.chunkIds),
                "citationEligible": eligibility_check(record)[0],
                "processors": record.processor,
                "versions": self._version_history.get(record.documentId, []),
            }
            for record in sorted(self._documents.values(), key=lambda item: item.documentId)
        ]

    def citations_for(self, document_id: str, version: str | None = None) -> list[Citation]:
        record = self.get_document(document_id, version)
        eligible, _ = eligibility_check(record)
        if not eligible:
            return []
        return [
            build_citation(record, self._chunks[chunk_id], 1.0)
            for chunk_id in record.chunkIds
            if chunk_id in self._chunks
        ]

    async def retrieve_detailed(
        self,
        query: str,
        *,
        language: Language = "en",
        top_k: int = 5,
        document_types: list[str] | None = None,
        options: RetrievalOptions | None = None,
        trace_id: str = "",
    ) -> HybridRetrievalResult:
        effective_options = options or RetrievalOptions(
            documentTypes=document_types or []
        )
        value = RetrievalQuery(
            query=query,
            language=language,
            topK=top_k,
            documentTypes=document_types or [],
            options=effective_options,
        )
        with self._span(trace_id, "retrieval.hybrid", queryLength=len(query)):
            result = await self.retrieval.retrieve_detailed(value, trace_id=trace_id)
        with self._span(trace_id, "retrieval.rerank", candidates=len(result.evidence)):
            result.evidence = await self.reranking.rerank(
                query,
                result.evidence,
                top_k=top_k,
            )
        diagnostics = result.diagnostics
        diagnostics.rerankedCount = len(result.evidence)
        diagnostics.selectedCandidates = len(result.evidence)
        diagnostics.insufficientEvidence = not result.evidence
        if self.monitoring is not None:
            understanding = diagnostics.queryUnderstanding
            self.monitoring.record_retrieval(
                trace_id=trace_id,
                query=query,
                language=str(understanding.get("language", language)),
                intent=str(understanding.get("intent", "general")),
                ranked_chunk_ids=[item.chunkId for item in result.evidence],
                scores=[item.score for item in result.evidence],
                backends=diagnostics.backends,
                latency_ms=diagnostics.latencyMs,
                result_count=len(result.evidence),
                insufficient_evidence=not result.evidence,
                filters=diagnostics.filters,
                deduplication_removed=diagnostics.deduplicationRemoved,
                expansion_count=len(diagnostics.searchQueries),
            )
        return result

    async def retrieve(
        self,
        query: str,
        *,
        language: Language = "en",
        top_k: int = 5,
        document_types: list[str] | None = None,
        options: RetrievalOptions | None = None,
        trace_id: str = "",
    ) -> list[EvidenceChunk]:
        result = await self.retrieve_detailed(
            query,
            language=language,
            top_k=top_k,
            document_types=document_types,
            options=options,
            trace_id=trace_id,
        )
        return result.evidence

    def _span(self, trace_id: str, name: str, **details: Any):  # type: ignore[no-untyped-def]
        if self.tracer is not None and trace_id:
            return self.tracer.span(trace_id, name, **details)
        from contextlib import nullcontext

        return nullcontext()

    def backend_status(self) -> dict[str, str]:
        return self.retrieval.backend_names()

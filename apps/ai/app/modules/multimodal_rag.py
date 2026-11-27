"""Multimodal indexing and retrieval for agricultural documents and images."""

from __future__ import annotations

import base64
import binascii
import hashlib
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.config import Settings, get_settings
from app.errors import ConfigurationError, DocumentError, IntegrationUnavailableError, UnauthorizedError
from app.infrastructure.image import IMAGE_MIME_TYPES, ImagePreprocessor
from app.infrastructure.image_embeddings import ImageEmbeddingService
from app.infrastructure.keyword_index import KeywordIndex
from app.infrastructure.ocr import TesseractOcrProcessor
from app.infrastructure.vector_store import VectorIndex, VectorPoint
from app.models import (
    Citation,
    DocumentChunk,
    DocumentRecord,
    DocumentType,
    EvidenceChunk,
    Language,
    LicenseMetadata,
    SourceMetadata,
    utc_now,
)
from app.modules.documents import DocumentProcessingInput, DocumentProcessingService, chunk_text
from app.modules.embeddings import EmbeddingService
from app.modules.knowledge import build_citation, eligibility_check
from app.infrastructure.vision import PLANT_IMAGE_DISCLAIMER, VisionModelClient, VisionObservation
from app.tracing import Tracer

AssetKind = Literal["pdf", "image", "chart", "table", "text", "research_material"]


class MultimodalAssetInput(BaseModel):
    """Caller-supplied asset. Verification is never caller-supplied."""

    model_config = ConfigDict(extra="forbid")

    assetId: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=500)
    filename: str = Field(default="", max_length=300)
    mimeType: str = Field(default="text/plain", min_length=1, max_length=150)
    documentType: DocumentType = "other"
    language: Language = "en"
    version: str = Field(default="v1", min_length=1, max_length=100)
    source: SourceMetadata
    license: LicenseMetadata
    sourceVersion: str = Field(default="", max_length=100)
    text: str = Field(default="", max_length=20_000_000)
    contentBase64: str = Field(default="", max_length=30_000_000)
    visualQuestion: str = Field(default="", max_length=2000)
    isPlantImage: bool = False

    @model_validator(mode="before")
    @classmethod
    def discard_verification_claims(cls, value: Any) -> Any:
        """Strip self-certification even for direct internal callers."""
        if not isinstance(value, dict):
            return value
        value = dict(value)
        value.pop("status", None)
        for field, keys in (
            ("source", {"authority", "jurisdiction"}),
            ("license", {"verified"}),
        ):
            nested = value.get(field)
            if isinstance(nested, dict):
                value[field] = {key: item for key, item in nested.items() if key not in keys}
            elif isinstance(nested, BaseModel):
                value[field] = nested.model_dump(exclude=keys)
        return value


class MultimodalAssetRecord(BaseModel):
    assetId: str
    organizationId: str
    title: str
    assetKind: AssetKind
    version: str
    language: Language
    mimeType: str
    status: str
    chunkIds: list[str]
    contentHash: str
    processors: list[str]
    layout: list[dict[str, Any]]
    vision: dict[str, Any]
    citationEligible: bool
    citationEligibilityReason: str
    advisory: bool = True


class MultimodalIngestionResult(MultimodalAssetRecord):
    chunkCount: int
    textEmbeddingModel: str
    imageEmbeddingModel: str
    usage: dict[str, Any]


class MultimodalRetrievalInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(default="", max_length=8000)
    language: Language = "en"
    topK: int = Field(default=5, ge=1, le=50)
    assetIds: list[str] = Field(default_factory=list, max_length=50)
    mimeTypes: list[str] = Field(default_factory=list, max_length=20)
    imageBase64: str = Field(default="", max_length=30_000_000)
    includeVisualSimilarity: bool = True


class MultimodalRetrievalResult(BaseModel):
    evidence: list[EvidenceChunk]
    diagnostics: dict[str, Any]


class MultimodalRAGService:
    """Evidence-first multimodal retrieval with strict organization isolation."""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        processing: DocumentProcessingService | None = None,
        embeddings: EmbeddingService | None = None,
        image_embeddings: ImageEmbeddingService | None = None,
        vector_index: VectorIndex | None = None,
        keyword_index: KeywordIndex | None = None,
        vision: VisionModelClient | None = None,
        tracer: Tracer | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        if not self.settings.multimodal_enabled:
            raise ConfigurationError("Multimodal RAG is disabled by configuration.")
        self.processing = processing or DocumentProcessingService(self.settings)
        self.embeddings = embeddings or EmbeddingService(self.settings)
        self.image_embeddings = image_embeddings or ImageEmbeddingService(self.settings)
        self.vector_index = vector_index
        self.keyword_index = keyword_index
        self.vision = vision or VisionModelClient(self.settings)
        self.tracer = tracer
        self.preprocessor = ImagePreprocessor()
        self.ocr = TesseractOcrProcessor()
        self._records: dict[str, DocumentRecord] = {}
        self._chunks: dict[str, DocumentChunk] = {}
        self._assets: dict[str, MultimodalAssetRecord] = {}
        self._payloads: dict[str, dict[str, Any]] = {}

    @staticmethod
    def _require_scope(trusted_organization_id: str) -> str:
        if not trusted_organization_id:
            raise UnauthorizedError(
                "Multimodal requests require an authenticated organization scope.",
                details={"reason": "missing_organization_scope"},
            )
        return trusted_organization_id

    @staticmethod
    def _asset_key(organization_id: str, asset_id: str) -> str:
        digest = hashlib.sha256(
            f"{organization_id}\x1f{asset_id}".encode("utf-8")
        ).hexdigest()[:24]
        return f"{digest}-{asset_id[:64]}"

    @classmethod
    def _namespaced_id(cls, organization_id: str, asset_id: str, version: str) -> str:
        base = cls._asset_key(organization_id, asset_id)
        digest = hashlib.sha256(f"{base}\x1f{version}".encode("utf-8")).hexdigest()[:12]
        return f"{base}-{digest}"

    def _span(self, trace_id: str, name: str, **details: Any):  # type: ignore[no-untyped-def]
        if self.tracer is not None and trace_id:
            return self.tracer.span(trace_id, name, **details)
        from contextlib import nullcontext

        return nullcontext()

    def _classify_asset(self, value: MultimodalAssetInput) -> tuple[AssetKind, str]:
        mime = value.mimeType.lower()
        filename = value.filename.lower()
        if mime == "application/pdf" or filename.endswith(".pdf"):
            return "pdf", "application/pdf"
        if mime in IMAGE_MIME_TYPES:
            if value.isPlantImage:
                return "image", mime
            if "chart" in filename or "graph" in filename:
                return "chart", mime
            return "image", mime
        if value.documentType in {"research_paper", "government_publication"}:
            return "research_material", mime
        if "table" in filename or any(token in value.text.lower() for token in ("|", "\t")):
            return "table", mime
        if any(term in filename for term in ("research", "paper", "study")):
            return "research_material", mime
        return "text", mime

    def _layout(
        self,
        *,
        asset_kind: AssetKind,
        text: str,
        tables: list[dict[str, Any]],
        preprocessed: Any | None,
    ) -> list[dict[str, Any]]:
        regions: list[dict[str, Any]] = []
        if asset_kind in {"image", "chart"}:
            regions.append(
                {
                    "kind": "image",
                    "page": 1,
                    "boundingBox": (
                        [0, 0, preprocessed.width, preprocessed.height]
                        if preprocessed is not None
                        and preprocessed.width is not None
                        and preprocessed.height is not None
                        else None
                    ),
                    "detection": "declared_asset_type",
                }
            )
        if text.strip():
            regions.append(
                {
                    "kind": "text",
                    "page": 1 if asset_kind in {"image", "chart"} else None,
                    "detection": "ocr" if asset_kind in {"image", "chart"} else "extracted_text",
                    "characterCount": len(text),
                }
            )
        if asset_kind == "chart":
            regions.append(
                {
                    "kind": "chart_candidate",
                    "page": 1,
                    "detection": "filename_declaration",
                    "confirmed": False,
                }
            )
        for table in tables:
            regions.append(
                {
                    "kind": "table",
                    "page": table.get("page"),
                    "detection": "document_layout_extractor",
                    "index": table.get("index"),
                }
            )
        return regions

    def _build_record(
        self,
        value: MultimodalAssetInput,
        *,
        document_id: str,
        organization_id: str,
        text: str,
        tables: list[dict[str, Any]],
        content_hash: str,
        processor: str,
    ) -> DocumentRecord:
        # No trusted document registry exists for caller-uploaded assets. Every
        # record stays unverified and unlicensed regardless of input claims.
        source = SourceMetadata(
            **{**value.source.model_dump(), "authority": "", "jurisdiction": ""}
        )
        license_data = LicenseMetadata(**{**value.license.model_dump(), "verified": False})
        return DocumentRecord(
            documentId=document_id,
            title=value.title,
            documentType=value.documentType,
            classifiedType=value.documentType,
            classificationConfidence=0.0,
            language=value.language,
            version=value.version,
            status="UNVERIFIED",
            provenance={
                "source": source.model_dump(),
                "license": license_data.model_dump(),
                "ingestedBy": "system",
                "originalFilename": value.filename,
                "contentHash": content_hash,
                "sourceVersion": value.sourceVersion,
            },
            text=text,
            tables=tables,
            extractedMetadata={
                "organizationId": organization_id,
                "assetId": value.assetId,
                "tableCount": len(tables),
            },
            processor=processor,
            createdAt=utc_now(),
            updatedAt=utc_now(),
        )

    async def ingest(
        self,
        value: MultimodalAssetInput,
        *,
        trusted_organization_id: str,
        trace_id: str = "",
    ) -> MultimodalIngestionResult:
        organization_id = self._require_scope(trusted_organization_id)
        asset_kind, effective_mime = self._classify_asset(value)
        if self.vector_index is None or self.keyword_index is None:
            raise ConfigurationError("Multimodal RAG requires configured vector and keyword indexes.")
        if len(self._assets) >= self.settings.multimodal_max_assets:
            raise DocumentError("The multimodal asset limit has been reached.")
        asset_key = self._asset_key(organization_id, value.assetId)
        document_id = self._namespaced_id(organization_id, value.assetId, value.version)
        previous = self._assets.get(asset_key)

        with self._span(trace_id, "multimodal.preprocess", assetId=value.assetId):
            preprocessed = None
            if asset_kind in {"image", "chart"}:
                if not value.contentBase64:
                    raise DocumentError("Image ingestion requires contentBase64.")
                preprocessed = self.preprocessor.preprocess(value.contentBase64, expected_mime=effective_mime)
                if preprocessed.bytesLength > self.settings.max_upload_bytes:
                    raise DocumentError("Image exceeds the configured upload size limit.")
            elif effective_mime == "application/pdf" or value.contentBase64:
                try:
                    raw = base64.b64decode(value.contentBase64, validate=True)
                except (binascii.Error, ValueError) as error:
                    raise DocumentError("contentBase64 is not valid base64.") from error
                if len(raw) > self.settings.max_upload_bytes:
                    raise DocumentError("Asset exceeds the configured upload size limit.")

        processors: list[str] = []
        tables: list[dict[str, Any]] = []
        text = value.text.strip()
        vision = VisionObservation(
            status="unavailable",
            provider="none",
            limitations=["Vision model was not invoked for this asset."],
        ).model_dump(mode="json")

        if asset_kind in {"image", "chart"} and preprocessed is not None:
            processors.append(preprocessed.mimeType + "-preprocessed")
            if self.settings.ocr_mode != "never":
                try:
                    ocr = await self.ocr.extract_images([preprocessed.content])
                    text = ocr["text"].strip()
                    processors.append(ocr["processor"])
                except IntegrationUnavailableError:
                    processors.append("ocr-unavailable")
            vision_result = await self.vision.observe(
                preprocessed.content,
                preprocessed.mimeType,
                question=value.visualQuestion,
                is_plant_image=value.isPlantImage,
            )
            vision = vision_result.model_dump(mode="json")
            processors.append(f"vision-{vision_result.provider}")
            if vision_result.observations:
                text = "\n\n".join(
                    part for part in (text, f"Model visual observation: {vision_result.observations}") if part
                )
        else:
            processing_input = DocumentProcessingInput(
                documentId=document_id,
                title=value.title,
                documentType=value.documentType,
                language=value.language,
                version=value.version,
                status="UNVERIFIED",
                source=value.source,
                license=value.license,
                sourceVersion=value.sourceVersion,
                mimeType=effective_mime,
                filename=value.filename,
                text=value.text,
                contentBase64=value.contentBase64,
            )
            extracted = await self.processing.extract(processing_input)
            text = str(extracted.get("text", "")).strip()
            tables = list(extracted.get("tables", []) or [])
            processors.append(str(extracted.get("processor", "unknown")))

        content_hash = (
            preprocessed.contentHash
            if preprocessed is not None
            else hashlib.sha256((text or value.contentBase64).encode("utf-8")).hexdigest()
        )
        record = self._build_record(
            value,
            document_id=document_id,
            organization_id=organization_id,
            text=text,
            tables=tables,
            content_hash=content_hash,
            processor="+".join(processors),
        )
        eligible, reason = eligibility_check(record)

        raw_chunks = chunk_text(
            text or f"{value.title} multimodal asset with no extractable text.",
            max_chars=self.settings.max_chunk_chars,
            overlap=self.settings.chunk_overlap_chars,
        )
        texts = [chunk for _, chunk in raw_chunks]
        vectors, usage = await self.embeddings.embed(texts)
        points: list[VectorPoint] = []
        chunks: list[DocumentChunk] = []
        for index, ((section, chunk_text_value), vector) in enumerate(zip(raw_chunks, vectors)):
            chunk = DocumentChunk(
                chunkId=f"{document_id}:t{index}",
                documentId=document_id,
                version=value.version,
                text=chunk_text_value,
                position=index,
                language=value.language,
                section=section or asset_kind,
                citationEligible=eligible,
                metadata={
                    "assetId": value.assetId,
                    "assetKind": asset_kind,
                    "organizationId": organization_id,
                    "processors": processors,
                    "contentHash": content_hash,
                },
            )
            chunks.append(chunk)
            points.append(
                VectorPoint(
                    id=chunk.chunkId,
                    vector=vector,
                    payload=self._payload(record, chunk, eligible, asset_kind, "text", vision),
                )
            )

        if preprocessed is not None and self.settings.multimodal_enabled:
            visual_vector = await self.image_embeddings.embed(preprocessed.content)
            visual_chunk = DocumentChunk(
                chunkId=f"{document_id}:visual",
                documentId=document_id,
                version=value.version,
                text=(
                    f"Visual signature for {value.title}; OCR text and model observations are "
                    "reported separately."
                ),
                position=len(chunks),
                language=value.language,
                section="visual_signature",
                citationEligible=eligible,
                metadata={
                    "assetId": value.assetId,
                    "assetKind": asset_kind,
                    "organizationId": organization_id,
                    "contentHash": content_hash,
                    "embeddingModel": self.image_embeddings.provider.model_name,
                    "width": preprocessed.width,
                    "height": preprocessed.height,
                },
            )
            chunks.append(visual_chunk)
            points.append(
                VectorPoint(
                    id=visual_chunk.chunkId,
                    vector=visual_vector,
                    payload=self._payload(
                        record, visual_chunk, eligible, asset_kind, "visual", vision
                    ),
                )
            )

        if previous is not None:
            # Version changes must not leave orphaned chunks in either index.
            old_document_id = self._namespaced_id(
                previous.organizationId, previous.assetId, previous.version
            )
            for chunk_id in previous.chunkIds:
                self._chunks.pop(chunk_id, None)
                self._payloads.pop(chunk_id, None)
            self._records.pop(old_document_id, None)
            if hasattr(self.vector_index, "delete_document"):
                await self.vector_index.delete_document(old_document_id)  # type: ignore[attr-defined]
            if hasattr(self.keyword_index, "delete_document"):
                await self.keyword_index.delete_document(old_document_id)  # type: ignore[attr-defined]

        for point in points:
            self._payloads[point.id] = point.payload
        await self.vector_index.upsert(points)
        for point in points:
            await self.keyword_index.upsert(point.id, point.payload["text"], point.payload)

        record.chunkIds = [chunk.chunkId for chunk in chunks]
        self._records[document_id] = record
        self._chunks.update({chunk.chunkId: chunk for chunk in chunks})
        asset = MultimodalAssetRecord(
            assetId=value.assetId,
            organizationId=organization_id,
            title=value.title,
            assetKind=asset_kind,
            version=value.version,
            language=value.language,
            mimeType=effective_mime,
            status="UNVERIFIED",
            chunkIds=record.chunkIds,
            contentHash=content_hash,
            processors=processors,
            layout=self._layout(
                asset_kind=asset_kind,
                text=text,
                tables=tables,
                preprocessed=preprocessed,
            ),
            vision=vision,
            citationEligible=eligible,
            citationEligibilityReason=reason,
        )
        self._assets[asset_key] = asset
        return MultimodalIngestionResult(
            **asset.model_dump(),
            chunkCount=len(chunks),
            textEmbeddingModel=str(usage.get("model", "")),
            imageEmbeddingModel=self.image_embeddings.provider.model_name,
            usage=usage,
        )

    def _payload(
        self,
        record: DocumentRecord,
        chunk: DocumentChunk,
        eligible: bool,
        asset_kind: AssetKind,
        modality: str,
        vision: dict[str, Any],
    ) -> dict[str, Any]:
        citation = build_citation(record, chunk, 0.0).model_dump(mode="json") if eligible else None
        return {
            "chunkId": chunk.chunkId,
            "documentId": record.documentId,
            "assetId": record.extractedMetadata["assetId"],
            "version": record.version,
            "text": chunk.text,
            "section": chunk.section,
            "page": chunk.page,
            "language": chunk.language,
            "documentType": record.documentType,
            "assetKind": asset_kind,
            "modality": modality,
            "organizationId": record.extractedMetadata["organizationId"],
            "citationEligible": eligible,
            "title": record.title,
            "source": record.provenance.source.name,
            "sourceName": record.provenance.source.name,
            "publisher": record.provenance.source.publisher,
            "sourceUrl": record.provenance.source.url,
            "contentHash": record.provenance.contentHash,
            "visionModel": vision.get("model", ""),
            "citation": citation,
        }

    async def retrieve(
        self,
        value: MultimodalRetrievalInput,
        *,
        trusted_organization_id: str,
        trace_id: str = "",
    ) -> MultimodalRetrievalResult:
        organization_id = self._require_scope(trusted_organization_id)
        if self.vector_index is None or self.keyword_index is None:
            raise ConfigurationError("Multimodal RAG requires configured vector and keyword indexes.")
        filters: dict[str, Any] = {"organizationId": organization_id}
        if value.assetIds:
            filters["assetId"] = list(value.assetIds)
        if value.mimeTypes:
            filters["assetKind"] = list(value.mimeTypes)

        ranked: dict[str, tuple[float, dict[str, Any]]] = {}
        with self._span(trace_id, "multimodal.retrieve.vector", queryLength=len(value.query)):
            if value.query.strip():
                vectors, _ = await self.embeddings.embed([value.query])
                for chunk_id, score, payload in await self.vector_index.query(
                    vectors[0], value.topK * 2, filters=filters
                ):
                    ranked[chunk_id] = (score, payload)
            if value.imageBase64 and value.includeVisualSimilarity:
                preprocessed = self.preprocessor.preprocess(value.imageBase64)
                vector = await self.image_embeddings.embed(preprocessed.content)
                for chunk_id, score, payload in await self.vector_index.query(
                    vector, value.topK * 2, filters={**filters, "modality": "visual"}
                ):
                    ranked[chunk_id] = (max(score, ranked.get(chunk_id, (0.0, payload))[0]), payload)
        with self._span(trace_id, "multimodal.retrieve.keyword", queryLength=len(value.query)):
            if value.query.strip():
                for chunk_id, score in await self.keyword_index.search(
                    value.query, value.topK * 2, filters=filters
                ):
                    payload = self._payloads.get(chunk_id)
                    if payload is None:
                        continue
                    ranked[chunk_id] = (
                        max(score, ranked.get(chunk_id, (0.0, payload))[0]),
                        payload,
                    )

        evidence: list[EvidenceChunk] = []
        for chunk_id, (score, payload) in sorted(
            ranked.items(), key=lambda item: (-item[1][0], item[0])
        )[: value.topK]:
            citation_payload = payload.get("citation")
            if not citation_payload:
                continue
            citation = Citation(**citation_payload)
            citation.score = round(min(1.0, max(0.0, score)), 4)
            evidence.append(
                EvidenceChunk(
                    chunkId=chunk_id,
                    documentId=str(payload["documentId"]),
                    version=str(payload["version"]),
                    text=str(payload["text"]),
                    section=str(payload.get("section", "")),
                    page=payload.get("page"),
                    language=payload.get("language", value.language),
                    score=round(min(1.0, max(0.0, score)), 4),
                    citation=citation,
                )
            )
        return MultimodalRetrievalResult(
            evidence=evidence,
            diagnostics={
                "strategy": "multimodal",
                "textQuery": bool(value.query.strip()),
                "imageQuery": bool(value.imageBase64 and value.includeVisualSimilarity),
                "organizationScoped": True,
                "candidates": len(ranked),
                "resultCount": len(evidence),
                "citationPolicy": "verified-licensed-sources-only",
                "imageEmbeddings": self.image_embeddings.describe(),
                "vision": self.vision.describe(),
            },
        )

    def describe(self) -> dict[str, Any]:
        return {
            "enabled": self.settings.multimodal_enabled,
            "assetKinds": ["pdf", "image", "chart", "table", "text", "research_material"],
            "pipeline": [
                "image_preprocessing",
                "ocr",
                "document_layout_analysis",
                "text_and_image_embeddings",
                "multimodal_indexing",
                "cross_modal_retrieval",
                "metadata_preservation",
                "evidence_retrieval",
                "source_attribution",
            ],
            "preprocessor": self.preprocessor.describe(),
            "imageEmbeddings": self.image_embeddings.describe(),
            "vision": self.vision.describe(),
            "plantImageDisclaimer": PLANT_IMAGE_DISCLAIMER,
            "organizationScopeEnforced": True,
        }


__all__ = [
    "MultimodalAssetInput",
    "MultimodalIngestionResult",
    "MultimodalRAGService",
    "MultimodalRetrievalInput",
    "MultimodalRetrievalResult",
]

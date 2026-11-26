"""Advisory image analysis orchestration for crop, leaf, fruit, and plant images."""

from __future__ import annotations

import base64
import secrets
import time
from contextlib import nullcontext
from datetime import datetime, timezone
from typing import Any

from app.config import Settings, get_settings
from app.errors import DocumentError, NotFoundError, UnauthorizedError
from app.infrastructure.image import ImagePreprocessor
from app.infrastructure.image_embeddings import ImageEmbeddingService
from app.models import Usage, utc_now
from app.modules.evaluation import EvaluationMonitoringService, FeedbackInput
from app.modules.multimodal_rag import MultimodalRAGService, MultimodalRetrievalInput
from app.tracing import Tracer

from .features import VisualFeatureExtractor
from .model import DEFAULT_PROMPT_VERSION, ImageAnalysisModelRegistry, ModelAnalysisInput
from .models import (
    ExpertReviewDecision,
    ExpertReviewRecord,
    ExpertReviewRequest,
    Explanation,
    ImageAnalysisRequest,
    ImageAnalysisResult,
    ImageFeedbackInput,
    NextStep,
    ReferenceMatch,
)
from .quality import ImageQualityValidator


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ImageAnalysisService:
    """Evidence-first image analysis with explicit uncertainty and human review."""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        models: ImageAnalysisModelRegistry | None = None,
        multimodal: MultimodalRAGService | None = None,
        embeddings: ImageEmbeddingService | None = None,
        monitoring: EvaluationMonitoringService | None = None,
        tracer: Tracer | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        if not self.settings.image_analysis_enabled:
            from app.errors import ConfigurationError

            raise ConfigurationError("Agricultural image analysis is disabled by configuration.")
        self.models = models or ImageAnalysisModelRegistry(self.settings)
        self.multimodal = multimodal
        self.monitoring = monitoring
        self.tracer = tracer
        self.preprocessor = ImagePreprocessor()
        self.validator = ImageQualityValidator(self.settings)
        self.features = VisualFeatureExtractor(embeddings or ImageEmbeddingService(self.settings))
        self._analyses: dict[str, tuple[str, ImageAnalysisResult]] = {}
        self._feedback: list[dict[str, Any]] = []
        self._reviews: dict[str, ExpertReviewRecord] = {}

    @staticmethod
    def _require_scope(trusted_organization_id: str) -> str:
        if not trusted_organization_id:
            raise UnauthorizedError(
                "Image analysis requires an authenticated organization scope.",
                details={"reason": "missing_organization_scope"},
            )
        return trusted_organization_id

    def _span(self, trace_id: str, name: str, **details: Any):  # type: ignore[no-untyped-def]
        if self.tracer is not None and trace_id:
            return self.tracer.span(trace_id, name, **details)
        return nullcontext()

    def _remember(self, result: ImageAnalysisResult, organization_id: str) -> None:
        self._analyses[result.analysisId] = (organization_id, result)
        limit = self.settings.image_analysis_max_records
        if len(self._analyses) > limit:
            oldest = next(iter(self._analyses))
            self._analyses.pop(oldest, None)

    def _analysis(self, analysis_id: str, organization_id: str) -> ImageAnalysisResult:
        stored = self._analyses.get(analysis_id)
        if stored is None:
            raise NotFoundError(f"Image analysis '{analysis_id}' was not found.")
        if stored[0] != organization_id:
            raise UnauthorizedError(
                "This analysis belongs to another organization.",
                details={"reason": "cross_organization_analysis_denied"},
            )
        return stored[1]

    async def _references(
        self,
        value: ImageAnalysisRequest,
        *,
        image_content: bytes,
        organization_id: str,
        trace_id: str,
    ) -> tuple[list[ReferenceMatch], dict[str, Any]]:
        if not value.includeReferences or self.multimodal is None:
            return [], {"attempted": False, "reason": "disabled_or_unavailable"}
        started = time.perf_counter()
        try:
            result = await self.multimodal.retrieve(
                MultimodalRetrievalInput(
                    query=value.question or f"{value.subjectType} {value.analysisKind} visual reference",
                    language=value.language,
                    topK=self.settings.image_analysis_max_references,
                    assetIds=value.assetIds,
                    imageBase64=base64.b64encode(image_content).decode("ascii"),
                    includeVisualSimilarity=True,
                ),
                trusted_organization_id=organization_id,
                trace_id=trace_id,
            )
        except Exception as error:  # noqa: BLE001 - retrieval must fail openly
            return [], {
                "attempted": True,
                "status": "failed",
                "reason": type(error).__name__,
                "latencyMs": round((time.perf_counter() - started) * 1000, 3),
            }
        matches: list[ReferenceMatch] = []
        for item in result.evidence:
            citation = item.citation.model_dump(mode="json")
            matches.append(
                ReferenceMatch(
                    assetId=citation.get("documentId") or item.documentId,
                    chunkId=item.chunkId,
                    title=str(citation.get("title") or ""),
                    score=float(item.score),
                    excerpt=item.text[:1000],
                    citation=citation,
                    sourceName=str(citation.get("sourceName") or ""),
                    sourceUrl=str(citation.get("sourceUrl") or ""),
                    licenseCode=str(citation.get("licenseCode") or ""),
                )
            )
        diagnostics = {
            "attempted": True,
            "status": "ok",
            "latencyMs": round((time.perf_counter() - started) * 1000, 3),
            "count": len(matches),
            "retrievalDiagnostics": result.diagnostics,
        }
        if self.monitoring is not None:
            self.monitoring.record_retrieval(
                trace_id=trace_id,
                query=value.question or f"{value.subjectType} reference",
                language=value.language,
                intent="image_analysis_reference",
                ranked_chunk_ids=[item.chunkId for item in matches],
                scores=[item.score for item in matches],
                backends={"visual_signature": "deterministic", "text": "configured"},
                latency_ms=float(diagnostics["latencyMs"]),
                result_count=len(matches),
                insufficient_evidence=not matches,
                filters={"assetIds": list(value.assetIds), "organizationScoped": True},
                deduplication_removed=0,
                expansion_count=1,
            )
        return matches, diagnostics

    @staticmethod
    def _next_steps(
        *,
        status: str,
        quality_status: str,
        has_references: bool,
        analysis_kind: str,
    ) -> list[NextStep]:
        steps: list[NextStep] = []
        if quality_status in {"degraded", "undetermined"}:
            steps.append(
                NextStep(
                    id="improve-image",
                    action="Capture another well-lit, focused image of the affected area.",
                    reason="The submitted image quality was not fully confirmed.",
                    category="image_collection",
                )
            )
        steps.append(
            NextStep(
                id="record-field-context",
                action="Record crop stage, location, recent weather, and when symptoms appeared.",
                reason="Field context helps a qualified reviewer interpret visible evidence.",
                category="image_collection",
            )
        )
        steps.append(
            NextStep(
                id="consult-verified-guidance",
                action=(
                    "Compare the observation with locally verified crop guidance from "
                    "your extension service."
                    if has_references
                    else "Ask for locally verified guidance; no eligible reference evidence was found."
                ),
                reason="Annotations are advisory and require trusted local sources.",
                category="verified_guidance",
            )
        )
        steps.append(
            NextStep(
                id="expert-review",
                action="Request review by a qualified agronomist or extension officer.",
                reason="A model observation is not a confirmed plant diagnosis.",
                category="expert_review",
            )
        )
        if analysis_kind in {"disease", "pest"} or status != "ok":
            steps.append(
                NextStep(
                    id="laboratory-confirmation",
                    action="Consider accredited laboratory or official extension confirmation.",
                    reason="Disease and pest identification needs independent confirmation.",
                    category="laboratory",
                )
            )
        return steps

    async def analyze(
        self,
        value: ImageAnalysisRequest,
        *,
        trusted_organization_id: str,
        trace_id: str = "",
    ) -> ImageAnalysisResult:
        organization_id = self._require_scope(trusted_organization_id)
        started = time.perf_counter()
        analysis_id = f"img-{secrets.token_hex(12)}"
        created_at = utc_now().isoformat()

        with self._span(trace_id, "image_analysis.preprocess", analysisId=analysis_id):
            image = self.preprocessor.preprocess(value.contentBase64, expected_mime=value.mimeType)
        quality, _quality_metrics = self.validator.validate(image)
        if quality.status == "rejected":
            quality.limitations.append("Analysis was stopped because required quality checks failed.")

        with self._span(trace_id, "image_analysis.features", analysisId=analysis_id):
            visual_features = await self.features.extract(image.content)

        model_input = ModelAnalysisInput(
            content=image.content,
            mime_type=image.mimeType,
            subject_type=value.subjectType,
            analysis_kind=value.analysisKind,
            crop=value.crop,
            region=value.region,
            question=value.question,
            language=value.language,
            prompt_version=value.promptVersion or DEFAULT_PROMPT_VERSION,
        )
        with self._span(trace_id, "image_analysis.inference", analysisId=analysis_id):
            if quality.status == "rejected":
                prediction = await self.models.resolve("none").analyze(model_input)
            else:
                prediction = await self.models.resolve(value.modelKey).analyze(model_input)

        references, reference_diagnostics = await self._references(
            value,
            image_content=image.content,
            organization_id=organization_id,
            trace_id=trace_id,
        )
        limitations: list[str] = []
        limitations.extend(quality.limitations)
        limitations.extend(visual_features.limitations)
        limitations.extend(prediction.limitations)
        limitations.extend(prediction.warnings)
        if not references and value.includeReferences:
            limitations.append(
                "No eligible reference images were retrieved; explanations do not cite visuals."
            )

        candidates = prediction.candidates
        confidence = max(
            (item.confidence for item in candidates if item.confidence is not None),
            default=None,
        )
        confidence_basis = (
            "model_reported_uncalibrated" if confidence is not None else "not_reported"
        )
        if confidence is None:
            uncertainty = (
                "No numeric confidence was reported. Observations are unverified and are "
                "not a confirmed plant diagnosis."
            )
        elif confidence < 0.6:
            uncertainty = (
                "The model reported low uncalibrated confidence; treat this as a weak "
                "signal that requires expert verification."
            )
        else:
            uncertainty = (
                "Model-reported confidence is uncalibrated, is not a calibrated probability, "
                "and does not confirm a diagnosis."
            )

        if candidates:
            summary = (
                f"The configured model reported {len(candidates)} advisory candidate(s) "
                "from visible features. None is a confirmed disease, pest, or nutrient diagnosis."
            )
        elif prediction.status == "ok":
            summary = (
                "The model produced observations but no structured candidate was accepted; "
                "no disease or pest classification is asserted."
            )
        else:
            summary = (
                "No model inference was available; no disease or pest candidate was produced."
            )
        explanation = Explanation(
            summary=summary,
            evidence=[
                {
                    "assetId": item.assetId,
                    "chunkId": item.chunkId,
                    "title": item.title,
                    "excerpt": item.excerpt,
                    "score": item.score,
                    "citation": item.citation,
                    "matchBasis": item.matchBasis,
                }
                for item in references
            ],
            modelObservations=prediction.observations,
            limitations=list(limitations),
        )

        if quality.status == "rejected":
            status = "quality_rejected"
        elif prediction.status == "unavailable":
            status = "model_unavailable"
        elif not candidates and not references:
            status = "insufficient_evidence"
        else:
            status = "ok"

        usage_payload = dict(prediction.usage)
        if self.monitoring is not None:
            self.monitoring.record_generation(
                trace_id=trace_id or analysis_id,
                task="image_analysis",
                usage=Usage(**usage_payload),
                latency_ms=prediction.latencyMs,
                status=status,
            )

        result = ImageAnalysisResult(
            analysisId=analysis_id,
            status=status,
            subjectType=value.subjectType,
            analysisKind=value.analysisKind,
            language=value.language,
            quality=quality,
            features=visual_features,
            prediction=prediction,
            confidence=confidence,
            confidenceBasis=confidence_basis,
            uncertainty=uncertainty,
            references=references,
            explanation=explanation,
            nextSteps=self._next_steps(
                status=status,
                quality_status=quality.status,
                has_references=bool(references),
                analysis_kind=value.analysisKind,
            ),
            inferenceMetadata={
                "provider": prediction.provider,
                "model": prediction.model,
                "modelVersion": prediction.modelVersion,
                "promptVersion": prediction.promptVersion,
                "inferenceId": prediction.inferenceId,
                "latencyMs": prediction.latencyMs,
                "startedAt": prediction.startedAt,
                "finishedAt": prediction.finishedAt,
                "preprocessing": image.transform,
                "contentHash": image.contentHash,
                "featureModel": visual_features.signatureModel,
                "usage": usage_payload,
                "restrictedContentRemoved": prediction.restrictedContentRemoved,
                "tenantScoped": True,
                "referenceDiagnostics": reference_diagnostics,
                "totalLatencyMs": round((time.perf_counter() - started) * 1000, 3),
            },
            limitations=sorted(set(limitations)),
            traceId=trace_id,
            createdAt=created_at,
        )
        self._remember(result, organization_id)
        return result

    def record_feedback(
        self,
        value: ImageFeedbackInput,
        *,
        trusted_organization_id: str,
        user_id: str = "system",
    ) -> dict[str, Any]:
        organization_id = self._require_scope(trusted_organization_id)
        analysis = self._analysis(value.analysisId, organization_id)
        record = {
            **value.model_dump(mode="json"),
            "traceId": value.traceId or analysis.traceId,
            "organizationId": organization_id,
            "userId": user_id,
            "recordedAt": _now(),
        }
        self._feedback.append(record)
        limit = self.settings.image_analysis_max_records
        if len(self._feedback) > limit:
            del self._feedback[: len(self._feedback) - limit]
        if self.monitoring is not None:
            self.monitoring.record_feedback(
                FeedbackInput(
                    traceId=str(record["traceId"]) or value.analysisId,
                    rating=value.rating,
                    comment=value.comment,
                    organizationId=organization_id,
                    userId=user_id,
                )
            )
        return {
            "analysisId": value.analysisId,
            "accepted": True,
            "recordedAt": record["recordedAt"],
            "feedbackCount": len(self._feedback),
        }

    def request_review(
        self,
        value: ExpertReviewRequest,
        *,
        trusted_organization_id: str,
        user_id: str = "system",
    ) -> ExpertReviewRecord:
        organization_id = self._require_scope(trusted_organization_id)
        analysis = self._analysis(value.analysisId, organization_id)
        review_id = f"review-{secrets.token_hex(10)}"
        now = _now()
        record = ExpertReviewRecord(
            reviewId=review_id,
            analysisId=value.analysisId,
            organizationId=organization_id,
            status="pending",
            priority=value.priority,
            notes=value.notes,
            predictionSummary={
                "status": analysis.status,
                "candidates": [
                    {"label": item.label, "confidence": item.confidence}
                    for item in analysis.prediction.candidates
                ],
                "confidence": analysis.confidence,
                "modelVersion": analysis.prediction.modelVersion,
            },
            evidenceSummary={
                "referenceCount": len(analysis.references),
                "assetIds": [item.assetId for item in analysis.references],
                "citationEligible": all(bool(item.citation) for item in analysis.references),
            },
            requestedBy=user_id,
            requestedAt=now,
            updatedAt=now,
        )
        self._reviews[review_id] = record
        return record

    def decide_review(
        self,
        value: ExpertReviewDecision,
        *,
        trusted_organization_id: str,
    ) -> ExpertReviewRecord:
        organization_id = self._require_scope(trusted_organization_id)
        record = self._reviews.get(value.reviewId)
        if record is None:
            raise NotFoundError(f"Expert review '{value.reviewId}' was not found.")
        if record.organizationId != organization_id:
            raise UnauthorizedError(
                "This review belongs to another organization.",
                details={"reason": "cross_organization_review_denied"},
            )
        if record.status in {"approved", "rejected", "needs_followup"}:
            raise DocumentError("This expert review has already been decided.")
        updated = record.model_copy(
            update={
                "status": value.decision,
                "decision": value.decision,
                "reviewer": value.reviewer,
                "notes": value.notes or record.notes,
                "updatedAt": _now(),
            }
        )
        self._reviews[value.reviewId] = updated
        return updated

    def get_review(
        self, review_id: str, *, trusted_organization_id: str
    ) -> ExpertReviewRecord:
        organization_id = self._require_scope(trusted_organization_id)
        record = self._reviews.get(review_id)
        if record is None:
            raise NotFoundError(f"Expert review '{review_id}' was not found.")
        if record.organizationId != organization_id:
            raise UnauthorizedError(
                "This review belongs to another organization.",
                details={"reason": "cross_organization_review_denied"},
            )
        return record

    def describe(self) -> dict[str, Any]:
        return {
            "enabled": self.settings.image_analysis_enabled,
            "subjectTypes": ["crop", "leaf", "fruit", "plant"],
            "analysisKinds": ["general", "disease", "pest", "nutrient"],
            "models": self.models.describe(),
            "quality": {
                "minWidth": self.settings.image_analysis_min_width,
                "minHeight": self.settings.image_analysis_min_height,
                "maxBytes": self.settings.max_upload_bytes,
                "pillowAvailable": ImagePreprocessor.available(),
            },
            "features": self.features.embeddings.describe(),
            "referenceRetrieval": {
                "enabled": self.multimodal is not None,
                "maxReferences": self.settings.image_analysis_max_references,
                "matchBasis": "deterministic_image_signature_not_semantic",
            },
            "policy": {
                "advisoryOnly": True,
                "diagnosisClaimed": False,
                "hazardousChemicalPrescription": False,
                "humanReviewWorkflow": True,
                "modelVersionStored": True,
                "inferenceMetadataStored": True,
                "userFeedbackStored": True,
            },
        }


__all__ = ["ImageAnalysisService"]

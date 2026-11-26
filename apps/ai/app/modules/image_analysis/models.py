"""Strict contracts for advisory agricultural image analysis."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import Language

SubjectType = Literal["crop", "leaf", "fruit", "plant"]
AnalysisKind = Literal["general", "disease", "pest", "nutrient"]
QualityStatus = Literal["acceptable", "degraded", "undetermined", "rejected"]


class ImageAnalysisRequest(BaseModel):
    """Caller-supplied image. Tenant identity is never accepted from the caller."""

    model_config = ConfigDict(extra="forbid")

    subjectType: SubjectType
    analysisKind: AnalysisKind = "general"
    language: Language = "en"
    contentBase64: str = Field(min_length=1, max_length=30_000_000)
    mimeType: str = Field(default="", max_length=150)
    filename: str = Field(default="", max_length=300)
    crop: str = Field(default="", max_length=200)
    region: str = Field(default="", max_length=200)
    question: str = Field(default="", max_length=2000)
    includeReferences: bool = True
    assetIds: list[str] = Field(default_factory=list, max_length=50)
    modelKey: str | None = Field(default=None, max_length=100)
    promptVersion: str | None = Field(default=None, max_length=100)


class QualityCheck(BaseModel):
    name: str
    status: Literal["pass", "fail", "unknown"]
    observed: str
    threshold: str
    basis: str


class ImageQualityReport(BaseModel):
    status: QualityStatus
    mimeType: str
    width: int | None = None
    height: int | None = None
    bytesLength: int
    contentHash: str
    checks: list[QualityCheck] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class VisualFeatures(BaseModel):
    status: Literal["extracted", "partial", "unavailable"]
    signatureModel: str
    signatureDimensions: int = 0
    colorHistogram: list[float] = Field(default_factory=list)
    meanLuminance: float | None = None
    edgeDensity: float | None = None
    basis: str = "deterministic_visual_descriptors_not_semantic_embeddings"
    limitations: list[str] = Field(default_factory=list)


class ClassificationCandidate(BaseModel):
    label: str = Field(min_length=1, max_length=300)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    confidenceBasis: Literal["model_reported_uncalibrated", "not_reported"] = "not_reported"
    basis: str = Field(default="", max_length=1000)
    advisory: bool = True
    diagnosisClaimed: bool = False


class ModelAnalysisResult(BaseModel):
    status: Literal["ok", "unavailable"]
    provider: str
    model: str
    modelVersion: str
    promptVersion: str
    observations: str = ""
    candidates: list[ClassificationCandidate] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    restrictedContentRemoved: bool = False
    usage: dict[str, Any] = Field(default_factory=dict)
    inferenceId: str
    startedAt: str
    finishedAt: str
    latencyMs: float = 0.0


class ReferenceMatch(BaseModel):
    assetId: str
    chunkId: str
    title: str
    score: float = Field(ge=0.0, le=1.0)
    excerpt: str
    citation: dict[str, Any] = Field(default_factory=dict)
    matchBasis: str = "deterministic_image_signature"
    sourceName: str = ""
    sourceUrl: str = ""
    licenseCode: str = ""


class Explanation(BaseModel):
    summary: str
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    modelObservations: str = ""
    limitations: list[str] = Field(default_factory=list)
    advisory: bool = True
    diagnosisClaimed: bool = False


class NextStep(BaseModel):
    id: str
    action: str
    reason: str
    category: Literal["image_collection", "verified_guidance", "expert_review", "laboratory"]


class ImageAnalysisResult(BaseModel):
    analysisId: str
    status: Literal[
        "ok", "model_unavailable", "quality_rejected", "insufficient_evidence"
    ]
    subjectType: SubjectType
    analysisKind: AnalysisKind
    language: Language
    quality: ImageQualityReport
    features: VisualFeatures
    prediction: ModelAnalysisResult
    confidence: float | None = None
    confidenceBasis: Literal["model_reported_uncalibrated", "not_reported"] = "not_reported"
    uncertainty: str
    references: list[ReferenceMatch] = Field(default_factory=list)
    explanation: Explanation
    nextSteps: list[NextStep] = Field(default_factory=list)
    inferenceMetadata: dict[str, Any] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list)
    traceId: str
    createdAt: str
    advisory: bool = True
    diagnosisClaimed: bool = False
    hazardousChemicalPrescription: bool = False


class ImageFeedbackInput(BaseModel):
    """Human feedback attached to a previously generated analysis."""

    model_config = ConfigDict(extra="forbid")

    analysisId: str = Field(min_length=1, max_length=128)
    traceId: str = Field(default="", max_length=128)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)
    labels: list[str] = Field(default_factory=list, max_length=20)
    correctionLabel: str = Field(default="", max_length=300)


class ExpertReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysisId: str = Field(min_length=1, max_length=128)
    notes: str = Field(default="", max_length=2000)
    priority: Literal["routine", "urgent"] = "routine"


class ExpertReviewDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reviewId: str = Field(min_length=1, max_length=128)
    decision: Literal["approved", "rejected", "needs_followup"]
    reviewer: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=2000)


class ExpertReviewRecord(BaseModel):
    reviewId: str
    analysisId: str
    organizationId: str
    status: Literal["pending", "in_review", "approved", "rejected", "needs_followup"]
    decision: str | None = None
    priority: str
    notes: str
    reviewer: str = ""
    predictionSummary: dict[str, Any] = Field(default_factory=dict)
    evidenceSummary: dict[str, Any] = Field(default_factory=dict)
    requestedBy: str
    requestedAt: str
    updatedAt: str


__all__ = [
    "AnalysisKind",
    "ClassificationCandidate",
    "ExpertReviewDecision",
    "ExpertReviewRecord",
    "ExpertReviewRequest",
    "Explanation",
    "ImageAnalysisRequest",
    "ImageAnalysisResult",
    "ImageFeedbackInput",
    "ImageQualityReport",
    "ModelAnalysisResult",
    "NextStep",
    "ReferenceMatch",
    "SubjectType",
    "VisualFeatures",
]

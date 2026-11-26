from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models import Language
from app.modules.agentic_rag import AgenticQueryRequest
from app.modules.evaluation_framework.models import EvaluationSuite, HumanFeedbackInput
from app.modules.image_analysis.models import (
    ExpertReviewDecision,
    ExpertReviewRequest,
    ImageAnalysisRequest,
    ImageFeedbackInput,
)
from app.modules.documents import DocumentProcessingInput
from app.modules.graph_rag import GraphApproval, GraphExtractionRequest, GraphRetrievalRequest
from app.modules.forecasting import MarketForecastRequest, PriceObservation
from app.modules.market_explanation import MarketExplanationRequest
from app.modules.multimodal import MultimodalInput
from app.modules.multimodal_rag import MultimodalAssetInput, MultimodalRetrievalInput
from app.modules.orchestration import UnifiedQueryRequest
from app.modules.weather import WeatherAdvisoryRequest, WeatherLookup

LanguageField = Field(default="en")


class RetrieveRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    language: Language = "en"
    topK: int = Field(default=5, ge=1, le=20)
    documentTypes: list[str] = Field(default_factory=list, max_length=20)
    languages: list[str] = Field(default_factory=list, max_length=3)
    sources: list[str] = Field(default_factory=list, max_length=20)
    publishers: list[str] = Field(default_factory=list, max_length=20)
    jurisdictions: list[str] = Field(default_factory=list, max_length=20)
    authorities: list[str] = Field(default_factory=list, max_length=20)
    region: str = Field(default="", max_length=200)
    fetchK: int | None = Field(default=None, ge=1, le=200)
    fusionMethod: Literal["weighted", "rrf"] | None = None
    vectorWeight: float | None = Field(default=None, ge=0.0, le=1.0)
    keywordWeight: float | None = Field(default=None, ge=0.0, le=1.0)
    rrfK: int | None = Field(default=None, ge=1, le=500)
    enableQueryExpansion: bool | None = None
    maxQueryVariants: int | None = Field(default=None, ge=1, le=8)
    deduplicationThreshold: float | None = Field(default=None, ge=0.5, le=1.0)
    maxChunksPerDocument: int | None = Field(default=None, ge=1, le=20)
    minScore: float | None = Field(default=None, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def weights_must_sum_to_one(self) -> "RetrieveRequest":
        if self.vectorWeight is not None and self.keywordWeight is not None:
            if abs(self.vectorWeight + self.keywordWeight - 1.0) > 1e-6:
                raise ValueError("vectorWeight and keywordWeight must sum to 1.0")
        return self


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    language: Language = "en"
    context: str = Field(default="", max_length=4000)
    topK: int = Field(default=5, ge=1, le=20)
    modelKey: str | None = Field(default=None, max_length=100)


class AssistantChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    language: Language = "en"
    conversationId: str | None = Field(default=None, max_length=128)
    topK: int = Field(default=5, ge=1, le=20)
    modelKey: str | None = Field(default=None, max_length=100)
    region: str = Field(default="", max_length=200)
    documentTypes: list[str] = Field(default_factory=list, max_length=20)
    maxHistoryTurns: int = Field(default=8, ge=1, le=50)
    includeHistory: bool = True


class ConversationCreateRequest(BaseModel):
    language: Language = "en"
    title: str = Field(default="", max_length=300)


class RetrievalEvaluationRequest(BaseModel):
    topK: int = Field(default=5, ge=1, le=20)


class UnifiedEvaluationRequest(BaseModel):
    dataset: Literal["text", "image", "multimodal"]
    topK: int = Field(default=5, ge=1, le=20)


class RecommendRequest(BaseModel):
    recommendationType: Literal[
        "cultivation",
        "fertilizer",
        "pest",
        "disease",
        "soil",
        "irrigation",
        "market",
    ]
    language: Language = "en"
    crop: str = Field(default="", max_length=200)
    region: str = Field(default="", max_length=200)
    season: str = Field(default="", max_length=200)
    soil: str = Field(default="", max_length=200)
    question: str = Field(default="", max_length=4000)
    topK: int = Field(default=5, ge=1, le=20)
    modelKey: str | None = Field(default=None, max_length=100)


class FeedbackRequest(BaseModel):
    traceId: str = Field(min_length=1, max_length=128)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


class AgenticApprovalRequest(BaseModel):
    model_config = {"extra": "forbid"}

    traceId: str = Field(min_length=1, max_length=128)
    approval: GraphApproval


class GraphBuildRequest(BaseModel):
    model_config = {"extra": "forbid"}

    extraction: GraphExtractionRequest
    approval: GraphApproval | None = None


class GraphContextRequest(BaseModel):
    model_config = {"extra": "forbid"}

    query: str = Field(min_length=1, max_length=4000)
    graph: GraphRetrievalRequest
    topK: int = Field(default=5, ge=1, le=20)
    documentTypes: list[str] = Field(default_factory=list, max_length=20)


class EvaluationRunRequest(BaseModel):
    model_config = {"extra": "forbid"}

    suite: EvaluationSuite | Literal["all"] = "all"
    modelVersions: dict[str, str] = Field(default_factory=dict, max_length=50)
    promptVersions: dict[str, str] = Field(default_factory=dict, max_length=50)


class BaselineRequest(BaseModel):
    model_config = {"extra": "forbid"}

    runId: str = Field(min_length=1, max_length=128)


class RegressionRequest(BaseModel):
    model_config = {"extra": "forbid"}

    runId: str = Field(min_length=1, max_length=128)
    baselineId: str = Field(min_length=1, max_length=128)
    tolerance: float = Field(default=0.02, ge=0.0, le=1.0)


class ComparisonRequest(BaseModel):
    model_config = {"extra": "forbid"}

    runIds: list[str] = Field(min_length=2, max_length=10)


__all__ = [
    "AgenticApprovalRequest",
    "BaselineRequest",
    "AgenticQueryRequest",
    "AskRequest",
    "ComparisonRequest",
    "AssistantChatRequest",
    "ConversationCreateRequest",
    "DocumentProcessingInput",
    "EvaluationRunRequest",
    "ExpertReviewDecision",
    "ExpertReviewRequest",
    "FeedbackRequest",
    "GraphBuildRequest",
    "GraphContextRequest",
    "GraphExtractionRequest",
    "GraphRetrievalRequest",
    "HumanFeedbackInput",
    "ImageAnalysisRequest",
    "ImageFeedbackInput",
    "MarketExplanationRequest",
    "MarketForecastRequest",
    "MultimodalAssetInput",
    "MultimodalInput",
    "MultimodalRetrievalInput",
    "PriceObservation",
    "RecommendRequest",
    "RegressionRequest",
    "RetrieveRequest",
    "RetrievalEvaluationRequest",
    "UnifiedEvaluationRequest",
    "UnifiedQueryRequest",
    "WeatherAdvisoryRequest",
    "WeatherLookup",
]

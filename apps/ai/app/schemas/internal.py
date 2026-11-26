from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models import Language
from app.modules.documents import DocumentProcessingInput
from app.modules.forecasting import MarketForecastRequest, PriceObservation
from app.modules.market_explanation import MarketExplanationRequest
from app.modules.multimodal import MultimodalInput
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


__all__ = [
    "AskRequest",
    "AssistantChatRequest",
    "ConversationCreateRequest",
    "DocumentProcessingInput",
    "FeedbackRequest",
    "MarketExplanationRequest",
    "MarketForecastRequest",
    "MultimodalInput",
    "PriceObservation",
    "RecommendRequest",
    "RetrieveRequest",
    "RetrievalEvaluationRequest",
    "WeatherAdvisoryRequest",
    "WeatherLookup",
]

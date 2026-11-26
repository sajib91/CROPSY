from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

Language = Literal["en", "bn", "both"]
DocumentStatus = Literal["VERIFIED", "DRAFT", "UNVERIFIED"]
DocumentType = Literal[
    "research_paper",
    "government_publication",
    "crop_cultivation_guideline",
    "fertilizer_recommendation",
    "pest_management",
    "disease_management",
    "agricultural_manual",
    "weather_guidance",
    "soil_management",
    "market_intelligence",
    "other",
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Usage(BaseModel):
    promptTokens: int = Field(ge=0, default=0)
    completionTokens: int = Field(ge=0, default=0)
    totalTokens: int = Field(ge=0, default=0)
    estimatedCostUsd: float = Field(ge=0, default=0.0)
    provider: str = "unknown"
    model: str = "unknown"


class SourceMetadata(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    url: str = Field(default="", max_length=1000)
    publisher: str = Field(default="", max_length=300)
    publishedAt: str = Field(default="", max_length=50)
    authors: list[str] = Field(default_factory=list, max_length=50)
    authority: str = Field(default="", max_length=200)
    jurisdiction: str = Field(default="", max_length=200)


class LicenseMetadata(BaseModel):
    code: str = Field(min_length=1, max_length=100)
    url: str = Field(default="", max_length=1000)
    attributionRequired: bool = False
    verified: bool = False


class Provenance(BaseModel):
    source: SourceMetadata
    license: LicenseMetadata
    ingestedAt: datetime = Field(default_factory=utc_now)
    ingestedBy: str = Field(default="system", min_length=1, max_length=128)
    originalFilename: str = Field(default="", max_length=300)
    contentHash: str = Field(min_length=64, max_length=64)
    sourceVersion: str = Field(default="", max_length=100)


class DocumentRecord(BaseModel):
    documentId: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=500)
    documentType: DocumentType
    classifiedType: DocumentType
    classificationConfidence: float = Field(ge=0, le=1, default=0.0)
    language: Language
    version: str = Field(min_length=1, max_length=100)
    status: DocumentStatus
    provenance: Provenance
    text: str
    tables: list[dict[str, Any]] = Field(default_factory=list)
    extractedMetadata: dict[str, Any] = Field(default_factory=dict)
    chunkIds: list[str] = Field(default_factory=list)
    processor: str = "unknown"
    advisory: bool = True
    createdAt: datetime = Field(default_factory=utc_now)
    updatedAt: datetime = Field(default_factory=utc_now)


class DocumentChunk(BaseModel):
    chunkId: str = Field(min_length=1, max_length=180)
    documentId: str = Field(min_length=1, max_length=128)
    version: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1)
    position: int = Field(ge=0)
    language: Language
    section: str = Field(default="", max_length=300)
    page: int | None = Field(default=None, ge=1)
    citationEligible: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class Citation(BaseModel):
    documentId: str
    version: str
    chunkId: str
    title: str
    section: str
    excerpt: str
    sourceName: str
    sourceUrl: str
    publisher: str
    publishedAt: str
    jurisdiction: str = Field(default="", max_length=200)
    authority: str = Field(default="", max_length=200)
    licenseCode: str
    licenseUrl: str
    page: int | None = None
    language: Language
    score: float = Field(ge=0, le=1)


class EvidenceChunk(BaseModel):
    chunkId: str
    documentId: str
    version: str
    text: str
    section: str
    page: int | None = None
    language: Language
    score: float = Field(ge=0, le=1)
    citation: Citation


class LLMRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=20000)
    systemPrompt: str = Field(default="", max_length=4000)
    maxTokens: int = Field(default=800, ge=1, le=8000)
    temperature: float = Field(default=0.1, ge=0, le=2)
    task: str = Field(default="general", max_length=100)


class LLMResponse(BaseModel):
    text: str
    model: str
    provider: str
    usage: Usage
    advisory: bool = True
    finishReason: str = "stop"

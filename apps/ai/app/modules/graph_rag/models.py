"""Data contracts for agricultural GraphRAG."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.infrastructure.graph_store import EntityLabel, GraphCommunity, Predicate

SOURCE_GROUNDED = "source_grounded"
HUMAN_APPROVAL = "human_approval"


class EntityMention(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    label: EntityLabel
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    evidenceSnippet: str = Field(default="", max_length=1000)
    source: str = Field(min_length=1, max_length=200)
    sourceReference: str = Field(min_length=1, max_length=300)


class RelationshipMention(BaseModel):
    subject: str = Field(min_length=1, max_length=300)
    predicate: Predicate
    object: str = Field(min_length=1, max_length=300)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    evidenceSnippet: str = Field(min_length=1, max_length=1000)
    source: str = Field(min_length=1, max_length=200)
    sourceReference: str = Field(min_length=1, max_length=300)
    extractionMethod: Literal["deterministic", "llm"] = "deterministic"

    @model_validator(mode="after")
    def no_self_reference(self) -> "RelationshipMention":
        if self.subject.casefold() == self.object.casefold():
            raise ValueError("A relationship cannot reference the same entity twice.")
        return self


class GraphExtractionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=30000)
    language: str = Field(default="en", max_length=10)
    source: str = Field(min_length=1, max_length=200)
    sourceReference: str = Field(min_length=1, max_length=300)
    sourceUrl: str = Field(default="", max_length=1000)
    documentId: str = Field(default="", max_length=128)
    chunkId: str = Field(default="", max_length=128)
    organizationId: str | None = Field(default=None, max_length=128)
    modelKey: str | None = Field(default=None, max_length=100)
    entityTypes: list[EntityLabel] = Field(default_factory=list)
    relationTypes: list[Predicate] = Field(default_factory=list)


class GraphExtractionResult(BaseModel):
    entities: list[EntityMention] = Field(default_factory=list)
    relationships: list[RelationshipMention] = Field(default_factory=list)
    extractionMethod: Literal["deterministic", "llm"] = "deterministic"
    limitations: list[str] = Field(default_factory=list)
    evidenceClasses: list[str] = Field(
        default_factory=lambda: ["candidate_extraction"]
    )
    usage: dict[str, Any] = Field(default_factory=dict)


class EntityResolution(BaseModel):
    mention: str
    id: str
    name: str
    label: EntityLabel
    confidence: float = Field(ge=0.0, le=1.0)
    method: str
    verified: bool = False


class GraphApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approvalId: str = Field(min_length=1, max_length=128)
    # Populated by the approval route from signed internal context; never from
    # the request body.
    approvedBy: str = Field(default="", max_length=128)
    decision: Literal["approved", "rejected"]
    scope: list[str] = Field(default_factory=list, max_length=100)
    approvedAt: str = Field(default="", max_length=50)
    notes: str = Field(default="", max_length=1000)


class GraphValidationResult(BaseModel):
    accepted: list[dict[str, Any]] = Field(default_factory=list)
    rejected: list[dict[str, Any]] = Field(default_factory=list)
    issues: list[dict[str, Any]] = Field(default_factory=list)
    requiresApproval: bool = False
    verifiedCount: int = 0
    validatedCount: int = 0


class GraphBuildResult(BaseModel):
    status: Literal["built", "awaiting_approval", "rejected", "no_candidates"]
    nodesWritten: int = 0
    relationshipsWritten: int = 0
    verifiedRelationships: int = 0
    validation: GraphValidationResult = Field(default_factory=GraphValidationResult)
    limitations: list[str] = Field(default_factory=list)


class GraphEvidenceItem(BaseModel):
    subject: str
    predicate: str
    object: str
    confidence: float
    evidenceClass: str
    verified: bool
    validated: bool
    source: str
    sourceReference: str
    documentId: str = ""
    chunkId: str = ""
    hop: int = 0


class GraphRetrievalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(default="", max_length=4000)
    entities: list[str] = Field(default_factory=list, max_length=20)
    organizationIds: list[str] = Field(default_factory=list, max_length=50)
    includeGlobal: bool = True
    topK: int = Field(default=20, ge=1, le=100)
    maxHops: int = Field(default=2, ge=1, le=6)
    minConfidence: float = Field(default=0.6, ge=0.0, le=1.0)
    verifiedOnly: bool = False
    includeCommunities: bool = True
    includeCandidates: bool = False
    predicates: list[Predicate] = Field(default_factory=list)


class GraphContext(BaseModel):
    query: str
    entities: list[str] = Field(default_factory=list)
    evidence: list[GraphEvidenceItem] = Field(default_factory=list)
    communities: list[GraphCommunity] = Field(default_factory=list)
    contextText: str = ""
    citations: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    evidenceClasses: list[str] = Field(default_factory=list)
    stats: dict[str, Any] = Field(default_factory=dict)


class CombinedGraphContext(BaseModel):
    contextText: str
    vectorEvidence: list[dict[str, Any]] = Field(default_factory=list)
    graphEvidence: list[dict[str, Any]] = Field(default_factory=list)
    evidenceClasses: list[str] = Field(default_factory=list)
    counts: dict[str, int] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list)
    advisory: bool = True


__all__ = [
    "SOURCE_GROUNDED",
    "HUMAN_APPROVAL",
    "CombinedGraphContext",
    "EntityMention",
    "EntityResolution",
    "GraphApproval",
    "GraphBuildResult",
    "GraphContext",
    "GraphEvidenceItem",
    "GraphExtractionRequest",
    "GraphExtractionResult",
    "GraphRetrievalRequest",
    "GraphValidationResult",
    "RelationshipMention",
]

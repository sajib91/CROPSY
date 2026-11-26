"""Contracts for the agentic RAG workflow."""

from __future__ import annotations

from typing import Any, Literal, TypedDict

from pydantic import BaseModel, ConfigDict, Field

from app.models import Language
from app.modules.graph_rag.models import GraphApproval
from app.modules.forecasting import PriceObservation

AgentName = Literal[
    "query_understanding",
    "agricultural_knowledge_retrieval",
    "market_intelligence",
    "crop_advisory",
    "document_analysis",
    "evidence_verification",
    "response_generation",
]


class AgenticQueryRequest(BaseModel):
    """Caller-supplied advisory request; farmer records are never accepted here."""

    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=4000)
    language: Language = "en"
    topK: int = Field(default=5, ge=1, le=20)
    documentTypes: list[str] = Field(default_factory=list, max_length=20)
    region: str = Field(default="", max_length=200)
    organizationIds: list[str] = Field(default_factory=list, max_length=50)
    includeGlobal: bool = True
    useGraph: bool = True
    requireApproval: bool = False
    documentText: str = Field(default="", max_length=30000)
    marketObservations: list[PriceObservation] = Field(default_factory=list, max_length=100)
    modelKey: str | None = Field(default=None, max_length=100)
    approval: GraphApproval | None = None


class AgenticRAGResult(BaseModel):
    status: Literal["ok", "insufficient_evidence", "awaiting_approval", "rejected", "blocked"]
    advisory: bool = True
    answer: str
    selectedAgents: list[str] = Field(default_factory=list)
    agentOutputs: dict[str, Any] = Field(default_factory=dict)
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    graphEvidence: list[dict[str, Any]] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    safetyNotes: list[dict[str, Any]] = Field(default_factory=list)
    toolCalls: list[dict[str, Any]] = Field(default_factory=list)
    executionTrace: list[dict[str, Any]] = Field(default_factory=list)
    usage: dict[str, Any] = Field(default_factory=dict)
    approvalId: str | None = None
    approval: dict[str, Any] | None = None
    traceId: str


class AgenticState(dict[str, Any]):
    """Mutable state shape used by service helpers."""


class AgentState(TypedDict, total=False):
    """LangGraph state schema carried through every node."""

    request: AgenticQueryRequest
    scope: Any
    traceId: str
    understanding: dict[str, Any]
    graphEntities: list[str]
    selectedAgents: list[str]
    step: int
    currentNode: str
    lastError: dict[str, Any] | None
    agentAttempts: dict[str, int]
    executionTrace: list[dict[str, Any]]
    toolCalls: list[dict[str, Any]]
    vectorEvidence: list[dict[str, Any]]
    graphContext: dict[str, Any]
    graphEvidence: list[dict[str, Any]]
    marketResult: dict[str, Any]
    verifiedVectorEvidence: list[dict[str, Any]]
    verifiedGraphEvidence: list[dict[str, Any]]
    verification: dict[str, Any]
    citations: list[str]
    approvalRequired: bool
    approvalId: str
    approval: dict[str, Any]
    status: str
    answer: str
    safetyNotes: list[dict[str, Any]]
    limitations: list[str]
    usage: dict[str, Any]
    generation: dict[str, Any]


class PendingAgenticRun(BaseModel):
    approvalId: str
    organizationId: str
    userId: str
    request: AgenticQueryRequest
    state: dict[str, Any]
    createdAt: str


__all__ = [
    "AgentName",
    "AgentState",
    "AgenticQueryRequest",
    "AgenticRAGResult",
    "AgenticState",
    "PendingAgenticRun",
]

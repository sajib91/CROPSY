"""Contracts for score-producing evaluation runs. No value here is pre-seeded."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

EvaluationSuite = Literal[
    "retrieval",
    "answer_relevance",
    "factual_correctness",
    "citation_correctness",
    "groundedness",
    "language_quality",
    "multimodal_retrieval",
    "agent_reliability",
    "performance",
]


class EvaluationCase(BaseModel):
    caseId: str = Field(min_length=1, max_length=128)
    category: EvaluationSuite
    input: dict[str, Any] = Field(default_factory=dict)
    expected: dict[str, Any] = Field(default_factory=dict)
    notes: str = Field(default="", max_length=500)


class EvaluationDataset(BaseModel):
    datasetId: str = Field(min_length=1, max_length=128)
    version: str = Field(min_length=1, max_length=50)
    suite: EvaluationSuite
    cases: list[EvaluationCase] = Field(default_factory=list, min_length=1)


class CaseResult(BaseModel):
    caseId: str
    category: EvaluationSuite
    passed: bool
    metrics: dict[str, float] = Field(default_factory=dict)
    observed: dict[str, Any] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list)


class EvaluationRun(BaseModel):
    runId: str
    suite: str
    datasetIds: list[str] = Field(default_factory=list)
    datasetVersions: dict[str, str] = Field(default_factory=dict)
    startedAt: str
    finishedAt: str
    caseCount: int
    caseResults: list[CaseResult] = Field(default_factory=list)
    metrics: dict[str, float] = Field(default_factory=dict)
    modelVersions: dict[str, str] = Field(default_factory=dict)
    promptVersions: dict[str, str] = Field(default_factory=dict)
    latencyMs: float = 0.0
    evaluated: bool = True
    scoresManufactured: bool = False
    accuracyClaimed: bool = False
    limitations: list[str] = Field(default_factory=list)


class HumanFeedbackInput(BaseModel):
    """Human judgment linked to a recorded trace, case, or evaluation run."""

    model_config = ConfigDict(extra="forbid")

    traceId: str = Field(min_length=1, max_length=128)
    rating: int = Field(ge=1, le=5)
    labels: list[str] = Field(default_factory=list, max_length=20)
    comment: str = Field(default="", max_length=2000)
    caseId: str = Field(default="", max_length=128)
    runId: str = Field(default="", max_length=128)
    task: str = Field(default="general", max_length=100)


class HumanFeedbackRecord(HumanFeedbackInput):
    feedbackId: str
    organizationId: str
    userId: str
    recordedAt: str


class RegressionBaseline(BaseModel):
    baselineId: str
    runId: str
    suite: str
    datasetIds: list[str]
    metrics: dict[str, float]
    modelVersions: dict[str, str]
    promptVersions: dict[str, str]
    recordedAt: str


class RegressionReport(BaseModel):
    runId: str
    baselineId: str
    comparable: bool
    comparabilityNotes: list[str] = Field(default_factory=list)
    comparisons: list[dict[str, Any]] = Field(default_factory=list)
    regressions: list[dict[str, Any]] = Field(default_factory=list)
    tolerance: float = 0.02


class ComparisonReport(BaseModel):
    runIds: list[str]
    comparable: bool
    comparabilityNotes: list[str] = Field(default_factory=list)
    runs: list[dict[str, Any]] = Field(default_factory=list)
    deltas: list[dict[str, Any]] = Field(default_factory=list)


class PromptVersion(BaseModel):
    key: str
    version: str
    system: str
    userTemplate: str
    contentHash: str
    registeredAt: str
    active: bool = False


class AgentExecutionRecord(BaseModel):
    traceId: str
    status: str
    steps: list[dict[str, Any]] = Field(default_factory=list)
    toolCalls: list[dict[str, Any]] = Field(default_factory=list)
    attempts: dict[str, int] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)
    latencyMs: float = 0.0
    recordedAt: str


__all__ = [
    "AgentExecutionRecord",
    "CaseResult",
    "ComparisonReport",
    "EvaluationCase",
    "EvaluationDataset",
    "EvaluationRun",
    "EvaluationSuite",
    "HumanFeedbackInput",
    "HumanFeedbackRecord",
    "PromptVersion",
    "RegressionBaseline",
    "RegressionReport",
]

import hashlib
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from app.models import Usage


class FeedbackInput(BaseModel):
    traceId: str = Field(min_length=1, max_length=128)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)
    organizationId: str = Field(default="system", max_length=128)
    userId: str = Field(default="system", max_length=128)


@dataclass
class GenerationRecord:
    trace_id: str
    task: str
    usage: Usage
    latency_ms: float
    status: str
    recorded_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class RetrievalRecord:
    trace_id: str
    query_hash: str
    language: str
    intent: str
    ranked_chunk_ids: list[str]
    scores: list[float]
    backends: dict[str, str]
    latency_ms: float
    result_count: int
    insufficient_evidence: bool
    filters: dict[str, Any]
    deduplication_removed: int
    expansion_count: int
    recorded_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class EvaluationMonitoringService:
    """Bounded in-memory execution metrics, costs, and feedback."""

    def __init__(self, max_records: int = 500) -> None:
        self.max_records = max_records
        self._generations: list[GenerationRecord] = []
        self._retrievals: list[RetrievalRecord] = []
        self._feedback: list[FeedbackInput] = []
        self._errors: Counter[str] = Counter()

    def record_generation(
        self,
        *,
        trace_id: str,
        task: str,
        usage: Usage,
        latency_ms: float,
        status: str = "ok",
    ) -> None:
        self._generations.append(
            GenerationRecord(
                trace_id=trace_id,
                task=task,
                usage=usage,
                latency_ms=max(0.0, latency_ms),
                status=status,
            )
        )
        if len(self._generations) > self.max_records:
            del self._generations[: len(self._generations) - self.max_records]

    def record_retrieval(
        self,
        *,
        trace_id: str,
        query: str,
        language: str,
        intent: str,
        ranked_chunk_ids: list[str],
        scores: list[float],
        backends: dict[str, str],
        latency_ms: float,
        result_count: int,
        insufficient_evidence: bool,
        filters: dict[str, Any] | None = None,
        deduplication_removed: int = 0,
        expansion_count: int = 1,
    ) -> None:
        self._retrievals.append(
            RetrievalRecord(
                trace_id=trace_id,
                query_hash=hashlib.sha256(query.encode("utf-8")).hexdigest()[:16],
                language=language,
                intent=intent,
                ranked_chunk_ids=list(ranked_chunk_ids),
                scores=list(scores),
                backends=dict(backends),
                latency_ms=max(0.0, latency_ms),
                result_count=result_count,
                insufficient_evidence=insufficient_evidence,
                filters=dict(filters or {}),
                deduplication_removed=deduplication_removed,
                expansion_count=expansion_count,
            )
        )
        if len(self._retrievals) > self.max_records:
            del self._retrievals[: len(self._retrievals) - self.max_records]

    def record_feedback(self, value: FeedbackInput) -> dict[str, Any]:
        self._feedback.append(value)
        if len(self._feedback) > self.max_records:
            del self._feedback[: len(self._feedback) - self.max_records]
        return {
            "traceId": value.traceId,
            "accepted": True,
            "recordedAt": datetime.now(timezone.utc),
        }

    def record_error(self, code: str) -> None:
        self._errors[code] += 1

    def snapshot(self) -> dict[str, Any]:
        generations = self._generations
        total = len(generations)
        successful = sum(1 for item in generations if item.status == "ok")
        total_tokens = sum(item.usage.totalTokens for item in generations)
        total_cost = sum(item.usage.estimatedCostUsd for item in generations)
        latency = (
            sum(item.latency_ms for item in generations) / total if total else 0.0
        )
        ratings = [item.rating for item in self._feedback]
        retrievals = self._retrievals
        retrieval_total = len(retrievals)
        retrieval_latency = (
            sum(item.latency_ms for item in retrievals) / retrieval_total
            if retrieval_total
            else 0.0
        )
        insufficient = sum(1 for item in retrievals if item.insufficient_evidence)
        dedup_removed = sum(item.deduplication_removed for item in retrievals)
        dedup_candidates = sum(
            item.deduplication_removed + item.result_count for item in retrievals
        )
        return {
            "generations": total,
            "retrievals": retrieval_total,
            "averageRetrievalLatencyMs": round(retrieval_latency, 3),
            "insufficientEvidenceRate": (
                round(insufficient / retrieval_total, 4) if retrieval_total else 0.0
            ),
            "deduplicationRate": (
                round(dedup_removed / dedup_candidates, 4) if dedup_candidates else 0.0
            ),
            "successfulGenerations": successful,
            "successRate": round(successful / total, 4) if total else 1.0,
            "totalTokens": total_tokens,
            "estimatedCostUsd": round(total_cost, 6),
            "averageLatencyMs": round(latency, 3),
            "feedbackCount": len(ratings),
            "averageRating": round(sum(ratings) / len(ratings), 3) if ratings else None,
            "errorsByCode": dict(self._errors),
            "recordedAt": datetime.now(timezone.utc),
        }

    def trace_usage(self, trace_id: str) -> dict[str, Any]:
        matches = [item for item in self._generations if item.trace_id == trace_id]
        retrievals = [item for item in self._retrievals if item.trace_id == trace_id]
        return {
            "traceId": trace_id,
            "generations": len(matches),
            "totalTokens": sum(item.usage.totalTokens for item in matches),
            "estimatedCostUsd": round(
                sum(item.usage.estimatedCostUsd for item in matches), 6
            ),
            "retrievals": len(retrievals),
            "retrievedChunks": sum(item.result_count for item in retrievals),
            "retrievalLatencyMs": round(
                sum(item.latency_ms for item in retrievals), 3
            ),
        }

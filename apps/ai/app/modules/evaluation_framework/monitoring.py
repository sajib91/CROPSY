"""Agent execution monitoring derived from actual workflow results."""

from __future__ import annotations

from collections import Counter
from typing import Any

from app.models import utc_now
from app.modules.evaluation_framework.models import AgentExecutionRecord


class AgentExecutionMonitor:
    def __init__(self, max_records: int = 500) -> None:
        self.max_records = max_records
        self._records: list[AgentExecutionRecord] = []

    def record(
        self,
        *,
        trace_id: str,
        result: dict[str, Any],
        latency_ms: float,
    ) -> AgentExecutionRecord:
        steps = [
            dict(item) for item in (result.get("executionTrace") or []) if isinstance(item, dict)
        ]
        tool_calls = [
            dict(item) for item in (result.get("toolCalls") or []) if isinstance(item, dict)
        ]
        attempts = {
            str(key): int(value)
            for key, value in (result.get("agentAttempts") or {}).items()
            if isinstance(value, int)
        }
        errors = [
            str(step.get("error"))
            for step in steps
            if step.get("status") == "error" and step.get("error")
        ]
        if result.get("status") in {"blocked", "failed"}:
            errors.append(str(result.get("status")))
        record = AgentExecutionRecord(
            traceId=trace_id,
            status=str(result.get("status") or "unknown"),
            steps=steps,
            toolCalls=tool_calls,
            attempts=attempts,
            errors=errors,
            latencyMs=round(max(0.0, float(latency_ms)), 3),
            recordedAt=utc_now().isoformat(),
        )
        self._records.append(record)
        if len(self._records) > self.max_records:
            del self._records[: len(self._records) - self.max_records]
        return record

    def snapshot(self) -> dict[str, Any]:
        total = len(self._records)
        statuses: Counter[str] = Counter(item.status for item in self._records)
        errors = sum(1 for item in self._records if item.errors)
        retries = sum(1 for item in self._records if any(value > 1 for value in item.attempts.values()))
        return {
            "executions": total,
            "statusCounts": dict(sorted(statuses.items())),
            "averageLatencyMs": round(
                sum(item.latencyMs for item in self._records) / total, 3
            ) if total else 0.0,
            "averageTraceSteps": round(
                sum(len(item.steps) for item in self._records) / total, 3
            ) if total else 0.0,
            "errorRate": round(errors / total, 4) if total else 0.0,
            "retryRate": round(retries / total, 4) if total else 0.0,
            "recordedAt": utc_now().isoformat(),
        }

    def failures(self) -> list[dict[str, Any]]:
        return [
            {
                "traceId": item.traceId,
                "status": item.status,
                "errors": item.errors,
                "recordedAt": item.recordedAt,
            }
            for item in self._records
            if item.errors
        ]


__all__ = ["AgentExecutionMonitor"]

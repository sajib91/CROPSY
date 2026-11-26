import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterator


@dataclass
class Span:
    trace_id: str
    name: str
    started_at: datetime
    duration_ms: float = 0.0
    status: str = "ok"
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "traceId": self.trace_id,
            "spanId": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{self.trace_id}:{self.name}")),
            "name": self.name,
            "startedAt": self.started_at.isoformat(),
            "durationMs": round(self.duration_ms, 3),
            "status": self.status,
            "details": self.details,
        }


class Tracer:
    def __init__(self, max_history: int) -> None:
        self.max_history = max_history
        self._spans: list[Span] = []

    def new_trace_id(self) -> str:
        return str(uuid.uuid4())

    @contextmanager
    def span(
        self,
        trace_id: str,
        name: str,
        **details: Any,
    ) -> Iterator[Span]:
        started = time.perf_counter()
        record = Span(trace_id=trace_id, name=name, started_at=datetime.now(timezone.utc))
        try:
            yield record
        except Exception as error:
            record.status = "error"
            record.details["error"] = type(error).__name__
            raise
        finally:
            record.duration_ms = (time.perf_counter() - started) * 1000
            self.record(record)

    def record(self, span: Span) -> None:
        self._spans.append(span)
        if len(self._spans) > self.max_history:
            del self._spans[: len(self._spans) - self.max_history]

    def for_trace(self, trace_id: str) -> list[dict[str, Any]]:
        return [span.to_dict() for span in self._spans if span.trace_id == trace_id]

    def recent(self, limit: int = 50) -> list[dict[str, Any]]:
        return [span.to_dict() for span in self._spans[-limit:]]

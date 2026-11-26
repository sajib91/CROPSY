"""Retrieval diagnostics computed from recorded retrieval observations."""

from __future__ import annotations

from collections import Counter
from typing import Any

from app.models import utc_now
from app.modules.evaluation import EvaluationMonitoringService


def _percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round((len(ordered) - 1) * fraction)))
    return round(ordered[index], 3)


class RetrievalDiagnosticsService:
    def __init__(self, monitoring: EvaluationMonitoringService) -> None:
        self.monitoring = monitoring

    def snapshot(self) -> dict[str, Any]:
        records = self.monitoring.retrieval_records()
        total = len(records)
        latencies = [float(item["latencyMs"]) for item in records]
        scores = [
            float(score)
            for item in records
            for score in item["scores"]
            if isinstance(score, (int, float))
        ]
        backends: Counter[str] = Counter()
        intents: Counter[str] = Counter()
        languages: Counter[str] = Counter()
        hashes: Counter[str] = Counter()
        insufficient = 0
        dedup_removed = 0
        dedup_candidates = 0
        filtered = 0
        for item in records:
            for backend, status in item["backends"].items():
                backends[f"{backend}:{status}"] += 1
            intents[str(item["intent"])] += 1
            languages[str(item["language"])] += 1
            hashes[str(item["queryHash"])] += 1
            insufficient += 1 if item["insufficientEvidence"] else 0
            dedup_removed += int(item["deduplicationRemoved"])
            dedup_candidates += int(item["deduplicationRemoved"]) + int(item["resultCount"])
            filtered += 1 if item["filters"] else 0
        buckets = {
            "below0.25": sum(1 for score in scores if score < 0.25),
            "0.25to0.5": sum(1 for score in scores if 0.25 <= score < 0.5),
            "0.5to0.75": sum(1 for score in scores if 0.5 <= score < 0.75),
            "0.75andAbove": sum(1 for score in scores if score >= 0.75),
        }
        return {
            "retrievals": total,
            "insufficientEvidenceRate": round(insufficient / total, 4) if total else 0.0,
            "deduplicationRate": (
                round(dedup_removed / dedup_candidates, 4) if dedup_candidates else 0.0
            ),
            "filteredRetrievalRate": round(filtered / total, 4) if total else 0.0,
            "latencyMs": {
                "mean": round(sum(latencies) / total, 3) if total else 0.0,
                "p50": _percentile(latencies, 0.5),
                "p95": _percentile(latencies, 0.95),
            },
            "scoreBuckets": buckets,
            "backendUsage": dict(sorted(backends.items())),
            "intentCounts": dict(sorted(intents.items())),
            "languageCounts": dict(sorted(languages.items())),
            "repeatedQueryHashes": {
                key: value for key, value in hashes.most_common(10) if value > 1
            },
            "recordedAt": utc_now().isoformat(),
        }


__all__ = ["RetrievalDiagnosticsService"]

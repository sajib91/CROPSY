"""Human feedback collection with explicit labels and trusted tenant identity."""

from __future__ import annotations

import secrets
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from app.config import Settings, get_settings
from app.models import utc_now
from app.modules.evaluation_framework.models import HumanFeedbackInput, HumanFeedbackRecord


class HumanFeedbackCollector:
    """Stores human judgments; it never converts ratings into model scores."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._records: list[HumanFeedbackRecord] = []

    def record(
        self,
        value: HumanFeedbackInput,
        *,
        trusted_organization_id: str,
        user_id: str = "system",
    ) -> HumanFeedbackRecord:
        if not trusted_organization_id:
            from app.errors import UnauthorizedError

            raise UnauthorizedError(
                "Human feedback requires an authenticated organization scope.",
                details={"reason": "missing_organization_scope"},
            )
        record = HumanFeedbackRecord(
            **value.model_dump(),
            feedbackId=f"feedback-{secrets.token_hex(8)}",
            organizationId=trusted_organization_id,
            userId=user_id,
            recordedAt=utc_now().isoformat(),
        )
        self._records.append(record)
        limit = self.settings.evaluation_framework_max_feedback
        if len(self._records) > limit:
            del self._records[: len(self._records) - limit]
        return record

    def for_trace(self, trace_id: str) -> list[HumanFeedbackRecord]:
        return [item for item in self._records if item.traceId == trace_id]

    def records_for_org(self, organization_id: str) -> list[HumanFeedbackRecord]:
        return [item for item in self._records if item.organizationId == organization_id]

    def summary(self) -> dict[str, Any]:
        ratings = [item.rating for item in self._records]
        labels: Counter[str] = Counter()
        for record in self._records:
            labels.update(record.labels)
        return {
            "feedbackCount": len(ratings),
            "averageRating": round(sum(ratings) / len(ratings), 4) if ratings else None,
            "labelCounts": dict(sorted(labels.items())),
            "casesJudged": len({item.caseId for item in self._records if item.caseId}),
            "runsJudged": len({item.runId for item in self._records if item.runId}),
            "recordedAt": datetime.now(timezone.utc).isoformat(),
        }


__all__ = ["HumanFeedbackCollector"]

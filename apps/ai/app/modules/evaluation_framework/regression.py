"""Regression checks against baselines created from previously completed runs."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Mapping

from app.errors import NotFoundError, UnauthorizedError
from app.models import utc_now
from app.modules.evaluation_framework.metrics import LOWER_IS_BETTER
from app.modules.evaluation_framework.models import (
    EvaluationRun,
    RegressionBaseline,
    RegressionReport,
)


class RegressionService:
    def __init__(self) -> None:
        self._baselines: dict[str, tuple[str, RegressionBaseline]] = {}

    def set_baseline(
        self, run: EvaluationRun, *, trusted_organization_id: str
    ) -> RegressionBaseline:
        baseline = RegressionBaseline(
            baselineId=f"baseline-{secrets.token_hex(8)}",
            runId=run.runId,
            suite=run.suite,
            datasetIds=list(run.datasetIds),
            metrics=dict(run.metrics),
            modelVersions=dict(run.modelVersions),
            promptVersions=dict(run.promptVersions),
            recordedAt=utc_now().isoformat(),
        )
        self._baselines[baseline.baselineId] = (trusted_organization_id, baseline)
        return baseline

    def get_baseline(
        self, baseline_id: str, *, trusted_organization_id: str
    ) -> RegressionBaseline:
        stored = self._baselines.get(baseline_id)
        if stored is None:
            raise NotFoundError(f"Regression baseline '{baseline_id}' was not found.")
        if stored[0] != trusted_organization_id:
            raise UnauthorizedError(
                "This baseline belongs to another organization.",
                details={"reason": "cross_organization_baseline_denied"},
            )
        return stored[1]

    def list_baselines(self, *, trusted_organization_id: str) -> list[RegressionBaseline]:
        return [
            baseline
            for organization_id, baseline in self._baselines.values()
            if organization_id == trusted_organization_id
        ]

    def compare(
        self,
        run: EvaluationRun,
        *,
        baseline_id: str,
        trusted_organization_id: str,
        tolerance: float = 0.02,
    ) -> RegressionReport:
        baseline = self.get_baseline(
            baseline_id, trusted_organization_id=trusted_organization_id
        )
        notes: list[str] = []
        comparable = run.suite == baseline.suite and run.datasetIds == baseline.datasetIds
        if run.suite != baseline.suite:
            notes.append(
                f"Suite mismatch: run '{run.suite}' vs baseline '{baseline.suite}'."
            )
        if run.datasetIds != baseline.datasetIds:
            notes.append("Dataset mismatch; metric deltas are not comparable.")
        if run.modelVersions != baseline.modelVersions:
            notes.append(
                "Model versions differ between run and baseline; deltas include model changes."
            )
        if run.promptVersions != baseline.promptVersions:
            notes.append(
                "Prompt versions differ between run and baseline; deltas include prompt changes."
            )

        comparisons: list[dict[str, Any]] = []
        regressions: list[dict[str, Any]] = []
        for key in sorted(set(run.metrics) | set(baseline.metrics)):
            current = run.metrics.get(key)
            previous = baseline.metrics.get(key)
            if current is None or previous is None:
                notes.append(f"Metric '{key}' is missing from one side and was not compared.")
                continue
            delta = round(current - previous, 6)
            lower_is_better = key in LOWER_IS_BETTER
            regressed = delta > tolerance if lower_is_better else delta < -tolerance
            entry = {
                "metric": key,
                "baseline": previous,
                "current": current,
                "delta": delta,
                "direction": "lower_is_better" if lower_is_better else "higher_is_better",
                "regressed": comparable and regressed,
            }
            comparisons.append(entry)
            if comparable and regressed:
                regressions.append(entry)
        return RegressionReport(
            runId=run.runId,
            baselineId=baseline.baselineId,
            comparable=comparable,
            comparabilityNotes=notes,
            comparisons=comparisons,
            regressions=regressions,
            tolerance=tolerance,
        )


__all__ = ["RegressionService"]

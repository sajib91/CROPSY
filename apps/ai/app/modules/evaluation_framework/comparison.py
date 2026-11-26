"""Side-by-side comparison of completed evaluation runs. No scores are generated here."""

from __future__ import annotations

from typing import Any, Sequence

from app.modules.evaluation_framework.metrics import LOWER_IS_BETTER
from app.modules.evaluation_framework.models import ComparisonReport, EvaluationRun


class ModelComparisonService:
    def compare(self, runs: Sequence[EvaluationRun]) -> ComparisonReport:
        if len(runs) < 2:
            return ComparisonReport(
                runIds=[run.runId for run in runs],
                comparable=False,
                comparabilityNotes=["At least two completed runs are required for comparison."],
                runs=[self._describe(run) for run in runs],
            )
        notes: list[str] = []
        reference = runs[0]
        comparable = True
        for run in runs[1:]:
            if run.suite != reference.suite:
                comparable = False
                notes.append(f"Suite differs for run '{run.runId}'.")
            if run.datasetIds != reference.datasetIds:
                comparable = False
                notes.append(f"Dataset differs for run '{run.runId}'.")

        deltas: list[dict[str, Any]] = []
        if comparable:
            for run in runs[1:]:
                for key in sorted(set(reference.metrics) | set(run.metrics)):
                    before = reference.metrics.get(key)
                    after = run.metrics.get(key)
                    if before is None or after is None:
                        notes.append(f"Metric '{key}' missing for '{run.runId}'.")
                        continue
                    deltas.append(
                        {
                            "fromRunId": reference.runId,
                            "toRunId": run.runId,
                            "metric": key,
                            "delta": round(after - before, 6),
                            "direction": (
                                "lower_is_better"
                                if key in LOWER_IS_BETTER
                                else "higher_is_better"
                            ),
                        }
                    )
        return ComparisonReport(
            runIds=[run.runId for run in runs],
            comparable=comparable,
            comparabilityNotes=notes,
            runs=[self._describe(run) for run in runs],
            deltas=deltas,
        )

    @staticmethod
    def _describe(run: EvaluationRun) -> dict[str, Any]:
        return {
            "runId": run.runId,
            "suite": run.suite,
            "datasetIds": list(run.datasetIds),
            "datasetVersions": dict(run.datasetVersions),
            "caseCount": run.caseCount,
            "metrics": dict(run.metrics),
            "modelVersions": dict(run.modelVersions),
            "promptVersions": dict(run.promptVersions),
            "finishedAt": run.finishedAt,
            "evaluated": run.evaluated,
        }


__all__ = ["ModelComparisonService"]

"""Executes evaluation suites against real callbacks and stores the resulting runs."""

from __future__ import annotations

import inspect
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Callable, Mapping

from app.config import Settings, get_settings
from app.errors import NotFoundError, UnauthorizedError
from app.models import utc_now
from app.modules.evaluation_framework.datasets import SUITE_DATASETS, load_dataset
from app.modules.evaluation_framework.metrics import SCORERS
from app.modules.evaluation_framework.models import CaseResult, EvaluationRun, EvaluationSuite

Callback = Callable[..., Any]


async def _call(callback: Callback, **kwargs: Any) -> Any:
    signature = inspect.signature(callback)
    accepts_kwargs = any(
        parameter.kind is inspect.Parameter.VAR_KEYWORD
        for parameter in signature.parameters.values()
    )
    arguments = kwargs if accepts_kwargs else {
        key: value for key, value in kwargs.items() if key in signature.parameters
    }
    result = callback(**arguments)
    if inspect.isawaitable(result):
        return await result
    return result


class EvaluationFrameworkService:
    """Runs versioned datasets; every reported score comes from that execution."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._runs: dict[str, tuple[str, EvaluationRun]] = {}

    def _remember(self, run: EvaluationRun, organization_id: str) -> None:
        self._runs[run.runId] = (organization_id, run)
        limit = self.settings.evaluation_framework_max_runs
        if len(self._runs) > limit:
            oldest = next(iter(self._runs))
            self._runs.pop(oldest, None)

    def get_run(self, run_id: str, *, trusted_organization_id: str) -> EvaluationRun:
        stored = self._runs.get(run_id)
        if stored is None:
            raise NotFoundError(f"Evaluation run '{run_id}' was not found.")
        if stored[0] != trusted_organization_id:
            raise UnauthorizedError(
                "This evaluation run belongs to another organization.",
                details={"reason": "cross_organization_run_denied"},
            )
        return stored[1]

    def runs_for_org(self, *, trusted_organization_id: str) -> list[EvaluationRun]:
        return [
            run
            for organization_id, run in self._runs.values()
            if organization_id == trusted_organization_id
        ]

    def list_runs(self, *, trusted_organization_id: str) -> list[dict[str, Any]]:
        return [
            {
                "runId": run.runId,
                "suite": run.suite,
                "datasetIds": run.datasetIds,
                "caseCount": run.caseCount,
                "finishedAt": run.finishedAt,
                "passRate": run.metrics.get("passRate"),
            }
            for organization_id, run in self._runs.values()
            if organization_id == trusted_organization_id
        ]

    async def run(
        self,
        suite: str,
        callbacks: Mapping[str, Callback],
        *,
        trusted_organization_id: str,
        model_versions: Mapping[str, str] | None = None,
        prompt_versions: Mapping[str, str] | None = None,
        trace_id: str = "",
    ) -> EvaluationRun:
        if not self.settings.evaluation_framework_enabled:
            from app.errors import ConfigurationError

            raise ConfigurationError("The evaluation framework is disabled by configuration.")
        if not trusted_organization_id:
            raise UnauthorizedError(
                "Evaluation runs require an authenticated organization scope.",
                details={"reason": "missing_organization_scope"},
            )
        suites: list[EvaluationSuite] = (
            list(SUITE_DATASETS) if suite == "all" else [suite]  # type: ignore[list-item]
        )
        if any(item not in SUITE_DATASETS for item in suites):
            from app.errors import DocumentError

            raise DocumentError(f"Unsupported evaluation suite '{suite}'.")

        started_at = utc_now().isoformat()
        started = time.perf_counter()
        case_results: list[CaseResult] = []
        dataset_ids: list[str] = []
        dataset_versions: dict[str, str] = {}
        limitations: list[str] = [
            "Scores are computed only from callbacks executed during this run.",
            "No stored, estimated, or interpolated score is used.",
        ]

        for selected in suites:
            dataset = load_dataset(selected)
            dataset_ids.append(dataset.datasetId)
            dataset_versions[dataset.datasetId] = dataset.version
            for case in dataset.cases:
                observed = await self._observe(case, callbacks)
                result = SCORERS[case.category](case, observed)
                case_results.append(result)

        count = len(case_results)
        metrics: dict[str, float] = {"passRate": round(
            sum(1 for item in case_results if item.passed) / count, 6
        ) if count else 0.0}
        keys = sorted({key for item in case_results for key in item.metrics})
        for key in keys:
            values = [item.metrics[key] for item in case_results if key in item.metrics]
            metrics[key] = round(sum(values) / len(values), 6) if values else 0.0

        run = EvaluationRun(
            runId=f"eval-{secrets.token_hex(10)}",
            suite=suite,
            datasetIds=dataset_ids,
            datasetVersions=dataset_versions,
            startedAt=started_at,
            finishedAt=datetime.now(timezone.utc).isoformat(),
            caseCount=count,
            caseResults=case_results,
            metrics=metrics,
            modelVersions=dict(model_versions or {}),
            promptVersions=dict(prompt_versions or {}),
            latencyMs=round((time.perf_counter() - started) * 1000, 3),
            limitations=limitations,
        )
        self._remember(run, trusted_organization_id)
        return run

    async def _observe(self, case: Any, callbacks: Mapping[str, Callback]) -> dict[str, Any]:
        callback_name = {
            "retrieval": "retrieve",
            "multimodal_retrieval": "multimodal",
            "agent_reliability": "agent",
        }.get(case.category, "ask")
        callback = callbacks.get(callback_name)
        if callback is None:
            return {
                "error": "callback_unavailable",
                "reason": f"No '{callback_name}' callback was supplied for this run.",
            }
        started = time.perf_counter()
        try:
            value = await _call(
                callback,
                query=str(case.input.get("query") or case.input.get("question") or ""),
                question=str(case.input.get("question") or case.input.get("query") or ""),
                language=str(case.input.get("language") or "en"),
                topK=int(case.input.get("topK") or 5),
                assetIds=list(case.input.get("assetIds") or []),
                requireApproval=bool(case.input.get("requireApproval") or False),
            )
        except Exception as error:  # noqa: BLE001 - evaluation must report real failures
            return {
                "error": type(error).__name__,
                "latencyMs": round((time.perf_counter() - started) * 1000, 3),
                "status": "failed",
            }
        latency = round((time.perf_counter() - started) * 1000, 3)
        if isinstance(value, list):
            return {"rankedIds": [str(item) for item in value], "latencyMs": latency}
        if isinstance(value, dict):
            return {**value, "latencyMs": float(value.get("latencyMs") or latency)}
        return {"value": value, "latencyMs": latency}

    def describe(self) -> dict[str, Any]:
        return {
            "enabled": self.settings.evaluation_framework_enabled,
            "suites": list(SUITE_DATASETS),
            "callbacks": ["retrieve", "ask", "multimodal", "agent"],
            "dimensions": [
                "retrievalQuality",
                "answerRelevance",
                "factualCorrectness",
                "citationCorrectness",
                "groundedness",
                "bengaliLanguageQuality",
                "englishLanguageQuality",
                "multimodalRetrievalQuality",
                "agentExecutionReliability",
                "responseLatency",
                "tokenConsumption",
                "costPerRequest",
            ],
            "scoresManufactured": False,
            "accuracyClaimed": False,
            "storedRuns": len(self._runs),
        }


__all__ = ["EvaluationFrameworkService"]

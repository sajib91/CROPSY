"""Failure-analysis dashboard data aggregated only from recorded events."""

from __future__ import annotations

from collections import Counter
from typing import Any

from app.models import utc_now
from app.modules.evaluation import EvaluationMonitoringService
from app.modules.evaluation_framework.diagnostics import RetrievalDiagnosticsService
from app.modules.evaluation_framework.feedback import HumanFeedbackCollector
from app.modules.evaluation_framework.monitoring import AgentExecutionMonitor
from app.modules.evaluation_framework.runner import EvaluationFrameworkService


class FailureAnalysisService:
    def __init__(
        self,
        *,
        runs: EvaluationFrameworkService,
        feedback: HumanFeedbackCollector,
        agent_monitor: AgentExecutionMonitor,
        monitoring: EvaluationMonitoringService,
        retrieval_diagnostics: RetrievalDiagnosticsService,
    ) -> None:
        self.runs = runs
        self.feedback = feedback
        self.agent_monitor = agent_monitor
        self.monitoring = monitoring
        self.retrieval_diagnostics = retrieval_diagnostics

    def dashboard(self, *, trusted_organization_id: str) -> dict[str, Any]:
        recorded_runs = self.runs.runs_for_org(trusted_organization_id=trusted_organization_id)
        failed_cases: list[dict[str, Any]] = []
        reasons: Counter[str] = Counter()
        by_model: Counter[str] = Counter()
        by_prompt: Counter[str] = Counter()
        for run in recorded_runs:
            for case in run.caseResults:
                if case.passed:
                    continue
                reason = "; ".join(case.limitations) or "case_check_failed"
                reasons[case.category] += 1
                for model in run.modelVersions.values():
                    by_model[str(model)] += 1
                for prompt in run.promptVersions.values():
                    by_prompt[str(prompt)] += 1
                failed_cases.append(
                    {
                        "runId": run.runId,
                        "caseId": case.caseId,
                        "category": case.category,
                        "reason": reason,
                        "metrics": dict(case.metrics),
                        "finishedAt": run.finishedAt,
                    }
                )

        feedback_records = self.feedback.records_for_org(trusted_organization_id)
        negative_feedback = [
            item for item in feedback_records if item.rating <= 2 or item.labels
        ]
        feedback_labels: Counter[str] = Counter()
        for item in negative_feedback:
            feedback_labels.update(item.labels)
        agent_failures = self.agent_monitor.failures()
        runtime_errors = dict(self.monitoring.snapshot().get("errorsByCode") or {})

        recent = sorted(failed_cases, key=lambda item: item["finishedAt"], reverse=True)[:20]
        return {
            "failureAnalysis": {
                "evaluationFailures": len(failed_cases),
                "failuresByCategory": dict(sorted(reasons.items())),
                "failuresByModel": dict(sorted(by_model.items())),
                "failuresByPrompt": dict(sorted(by_prompt.items())),
                "humanFeedbackFlags": len(negative_feedback),
                "humanFeedbackLabels": dict(sorted(feedback_labels.items())),
                "agentExecutionFailures": len(agent_failures),
                "runtimeErrorCounts": runtime_errors,
                "topCauses": [name for name, _ in reasons.most_common(5)],
            },
            "retrievalDiagnostics": self.retrieval_diagnostics.snapshot(),
            "agentReliability": self.agent_monitor.snapshot(),
            "humanFeedback": self.feedback.summary(),
            "recentFailures": recent,
            "agentFailures": agent_failures[:20],
            "recordedAt": utc_now().isoformat(),
            "basedOnRecordedRunsOnly": True,
            "scoresManufactured": False,
        }


__all__ = ["FailureAnalysisService"]

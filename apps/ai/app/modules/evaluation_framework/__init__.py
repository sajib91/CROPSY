"""Complete evaluation framework: datasets, runs, feedback, diagnostics, and reports."""

from app.modules.evaluation_framework.comparison import ModelComparisonService
from app.modules.evaluation_framework.dashboards import FailureAnalysisService
from app.modules.evaluation_framework.datasets import describe_datasets
from app.modules.evaluation_framework.diagnostics import RetrievalDiagnosticsService
from app.modules.evaluation_framework.feedback import HumanFeedbackCollector
from app.modules.evaluation_framework.metrics import SCORERS
from app.modules.evaluation_framework.models import (
    EvaluationRun,
    EvaluationSuite,
    HumanFeedbackInput,
)
from app.modules.evaluation_framework.monitoring import AgentExecutionMonitor
from app.modules.evaluation_framework.prompts import PromptVersionRegistry
from app.modules.evaluation_framework.regression import RegressionService
from app.modules.evaluation_framework.runner import EvaluationFrameworkService

__all__ = [
    "AgentExecutionMonitor",
    "EvaluationFrameworkService",
    "EvaluationRun",
    "EvaluationSuite",
    "FailureAnalysisService",
    "HumanFeedbackCollector",
    "HumanFeedbackInput",
    "ModelComparisonService",
    "PromptVersionRegistry",
    "RegressionService",
    "RetrievalDiagnosticsService",
    "SCORERS",
    "describe_datasets",
]

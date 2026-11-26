"""Advisory image analysis and evaluation-framework behavior driven by real runs."""

import asyncio
import base64
import json

import httpx
import pytest
from pydantic import SecretStr

from app.config import Settings
from app.container import AiContainer
from app.errors import DocumentError, UnauthorizedError
from app.modules.evaluation_framework import EvaluationFrameworkService
from app.modules.evaluation_framework.comparison import ModelComparisonService
from app.modules.evaluation_framework.dashboards import FailureAnalysisService
from app.modules.evaluation_framework.feedback import HumanFeedbackCollector
from app.modules.evaluation_framework.models import HumanFeedbackInput
from app.modules.evaluation_framework.monitoring import AgentExecutionMonitor
from app.modules.evaluation_framework.prompts import PromptVersionRegistry
from app.modules.evaluation_framework.regression import RegressionService
from app.modules.image_analysis import ImageAnalysisRequest
from app.modules.image_analysis.model import (
    HttpVisionLanguageModel,
    ModelAnalysisInput,
    screen_observations,
)
from app.modules.image_analysis.models import (
    ClassificationCandidate,
    ExpertReviewDecision,
    ExpertReviewRequest,
    ImageFeedbackInput,
    ModelAnalysisResult,
)

ORG_OWN = "org-image-own"
ORG_OTHER = "org-image-other"

# Magic bytes only; Pillow is optional, so dimensions are unknown and are
# reported as such instead of being fabricated.
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 96
OVERSIZED_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 1200


def encoded(content: bytes) -> str:
    return base64.b64encode(content).decode("ascii")


def build_container(**overrides: object) -> AiContainer:
    settings = Settings(
        environment="test",
        allow_mock_provider=True,
        graph_backend="memory",
        internal_service_secret=SecretStr("test-ai-service-secret-at-least-32"),
        **overrides,
    )
    return AiContainer(settings)


def image_request(**overrides: object) -> ImageAnalysisRequest:
    payload: dict[str, object] = {
        "subjectType": "leaf",
        "analysisKind": "disease",
        "language": "en",
        "contentBase64": encoded(PNG_BYTES),
        "mimeType": "image/png",
        "crop": "rice",
        "includeReferences": False,
    }
    payload.update(overrides)
    return ImageAnalysisRequest(**payload)


def test_quality_rejection_stops_model_inference_and_keeps_advisory_policy() -> None:
    service = build_container(max_upload_bytes=1024).image_analysis

    async def scenario():
        return await service.analyze(
            image_request(contentBase64=encoded(OVERSIZED_PNG)),
            trusted_organization_id=ORG_OWN,
            trace_id="trace-quality-rejected",
        )

    result = asyncio.run(scenario())
    assert result is not None
    assert result.status == "quality_rejected"
    assert result.quality.status == "rejected"
    assert any(
        check.name == "fileSize" and check.status == "fail" for check in result.quality.checks
    )
    assert result.prediction.provider == "none"
    assert result.prediction.status == "unavailable"
    assert result.confidence is None
    assert result.confidenceBasis == "not_reported"
    assert result.advisory is True
    assert result.diagnosisClaimed is False
    assert result.hazardousChemicalPrescription is False
    assert {step.id for step in result.nextSteps} >= {"record-field-context", "expert-review"}


def test_unavailable_model_reports_no_confidence_and_safe_next_steps() -> None:
    service = build_container().image_analysis

    async def scenario():
        return await service.analyze(
            image_request(), trusted_organization_id=ORG_OWN, trace_id="trace-no-model"
        )

    result = asyncio.run(scenario())
    assert result.status == "model_unavailable"
    assert result.quality.status == "undetermined"
    assert "Pillow is not available" in " ".join(result.quality.limitations)
    assert result.features.status == "partial"
    assert not result.prediction.candidates
    assert result.confidence is None
    assert result.confidenceBasis == "not_reported"
    assert "not a confirmed plant diagnosis" in result.uncertainty
    assert result.inferenceMetadata["modelVersion"] == "none"
    assert result.inferenceMetadata["promptVersion"].startswith("image-analysis-advisory")
    assert result.explanation.advisory is True
    assert result.explanation.diagnosisClaimed is False
    categories = {step.category for step in result.nextSteps}
    assert categories == {"image_collection", "verified_guidance", "expert_review", "laboratory"}
    assert all("spray" not in step.action.lower() for step in result.nextSteps)


def test_replaceable_model_candidates_keep_confidence_and_screen_restricted_claims() -> None:
    container = build_container()

    class AdvisoryModel:
        provider_name = "test-advisory"

        async def analyze(self, value: ModelAnalysisInput) -> ModelAnalysisResult:
            return ModelAnalysisResult(
                status="ok",
                provider=self.provider_name,
                model="advisory-vision-v1",
                modelVersion="advisory-vision-v1",
                promptVersion=value.prompt_version,
                observations="Leaf shows small dark spots and discoloration.",
                candidates=[
                    ClassificationCandidate(
                        label="possible leaf spot",
                        confidence=0.43,
                        confidenceBasis="model_reported_uncalibrated",
                        basis="visible spots and discoloration",
                    )
                ],
                inferenceId="inf-test-1",
                startedAt="2026-01-01T00:00:00+00:00",
                finishedAt="2026-01-01T00:00:01+00:00",
                latencyMs=1.0,
                usage={"totalTokens": 20, "estimatedCostUsd": 0.0},
            )

        def describe(self) -> dict[str, object]:
            return {"provider": self.provider_name, "configured": True}

    container.image_analysis.models.register("test-advisory", AdvisoryModel())

    async def scenario():
        return await container.image_analysis.analyze(
            image_request(modelKey="test-advisory"),
            trusted_organization_id=ORG_OWN,
            trace_id="trace-advisory-model",
        )

    result = asyncio.run(scenario())
    assert result.status == "ok"
    assert result.confidence == 0.43
    assert result.confidenceBasis == "model_reported_uncalibrated"
    assert result.prediction.restrictedContentRemoved is False
    assert "spray" not in result.prediction.observations.lower()
    assert "confirmed diagnosis" not in result.prediction.observations.lower()
    assert result.inferenceMetadata["modelVersion"] == "advisory-vision-v1"
    assert result.inferenceMetadata["provider"] == "test-advisory"
    assert result.advisory is True
    assert result.diagnosisClaimed is False


def test_http_vision_adapter_screens_restricted_claims_and_records_model_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        environment="test",
        allow_mock_provider=True,
        internal_service_secret=SecretStr("test-ai-service-secret-at-least-32"),
        image_analysis_model_provider="http",
        image_analysis_model="vision-test-v1",
        image_analysis_base_url="https://vision.example.test/v1",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/chat/completions")
        return httpx.Response(
            200,
            json={
                "model": "vision-test-v1",
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "observations": (
                                        "Leaves show spots. Spray 2 ml pesticide per litre. "
                                        "This is a confirmed diagnosis."
                                    ),
                                    "candidates": [
                                        {"label": "possible leaf spot", "confidence": 0.72},
                                        {"label": "unscored observation", "confidence": "0.9"},
                                    ],
                                    "limitations": ["Visible symptoms only."],
                                }
                            )
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 5,
                    "completion_tokens": 5,
                    "total_tokens": 10,
                    "estimated_cost_usd": 0.002,
                },
            },
        )

    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        "app.modules.image_analysis.model.httpx.AsyncClient",
        lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    model = HttpVisionLanguageModel(settings)

    async def scenario():
        return await model.analyze(
            ModelAnalysisInput(
                content=PNG_BYTES,
                mime_type="image/png",
                subject_type="leaf",
                analysis_kind="disease",
                crop="rice",
                region="",
                question="",
                language="en",
            )
        )

    result = asyncio.run(scenario())
    assert result.status == "ok"
    assert result.model == "vision-test-v1"
    assert result.modelVersion == "vision-test-v1"
    assert result.restrictedContentRemoved is True
    assert "spray" not in result.observations.lower()
    assert "confirmed diagnosis" not in result.observations.lower()
    assert "leaves show spots" in result.observations.lower()
    assert result.warnings
    assert result.candidates[0].confidence == 0.72
    assert result.candidates[0].confidenceBasis == "model_reported_uncalibrated"
    assert result.candidates[1].confidence is None
    assert result.candidates[1].confidenceBasis == "not_reported"
    assert result.usage["totalTokens"] == 10
    assert result.usage["costBasis"] == "provider_reported"

    screened, removed = screen_observations("Apply 2 ml dose. Leaves show spots.")
    assert removed is True
    assert screened == "Leaves show spots."


def test_feedback_and_expert_review_are_recorded_and_tenant_scoped() -> None:
    service = build_container().image_analysis

    async def scenario():
        analysis = await service.analyze(
            image_request(), trusted_organization_id=ORG_OWN, trace_id="trace-review"
        )
        feedback = service.record_feedback(
            ImageFeedbackInput(
                analysisId=analysis.analysisId,
                traceId=analysis.traceId,
                rating=2,
                comment="Needs an expert opinion.",
                labels=["needs-review"],
            ),
            trusted_organization_id=ORG_OWN,
            user_id="user-own",
        )
        review = service.request_review(
            ExpertReviewRequest(analysisId=analysis.analysisId, priority="urgent"),
            trusted_organization_id=ORG_OWN,
            user_id="user-own",
        )
        decision = service.decide_review(
            ExpertReviewDecision(
                reviewId=review.reviewId,
                decision="needs_followup",
                reviewer="agronomist-1",
                notes="Request clearer image.",
            ),
            trusted_organization_id=ORG_OWN,
        )
        stored = service.get_review(review.reviewId, trusted_organization_id=ORG_OWN)
        return analysis, feedback, review, decision, stored

    analysis, feedback, review, decision, stored = asyncio.run(scenario())
    assert feedback["accepted"] is True
    assert review.status == "pending"
    assert decision.status == "needs_followup"
    assert stored.decision == "needs_followup"
    assert stored.reviewer == "agronomist-1"
    assert stored.evidenceSummary["referenceCount"] == 0
    assert stored.predictionSummary["modelVersion"] == "none"
    assert analysis.analysisId == stored.analysisId

    with pytest.raises(UnauthorizedError):
        service.get_review(review.reviewId, trusted_organization_id=ORG_OTHER)
    with pytest.raises(UnauthorizedError):
        service.record_feedback(
            ImageFeedbackInput(analysisId=analysis.analysisId, rating=3),
            trusted_organization_id=ORG_OTHER,
        )
    with pytest.raises(DocumentError):
        service.decide_review(
            ExpertReviewDecision(
                reviewId=review.reviewId, decision="approved", reviewer="other"
            ),
            trusted_organization_id=ORG_OWN,
        )


def test_evaluation_framework_scores_only_observed_callbacks() -> None:
    container = build_container()
    framework: EvaluationFrameworkService = container.evaluation_framework

    async def scenario():
        return await framework.run(
            "all",
            container.evaluation_callbacks(organization_id=ORG_OWN, trace_id="trace-all-suites"),
            trusted_organization_id=ORG_OWN,
            model_versions={"llm": "mock-model-v1"},
            prompt_versions={"ask.en": "1.0.0"},
        )

    run = asyncio.run(scenario())
    assert run.caseCount == len(run.caseResults) == 18
    assert len(run.datasetIds) == 9
    assert 0.0 <= run.metrics["passRate"] <= 1.0
    assert run.scoresManufactured is False
    assert run.accuracyClaimed is False
    assert run.evaluated is True
    assert run.modelVersions == {"llm": "mock-model-v1"}
    assert run.promptVersions == {"ask.en": "1.0.0"}
    assert all(item.observed.get("latencyMs", 0) >= 0 for item in run.caseResults)
    assert any("callbacks executed during this run" in item for item in run.limitations)
    assert framework.get_run(run.runId, trusted_organization_id=ORG_OWN).runId == run.runId
    with pytest.raises(UnauthorizedError):
        framework.get_run(run.runId, trusted_organization_id=ORG_OTHER)


def test_regression_comparison_feedback_and_dashboard_use_recorded_runs() -> None:
    container = build_container()
    framework: EvaluationFrameworkService = container.evaluation_framework

    async def good_retrieve(**_: object) -> dict[str, object]:
        return {"rankedIds": ["eval-unified-doc", "bn-irrigation-doc"], "latencyMs": 2.0}

    async def empty_retrieve(**_: object) -> dict[str, object]:
        return {"rankedIds": [], "latencyMs": 3.0}

    async def scenario():
        baseline_run = await framework.run(
            "retrieval",
            {"retrieve": good_retrieve},
            trusted_organization_id=ORG_OWN,
            model_versions={"llm": "model-v1"},
        )
        current_run = await framework.run(
            "retrieval",
            {"retrieve": empty_retrieve},
            trusted_organization_id=ORG_OWN,
            model_versions={"llm": "model-v2"},
        )
        return baseline_run, current_run

    baseline_run, current_run = asyncio.run(scenario())
    assert baseline_run.metrics["passRate"] > current_run.metrics["passRate"]

    regression = RegressionService()
    baseline = regression.set_baseline(baseline_run, trusted_organization_id=ORG_OWN)
    report = regression.compare(
        current_run, baseline_id=baseline.baselineId, trusted_organization_id=ORG_OWN
    )
    assert baseline.metrics == baseline_run.metrics
    assert report.comparable is True
    assert any(item["metric"] == "passRate" and item["regressed"] for item in report.regressions)
    assert any("Model versions differ" in item for item in report.comparabilityNotes)
    with pytest.raises(UnauthorizedError):
        regression.get_baseline(baseline.baselineId, trusted_organization_id=ORG_OTHER)

    comparison = ModelComparisonService().compare([baseline_run, current_run])
    assert comparison.comparable is True
    assert any(item["metric"] == "passRate" for item in comparison.deltas)
    assert comparison.runs[0]["evaluated"] is True

    collector = HumanFeedbackCollector(container.settings)
    feedback = collector.record(
        HumanFeedbackInput(
            traceId="trace-all-suites",
            rating=2,
            labels=["not-grounded"],
            runId=current_run.runId,
        ),
        trusted_organization_id=ORG_OWN,
        user_id="user-own",
    )
    assert feedback.organizationId == ORG_OWN
    assert collector.summary()["feedbackCount"] == 1
    assert collector.for_trace("trace-all-suites")[0].labels == ["not-grounded"]

    monitor = AgentExecutionMonitor()
    monitor.record(
        trace_id="trace-agent-failure",
        result={
            "status": "blocked",
            "executionTrace": [{"status": "error", "error": "tool_denied"}],
            "toolCalls": [],
        },
        latency_ms=5.0,
    )
    assert monitor.snapshot()["errorRate"] == 1.0
    assert monitor.failures()[0]["errors"]

    container.retrieval_diagnostics.monitoring.record_retrieval(
        trace_id="trace-diagnostics",
        query="rice irrigation",
        language="en",
        intent="retrieval",
        ranked_chunk_ids=["chunk-1"],
        scores=[0.8],
        backends={"vector": "ok"},
        latency_ms=4.0,
        result_count=1,
        insufficient_evidence=False,
        filters={},
        deduplication_removed=0,
        expansion_count=0,
    )
    dashboard = FailureAnalysisService(
        runs=framework,
        feedback=collector,
        agent_monitor=monitor,
        monitoring=container.monitoring,
        retrieval_diagnostics=container.retrieval_diagnostics,
    ).dashboard(trusted_organization_id=ORG_OWN)
    assert dashboard["basedOnRecordedRunsOnly"] is True
    assert dashboard["scoresManufactured"] is False
    assert dashboard["failureAnalysis"]["evaluationFailures"] >= 1
    assert dashboard["retrievalDiagnostics"]["retrievals"] >= 1
    assert dashboard["failureAnalysis"]["agentExecutionFailures"] == 1


def test_prompt_versions_are_registered_and_attributed_to_runs() -> None:
    registry = PromptVersionRegistry()
    first = registry.register(
        key="ask.en", version="1.0.0", system="advisory", user_template="{question}", activate=True
    )
    second = registry.register(
        key="ask.en", version="1.1.0", system="advisory v2", user_template="{question}"
    )
    assert registry.resolve("ask.en").version == "1.0.0"
    activated = registry.activate("ask.en", "1.1.0")
    assert activated.version == "1.1.0"
    assert registry.snapshot() == {"ask.en": "1.1.0"}
    assert first.contentHash != second.contentHash
    assert [item["version"] for item in registry.describe()] == ["1.0.0", "1.1.0"]
    with pytest.raises(DocumentError):
        registry.register(
            key="ask.en", version="1.0.0", system="duplicate", user_template="{question}"
        )

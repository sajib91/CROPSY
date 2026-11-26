import asyncio
import base64
import math

import pytest
from pydantic import SecretStr

from app.config import Settings
from app.errors import ConfigurationError, IntegrationUnavailableError, RateLimitError
from app.models import Language, LLMRequest
from app.modules.documents import chunk_text, classify_document, detect_language
from app.modules.embeddings import EmbeddingService
from app.modules.evaluation import EvaluationMonitoringService, FeedbackInput
from app.modules.llm_provider import LLMProviderManager, MockLLMProvider
from app.modules.model_config import ModelRegistry
from app.modules.multimodal import MultimodalInput, MultimodalProcessingService
from app.modules.prompt import PromptManager
from app.modules.reranking import RerankingService
from app.rate_limit import SlidingWindowRateLimiter
from app.security import build_signature_base
from app.tracing import Tracer


class FakeLlm:
    provider_name = "fake"

    def __init__(self, text: str) -> None:
        self.text = text

    async def generate(self, request, model):
        from app.models import LLMResponse, Usage

        return LLMResponse(
            text=self.text,
            model=model,
            provider=self.provider_name,
            usage=Usage(provider=self.provider_name, model=model),
        )


def test_signature_base_is_canonical() -> None:
    import hashlib

    body = b'{"a":1}'
    base = build_signature_base("POST", "/api/v1/internal/ask", "123", body)
    assert base == (
        f"POST\n/api/v1/internal/ask\n123\n{hashlib.sha256(body).hexdigest()}"
    )


def test_rate_limiter_blocks_excess_requests() -> None:
    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60)
    assert limiter.check("client")["remaining"] == 1
    assert limiter.check("client")["remaining"] == 0
    with pytest.raises(RateLimitError):
        limiter.check("client")


def test_model_registry_supports_explicit_and_task_selection() -> None:
    settings = Settings(environment="test", allow_mock_provider=True)
    registry = ModelRegistry(settings)
    assert registry.resolve("advisory-local").provider == "mock"
    assert registry.resolve(task="recommend").key == "advisory-local"
    with pytest.raises(ConfigurationError):
        registry.resolve("missing-model")


def test_production_rejects_mock_providers_unless_explicitly_allowed() -> None:
    settings = Settings(
        environment="production",
        llm_provider="mock",
        embedding_provider="deterministic",
        allow_mock_provider=False,
        internal_service_secret=SecretStr("strong-production-secret-at-least-32-chars"),
        graph_backend="neo4j",
        neo4j_uri="bolt://neo4j.test:7687",
        neo4j_user="neo4j",
        neo4j_password=SecretStr("test-neo4j-password"),
    )
    with pytest.raises(ConfigurationError):
        LLMProviderManager(settings).resolve()
    with pytest.raises(ConfigurationError):
        EmbeddingService(settings).resolve()


def test_prompt_manager_rejects_missing_variables() -> None:
    prompts = PromptManager()
    system, rendered, version = prompts.render(
        "ask.en",
        {"question": "q", "context": "c", "evidence": "e"},
    )
    assert "q" in rendered and version == "1.0.0"
    assert "agricultural advisory" in system
    with pytest.raises(ConfigurationError):
        prompts.render("ask.en", {"question": "q"})


def test_deterministic_embeddings_are_normalized_and_support_bengali() -> None:
    service = EmbeddingService(Settings(environment="test", embedding_dimensions=64))
    vectors, usage = asyncio.run(service.embed(["ধান সেচ", "rice irrigation"]))
    assert len(vectors) == 2
    assert all(len(vector) == 64 for vector in vectors)
    assert all(math.isclose(math.sqrt(sum(v * v for v in vector)), 1.0, abs_tol=1e-6) for vector in vectors)
    assert usage["provider"] == "deterministic"


def test_chunking_and_language_detection() -> None:
    text = ("paragraph one " * 120) + "\n\n" + ("paragraph two " * 120)
    chunks = chunk_text(text, max_chars=200, overlap=40)
    assert chunks
    assert all(len(chunk) <= 200 for _, chunk in chunks)
    assert detect_language("ধান চাষের নির্দেশিকা", "en") == "bn"


def test_classification_is_transparent_and_does_not_invent_sources() -> None:
    kind, confidence = classify_document(
        "Soil note",
        "Soil pH and organic matter management guidance for rice fields.",
        "other",
    )
    assert kind == "soil_management"
    assert 0 < confidence <= 0.95


def test_reranking_keeps_only_supplied_evidence() -> None:
    from app.modules.knowledge import build_citation
    from app.models import DocumentChunk, DocumentRecord, EvidenceChunk, Provenance, SourceMetadata, LicenseMetadata

    provenance = Provenance(
        source=SourceMetadata(
            name="Test source",
            url="https://example.test/doc",
            publisher="Test publisher",
            publishedAt="2026-01-01",
        ),
        license=LicenseMetadata(code="CC-BY-4.0", url="https://example.test/license", verified=True),
        contentHash="0" * 64,
    )
    record = DocumentRecord(
        documentId="doc-x",
        title="Rice irrigation",
        documentType="crop_cultivation_guideline",
        classifiedType="crop_cultivation_guideline",
        language="en",
        version="v1",
        status="VERIFIED",
        provenance=provenance,
        text="Irrigate rice fields according to soil moisture.",
    )
    chunk = DocumentChunk(
        chunkId="doc-x:v1:0",
        documentId="doc-x",
        version="v1",
        text=record.text,
        position=0,
        language="en",
        citationEligible=True,
    )
    evidence = EvidenceChunk(
        chunkId=chunk.chunkId,
        documentId="doc-x",
        version="v1",
        text=chunk.text,
        section="",
        language="en",
        score=0.5,
        citation=build_citation(record, chunk, 0.5),
    )
    reranked = asyncio.run(
        RerankingService().rerank("rice irrigation", [evidence], top_k=1)
    )
    assert len(reranked) == 1
    assert reranked[0].citation.documentId == "doc-x"


def test_ocr_dependency_missing_fails_explicitly() -> None:
    service = MultimodalProcessingService(Settings(environment="test"))
    value = MultimodalInput(
        mimeType="image/png",
        filename="field.png",
        task="ocr",
        contentBase64=base64.b64encode(b"not-an-image").decode("ascii"),
    )
    with pytest.raises(IntegrationUnavailableError):
        asyncio.run(service.process(value, trace_id="trace-ocr"))


def test_evaluation_and_tracing_record_usage() -> None:
    from app.models import Usage

    tracer = Tracer(10)
    monitoring = EvaluationMonitoringService(10)
    trace_id = tracer.new_trace_id()
    with tracer.span(trace_id, "unit.step", value=1):
        monitoring.record_generation(
            trace_id=trace_id,
            task="ask",
            usage=Usage(totalTokens=12, estimatedCostUsd=0.01),
            latency_ms=2.5,
        )
    monitoring.record_feedback(
        FeedbackInput(traceId=trace_id, rating=5, organizationId="org", userId="user")
    )
    assert tracer.for_trace(trace_id)[0]["name"] == "unit.step"
    assert monitoring.snapshot()["totalTokens"] == 12
    assert monitoring.snapshot()["averageRating"] == 5.0


def test_answer_sanitizer_removes_unverified_references() -> None:
    from app.modules.recommendations import sanitize_answer

    cleaned = sanitize_answer(
        "Visit https://fabricated.example.test. [citation invented source]",
        [],
    )
    assert "fabricated.example.test" not in cleaned
    assert "[citation" not in cleaned


def test_mock_llm_is_explicitly_advisory() -> None:
    response = asyncio.run(
        MockLLMProvider().generate(
            LLMRequest(prompt="Question only", systemPrompt="system"),
            "cropsy-deterministic-advisory-v1",
        )
    )
    assert response.advisory is True
    assert "cannot provide" in response.text

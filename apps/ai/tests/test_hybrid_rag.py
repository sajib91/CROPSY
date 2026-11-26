import asyncio
import json
import math
from pathlib import Path

import pytest
from pydantic import SecretStr

from app.config import Settings
from app.models import DocumentChunk, DocumentRecord, EvidenceChunk, LicenseMetadata, Provenance, SourceMetadata
from app.modules.assistant import AssistantChatInput, AgriculturalAssistantService
from app.modules.conversation import InMemoryConversationStore
from app.modules.evaluation import EvaluationMonitoringService
from app.modules.knowledge import KnowledgeBaseService, build_citation
from app.modules.llm_provider import LLMProviderManager
from app.modules.model_config import ModelRegistry
from app.modules.prompt import PromptManager
from app.modules.query_understanding import QueryUnderstandingService
from app.modules.reranking import HttpBgeRankingProvider, RerankingService
from app.modules.retrieval import RetrievalEngine, RetrievalOptions
from app.modules.retrieval_evaluation import (
    RelevanceJudgment,
    RetrievalDataset,
    RetrievalEvaluationService,
)
from app.tracing import Tracer

FIXTURES = (
    Path(__file__).resolve().parents[1]
    / "evaluation"
    / "fixtures"
    / "documents.json"
)
DATASET = (
    Path(__file__).resolve().parents[1]
    / "evaluation"
    / "datasets"
    / "hybrid-retrieval-v1.json"
)


def build_settings() -> Settings:
    return Settings(
        environment="test",
        allow_mock_provider=True,
        embedding_dimensions=64,
        retrieval_fetch_k=20,
        retrieval_max_query_variants=3,
        reranker_provider="lexical",
        internal_service_secret=SecretStr("test-ai-service-secret-at-least-32"),
    )


def build_stack(settings: Settings | None = None):
    from app.infrastructure.keyword_index import InMemoryKeywordIndex
    from app.infrastructure.vector_store import InMemoryVectorIndex
    from app.modules.documents import DocumentProcessingInput
    from app.modules.embeddings import EmbeddingService

    active = settings or build_settings()
    tracer = Tracer(500)
    monitoring = EvaluationMonitoringService(500)
    embeddings = EmbeddingService(active)
    vector = InMemoryVectorIndex()
    keyword = InMemoryKeywordIndex()
    understanding = QueryUnderstandingService(max_variants=3)
    retrieval = RetrievalEngine(
        vector_index=vector,
        keyword_index=keyword,
        embeddings=embeddings,
        settings=active,
        query_understanding=understanding,
    )
    reranking = RerankingService(active)
    knowledge = KnowledgeBaseService(
        settings=active,
        embeddings=embeddings,
        retrieval=retrieval,
        reranking=reranking,
        vector_index=vector,
        keyword_index=keyword,
        monitoring=monitoring,
        tracer=tracer,
    )

    async def ingest_fixtures() -> None:
        for payload in json.loads(FIXTURES.read_text(encoding="utf-8")):
            await knowledge.ingest(DocumentProcessingInput(**payload))

    return {
        "settings": active,
        "tracer": tracer,
        "monitoring": monitoring,
        "knowledge": knowledge,
        "retrieval": retrieval,
        "reranking": reranking,
        "understanding": understanding,
        "ingest_fixtures": ingest_fixtures,
    }


def make_evidence(document_id: str, text: str, score: float) -> EvidenceChunk:
    provenance = Provenance(
        source=SourceMetadata(
            name="Test extension service",
            url=f"https://example.test/{document_id}",
            publisher="Test publisher",
            publishedAt="2026-01-01",
            jurisdiction="Bangladesh",
        ),
        license=LicenseMetadata(
            code="CC-BY-4.0",
            url="https://example.test/license",
            verified=True,
        ),
        contentHash="1" * 64,
    )
    record = DocumentRecord(
        documentId=document_id,
        title=document_id,
        documentType="government_publication",
        classifiedType="government_publication",
        language="en",
        version="v1",
        status="VERIFIED",
        provenance=provenance,
        text=text,
    )
    chunk = DocumentChunk(
        chunkId=f"{document_id}:v1:0",
        documentId=document_id,
        version="v1",
        text=text,
        position=0,
        language="en",
        citationEligible=True,
    )
    return EvidenceChunk(
        chunkId=chunk.chunkId,
        documentId=document_id,
        version="v1",
        text=text,
        section="",
        language="en",
        score=score,
        citation=build_citation(record, chunk, score),
    )


def build_assistant(stack: dict) -> AgriculturalAssistantService:
    settings = stack["settings"]
    return AgriculturalAssistantService(
        knowledge=stack["knowledge"],
        llms=LLMProviderManager(settings),
        models=ModelRegistry(settings),
        prompts=PromptManager(),
        tracer=stack["tracer"],
        monitoring=stack["monitoring"],
        conversations=InMemoryConversationStore(),
        understanding=QueryUnderstandingService(max_variants=3),
    )


def test_query_understanding_expands_and_resolves_follow_ups() -> None:
    service = QueryUnderstandingService(max_variants=3)
    english = service.understand("rice irrigation guidance", language="en")
    assert english.intent == "irrigation"
    assert english.expandedQueries[0] == english.resolvedQuery
    assert len(english.expandedQueries) > 1

    bengali = service.understand("ধান সেচের নির্দেশিকা", language="bn")
    assert bengali.language == "bn"
    assert any(any("\u0980" <= char <= "\u09ff" for char in item) for item in bengali.expandedQueries)

    history = [
        {"role": "user", "content": "How should I irrigate rice?"},
        {"role": "assistant", "content": "Use verified local guidance."},
    ]
    follow_up = service.understand(
        "What about fertilizer?",
        language="en",
        history=history,
    )
    assert follow_up.isFollowUp is True
    assert "irrigate rice" in follow_up.resolvedQuery


def test_hybrid_retrieval_reports_diagnostics_and_enforces_filters() -> None:
    stack = build_stack()
    asyncio.run(stack["ingest_fixtures"]())
    knowledge = stack["knowledge"]

    result = asyncio.run(
        knowledge.retrieve_detailed(
            "soil test based fertilizer dose",
            language="en",
            top_k=3,
            options=RetrievalOptions(
                documentTypes=["fertilizer_recommendation", "soil_management"],
                region="Dhaka",
            ),
            trace_id="trace-hybrid",
        )
    )
    assert result.evidence
    assert result.diagnostics.vectorHits + result.diagnostics.keywordHits > 0
    assert result.diagnostics.fusedCandidates >= result.diagnostics.deduplicatedCandidates
    assert result.diagnostics.backends["vector"] == "memory"
    assert result.diagnostics.backends["keyword"] == "memory"
    assert result.diagnostics.insufficientEvidence is False
    assert stack["monitoring"].snapshot()["retrievals"] >= 1
    for item in result.evidence:
        assert item.citation.sourceUrl
        assert item.citation.licenseCode
        assert item.citation.jurisdiction == "Bangladesh"
        assert 0.0 <= item.score <= 1.0

    filtered = asyncio.run(
        knowledge.retrieve_detailed(
            "soil test fertilizer",
            language="en",
            top_k=5,
            options=RetrievalOptions(
                sources=["National Soil Research Test Institute"]
            ),
        )
    )
    assert filtered.evidence
    assert all(
        item.citation.sourceName == "National Soil Research Test Institute"
        for item in filtered.evidence
    )

    rrf = asyncio.run(
        knowledge.retrieve_detailed(
            "rice irrigation",
            language="en",
            top_k=3,
            options=RetrievalOptions(
                fusionMethod="rrf",
                vectorWeight=0.5,
                keywordWeight=0.5,
            ),
        )
    )
    assert rrf.diagnostics.fusionMethod == "rrf"
    assert rrf.diagnostics.weights == {"vector": 0.5, "keyword": 0.5}


def test_context_deduplication_suppresses_near_duplicate_documents() -> None:
    stack = build_stack()
    from app.modules.documents import DocumentProcessingInput

    payloads = json.loads(FIXTURES.read_text(encoding="utf-8"))
    first = dict(payloads[0])
    first["documentId"] = "eval-duplicate-a"
    second = dict(payloads[0])
    second["documentId"] = "eval-duplicate-b"
    for payload in (first, second):
        asyncio.run(stack["knowledge"].ingest(DocumentProcessingInput(**payload)))

    result = asyncio.run(
        stack["knowledge"].retrieve_detailed(
            "upland rice cultivation certified seed",
            language="en",
            top_k=10,
            options=RetrievalOptions(
                documentTypes=["crop_cultivation_guideline"],
                deduplicationThreshold=0.8,
            ),
        )
    )
    duplicate_ids = {
        item.documentId
        for item in result.evidence
        if item.documentId in {"eval-duplicate-a", "eval-duplicate-b"}
    }
    assert len(duplicate_ids) <= 1
    assert result.diagnostics.deduplicationRemoved >= 1


def test_bge_reranker_parses_scores_without_exposing_credentials() -> None:
    settings = build_settings()
    seen: dict[str, object] = {}

    async def fake_post(path, payload, headers):
        seen.update({"path": path, "payload": payload, "headers": headers})
        return {
            "results": [
                {"index": 1, "relevance_score": 0.95},
                {"index": 0, "relevance_score": 0.1},
            ]
        }

    provider = HttpBgeRankingProvider(
        base_url="http://bge.test",
        model="BAAI/bge-reranker-v2-m3",
        api_key="never-expose-this-key",
        timeout_seconds=1,
        max_attempts=1,
        base_delay_seconds=0,
        max_delay_seconds=0,
        post=fake_post,
    )
    scores = asyncio.run(provider.rank("rice irrigation", ["a", "b"]))
    assert scores == [0.1, 0.95]
    assert seen["path"] == "/rerank"
    assert seen["headers"]["authorization"] == "Bearer never-expose-this-key"

    service = RerankingService(settings, provider)
    evidence = [
        make_evidence("doc-a", "rice irrigation water", 0.5),
        make_evidence("doc-b", "rice irrigation schedule", 0.5),
    ]
    reranked = asyncio.run(service.rerank("rice irrigation", evidence, top_k=2))
    assert reranked[0].documentId == "doc-b"
    assert "never-expose-this-key" not in json.dumps(service.describe())


def test_retrieval_metrics_are_computed_not_claimed() -> None:
    service = RetrievalEvaluationService()
    judgment = RelevanceJudgment(
        queryId="q1",
        query="soil test fertilizer",
        relevantDocumentIds=["a", "b"],
    )
    metrics = service.score_query(judgment, ["c", "a", "d", "b"], top_k=4)
    assert metrics.precisionAtK == 0.5
    assert metrics.recallAtK == 1.0
    assert metrics.mrr == 0.5
    ideal = 1.0 + 1.0 / math.log2(3)
    expected = (1.0 / math.log2(3) + 1.0 / math.log2(5)) / ideal
    assert metrics.ndcgAtK == round(expected, 6)

    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    judgments = [RelevanceJudgment(**item) for item in dataset["queries"]]

    async def retrieve(query: str, language: str) -> list[str]:
        match = next(item for item in judgments if item.query == query)
        return [*match.relevantDocumentIds, "eval-extra"]

    result = asyncio.run(
        service.evaluate(
            judgments,
            retrieve,
            top_k=5,
            dataset_id=dataset["datasetId"],
            dataset_version=dataset["version"],
        )
    )
    assert result.queryCount == 8
    assert result.accuracyClaimed is False
    assert set(result.metrics) == {"recallAtK", "precisionAtK", "mrr", "ndcgAtK"}
    assert result.metrics["recallAtK"] == 1.0
    assert any("No production accuracy claim" in item for item in result.limitations)


def test_assistant_supports_conversation_follow_ups_and_no_answer() -> None:
    stack = build_stack()
    asyncio.run(stack["ingest_fixtures"]())
    assistant = build_assistant(stack)

    first = asyncio.run(
        assistant.chat(
            AssistantChatInput(
                message="How should upland rice be sown?",
                language="en",
                topK=3,
            ),
            trace_id="trace-chat-1",
            organization_id="org-1",
            user_id="user-1",
        )
    )
    assert first.status == "ok"
    assert first.advisory is True
    assert first.citations
    assert first.facts
    assert all(claim.status == "source_supported" for claim in first.facts)

    follow_up = asyncio.run(
        assistant.chat(
            AssistantChatInput(
                message="What about soil testing?",
                language="en",
                conversationId=first.conversationId,
                topK=3,
            ),
            trace_id="trace-chat-2",
            organization_id="org-1",
            user_id="user-1",
        )
    )
    assert follow_up.isFollowUp is True
    assert "upland rice" in follow_up.resolvedQuery
    conversation = asyncio.run(
        assistant.get_conversation(
            first.conversationId,
            organization_id="org-1",
            user_id="user-1",
        )
    )
    assert len(conversation.messages) == 4

    no_answer = asyncio.run(
        assistant.chat(
            AssistantChatInput(
                message="fertilizer guidance",
                language="en",
                documentTypes=["not_a_valid_source_type"],
            ),
            trace_id="trace-chat-3",
            organization_id="org-1",
            user_id="user-1",
        )
    )
    assert no_answer.status == "insufficient_evidence"
    assert no_answer.citations == []


def test_assistant_guards_chemicals_diagnosis_and_predictions() -> None:
    stack = build_stack()
    asyncio.run(stack["ingest_fixtures"]())
    assistant = build_assistant(stack)

    chemical = asyncio.run(
        assistant.chat(
            AssistantChatInput(
                message="What pesticide dosage should I use for rice stem borer?",
                language="en",
                region="Dhaka",
                documentTypes=["pest_management"],
                topK=3,
            ),
            trace_id="trace-safety-1",
            organization_id="org-1",
            user_id="user-1",
        )
    )
    assert chemical.status == "ok"
    categories = {note.category for note in chemical.safetyNotes}
    assert {"pesticide", "local_evidence"}.issubset(categories)
    assert any("registered" in note.message for note in chemical.safetyNotes)

    diagnosis = asyncio.run(
        assistant.chat(
            AssistantChatInput(
                message="What disease is this? Grey spots on rice leaves.",
                language="en",
                documentTypes=["disease_management"],
                topK=3,
            ),
            trace_id="trace-safety-2",
            organization_id="org-1",
            user_id="user-1",
        )
    )
    assert "diagnosis" in {note.category for note in diagnosis.safetyNotes}
    assert "diagnosis_unconfirmed" in {
        warning.code for warning in diagnosis.uncertainties
    }

    market = asyncio.run(
        assistant.chat(
            AssistantChatInput(
                message="Paddy market price outlook",
                language="en",
                documentTypes=["market_intelligence"],
                topK=3,
            ),
            trace_id="trace-safety-3",
            organization_id="org-1",
            user_id="user-1",
        )
    )
    assert market.predictions
    assert all(claim.status == "uncertain" for claim in market.predictions)
    assert "prediction_not_guaranteed" in {
        warning.code for warning in market.uncertainties
    }


def test_production_retrieval_requires_real_backends_and_bge() -> None:
    from app.errors import ConfigurationError
    from app.modules.retrieval import require_production_retrieval

    stack = build_stack()
    production = Settings(
        environment="production",
        internal_service_secret=SecretStr("strong-production-secret-at-least-32-chars"),
        llm_provider="http",
        llm_base_url="http://llm.test",
        embedding_provider="http",
        embedding_base_url="http://embed.test",
        graph_backend="neo4j",
        neo4j_uri="bolt://neo4j.test:7687",
        neo4j_user="neo4j",
        neo4j_password=SecretStr("test-neo4j-password"),
    )
    with pytest.raises(ConfigurationError) as error:
        require_production_retrieval(stack["retrieval"], production)
    assert "Qdrant" in str(error.value)
    assert "BGE" in str(error.value)

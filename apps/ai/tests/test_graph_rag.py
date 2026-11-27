import asyncio

import pytest
from pydantic import SecretStr

from app.config import Settings
from app.errors import UnauthorizedError
from app.infrastructure.graph_store import InMemoryGraphStore
from app.modules.graph_rag import (
    GraphExtractionRequest,
    GraphRAGService,
    GraphRetrievalRequest,
)
from app.modules.knowledge import KnowledgeBaseService
from app.modules.llm_provider import LLMProviderManager
from app.modules.model_config import ModelRegistry


def build_service() -> GraphRAGService:
    settings = Settings(
        environment="test",
        allow_mock_provider=True,
        graph_backend="memory",
        graph_confidence_threshold=0.6,
        internal_service_secret=SecretStr("test-ai-service-secret-at-least-32"),
    )
    return GraphRAGService(
        store=InMemoryGraphStore(),
        knowledge=KnowledgeBaseService(settings=settings),
        llms=LLMProviderManager(settings),
        models=ModelRegistry(settings),
        settings=settings,
    )


def extraction() -> GraphExtractionRequest:
    return GraphExtractionRequest(
        text=(
            "Rice blast affects rice. Agricultural research has evidence for rice blast. "
            "Expert recommendation recommends irrigation for rice."
        ),
        source="Ministry agriculture note",
        sourceReference="agr-note-v1",
        organizationId="org-own",
    )


def test_graph_build_never_promotes_caller_claimed_verification() -> None:
    service = build_service()

    async def scenario() -> None:
        # Caller verification flags are rejected by the DTO; direct internal
        # callers have no field with which to self-certify source status.
        result = await service.build(value=extraction(), trusted_organization_id="org-own")
        assert result.status == "built"
        assert result.nodesWritten >= 3
        assert result.relationshipsWritten >= 1
        assert result.verifiedRelationships == 0
        assert result.validation.requiresApproval is False
        classes = {item["evidenceClass"] for item in result.validation.accepted}
        assert classes == {"candidate_extraction"}

        # Candidate-only graph edges are opt-in for retrieval, but they are
        # always labelled unverified and never validated by this build path.
        retrieval = await service.retrieve(
            GraphRetrievalRequest(
                query="rice blast",
                organizationIds=["org-own"],
                includeGlobal=False,
                includeCandidates=True,
            ),
            trusted_organization_id="org-own",
        )
        assert retrieval.evidence
        assert all(not item.verified for item in retrieval.evidence)
        assert all(not item.validated for item in retrieval.evidence)

        verified = await service.retrieve(
            GraphRetrievalRequest(
                query="rice blast",
                organizationIds=["org-own"],
                includeGlobal=False,
                verifiedOnly=True,
            ),
            trusted_organization_id="org-own",
        )
        assert verified.evidence == []

    asyncio.run(scenario())


def test_graph_requests_cannot_cross_organization_scope() -> None:
    service = build_service()

    async def scenario() -> None:
        with pytest.raises(UnauthorizedError):
            await service.retrieve(
                GraphRetrievalRequest(
                    query="rice",
                    organizationIds=["org-other"],
                    includeGlobal=False,
                ),
                trusted_organization_id="org-own",
            )
        with pytest.raises(UnauthorizedError):
            await service.build(
                value=extraction(),
                trusted_organization_id="org-other",
            )

    asyncio.run(scenario())


def test_graph_capabilities_disclose_provenance_policy() -> None:
    description = build_service().describe()
    assert description["policies"]["tenantScopeEnforced"] is True
    assert description["policies"]["humanApprovalRequiredForVerifiedRelationship"] is True
    assert "HAS_EVIDENCE" in description["relationships"]
    assert "CropVariety" in description["entities"]

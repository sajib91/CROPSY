import asyncio

import pytest
from pydantic import SecretStr

from app.config import Settings
from app.errors import UnauthorizedError
from app.infrastructure.graph_store import InMemoryGraphStore
from app.modules.graph_rag import (
    GraphApproval,
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
        documentStatus="verified",
        licenseVerified=True,
        organizationId="org-own",
    )


def test_graph_build_keeps_llm_extractions_unverified_until_human_approval() -> None:
    service = build_service()

    async def scenario() -> None:
        result = await service.build(value=extraction(), trusted_organization_id="org-own")
        assert result.status == "awaiting_approval"
        assert result.nodesWritten >= 3
        assert result.relationshipsWritten >= 1
        assert result.verifiedRelationships == 0
        assert result.validation.requiresApproval is True
        classes = {item["evidenceClass"] for item in result.validation.accepted}
        assert "verified_relationship" not in classes
        assert "validated_extraction" in classes

        retrieval = await service.retrieve(
            GraphRetrievalRequest(
                query="rice blast",
                organizationIds=["org-own"],
                includeGlobal=False,
            ),
            trusted_organization_id="org-own",
        )
        assert retrieval.evidence
        assert all(not item.verified for item in retrieval.evidence)
        assert "not scientific facts" in " ".join(retrieval.limitations)

        approval = GraphApproval(
            approvalId="approval-graph-1",
            approvedBy="agronomist-1",
            decision="approved",
            scope=[str(item["id"]) for item in result.validation.accepted],
        )
        approved = await service.build(
            value=extraction(),
            approval=approval,
            trusted_organization_id="org-own",
        )
        assert approved.status == "built"
        assert approved.verifiedRelationships >= 1
        verified = await service.retrieve(
            GraphRetrievalRequest(
                query="rice blast",
                organizationIds=["org-own"],
                includeGlobal=False,
                verifiedOnly=True,
            ),
            trusted_organization_id="org-own",
        )
        assert verified.evidence
        assert all(item.verified for item in verified.evidence)

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

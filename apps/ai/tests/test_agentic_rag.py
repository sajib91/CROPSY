import asyncio

import pytest
from pydantic import SecretStr

from app.config import Settings
from app.container import AiContainer
from app.errors import NotFoundError, UnauthorizedError
from app.modules.agentic_rag import AgenticQueryRequest
from app.modules.documents import DocumentProcessingInput
from app.modules.graph_rag import GraphApproval
from app.modules.agentic_rag.tools import ToolPolicyError, ToolRegistry


def build_container() -> AiContainer:
    settings = Settings(
        environment="test",
        allow_mock_provider=True,
        graph_backend="memory",
        internal_service_secret=SecretStr("test-ai-service-secret-at-least-32"),
        approval_reviewer_ids="user-own",
    )
    return AiContainer(settings)


def document_payload() -> dict:
    return {
        "documentId": "agentic-doc-1",
        "title": "Verified rice blast guidance",
        "documentType": "crop_cultivation_guideline",
        "language": "en",
        "version": "v1",
        "status": "VERIFIED",
        "source": {
            "name": "Agriculture Test Authority",
            "url": "https://example.test/rice-blast",
            "publisher": "Agriculture Test Authority",
            "publishedAt": "2026-02-01",
            "authority": "Government publication",
            "jurisdiction": "Bangladesh",
        },
        "license": {
            "code": "CC-BY-4.0",
            "url": "https://creativecommons.org/licenses/by/4.0/",
            "verified": True,
        },
        "text": "Rice blast affects rice. Use locally verified guidance for irrigation.",
        "mimeType": "text/plain",
        "filename": "agentic-doc-1.txt",
    }


def test_agentic_workflow_uses_evidence_tracks_usage_and_selected_agents() -> None:
    container = build_container()

    async def scenario() -> None:
        await container.knowledge.ingest(DocumentProcessingInput(**document_payload()))
        request = AgenticQueryRequest(
            query="What does verified guidance say about rice blast?",
            language="en",
            useGraph=False,
        )
        result = await container.agentic.run(
            request,
            trace_id="trace-agentic-evidence",
            organization_id="org-own",
            user_id="user-own",
        )
        assert result.status == "ok"
        assert "agricultural_knowledge_retrieval" in result.selectedAgents
        assert "evidence_verification" in result.selectedAgents
        assert "response_generation" in result.selectedAgents
        assert result.evidence
        assert result.usage["totalTokens"] > 0
        assert result.usage["estimatedCostUsd"] >= 0
        assert any(call["tool"] == "hybrid_retrieve" for call in result.toolCalls)
        assert all(
            call["tool"] not in {"create_order", "make_payment", "delete_farm"}
            for call in result.toolCalls
        )
        assert container.tracer.for_trace("trace-agentic-evidence")

    asyncio.run(scenario())


def test_agentic_workflow_is_resumable_after_human_approval() -> None:
    container = build_container()

    async def scenario() -> None:
        request = AgenticQueryRequest(
            query="Rice irrigation guidance",
            language="en",
            useGraph=False,
            requireApproval=True,
        )
        pending = await container.agentic.run(
            request,
            trace_id="trace-agentic-approval",
            organization_id="org-own",
            user_id="user-own",
        )
        assert pending.status == "awaiting_approval"
        assert pending.approvalId

        # Reviewer identity is derived from signed context, never from the body.
        approval = GraphApproval(
            approvalId=pending.approvalId,
            decision="approved",
            scope=["response_generation"],
        )
        with pytest.raises(UnauthorizedError):
            await container.agentic.resume(
                approval,
                trace_id="trace-agentic-approval",
                organization_id="org-own",
                user_id="user-other",
            )
        with pytest.raises(UnauthorizedError):
            await container.agentic.resume(
                approval,
                trace_id="trace-agentic-approval",
                organization_id="org-other",
                user_id="user-own",
            )

        approved = await container.agentic.resume(
            approval,
            trace_id="trace-agentic-approval",
            organization_id="org-own",
            user_id="user-own",
        )
        assert approved.status in {"ok", "insufficient_evidence"}
        assert approved.approval is not None
        assert approved.approval["approvedBy"] == "user-own"

        with pytest.raises(NotFoundError):
            await container.agentic.resume(
                approval.model_copy(update={"approvalId": "approval-unknown"}),
                trace_id="trace-agentic-approval",
                organization_id="org-own",
                user_id="user-own",
            )

    asyncio.run(scenario())


def test_agentic_workflow_does_not_invent_evidence_or_market_values() -> None:
    container = build_container()

    async def scenario() -> None:
        result = await container.agentic.run(
            AgenticQueryRequest(
                query="What is today's rice price in Sylhet?",
                language="en",
                useGraph=False,
            ),
            trace_id="trace-agentic-no-evidence",
            organization_id="org-own",
            user_id="user-own",
        )
        assert result.status == "insufficient_evidence"
        assert "do not have enough verified" in result.answer
        assert result.citations == []
        assert "insufficient_verified_evidence" in result.limitations

    asyncio.run(scenario())


def test_agentic_tool_policy_denies_business_mutations_and_farmer_identifiers() -> None:
    with pytest.raises(ToolPolicyError):
        ToolRegistry.assert_allowed("create_order", {})
    with pytest.raises(ToolPolicyError):
        ToolRegistry.assert_allowed("hybrid_retrieve", {"farmId": "farm-secret"})
    assert ToolRegistry.assert_allowed("hybrid_retrieve", {"topK": 5}) is None

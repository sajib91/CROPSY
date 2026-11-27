"""Regressions for the four intelligence-stack trust boundaries."""

from __future__ import annotations

import asyncio
import json
import time

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.config import Settings
from app.container import AiContainer
from app.errors import UnauthorizedError
from app.middleware import RequestContextMiddleware
from app.modules.agentic_rag import AgenticQueryRequest
from app.modules.graph_rag import GraphApproval, GraphExtractionRequest
from app.modules.multimodal_rag import (
    MultimodalAssetInput,
    MultimodalRAGService,
    MultimodalRetrievalInput,
)
from app.rate_limit import SlidingWindowRateLimiter
from app.schemas.internal import GraphBuildRequest
from app.security import sign_internal_request


def build_settings(**overrides: object) -> Settings:
    defaults: dict[str, object] = {
        "environment": "test",
        "allow_mock_provider": True,
        "graph_backend": "memory",
        "internal_service_secret": SecretStr("test-ai-service-secret-at-least-32"),
    }
    defaults.update(overrides)
    return Settings(**defaults)


def asset(asset_id: str, text: str, version: str = "v1") -> MultimodalAssetInput:
    return MultimodalAssetInput.model_validate(
        {
            "assetId": asset_id,
            "title": f"Unverified note for {asset_id}",
            "mimeType": "text/plain",
            "documentType": "research_paper",
            "source": {"name": "Unknown contributor"},
            "license": {"code": "CC-BY-4.0", "url": "https://example.test/license"},
            "text": text,
            "version": version,
            # Caller assertions must never make this record citable.
            "status": "VERIFIED",
        }
    )


def test_multimodal_input_strips_self_certification() -> None:
    value = MultimodalAssetInput.model_validate(
        {
            "assetId": "asset-claims",
            "title": "Caller-certified research",
            "source": {
                "name": "Unknown contributor",
                "authority": "National registry",
                "jurisdiction": "Bangladesh",
            },
            "license": {"code": "CC-BY-4.0", "verified": True},
            "text": "This note claims to be verified.",
            "status": "VERIFIED",
        }
    )
    assert not hasattr(value, "status")
    assert value.source.authority == ""
    assert value.source.jurisdiction == ""
    assert value.license.verified is False


def test_multimodal_assets_are_namespaced_by_trusted_organization() -> None:
    container = AiContainer(build_settings())
    service = container.multimodal_rag

    async def scenario() -> None:
        first = await service.ingest(
            asset("shared-asset", "Alpha tenant irrigation note."),
            trusted_organization_id="org-a",
        )
        second = await service.ingest(
            asset("shared-asset", "Beta tenant irrigation note."),
            trusted_organization_id="org-b",
        )
        assert first.organizationId == "org-a"
        assert second.organizationId == "org-b"
        assert first.status == second.status == "UNVERIFIED"
        assert first.citationEligible is False
        assert second.citationEligible is False

        first_key = service._asset_key("org-a", "shared-asset")
        second_key = service._asset_key("org-b", "shared-asset")
        assert first_key != second_key
        assert service._assets[first_key].organizationId == "org-a"
        assert service._assets[second_key].organizationId == "org-b"
        assert not set(first.chunkIds) & set(second.chunkIds)

        for chunk_id in first.chunkIds:
            payload = service._payloads[chunk_id]
            assert payload["organizationId"] == "org-a"
            assert payload["assetId"] == "shared-asset"
            assert payload["documentId"] != "shared-asset"
        for chunk_id in second.chunkIds:
            payload = service._payloads[chunk_id]
            assert payload["organizationId"] == "org-b"
            assert payload["assetId"] == "shared-asset"
            assert payload["documentId"] != "shared-asset"

        for organization_id in ("org-a", "org-b"):
            result = await service.retrieve(
                MultimodalRetrievalInput(
                    query="irrigation note",
                    topK=10,
                    assetIds=["shared-asset"],
                ),
                trusted_organization_id=organization_id,
            )
            assert result.diagnostics["organizationScoped"] is True
            # Unverified uploads never become citable evidence for either tenant.
            assert result.evidence == []

    asyncio.run(scenario())


def test_multimodal_version_change_removes_old_index_entries() -> None:
    container = AiContainer(build_settings())
    service = container.multimodal_rag

    async def scenario() -> None:
        first = await service.ingest(
            asset("versioned-asset", "Old irrigation text.", "v1"),
            trusted_organization_id="org-a",
        )
        old_ids = set(first.chunkIds)
        assert old_ids
        second = await service.ingest(
            asset("versioned-asset", "New irrigation text.", "v2"),
            trusted_organization_id="org-a",
        )
        new_ids = set(second.chunkIds)
        assert new_ids
        assert old_ids.isdisjoint(new_ids)

        for chunk_id in old_ids:
            assert chunk_id not in service._chunks
            assert chunk_id not in service._payloads
            assert chunk_id not in service.vector_index._points
            assert chunk_id not in service.keyword_index._documents
        for chunk_id in new_ids:
            assert chunk_id in service._chunks
            assert chunk_id in service._payloads
            assert chunk_id in service.vector_index._points
            assert chunk_id in service.keyword_index._documents

    asyncio.run(scenario())


def test_internal_dtos_reject_verification_and_inline_graph_approval() -> None:
    base = {
        "text": "Rice blast affects rice.",
        "source": "Internal agronomy note",
        "sourceReference": "hardening-graph-v1",
    }
    for field, value in (
        ("documentStatus", "verified"),
        ("licenseVerified", True),
    ):
        with pytest.raises(ValidationError):
            GraphExtractionRequest.model_validate({**base, field: value})

    extraction = GraphExtractionRequest.model_validate(base)
    with pytest.raises(ValidationError):
        GraphBuildRequest.model_validate(
            {
                "extraction": base,
                "approval": {
                    "approvalId": "self-approved-edge",
                    "decision": "approved",
                    "scope": ["edge-1"],
                },
            }
        )
    built = GraphBuildRequest.model_validate({"extraction": extraction})
    assert not hasattr(built, "approval")


def test_agentic_approval_identity_comes_from_signed_context_only() -> None:
    container = AiContainer(build_settings(approval_reviewer_ids="user-allowed"))

    async def scenario() -> None:
        pending = await container.agentic.run(
            AgenticQueryRequest(
                query="Rice irrigation guidance",
                language="en",
                useGraph=False,
                requireApproval=True,
            ),
            trace_id="trace-hardening-approval",
            organization_id="org-a",
            user_id="user-allowed",
        )
        assert pending.status == "awaiting_approval"
        assert pending.approvalId

        approval = GraphApproval(
            approvalId=pending.approvalId,
            approvedBy="self-appointed-reviewer",
            decision="approved",
            scope=["response_generation"],
        )
        approved = await container.agentic.resume(
            approval,
            trace_id="trace-hardening-approval",
            organization_id="org-a",
            user_id="user-allowed",
        )
        assert approved.approval is not None
        assert approved.approval["approvedBy"] == "user-allowed"
        assert approved.approval["approvedAt"]

    asyncio.run(scenario())


def test_agentic_approval_is_default_denied_without_reviewer_allowlist() -> None:
    container = AiContainer(build_settings(approval_reviewer_ids=""))

    async def scenario() -> None:
        pending = await container.agentic.run(
            AgenticQueryRequest(
                query="Rice irrigation guidance",
                language="en",
                useGraph=False,
                requireApproval=True,
            ),
            trace_id="trace-hardening-no-reviewer",
            organization_id="org-a",
            user_id="user-allowed",
        )
        assert pending.approvalId
        with pytest.raises(UnauthorizedError) as raised:
            await container.agentic.resume(
                GraphApproval(
                    approvalId=pending.approvalId,
                    decision="approved",
                    scope=["response_generation"],
                ),
                trace_id="trace-hardening-no-reviewer",
                organization_id="org-a",
                user_id="user-allowed",
            )
        assert raised.value.details["reason"] == "reviewer_not_allowed"

    asyncio.run(scenario())


class CaptureLimiter:
    def __init__(self) -> None:
        self.keys: list[str] = []

    def check(self, key: str) -> dict[str, int]:
        self.keys.append(key)
        return {"limit": 100, "remaining": 99, "resetSeconds": 60}


def signed_headers(
    settings: Settings,
    body: bytes,
    *,
    path: str,
    organization_id: str,
    user_id: str,
    request_id: str,
) -> dict[str, str]:
    timestamp = str(int(time.time()))
    return {
        "content-type": "application/json",
        "x-cropsy-service-id": settings.internal_service_id,
        "x-cropsy-timestamp": timestamp,
        "x-cropsy-signature": sign_internal_request(
            secret=settings.internal_service_secret.get_secret_value(),
            method="POST",
            path=path,
            timestamp=timestamp,
            body=body,
        ),
        "x-request-id": request_id,
        "x-organization-id": organization_id,
        "x-user-id": user_id,
    }


def rate_limit_client(
    settings: Settings,
    user_limiter: object,
    org_limiter: object,
) -> TestClient:
    async def endpoint(request: object) -> JSONResponse:  # type: ignore[no-untyped-def]
        return JSONResponse({"success": True, "data": {"ok": True}})

    inner = Starlette(
        routes=[Route("/api/v1/internal/ask", endpoint, methods=["POST"])]
    )
    inner.add_middleware(
        RequestContextMiddleware,
        settings=settings,
        rate_limiter=user_limiter,
        org_rate_limiter=org_limiter,
    )
    return TestClient(inner)


def signed_request(
    client: TestClient,
    settings: Settings,
    body: bytes,
    *,
    organization_id: str,
    user_id: str,
    request_id: str,
) -> object:
    path = "/api/v1/internal/ask"
    return client.post(
        path,
        content=body,
        headers=signed_headers(
            settings,
            body,
            path=path,
            organization_id=organization_id,
            user_id=user_id,
            request_id=request_id,
        ),
    )


def test_rate_limit_keys_use_verified_identity_and_reject_spoofing() -> None:
    settings = build_settings()
    user_limiter = CaptureLimiter()
    org_limiter = CaptureLimiter()
    client = rate_limit_client(settings, user_limiter, org_limiter)
    body = json.dumps({"question": "Rice irrigation?"}, separators=(",", ":")).encode()

    first = signed_request(
        client,
        settings,
        body,
        organization_id="org-a",
        user_id="user-1",
        request_id="req-rate-1",
    )
    second = signed_request(
        client,
        settings,
        body,
        organization_id="org-a",
        user_id="user-2",
        request_id="req-rate-2",
    )
    forged = client.post(
        "/api/v1/internal/ask",
        content=body,
        headers={
            "x-organization-id": "org-other",
            "x-user-id": "attacker",
            "x-cropsy-signature": "not-a-signature",
        },
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert forged.status_code == 200
    assert user_limiter.keys[0] == "org:org-a:user:user-1:/api/v1/internal/ask"
    assert user_limiter.keys[1] == "org:org-a:user:user-2:/api/v1/internal/ask"
    assert user_limiter.keys[2].startswith("ip:")
    assert "org-other" not in user_limiter.keys[2]
    assert org_limiter.keys == ["org:org-a", "org:org-a"]


def test_rate_limits_enforce_per_user_and_per_organization_budgets() -> None:
    settings = build_settings()
    body = json.dumps({"question": "Rice irrigation?"}, separators=(",", ":")).encode()

    per_user = rate_limit_client(
        settings,
        SlidingWindowRateLimiter(max_requests=1, window_seconds=60),
        SlidingWindowRateLimiter(max_requests=10, window_seconds=60),
    )
    assert (
        signed_request(
            per_user, settings, body,
            organization_id="org-a", user_id="user-1", request_id="req-user-1",
        ).status_code
        == 200
    )
    assert (
        signed_request(
            per_user, settings, body,
            organization_id="org-a", user_id="user-1", request_id="req-user-2",
        ).status_code
        == 429
    )
    assert (
        signed_request(
            per_user, settings, body,
            organization_id="org-a", user_id="user-2", request_id="req-user-3",
        ).status_code
        == 200
    )

    per_org = rate_limit_client(
        settings,
        SlidingWindowRateLimiter(max_requests=10, window_seconds=60),
        SlidingWindowRateLimiter(max_requests=1, window_seconds=60),
    )
    assert (
        signed_request(
            per_org, settings, body,
            organization_id="org-b", user_id="user-1", request_id="req-org-1",
        ).status_code
        == 200
    )
    assert (
        signed_request(
            per_org, settings, body,
            organization_id="org-b", user_id="user-2", request_id="req-org-2",
        ).status_code
        == 429
    )


def test_multimodal_service_rejects_empty_trusted_scope() -> None:
    container = AiContainer(build_settings())
    with pytest.raises(UnauthorizedError):
        asyncio.run(
            container.multimodal_rag.ingest(
                asset("asset-no-scope", "No trusted organization."),
                trusted_organization_id="",
            )
        )


def test_namespaced_multimodal_id_is_not_the_caller_asset_id() -> None:
    namespaced = MultimodalRAGService._namespaced_id("org-a", "shared", "v1")
    other_tenant = MultimodalRAGService._namespaced_id("org-b", "shared", "v1")
    assert namespaced != "shared"
    assert namespaced != other_tenant

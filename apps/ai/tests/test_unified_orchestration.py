import base64
import json
import time

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.modules.orchestration.evidence import EvidenceFusion
from app.modules.orchestration.query_router import QueryRouteInput, QueryRouter
from app.security import sign_internal_request

client = TestClient(app)
SETTINGS = get_settings()


def signed(method: str, path: str, body: dict | None = None) -> dict[str, str]:
    payload = b"" if body is None else json.dumps(
        body, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    timestamp = str(int(time.time()))
    return {
        "content-type": "application/json",
        "x-cropsy-service-id": SETTINGS.internal_service_id,
        "x-cropsy-timestamp": timestamp,
        "x-cropsy-signature": sign_internal_request(
            secret=SETTINGS.internal_service_secret.get_secret_value(),
            method=method,
            path=path,
            timestamp=timestamp,
            body=payload,
        ),
        "x-request-id": "req-unified-test",
        "x-organization-id": "org-ai-test",
        "x-user-id": "user-ai-test",
    }


def post(path: str, body: dict):
    response = client.post(
        path,
        content=json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
        headers=signed("POST", path, body),
    )
    return response, response.json()


def test_query_router_applies_deterministic_rules() -> None:
    router = QueryRouter()
    assert router.route(QueryRouteInput(query="How should rice be irrigated?")).strategy == "hybrid"
    assert (
        router.route(
            QueryRouteInput(query="What is the impact of soil pH on rice fertilizer practices?")
        ).strategy
        == "graph_hybrid"
    )
    assert (
        router.route(
            QueryRouteInput(query="What is visible here?", hasImages=True)
        ).strategy
        == "multimodal"
    )
    assert (
        router.route(
            QueryRouteInput(query="What does this document say?", hasDocuments=True)
        ).strategy
        == "multimodal"
    )
    assert (
        router.route(
            QueryRouteInput(query="Plan the workflow step by step", requiresApproval=True)
        ).strategy
        == "agentic"
    )
    assert router.describe()["llmBasedSelection"] is False


def test_fusion_deduplicates_and_preserves_citation() -> None:
    from app.modules.knowledge import build_citation
    from app.models import Citation, DocumentChunk, DocumentRecord, EvidenceChunk

    record = DocumentRecord(
        documentId="doc-fusion",
        title="Verified fusion note",
        documentType="agricultural_manual",
        classifiedType="agricultural_manual",
        classificationConfidence=0.0,
        language="en",
        version="v1",
        status="VERIFIED",
        provenance={
            "source": {
                "name": "Test Authority",
                "url": "https://example.test/fusion",
                "publisher": "Test Publisher",
                "publishedAt": "2026-01-01",
            },
            "license": {
                "code": "CC-BY-4.0",
                "url": "https://creativecommons.org/licenses/by/4.0/",
                "verified": True,
            },
            "contentHash": "a" * 64,
        },
        text="Rice irrigation evidence.",
    )
    chunk = DocumentChunk(
        chunkId="doc-fusion:v1:0",
        documentId="doc-fusion",
        version="v1",
        text="Rice irrigation evidence.",
        position=0,
        language="en",
        citationEligible=True,
    )
    citation = build_citation(record, chunk, 0.8)
    evidence = EvidenceChunk(
        chunkId=chunk.chunkId,
        documentId=record.documentId,
        version=record.version,
        text=chunk.text,
        section="",
        language="en",
        score=0.8,
        citation=citation,
    )
    fused = EvidenceFusion().fuse({"hybrid": [evidence], "multimodal": [evidence]})
    assert len(fused) == 1
    assert fused[0].strategies == ["hybrid", "multimodal"]
    bundle = EvidenceFusion().build_context(fused)
    assert "doc-fusion:v1:0" in bundle.context
    assert bundle.citations[0]["documentId"] == "doc-fusion"


def test_multimodal_ingestion_retrieval_and_unified_question_answering() -> None:
    asset_body = {
        "assetId": "eval-unified-doc",
        "title": "Verified rice irrigation research note",
        "filename": "rice-irrigation.txt",
        "mimeType": "text/plain",
        "documentType": "research_paper",
        "language": "en",
        "status": "VERIFIED",
        "source": {
            "name": "Test Agricultural Research Institute",
            "url": "https://example.test/research/rice-irrigation",
            "publisher": "Test Agricultural Research Institute",
            "publishedAt": "2026-02-01",
            "authority": "Research publication",
            "jurisdiction": "Bangladesh",
        },
        "license": {
            "code": "CC-BY-4.0",
            "url": "https://creativecommons.org/licenses/by/4.0/",
            "verified": True,
        },
        "text": (
            "Research observation: alternate wetting and drying was recorded in the "
            "irigation trial. Local agronomist review is required before applying it."
        ),
        "sourceVersion": "1.0",
    }
    response, payload = post("/api/v1/internal/multimodal/assets", asset_body)
    assert response.status_code == 200, payload
    assert payload["data"]["assetKind"] == "research_material"
    assert payload["data"]["citationEligible"] is True
    assert payload["data"]["vision"]["status"] == "unavailable"

    response, payload = post(
        "/api/v1/internal/multimodal/retrieve",
        {"query": "What does the rice irrigation research say?", "topK": 3},
    )
    assert response.status_code == 200, payload
    assert payload["data"]["evidence"]
    assert payload["data"]["diagnostics"]["organizationScoped"] is True

    response, payload = post(
        "/api/v1/internal/orchestration/run",
        {
            "query": "What does the uploaded document say about rice irrigation?",
            "topK": 3,
            "assetIds": ["eval-unified-doc"],
        },
    )
    assert response.status_code == 200, payload
    data = payload["data"]
    assert data["advisory"] is True
    assert data["route"]["strategy"] == "multimodal"
    assert "agentic" in data["strategiesAttempted"] or "hybrid" in data["strategiesAttempted"]
    assert data["evidence"]
    assert data["citations"]
    assert data["sourceAttribution"][0]["assetId"] == "eval-unified-doc"
    assert data["confidence"]["basis"] == "rule_based_retrieval_evidence"
    assert "not scientifically validated" in " ".join(data["confidence"]["limitations"]).lower()


def test_unified_capabilities_do_not_expose_credentials() -> None:
    path = "/api/v1/internal/orchestration/capabilities"
    response = client.get(path, headers=signed("GET", path))
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["llmSelectsStrategy"] is False
    assert data["multimodal"]["organizationScopeEnforced"] is True
    assert "not a confirmed plant diagnosis" in data["multimodal"]["plantImageDisclaimer"].lower()
    assert "test-ai-service-secret" not in json.dumps(data)


def test_unified_evaluation_datasets_are_separate() -> None:
    for dataset in ("text", "image", "multimodal"):
        response, payload = post(
            "/api/v1/internal/orchestration/evaluation", {"dataset": dataset, "topK": 3}
        )
        assert response.status_code == 200, payload
        assert payload["data"]["datasetId"].startswith("cropsy-")
        assert payload["data"]["caseCount"] >= 1
        assert payload["data"]["metrics"]

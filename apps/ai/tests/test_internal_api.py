import base64
import json
import time

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.security import sign_internal_request

client = TestClient(app)
SETTINGS = get_settings()


def signed(
    method: str,
    path: str,
    body: dict | None = None,
    *,
    service_id: str | None = None,
    secret: str | None = None,
    organization_id: str = "org-ai-test",
    user_id: str = "user-ai-test",
    request_id: str = "req-ai-test",
) -> dict[str, str]:
    payload = b"" if body is None else json.dumps(
        body, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    timestamp = str(int(time.time()))
    active_secret = secret or SETTINGS.internal_service_secret.get_secret_value()
    signature = sign_internal_request(
        secret=active_secret,
        method=method,
        path=path,
        timestamp=timestamp,
        body=payload,
    )
    return {
        "content-type": "application/json",
        "x-cropsy-service-id": service_id or SETTINGS.internal_service_id,
        "x-cropsy-timestamp": timestamp,
        "x-cropsy-signature": signature,
        "x-request-id": request_id,
        "x-organization-id": organization_id,
        "x-user-id": user_id,
    }


def document_payload(
    document_id: str,
    text: str,
    *,
    status: str = "VERIFIED",
    document_type: str = "crop_cultivation_guideline",
    license_verified: bool = True,
) -> dict:
    return {
        "documentId": document_id,
        "title": f"Verified {document_id} cultivation note",
        "documentType": document_type,
        "language": "en",
        "version": "v1",
        "status": status,
        "source": {
            "name": "Ministry of Agriculture Test Publication",
            "url": "https://example.test/publications/cultivation-note",
            "publisher": "Ministry of Agriculture",
            "publishedAt": "2026-01-15",
            "authors": ["Agricultural Officer"],
            "authority": "Government publication",
            "jurisdiction": "Bangladesh",
        },
        "license": {
            "code": "CC-BY-4.0",
            "url": "https://creativecommons.org/licenses/by/4.0/",
            "attributionRequired": True,
            "verified": license_verified,
        },
        "text": text,
        "mimeType": "text/plain",
        "filename": f"{document_id}.txt",
    }


def post(path: str, body: dict, **kwargs) -> tuple[object, dict]:
    response = client.post(
        path,
        content=json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
        headers=signed("POST", path, body, **kwargs),
    )
    return response, response.json()


def test_internal_routes_require_hmac_authentication() -> None:
    response = client.post(
        "/api/v1/internal/ask",
        json={"question": "What should I plant?"},
    )
    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "unauthorized"


def test_internal_routes_reject_wrong_service_identity() -> None:
    path = "/api/v1/internal/capabilities"
    response = client.get(
        path,
        headers=signed("GET", path, service_id="unknown-service"),
    )
    assert response.status_code == 401


def test_internal_routes_reject_malformed_signature() -> None:
    path = "/api/v1/internal/capabilities"
    headers = signed("GET", path)
    headers["x-cropsy-signature"] = "not-a-signature"
    response = client.get(path, headers=headers)
    assert response.status_code == 401


def test_capabilities_expose_modules_without_credentials() -> None:
    path = "/api/v1/internal/capabilities"
    response = client.get(path, headers=signed("GET", path))
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert len(body["data"]["modules"]) == 22
    assert "advisory-image-analysis" in body["data"]["modules"]
    assert "ai-evaluation-framework" in body["data"]["modules"]
    assert "market-forecasting" in body["data"]["modules"]
    assert "market-explanation" in body["data"]["modules"]
    assert "weather-intelligence" in body["data"]["modules"]
    assert body["data"]["marketIntelligence"]["noLiveQuoteClaim"] is True
    assert body["data"]["marketIntelligence"]["forecastValidation"] == "time_based_split"
    assert body["data"]["weatherIntelligence"]["noSyntheticWeather"] is True
    assert body["data"]["citationPolicy"] == "verified-licensed-sources-only"
    assert body["data"]["credentialPolicy"] == "server-side-only"
    rendered = json.dumps(body)
    assert "test-ai-service-secret" not in rendered


def test_ingest_retrieve_and_ask_use_only_verified_evidence() -> None:
    text = (
        "Cultivation note for upland rice. Sow certified seed after the first steady rain. "
        "Maintain 20 centimeters between rows. Soil testing should guide nutrient application."
    )
    path = "/api/v1/internal/documents/ingest"
    body = document_payload("doc-rice-en", text)
    response, payload = post(path, body)
    assert response.status_code == 200, payload
    assert payload["data"]["citationEligible"] is True
    assert payload["data"]["chunkCount"] >= 1

    retrieve_path = "/api/v1/internal/retrieve"
    retrieve_body = {"query": "How should upland rice be sown?", "topK": 3}
    response, payload = post(retrieve_path, retrieve_body)
    assert response.status_code == 200, payload
    evidence = payload["data"]["evidence"]
    assert evidence
    assert all(item["citation"]["documentId"] == "doc-rice-en" for item in evidence)

    ask_path = "/api/v1/internal/ask"
    ask_body = {"question": "How should upland rice be sown?", "language": "en", "topK": 3}
    response, payload = post(ask_path, ask_body)
    assert response.status_code == 200, payload
    assert payload["data"]["status"] == "ok"
    assert payload["data"]["citations"]
    assert all(
        citation["documentId"] == "doc-rice-en"
        for citation in payload["data"]["citations"]
    )
    assert payload["data"]["advisory"] is True
    assert "cropsy-deterministic-advisory-v1" == payload["data"]["model"]


def test_bengali_documents_are_indexed_and_queryable() -> None:
    path = "/api/v1/internal/documents/ingest"
    body = document_payload(
        "doc-rice-bn",
        "ধান সেচের নির্দেশিকা। প্রথম বৃষ্টির পর সারা জমিতে পানি দিন। মাটি পরীক্ষা করে সার প্রয়োগ করুন।",
    )
    body["language"] = "bn"
    response, payload = post(path, body)
    assert response.status_code == 200, payload
    assert payload["data"]["citationEligible"] is True

    retrieve_path = "/api/v1/internal/retrieve"
    response, payload = post(
        retrieve_path,
        {"query": "ধান সেচের নির্দেশিকা", "language": "bn", "topK": 3},
    )
    assert response.status_code == 200, payload
    assert any(
        item["citation"]["documentId"] == "doc-rice-bn"
        for item in payload["data"]["evidence"]
    )


def test_unverified_documents_are_never_citable() -> None:
    path = "/api/v1/internal/documents/ingest"
    body = document_payload(
        "doc-unverified",
        "This draft has no verified publication license.",
        status="DRAFT",
        license_verified=False,
    )
    response, payload = post(path, body)
    assert response.status_code == 200, payload
    assert payload["data"]["citationEligible"] is False
    assert payload["data"]["citationEligibilityReason"] == "document_status_not_verified"

    citations_path = "/api/v1/internal/documents/doc-unverified/citations"
    response = client.get(citations_path, headers=signed("GET", citations_path))
    assert response.status_code == 200
    assert response.json()["data"]["citations"] == []


def test_missing_docling_dependency_fails_explicitly() -> None:
    path = "/api/v1/internal/documents/ingest"
    body = document_payload("doc-pdf", "")
    body["contentBase64"] = base64.b64encode(b"%PDF-1.4 minimal").decode("ascii")
    body["mimeType"] = "application/pdf"
    body["filename"] = "field-guide.pdf"
    response, payload = post(path, body)
    assert response.status_code == 503, payload
    assert payload["error"]["code"] == "integration_unavailable"
    assert "Docling" in payload["error"]["message"]


def test_ask_validation_is_enforced_before_agents() -> None:
    path = "/api/v1/internal/ask"
    body = {"question": ""}
    response, payload = post(path, body)
    assert response.status_code == 400
    assert payload["error"]["code"] == "validation_error"


def test_feedback_updates_evaluation_snapshot() -> None:
    path = "/api/v1/internal/feedback"
    body = {"traceId": "trace-feedback-test", "rating": 4, "comment": "Useful"}
    response, payload = post(path, body)
    assert response.status_code == 200, payload

    evaluation_path = "/api/v1/internal/evaluation"
    response = client.get(evaluation_path, headers=signed("GET", evaluation_path))
    assert response.status_code == 200
    snapshot = response.json()["data"]
    assert snapshot["feedbackCount"] >= 1
    assert snapshot["averageRating"] is not None


def graph_extraction_body(reference: str = "api-graph-v1") -> dict:
    return {
        "text": (
            "Rice blast affects rice. Agricultural research has evidence for rice blast. "
            "Expert recommendation recommends irrigation for rice."
        ),
        "source": "Internal agronomy note",
        "sourceReference": reference,
        "documentStatus": "verified",
        "licenseVerified": True,
    }


def graph_retrieval_body(**overrides: object) -> dict:
    body = {
        "query": "rice blast",
        "organizationIds": ["org-ai-test"],
        "includeGlobal": False,
        "topK": 10,
        "minConfidence": 0.5,
        "includeCandidates": False,
    }
    body.update(overrides)
    return body


def test_new_internal_routes_require_hmac_authentication() -> None:
    cases = (
        ("POST", "/api/v1/internal/agentic/run", {"query": "rice irrigation"}),
        (
            "POST",
            "/api/v1/internal/agentic/approve",
            {"traceId": "trace-x", "approval": {}},
        ),
        ("POST", "/api/v1/internal/graph/extract", graph_extraction_body()),
        ("POST", "/api/v1/internal/graph/build", {"extraction": graph_extraction_body()}),
        ("POST", "/api/v1/internal/graph/retrieve", graph_retrieval_body()),
        (
            "POST",
            "/api/v1/internal/graph/context",
            {
                "query": "rice blast",
                "graph": graph_retrieval_body(),
            },
        ),
        ("GET", "/api/v1/internal/graph/capabilities", None),
    )
    for method, path, body in cases:
        response = (
            client.post(path, json=body) if method == "POST" else client.get(path)
        )
        assert response.status_code == 401, path
        assert response.json()["error"]["code"] == "unauthorized"


def test_agentic_run_resumes_after_human_approval_over_internal_api() -> None:
    run_path = "/api/v1/internal/agentic/run"
    trace_id = "req-agentic-approval-api"
    response, payload = post(
        run_path,
        {
            "query": "Rice irrigation guidance",
            "language": "en",
            "useGraph": False,
            "requireApproval": True,
        },
        request_id=trace_id,
    )
    assert response.status_code == 200, payload
    assert payload["data"]["status"] == "awaiting_approval"
    assert payload["data"]["advisory"] is False
    approval_id = payload["data"]["approvalId"]
    assert approval_id

    approve_path = "/api/v1/internal/agentic/approve"
    response, payload = post(
        approve_path,
        {
            "traceId": trace_id,
            "approval": {
                "approvalId": approval_id,
                "approvedBy": "internal-reviewer",
                "decision": "approved",
                "scope": ["response_generation"],
            },
        },
    )
    assert response.status_code == 200, payload
    assert payload["data"]["approval"]["approvedBy"] == "internal-reviewer"
    assert payload["data"]["status"] in {"ok", "insufficient_evidence"}
    assert payload["data"]["traceId"] == trace_id
    usage = payload["data"]["usage"]
    assert not usage or usage.get("totalTokens", 0) >= 0


def test_agentic_requests_reject_farmer_identifiers() -> None:
    response, payload = post(
        "/api/v1/internal/agentic/run",
        {"query": "rice blast", "farmId": "farm-secret"},
    )
    assert response.status_code == 400
    assert payload["error"]["code"] == "validation_error"

    response, payload = post(
        "/api/v1/internal/graph/retrieve",
        graph_retrieval_body(farmerId="farmer-secret"),
    )
    assert response.status_code == 400
    assert payload["error"]["code"] == "validation_error"


def test_graph_extract_build_retrieve_and_context_over_internal_api() -> None:
    response, payload = post("/api/v1/internal/graph/extract", graph_extraction_body())
    assert response.status_code == 200, payload
    assert payload["data"]["extractionMethod"] == "deterministic"
    assert payload["data"]["relationships"]

    build_path = "/api/v1/internal/graph/build"
    response, payload = post(build_path, {"extraction": graph_extraction_body()})
    assert response.status_code == 200, payload
    assert payload["data"]["status"] == "awaiting_approval"
    assert payload["data"]["relationshipsWritten"] >= 1
    assert payload["data"]["verifiedRelationships"] == 0
    assert payload["data"]["validation"]["requiresApproval"] is True
    classes = {
        item["evidenceClass"] for item in payload["data"]["validation"]["accepted"]
    }
    assert "verified_relationship" not in classes
    assert "validated_extraction" in classes

    retrieve_path = "/api/v1/internal/graph/retrieve"
    response, payload = post(retrieve_path, graph_retrieval_body())
    assert response.status_code == 200, payload
    assert payload["data"]["evidence"]
    assert all(not item["verified"] for item in payload["data"]["evidence"])

    context_path = "/api/v1/internal/graph/context"
    response, payload = post(
        context_path,
        {
            "query": "rice blast",
            "graph": graph_retrieval_body(),
            "topK": 5,
            "documentTypes": [],
        },
    )
    assert response.status_code == 200, payload
    assert payload["data"]["counts"]["graphEvidence"] >= 1
    assert any(
        "not scientific facts" in limitation
        for limitation in payload["data"]["limitations"]
    )


def test_graph_retrieve_denies_cross_organization_scope() -> None:
    response, payload = post(
        "/api/v1/internal/graph/retrieve",
        graph_retrieval_body(
            organizationIds=["org-other"],
            includeGlobal=False,
        ),
        organization_id="org-ai-test",
    )
    assert response.status_code == 401, payload
    assert payload["error"]["code"] == "unauthorized"
    assert payload["error"]["details"]["reason"] == "cross_organization_graph_scope_denied"


def test_graph_capabilities_disclose_provenance_policy() -> None:
    path = "/api/v1/internal/graph/capabilities"
    response = client.get(path, headers=signed("GET", path))
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["policies"]["tenantScopeEnforced"] is True
    assert data["policies"]["llmRelationshipsRequireValidation"] is True
    assert data["policies"]["humanApprovalRequiredForVerifiedRelationship"] is True
    assert "HAS_EVIDENCE" in data["relationships"]
    assert "verified_relationship" in data["evidenceClasses"]

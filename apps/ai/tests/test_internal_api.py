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
    assert len(body["data"]["modules"]) == 15
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

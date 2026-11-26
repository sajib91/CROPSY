from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)


def test_health_returns_standard_envelope() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["status"] == "ok"
    assert body["data"]["service"] == get_settings().service_name
    assert body["data"]["uptimeSeconds"] >= 0


def test_ready_reports_process_check() -> None:
    response = client.get("/api/v1/health/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["status"] == "ready"
    checks = body["data"]["checks"]
    assert checks["process"] == "ok"
    assert checks["credentialsExposed"] == "false"
    assert checks["vectorIndex"] in {"memory", "qdrant"}
    assert checks["keywordIndex"] in {"memory", "opensearch"}

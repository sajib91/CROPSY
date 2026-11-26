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
    request_id: str = "req-ai-test",
) -> dict[str, str]:
    payload = b"" if body is None else json.dumps(
        body, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    timestamp = str(int(time.time()))
    signature = sign_internal_request(
        secret=SETTINGS.internal_service_secret.get_secret_value(),
        method=method,
        path=path,
        timestamp=timestamp,
        body=payload,
    )
    return {
        "content-type": "application/json",
        "x-cropsy-service-id": SETTINGS.internal_service_id,
        "x-cropsy-timestamp": timestamp,
        "x-cropsy-signature": signature,
        "x-request-id": request_id,
        "x-organization-id": "org-ai-test",
        "x-user-id": "user-ai-test",
    }


def post(path: str, body: dict, **kwargs) -> tuple[object, dict]:
    response = client.post(
        path,
        content=json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
        headers=signed("POST", path, body, **kwargs),
    )
    return response, response.json()


def observation(index: int) -> dict:
    return {
        "observationId": f"obs-{index:03d}",
        "productId": "product-rice",
        "price": 100.0 + index,
        "currency": "BDT",
        "observedAt": f"2026-01-{index + 1:02d}T00:00:00Z",
        "region": "Sylhet",
        "source": "CROPSY marketplace listing",
        "sourceReference": f"listing:{index}",
        "sourceUrl": "",
        "collectionMethod": "seller_submitted_listing",
        "evidenceClass": "historical_observation",
        "favoriteCount": 0,
    }


def test_market_forecast_route_requires_hmac_and_separates_evidence() -> None:
    path = "/api/v1/internal/market/forecast"
    body = {
        "observations": [observation(index) for index in range(8)],
        "productId": "product-rice",
        "region": "Sylhet",
        "horizon": 2,
        "model": "moving_average",
        "language": "en",
        "includeExplanation": False,
    }
    unsigned = client.post(path, json=body)
    assert unsigned.status_code == 401

    response, payload = post(path, body)
    assert response.status_code == 200, payload
    data = payload["data"]
    assert len(data["historicalObservations"]) == 8
    assert data["statisticalEstimates"]["evidenceClass"] == "statistical_estimate"
    assert all(item["evidenceClass"] == "ml_prediction" for item in data["mlPredictions"])
    assert all(item["uncertain"] is True for item in data["mlPredictions"])
    assert data["evaluation"]["evaluated"] is True
    assert data["evaluation"]["method"] == "time_based_split"
    assert data["llmExplanation"] is None
    assert payload["meta"]["requestId"] == "req-ai-test"


def test_market_forecast_rejects_invalid_provenance_before_forecasting() -> None:
    path = "/api/v1/internal/market/forecast"
    body = {
        "observations": [
            {
                "observationId": "obs-001",
                "productId": "product-rice",
                "price": 100,
                "currency": "BDT",
                "observedAt": "2026-01-01T00:00:00Z",
                "source": "invented",
                "sourceReference": "invented",
                "collectionMethod": "invented",
                "evidenceClass": "ml_prediction",
            }
        ]
    }
    response, payload = post(path, body)
    assert response.status_code == 400, payload
    assert payload["error"]["code"] == "validation_error"


def test_weather_routes_are_explicitly_unavailable_without_a_provider() -> None:
    path = "/api/v1/internal/weather/advisory"
    body = {
        "farmId": "farm-1",
        "language": "en",
        "coordinates": {"latitude": 23.8, "longitude": 90.4},
        "region": "Sylhet",
        "crop": "rice",
        "cropStage": "FLOWERING",
        "includeHistory": True,
        "includeForecast": True,
        "includeAlerts": True,
    }
    unsigned = client.post(path, json=body)
    assert unsigned.status_code == 401

    response, payload = post(path, body)
    assert response.status_code == 503, payload
    assert payload["error"]["code"] == "integration_unavailable"
    assert "no weather provider" in payload["error"]["message"]
    rendered = json.dumps(payload)
    assert "temperatureC" not in rendered
    assert "rainfallMm" not in rendered


def test_market_explanation_route_requires_hmac() -> None:
    path = "/api/v1/internal/market/explain"
    body = {
        "observations": [observation(0)],
        "statisticalEstimates": {"mean": 100.0},
        "language": "en",
    }
    assert client.post(path, json=body).status_code == 401
    response, payload = post(path, body)
    assert response.status_code == 200, payload
    assert payload["data"]["evidenceClass"] == "llm_generated_explanation"
    assert payload["data"]["advisory"] is True

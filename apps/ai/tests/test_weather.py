import asyncio
from typing import Any

import httpx
import pytest

from app.config import Settings
from app.errors import IntegrationUnavailableError, ProviderError
from app.infrastructure.weather import (
    HttpWeatherProvider,
    UnavailableWeatherProvider,
    build_weather_provider,
    normalize_alert,
    normalize_forecast,
    normalize_observation,
)
from app.modules.weather import (
    WeatherAdvisoryRequest,
    WeatherContext,
    WeatherIntelligenceService,
    WeatherLookup,
)


class FakeProvider:
    backend_name = "fake-configured-provider"

    def __init__(self) -> None:
        self.calls: list[str] = []

    def describe(self) -> dict[str, Any]:
        return {"backend": self.backend_name, "available": True, "sourceName": "Test Weather API"}

    async def observations(self, latitude, longitude, region, from_value, to_value):
        self.calls.append("observations")
        return [
            {
                "observedAt": "2026-01-01T00:00:00Z",
                "temperatureC": 30.0,
                "humidityPct": 93.0,
                "rainfallMm": 0.0,
                "source": "Test Weather API",
                "sourceReference": "observation:1",
                "evidenceClass": "weather_observation",
            }
        ]

    async def forecasts(self, latitude, longitude, region, from_value, to_value):
        self.calls.append("forecasts")
        return [
            {
                "forecastFor": "2026-01-02T00:00:00Z",
                "temperatureC": 39.0,
                "rainfallMm": 0.0,
                "source": "Test Weather API",
                "sourceReference": "forecast:1",
                "evidenceClass": "weather_forecast",
                "uncertain": True,
            }
        ]

    async def alerts(self, latitude, longitude, region, from_value, to_value):
        self.calls.append("alerts")
        return [
            {
                "event": "Heatwave",
                "severity": "SEVERE",
                "headline": "Severe heat expected",
                "startsAt": "2026-01-02T00:00:00Z",
                "source": "Test Weather API",
                "sourceReference": "alert:1",
                "evidenceClass": "weather_alert",
            }
        ]


def context() -> WeatherContext:
    return WeatherContext.model_validate(
        {
            "farm": {
                "id": "farm-1",
                "name": "Test Farm",
                "coordinates": {"latitude": 23.8, "longitude": 90.4},
                "region": "Sylhet",
            },
            "crop": {"name": "rice", "stage": "FLOWERING", "cultivationId": "cultivation-1"},
            "irrigation": [
                {
                    "id": "irrigation-1",
                    "source": "Canal",
                    "method": "Furrow",
                    "status": "ACTIVE",
                }
            ],
        }
    )


def test_unconfigured_weather_provider_fails_explicitly_without_values() -> None:
    provider = build_weather_provider(Settings(environment="test", weather_provider="none"))
    assert isinstance(provider, UnavailableWeatherProvider)
    service = WeatherIntelligenceService(provider, Settings(environment="test"))
    lookup = WeatherLookup(farmId="farm-1", context=context())
    with pytest.raises(IntegrationUnavailableError, match="no weather provider"):
        asyncio.run(service.observations(lookup))
    assert provider.describe()["available"] is False


def test_advisory_separates_evidence_and_produces_referenced_recommendations() -> None:
    provider = FakeProvider()
    service = WeatherIntelligenceService(provider, Settings(environment="test"))
    request = WeatherAdvisoryRequest(
        farmId="farm-1",
        language="en",
        context=context(),
        includeHistory=True,
        includeForecast=True,
        includeAlerts=True,
    )
    result = asyncio.run(service.advisory(request))
    dumped = result.model_dump(mode="json")

    assert set(provider.calls) == {"observations", "forecasts", "alerts"}
    assert dumped["evidenceClasses"] == [
        "weather_observation",
        "weather_forecast",
        "weather_alert",
        "ai_generated_recommendation",
    ]
    assert all(
        item["evidenceClass"] == "weather_observation"
        for item in dumped["observations"]
    )
    assert all(item["uncertain"] is True for item in dumped["forecasts"])
    assert all(item["evidenceClass"] == "weather_alert" for item in dumped["alerts"])
    assert [item["sourceReference"] for item in dumped["severeAlerts"]] == ["alert:1"]
    assert dumped["riskNotifications"]
    assert dumped["recommendations"]
    assert all(item["advisory"] is True for item in dumped["recommendations"])
    assert all(item["evidenceClass"] == "ai_generated_recommendation" for item in dumped["recommendations"])
    assert "farm-irrigation:irrigation-1" in {
        reference
        for item in dumped["recommendations"]
        for reference in item["basis"]
    }
    assert "alert:1" in {
        reference
        for item in dumped["recommendations"]
        for reference in item["basis"]
    }
    assert dumped["location"]["coordinates"] == {"latitude": 23.8, "longitude": 90.4}
    assert dumped["provider"]["credentialsInResponse"] is False
    assert any("separate fields" in item for item in dumped["limitations"])


def test_weather_lookup_requires_a_usable_farm_location() -> None:
    provider = FakeProvider()
    service = WeatherIntelligenceService(provider, Settings(environment="test"))
    lookup = WeatherLookup.model_validate({"farmId": "farm-1", "context": {"farm": {"id": "farm-1"}}})
    with pytest.raises(IntegrationUnavailableError, match="No usable farm location"):
        asyncio.run(service.observations(lookup))
    assert provider.calls == []


def test_normalization_rejects_missing_measurements_and_provenance() -> None:
    with pytest.raises(ProviderError, match="usable measurement"):
        normalize_observation(
            {"observedAt": "2026-01-01T00:00:00Z", "source": "X", "sourceReference": "ref"}
        )
    with pytest.raises(ProviderError, match="usable predicted value"):
        normalize_forecast(
            {"forecastFor": "2026-01-01T00:00:00Z", "source": "X", "sourceReference": "ref"}
        )
    with pytest.raises(ProviderError, match="event or headline"):
        normalize_alert({"severity": "HIGH", "source": "X", "sourceReference": "ref"})
    with pytest.raises(ProviderError, match="invalid"):
        normalize_observation(
            {
                "observedAt": "not-a-date",
                "temperatureC": 20,
                "source": "X",
                "sourceReference": "ref",
            }
        )


def test_http_adapter_uses_configured_path_and_header(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    class MockClient:
        def __init__(self, *, timeout: float) -> None:
            seen["timeout"] = timeout

        async def __aenter__(self) -> "MockClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def get(self, url: str, params: dict[str, str], headers: dict[str, str]) -> httpx.Response:
            seen["url"] = url
            seen["params"] = params
            seen["headers"] = headers
            return httpx.Response(
                200,
                json={
                    "observations": [
                        {
                            "observedAt": "2026-01-01T00:00:00Z",
                            "rainfallMm": 12.5,
                            "source": "Configured Provider",
                            "sourceReference": "provider:obs-1",
                        }
                    ]
                },
            )

    monkeypatch.setattr("app.infrastructure.weather.httpx.AsyncClient", MockClient)
    provider = HttpWeatherProvider(
        base_url="https://weather.example.test/api/",
        api_key="server-side-key",
        api_key_header="x-weather-key",
        observation_path="/history",
        forecast_path="/prediction",
        alerts_path="/warnings",
        timeout_seconds=7.0,
        source_name="Configured Provider",
    )
    rows = asyncio.run(provider.observations(23.8, 90.4, "Sylhet", "2026-01-01", "2026-01-02"))
    assert seen["url"] == "https://weather.example.test/api/history"
    assert seen["params"] == {
        "lat": "23.8",
        "lon": "90.4",
        "region": "Sylhet",
        "from": "2026-01-01",
        "to": "2026-01-02",
    }
    assert seen["headers"] == {"x-weather-key": "server-side-key"}
    assert seen["timeout"] == 7.0
    assert rows[0]["rainfallMm"] == 12.5
    assert rows[0]["source"] == "Configured Provider"
    assert rows[0]["evidenceClass"] == "weather_observation"

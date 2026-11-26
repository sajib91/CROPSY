"""Configurable external weather provider adapter.

There is deliberately no mock or synthetic weather adapter. When no provider is
configured, the unavailable provider returns an explicit integration error.
All values returned by the HTTP adapter are copied from the provider response
and validated; no weather value is invented or defaulted.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.errors import IntegrationUnavailableError, ProviderError
from app.retry import retry_async

SEVERE_ALERT_LEVELS = frozenset({"EXTREME", "SEVERE", "CRITICAL", "HIGH", "WARNING"})


class UnavailableWeatherProvider:
    """Explicit unavailable state. Never produces weather values."""

    backend_name = "none"

    def __init__(self, reason: str = "weather_provider_not_configured") -> None:
        self.reason = reason

    def describe(self) -> dict[str, Any]:
        return {"backend": self.backend_name, "available": False, "reason": self.reason}

    async def observations(
        self,
        latitude: float | None,
        longitude: float | None,
        region: str,
        from_value: str | None,
        to_value: str | None,
    ) -> list[dict[str, Any]]:
        raise IntegrationUnavailableError(
            "Weather observations are unavailable: no weather provider is configured.",
            details={"reason": self.reason},
        )

    async def forecasts(
        self,
        latitude: float | None,
        longitude: float | None,
        region: str,
        from_value: str | None,
        to_value: str | None,
    ) -> list[dict[str, Any]]:
        raise IntegrationUnavailableError(
            "Weather forecasts are unavailable: no weather provider is configured.",
            details={"reason": self.reason},
        )

    async def alerts(
        self,
        latitude: float | None,
        longitude: float | None,
        region: str,
        from_value: str | None,
        to_value: str | None,
    ) -> list[dict[str, Any]]:
        raise IntegrationUnavailableError(
            "Weather alerts are unavailable: no weather provider is configured.",
            details={"reason": self.reason},
        )


def _finite_number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _text(value: Any, field: str, max_length: int = 500) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ProviderError(
            f"Weather provider returned an invalid '{field}' field.",
            details={"field": field},
        )
    return value.strip()[:max_length]


def _timestamp(value: Any, field: str) -> str:
    text = _text(value, field, 50)
    try:
        datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise ProviderError(
            f"Weather provider returned an invalid '{field}' timestamp.",
            details={"field": field},
        ) from error
    return text


def _envelope(payload: Any, key: str) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for candidate in (key, "data", "items", "results"):
            value = payload.get(candidate)
            if isinstance(value, list):
                return value
    raise ProviderError(
        f"Weather provider response did not contain a '{key}' list.",
        details={"expectedKey": key},
    )


def normalize_observation(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ProviderError("Weather provider returned a malformed observation.")
    values = {
        "temperatureC": _finite_number(raw.get("temperatureC")),
        "humidityPct": _finite_number(raw.get("humidityPct")),
        "rainfallMm": _finite_number(raw.get("rainfallMm")),
        "windSpeedMs": _finite_number(raw.get("windSpeedMs")),
    }
    if all(value is None for value in values.values()):
        raise ProviderError(
            "Weather observation did not contain any usable measurement.",
            details={"reason": "no_numeric_measurement"},
        )
    return {
        "observedAt": _timestamp(raw.get("observedAt"), "observedAt"),
        **values,
        "conditions": raw.get("conditions") if isinstance(raw.get("conditions"), str) else None,
        "source": _text(raw.get("source"), "source", 200),
        "sourceReference": _text(raw.get("sourceReference"), "sourceReference", 300),
        "sourceUrl": raw.get("sourceUrl") if isinstance(raw.get("sourceUrl"), str) else "",
        "evidenceClass": "weather_observation",
    }


def normalize_forecast(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ProviderError("Weather provider returned a malformed forecast.")
    values = {
        "temperatureC": _finite_number(raw.get("temperatureC")),
        "humidityPct": _finite_number(raw.get("humidityPct")),
        "rainfallMm": _finite_number(raw.get("rainfallMm")),
        "windSpeedMs": _finite_number(raw.get("windSpeedMs")),
        "precipitationProbabilityPct": _finite_number(
            raw.get("precipitationProbabilityPct")
        ),
    }
    if all(value is None for value in values.values()):
        raise ProviderError(
            "Weather forecast did not contain any usable predicted value.",
            details={"reason": "no_numeric_prediction"},
        )
    return {
        "forecastFor": _timestamp(raw.get("forecastFor"), "forecastFor"),
        **values,
        "conditions": raw.get("conditions") if isinstance(raw.get("conditions"), str) else None,
        "source": _text(raw.get("source"), "source", 200),
        "sourceReference": _text(raw.get("sourceReference"), "sourceReference", 300),
        "sourceUrl": raw.get("sourceUrl") if isinstance(raw.get("sourceUrl"), str) else "",
        "evidenceClass": "weather_forecast",
        "uncertain": True,
    }


def normalize_alert(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ProviderError("Weather provider returned a malformed alert.")
    event = raw.get("event")
    headline = raw.get("headline")
    if not isinstance(event, str) or not event.strip():
        if not isinstance(headline, str) or not headline.strip():
            raise ProviderError(
                "Weather alert did not contain an event or headline.",
                details={"reason": "missing_event"},
            )
        event = headline
    severity = _text(raw.get("severity"), "severity", 40).upper()
    result: dict[str, Any] = {
        "event": event.strip()[:200],
        "severity": severity,
        "headline": headline.strip()[:300] if isinstance(headline, str) else "",
        "source": _text(raw.get("source"), "source", 200),
        "sourceReference": _text(raw.get("sourceReference"), "sourceReference", 300),
        "sourceUrl": raw.get("sourceUrl") if isinstance(raw.get("sourceUrl"), str) else "",
        "evidenceClass": "weather_alert",
    }
    for field in ("startsAt", "endsAt"):
        value = raw.get(field)
        result[field] = _timestamp(value, field) if value not in (None, "") else None
    result["description"] = (
        raw.get("description").strip()[:2000]
        if isinstance(raw.get("description"), str)
        else ""
    )
    return result


class HttpWeatherProvider:
    """HTTP adapter for a configured external weather data provider."""

    backend_name = "http"

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        api_key_header: str,
        observation_path: str,
        forecast_path: str,
        alerts_path: str,
        timeout_seconds: float,
        source_name: str,
        max_attempts: int = 3,
        base_delay_seconds: float = 0.1,
        max_delay_seconds: float = 2.0,
    ) -> None:
        if not base_url:
            raise IntegrationUnavailableError(
                "HTTP weather provider requires a base URL.",
                details={"reason": "weather_base_url_missing"},
            )
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.api_key_header = api_key_header
        self.paths = {
            "observations": observation_path,
            "forecasts": forecast_path,
            "alerts": alerts_path,
        }
        self.timeout_seconds = timeout_seconds
        self.source_name = source_name
        self.max_attempts = max_attempts
        self.base_delay_seconds = base_delay_seconds
        self.max_delay_seconds = max_delay_seconds

    def describe(self) -> dict[str, Any]:
        return {
            "backend": self.backend_name,
            "available": True,
            "sourceName": self.source_name,
            "credentialsInResponse": False,
        }

    def _params(
        self,
        latitude: float | None,
        longitude: float | None,
        region: str,
        from_value: str | None,
        to_value: str | None,
    ) -> dict[str, str]:
        if latitude is None or longitude is None:
            if not region:
                raise IntegrationUnavailableError(
                    "Weather lookup requires coordinates or a farm region.",
                    details={"reason": "weather_location_missing"},
                )
            params = {"region": region}
        else:
            params = {"lat": str(latitude), "lon": str(longitude)}
            if region:
                params["region"] = region
        if from_value:
            params["from"] = from_value
        if to_value:
            params["to"] = to_value
        return params

    async def _request(
        self,
        key: str,
        latitude: float | None,
        longitude: float | None,
        region: str,
        from_value: str | None,
        to_value: str | None,
    ) -> Any:
        params = self._params(latitude, longitude, region, from_value, to_value)
        url = f"{self.base_url}{self.paths[key]}"

        async def operation() -> httpx.Response:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                headers = {self.api_key_header: self.api_key} if self.api_key else {}
                return await client.get(url, params=params, headers=headers)

        try:
            response = await retry_async(
                operation,
                max_attempts=self.max_attempts,
                base_delay_seconds=self.base_delay_seconds,
                max_delay_seconds=self.max_delay_seconds,
            )
        except IntegrationUnavailableError:
            raise
        except Exception as error:  # noqa: BLE001 - third-party transport boundary
            raise ProviderError(
                "Weather provider request failed.",
                details={"reason": type(error).__name__},
            ) from error
        if response.status_code >= 400:
            raise ProviderError(
                "Weather provider rejected the request.",
                details={"status": response.status_code},
            )
        try:
            return response.json()
        except Exception as error:  # noqa: BLE001 - third-party response boundary
            raise ProviderError(
                "Weather provider returned invalid JSON.",
                details={"reason": type(error).__name__},
            ) from error

    async def observations(
        self,
        latitude: float | None,
        longitude: float | None,
        region: str,
        from_value: str | None,
        to_value: str | None,
    ) -> list[dict[str, Any]]:
        payload = await self._request(
            "observations", latitude, longitude, region, from_value, to_value
        )
        return [normalize_observation(item) for item in _envelope(payload, "observations")]

    async def forecasts(
        self,
        latitude: float | None,
        longitude: float | None,
        region: str,
        from_value: str | None,
        to_value: str | None,
    ) -> list[dict[str, Any]]:
        payload = await self._request("forecasts", latitude, longitude, region, from_value, to_value)
        return [normalize_forecast(item) for item in _envelope(payload, "forecasts")]

    async def alerts(
        self,
        latitude: float | None,
        longitude: float | None,
        region: str,
        from_value: str | None,
        to_value: str | None,
    ) -> list[dict[str, Any]]:
        payload = await self._request("alerts", latitude, longitude, region, from_value, to_value)
        return [normalize_alert(item) for item in _envelope(payload, "alerts")]


def build_weather_provider(settings: Settings | None = None) -> Any:
    """Compose the configured provider; 'none' yields an explicit unavailable adapter."""
    active = settings or get_settings()
    if active.weather_provider == "none":
        return UnavailableWeatherProvider()
    return HttpWeatherProvider(
        base_url=active.weather_base_url,
        api_key=active.weather_api_key.get_secret_value(),
        api_key_header=active.weather_api_key_header,
        observation_path=active.weather_observation_path,
        forecast_path=active.weather_forecast_path,
        alerts_path=active.weather_alerts_path,
        timeout_seconds=active.weather_timeout_seconds,
        source_name=active.weather_source_name,
        max_attempts=active.retry_max_attempts,
        base_delay_seconds=active.retry_base_delay_seconds,
        max_delay_seconds=active.retry_max_delay_seconds,
    )

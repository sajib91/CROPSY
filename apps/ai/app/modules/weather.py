"""Weather intelligence with strict separation of observed, forecast, and advisory data.

Weather values originate only from a configured provider. Recommendations are
deterministic, threshold-based, and always labelled as AI-generated advice with
their evidence references. No weather value is inferred or invented here.
"""

from __future__ import annotations

from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings, get_settings
from app.errors import IntegrationUnavailableError
from app.infrastructure.weather import SEVERE_ALERT_LEVELS
from app.models import utc_now

EVIDENCE_CLASSES = (
    "weather_observation",
    "weather_forecast",
    "weather_alert",
    "ai_generated_recommendation",
)


class Coordinates(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class FarmContext(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(default="", max_length=200)
    organizationId: str | None = Field(default=None, max_length=128)
    coordinates: Coordinates | None = None
    region: str = Field(default="", max_length=300)


class CropContext(BaseModel):
    name: str = Field(default="", max_length=200)
    stage: str = Field(default="", max_length=100)
    varietyId: str | None = Field(default=None, max_length=128)
    cropId: str | None = Field(default=None, max_length=128)
    cultivationId: str | None = Field(default=None, max_length=128)
    sownAt: str | None = Field(default=None, max_length=50)
    expectedHarvestAt: str | None = Field(default=None, max_length=50)


class IrrigationContext(BaseModel):
    id: str = Field(default="", max_length=128)
    source: str | None = Field(default=None, max_length=200)
    method: str | None = Field(default=None, max_length=200)
    status: str | None = Field(default=None, max_length=100)
    frequencyPerWeek: float | None = Field(default=None, ge=0, le=100)


class WeatherContext(BaseModel):
    farm: FarmContext
    crop: CropContext = Field(default_factory=CropContext)
    irrigation: list[IrrigationContext] = Field(default_factory=list, max_length=50)
    coordinatesAccess: str = Field(default="GRANTED", max_length=50)


class WeatherLookup(BaseModel):
    """Server-resolved farm context supplied by the trusted business API."""

    model_config = ConfigDict(populate_by_name=True)

    farmId: str = Field(min_length=1, max_length=128)
    language: str = Field(default="en", max_length=10)
    from_: str | None = Field(default=None, alias="from", max_length=50)
    to: str | None = Field(default=None, max_length=50)
    context: WeatherContext | None = None
    coordinates: Coordinates | None = None
    region: str = Field(default="", max_length=300)


class WeatherAdvisoryRequest(WeatherLookup):
    crop: str = Field(default="", max_length=200)
    cropStage: str = Field(default="", max_length=100)
    cultivationId: str | None = Field(default=None, max_length=128)
    includeHistory: bool = True
    includeForecast: bool = True
    includeAlerts: bool = True
    modelKey: str | None = Field(default=None, max_length=100)


class WeatherObservation(BaseModel):
    observedAt: str
    temperatureC: float | None = None
    humidityPct: float | None = None
    rainfallMm: float | None = None
    windSpeedMs: float | None = None
    conditions: str | None = Field(default=None, max_length=200)
    source: str
    sourceReference: str
    sourceUrl: str = Field(default="", max_length=1000)
    evidenceClass: str = "weather_observation"


class WeatherForecast(BaseModel):
    forecastFor: str
    temperatureC: float | None = None
    humidityPct: float | None = None
    rainfallMm: float | None = None
    windSpeedMs: float | None = None
    precipitationProbabilityPct: float | None = Field(default=None, ge=0, le=100)
    conditions: str | None = Field(default=None, max_length=200)
    source: str
    sourceReference: str
    sourceUrl: str = Field(default="", max_length=1000)
    evidenceClass: str = "weather_forecast"
    uncertain: bool = True


class WeatherAlert(BaseModel):
    event: str
    severity: str
    headline: str = Field(default="", max_length=300)
    startsAt: str | None = None
    endsAt: str | None = None
    description: str = Field(default="", max_length=2000)
    source: str
    sourceReference: str
    sourceUrl: str = Field(default="", max_length=1000)
    evidenceClass: str = "weather_alert"


class WeatherProvider(Protocol):
    backend_name: str

    def describe(self) -> dict[str, Any]: ...

    async def observations(
        self, latitude: float | None, longitude: float | None, region: str,
        from_value: str | None, to_value: str | None,
    ) -> list[dict[str, Any]]: ...

    async def forecasts(
        self, latitude: float | None, longitude: float | None, region: str,
        from_value: str | None, to_value: str | None,
    ) -> list[dict[str, Any]]: ...

    async def alerts(
        self, latitude: float | None, longitude: float | None, region: str,
        from_value: str | None, to_value: str | None,
    ) -> list[dict[str, Any]]: ...


class WeatherResult(BaseModel):
    farmId: str
    generatedAt: str = Field(default_factory=lambda: utc_now().isoformat())
    location: dict[str, Any]
    provider: dict[str, Any]
    evidenceClasses: list[str]
    advisory: bool = True
    language: str = "en"


class WeatherObservationResult(WeatherResult):
    observations: list[WeatherObservation] = Field(default_factory=list)
    historyRequested: bool = True


class WeatherForecastResult(WeatherResult):
    forecasts: list[WeatherForecast] = Field(default_factory=list)


class WeatherAlertResult(WeatherResult):
    alerts: list[WeatherAlert] = Field(default_factory=list)
    severeAlerts: list[WeatherAlert] = Field(default_factory=list)


class WeatherRecommendation(BaseModel):
    text: str
    basis: list[str] = Field(default_factory=list)
    evidenceClass: str = "ai_generated_recommendation"
    advisory: bool = True
    uncertain: bool = True


class WeatherRiskNotification(BaseModel):
    risk: str
    level: str
    basis: list[str] = Field(default_factory=list)
    advisory: bool = True
    evidenceClass: str = "ai_generated_recommendation"


class WeatherAdvisoryResult(WeatherResult):
    crop: dict[str, Any] = Field(default_factory=dict)
    observations: list[WeatherObservation] = Field(default_factory=list)
    forecasts: list[WeatherForecast] = Field(default_factory=list)
    alerts: list[WeatherAlert] = Field(default_factory=list)
    severeAlerts: list[WeatherAlert] = Field(default_factory=list)
    riskNotifications: list[WeatherRiskNotification] = Field(default_factory=list)
    recommendations: list[WeatherRecommendation] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class WeatherIntelligenceService:
    def __init__(
        self,
        provider: WeatherProvider,
        settings: Settings | None = None,
    ) -> None:
        self.provider = provider
        self.settings = settings or get_settings()

    def _location(self, value: WeatherLookup) -> dict[str, Any]:
        coordinates = None
        region = ""
        farm = None
        if value.context is not None:
            farm = value.context.farm
            coordinates = farm.coordinates
            region = farm.region
        if coordinates is None:
            coordinates = value.coordinates
        if not region:
            region = value.region
        if coordinates is None and not region:
            raise IntegrationUnavailableError(
                "No usable farm location is available for weather intelligence.",
                details={"reason": "weather_location_missing"},
            )
        return {
            "farmId": value.farmId,
            "farmName": farm.name if farm else "",
            "farmOrganizationId": farm.organizationId if farm else None,
            "coordinates": (
                {"latitude": coordinates.latitude, "longitude": coordinates.longitude}
                if coordinates
                else None
            ),
            "region": region,
            "coordinatesAccess": value.context.coordinatesAccess if value.context else "UNSPECIFIED",
        }

    def _provider_info(self) -> dict[str, Any]:
        info = self.provider.describe()
        source = self.settings.weather_source_name or info.get("sourceName") or ""
        return {**info, "sourceName": source, "credentialsInResponse": False}

    async def observations(self, value: WeatherLookup) -> WeatherObservationResult:
        location = self._location(value)
        coordinates = location["coordinates"]
        raw = await self.provider.observations(
            coordinates["latitude"] if coordinates else None,
            coordinates["longitude"] if coordinates else None,
            location["region"],
            value.from_,
            value.to,
        )
        return WeatherObservationResult(
            farmId=value.farmId,
            location=location,
            provider=self._provider_info(),
            language=value.language,
            evidenceClasses=["weather_observation"],
            observations=[WeatherObservation(**item) for item in raw],
            historyRequested=True,
        )

    async def forecasts(self, value: WeatherLookup) -> WeatherForecastResult:
        location = self._location(value)
        coordinates = location["coordinates"]
        raw = await self.provider.forecasts(
            coordinates["latitude"] if coordinates else None,
            coordinates["longitude"] if coordinates else None,
            location["region"],
            value.from_,
            value.to,
        )
        return WeatherForecastResult(
            farmId=value.farmId,
            location=location,
            provider=self._provider_info(),
            language=value.language,
            evidenceClasses=["weather_forecast"],
            forecasts=[WeatherForecast(**item) for item in raw],
        )

    async def alerts(self, value: WeatherLookup) -> WeatherAlertResult:
        location = self._location(value)
        coordinates = location["coordinates"]
        raw = await self.provider.alerts(
            coordinates["latitude"] if coordinates else None,
            coordinates["longitude"] if coordinates else None,
            location["region"],
            value.from_,
            value.to,
        )
        alerts = [WeatherAlert(**item) for item in raw]
        return WeatherAlertResult(
            farmId=value.farmId,
            location=location,
            provider=self._provider_info(),
            language=value.language,
            evidenceClasses=["weather_alert"],
            alerts=alerts,
            severeAlerts=[
                item for item in alerts if item.severity.upper() in SEVERE_ALERT_LEVELS
            ],
        )

    def _crop_context(self, value: WeatherAdvisoryRequest) -> dict[str, Any]:
        context_crop = value.context.crop if value.context else None
        return {
            "name": value.crop or (context_crop.name if context_crop else ""),
            "cropStage": value.cropStage or (context_crop.stage if context_crop else ""),
            "cultivationId": value.cultivationId
            or (context_crop.cultivationId if context_crop else None),
            "cropId": context_crop.cropId if context_crop else None,
            "varietyId": context_crop.varietyId if context_crop else None,
            "sownAt": context_crop.sownAt if context_crop else None,
            "expectedHarvestAt": context_crop.expectedHarvestAt if context_crop else None,
        }

    def _recommendations(
        self,
        *,
        observations: list[WeatherObservation],
        forecasts: list[WeatherForecast],
        severe_alerts: list[WeatherAlert],
        irrigation: list[IrrigationContext],
        crop_stage: str,
    ) -> tuple[list[WeatherRecommendation], list[WeatherRiskNotification]]:
        recommendations: list[WeatherRecommendation] = []
        risks: list[WeatherRiskNotification] = []

        for alert in severe_alerts:
            basis = [alert.sourceReference]
            risks.append(
                WeatherRiskNotification(
                    risk=f"Severe weather alert: {alert.event}",
                    level=alert.severity,
                    basis=basis,
                )
            )
            recommendations.append(
                WeatherRecommendation(
                    text=(
                        f"Review the {alert.event} weather alert for this farm and "
                        "postpone weather-sensitive field work while it is active."
                    ),
                    basis=basis,
                )
            )

        rain_values = [
            item.rainfallMm for item in forecasts if item.rainfallMm is not None
        ]
        if rain_values and max(rain_values) >= self.settings.weather_heavy_rain_mm:
            refs = [
                item.sourceReference
                for item in forecasts
                if item.rainfallMm is not None
                and item.rainfallMm >= self.settings.weather_heavy_rain_mm
            ][:3]
            risks.append(
                WeatherRiskNotification(
                    risk="Heavy rainfall indicated in provider forecast",
                    level="HIGH",
                    basis=refs,
                )
            )
            recommendations.append(
                WeatherRecommendation(
                    text=(
                        "Forecast rainfall is high; consider checking drainage and "
                        "delaying irrigation until field conditions are verified."
                    ),
                    basis=refs,
                )
            )
        elif rain_values and max(rain_values) <= self.settings.weather_low_rain_mm:
            refs = [
                item.sourceReference
                for item in forecasts
                if item.rainfallMm is not None
                and item.rainfallMm <= self.settings.weather_low_rain_mm
            ][:3]
            recommendation = WeatherRecommendation(
                text=(
                    "Forecast rainfall is low; verify soil moisture before deciding "
                    "whether to schedule irrigation."
                ),
                basis=refs,
            )
            recommendations.append(recommendation)
            if irrigation:
                recommendations.append(
                    WeatherRecommendation(
                        text=(
                            "The farm has recorded irrigation context; review the "
                            "available method and source before scheduling water."
                        ),
                        basis=refs + [f"farm-irrigation:{item.id}" for item in irrigation[:3]],
                    )
                )

        temperatures = [
            item.temperatureC for item in forecasts if item.temperatureC is not None
        ]
        if temperatures and max(temperatures) >= self.settings.weather_high_temperature_c:
            refs = [
                item.sourceReference
                for item in forecasts
                if item.temperatureC is not None
                and item.temperatureC >= self.settings.weather_high_temperature_c
            ][:3]
            risks.append(
                WeatherRiskNotification(
                    risk="High temperature indicated in provider forecast",
                    level="HIGH",
                    basis=refs,
                )
            )
            recommendations.append(
                WeatherRecommendation(
                    text=(
                        "Forecast temperature is high; consider moisture-conserving "
                        "practices and verify crop tolerance locally."
                    ),
                    basis=refs,
                )
            )
        if temperatures and min(temperatures) <= self.settings.weather_low_temperature_c:
            refs = [
                item.sourceReference
                for item in forecasts
                if item.temperatureC is not None
                and item.temperatureC <= self.settings.weather_low_temperature_c
            ][:3]
            risks.append(
                WeatherRiskNotification(
                    risk="Low temperature indicated in provider forecast",
                    level="HIGH",
                    basis=refs,
                )
            )
            recommendations.append(
                WeatherRecommendation(
                    text=(
                        "Forecast temperature is low; consider protective measures "
                        "and verify crop-stage sensitivity locally."
                    ),
                    basis=refs,
                )
            )

        humidity = [item.humidityPct for item in observations if item.humidityPct is not None]
        if humidity and max(humidity) >= self.settings.weather_high_humidity_pct:
            refs = [
                item.sourceReference
                for item in observations
                if item.humidityPct is not None
                and item.humidityPct >= self.settings.weather_high_humidity_pct
            ][:3]
            recommendations.append(
                WeatherRecommendation(
                    text=(
                        "Observed humidity is high; consider scouting for humidity-related "
                        "crop issues and verify locally before acting."
                    ),
                    basis=refs,
                )
            )

        if crop_stage:
            recommendations.append(
                WeatherRecommendation(
                    text=(
                        f"Apply the above advisories with the reported '{crop_stage}' crop stage "
                        "in mind; stage-specific requirements must be verified from approved sources."
                    ),
                    basis=[],
                )
            )

        return recommendations, risks

    async def advisory(self, value: WeatherAdvisoryRequest) -> WeatherAdvisoryResult:
        location = self._location(value)
        coordinates = location["coordinates"]
        lat = coordinates["latitude"] if coordinates else None
        lon = coordinates["longitude"] if coordinates else None

        observations: list[WeatherObservation] = []
        forecasts: list[WeatherForecast] = []
        alerts: list[WeatherAlert] = []
        if value.includeHistory:
            observations = [
                WeatherObservation(**item)
                for item in await self.provider.observations(
                    lat, lon, location["region"], value.from_, value.to
                )
            ]
        if value.includeForecast:
            forecasts = [
                WeatherForecast(**item)
                for item in await self.provider.forecasts(
                    lat, lon, location["region"], value.from_, value.to
                )
            ]
        if value.includeAlerts:
            alerts = [
                WeatherAlert(**item)
                for item in await self.provider.alerts(
                    lat, lon, location["region"], value.from_, value.to
                )
            ]
        severe = [
            item for item in alerts if item.severity.upper() in SEVERE_ALERT_LEVELS
        ]
        irrigation = value.context.irrigation if value.context else []
        crop_stage = self._crop_context(value)["cropStage"]
        recommendations, risks = self._recommendations(
            observations=observations,
            forecasts=forecasts,
            severe_alerts=severe,
            irrigation=irrigation,
            crop_stage=crop_stage,
        )
        return WeatherAdvisoryResult(
            farmId=value.farmId,
            location=location,
            provider=self._provider_info(),
            language=value.language,
            evidenceClasses=list(EVIDENCE_CLASSES),
            crop=self._crop_context(value),
            observations=observations,
            forecasts=forecasts,
            alerts=alerts,
            severeAlerts=severe,
            riskNotifications=risks,
            recommendations=recommendations,
            limitations=[
                "Observations, forecasts, alerts, and recommendations are kept in separate fields.",
                "Thresholds used for advisories are deployment configuration, not verified crop requirements.",
                "Recommendations are advisory only and require local verification.",
            ],
        )

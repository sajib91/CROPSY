"""Configurable market forecasting pipeline with time-based evaluation.

The pipeline consumes only observations supplied by the caller. It never
invented a live price and never treats a model output as a historical fact.
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Callable, Iterable, Sequence
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.models import utc_now


class PriceObservation(BaseModel):
    observationId: str = Field(min_length=1, max_length=180)
    productId: str = Field(min_length=1, max_length=128)
    listingId: str | None = Field(default=None, max_length=128)
    price: float = Field(gt=0, le=1e12)
    currency: str = Field(min_length=1, max_length=3)
    observedAt: datetime
    region: str = Field(default="", max_length=200)
    status: str | None = Field(default=None, max_length=64)
    quantityAvailable: float | None = Field(default=None, ge=0, le=1e12)
    harvestDate: str | None = Field(default=None, max_length=20)
    favoriteCount: int = Field(default=0, ge=0, le=1_000_000)
    demandSignal: str | None = Field(default=None, max_length=64)
    source: str = Field(min_length=1, max_length=300)
    sourceReference: str = Field(min_length=1, max_length=300)
    sourceUrl: str = Field(default="", max_length=1000)
    collectionMethod: str = Field(min_length=1, max_length=120)
    evidenceClass: Literal["historical_observation"] = "historical_observation"


class MarketForecastRequest(BaseModel):
    observations: list[PriceObservation] = Field(min_length=1, max_length=500)
    productId: str | None = Field(default=None, max_length=128)
    region: str | None = Field(default=None, max_length=200)
    horizon: int = Field(default=3, ge=1, le=12)
    model: str | None = Field(default=None, max_length=100)
    seasonLength: int | None = Field(default=None, ge=1, le=24)
    language: str = Field(default="en", max_length=10)
    includeExplanation: bool = False


class StatisticalEstimates(BaseModel):
    evidenceClass: str = "statistical_estimate"
    observationCount: int
    currency: str
    min: float
    max: float
    mean: float
    median: float
    standardDeviation: float
    oldestObservedAt: str
    latestObservedAt: str
    sourceCount: int


class MlPrediction(BaseModel):
    forecastFor: str
    predictedPrice: float
    currency: str
    evidenceClass: str = "ml_prediction"
    uncertain: bool = True
    basisObservationIds: list[str] = Field(default_factory=list)


class ForecastEvaluation(BaseModel):
    evaluated: bool
    method: str = "time_based_split"
    trainObservationIds: list[str] = Field(default_factory=list)
    testObservationIds: list[str] = Field(default_factory=list)
    mae: float | None = None
    rmse: float | None = None
    mape: float | None = None
    mapeApplicable: bool = False
    mapeNote: str = ""
    limitations: list[str] = Field(default_factory=list)


class MarketForecastResult(BaseModel):
    productId: str | None = None
    region: str | None = None
    generatedAt: str = Field(default_factory=lambda: utc_now().isoformat())
    historicalObservations: list[PriceObservation]
    statisticalEstimates: StatisticalEstimates | None = None
    mlPredictions: list[MlPrediction] = Field(default_factory=list)
    llmExplanation: dict[str, Any] | None = None
    evaluation: ForecastEvaluation
    pipeline: dict[str, Any]
    evidenceClasses: list[str] = Field(
        default_factory=lambda: [
            "historical_observation",
            "statistical_estimate",
            "ml_prediction",
            "llm_generated_explanation",
        ]
    )
    advisory: bool = True


Point = tuple[datetime, float]


class ForecastModel(Protocol):
    name: str

    def fit(self, points: Sequence[Point]) -> None: ...

    def predict(self, horizon: int) -> list[float]: ...


class MovingAverageModel:
    name = "moving_average"

    def __init__(self, window: int = 3) -> None:
        if window < 1:
            raise ValueError("window must be positive")
        self.window = window
        self._values: list[float] = []

    def fit(self, points: Sequence[Point]) -> None:
        self._values = [price for _, price in points]

    def predict(self, horizon: int) -> list[float]:
        if not self._values:
            raise RuntimeError("model must be fitted before prediction")
        window = min(self.window, len(self._values))
        value = sum(self._values[-window:]) / window
        return [value] * horizon


class SeasonalNaiveModel:
    name = "seasonal_naive"

    def __init__(self, season_length: int = 1) -> None:
        if season_length < 1:
            raise ValueError("season_length must be positive")
        self.season_length = season_length
        self._values: list[float] = []

    def fit(self, points: Sequence[Point]) -> None:
        self._values = [price for _, price in points]

    def predict(self, horizon: int) -> list[float]:
        if not self._values:
            raise RuntimeError("model must be fitted before prediction")
        cycle = min(self.season_length, len(self._values))
        recent = self._values[-cycle:]
        return [recent[index % cycle] for index in range(horizon)]


class LogLinearTrendModel:
    """Least-squares trend on log prices, which keeps predictions positive."""

    name = "linear_trend"

    def __init__(self) -> None:
        self._origin: datetime | None = None
        self._last_day = 0.0
        self._intercept = 0.0
        self._slope = 0.0

    def fit(self, points: Sequence[Point]) -> None:
        if not points:
            raise ValueError("at least one point is required")
        self._origin = points[0][0]
        xs = [(moment - self._origin).total_seconds() / 86400.0 for moment, _ in points]
        self._last_day = max(xs)
        ys = [math.log(price) for _, price in points]
        x_mean = sum(xs) / len(xs)
        y_mean = sum(ys) / len(ys)
        denominator = sum((x - x_mean) ** 2 for x in xs)
        self._slope = 0.0 if denominator == 0 else sum(
            (x - x_mean) * (y - y_mean) for x, y in zip(xs, ys)
        ) / denominator
        self._intercept = y_mean - self._slope * x_mean

    def predict(self, horizon: int) -> list[float]:
        if self._origin is None:
            raise RuntimeError("model must be fitted before prediction")
        return [
            math.exp(self._intercept + self._slope * (self._last_day + index + 1))
            for index in range(horizon)
        ]


ForecastModelFactory = Callable[[Settings, int | None], ForecastModel]


class ForecastPipelineRegistry:
    """Registry seam for local or externally registered model pipelines."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._factories: dict[str, ForecastModelFactory] = {
            "moving_average": lambda settings, _: MovingAverageModel(window=3),
            "seasonal_naive": lambda settings, season: SeasonalNaiveModel(
                season_length=season or 1
            ),
            "linear_trend": lambda settings, _: LogLinearTrendModel(),
        }

    def register(self, name: str, factory: ForecastModelFactory) -> None:
        if not name or not callable(factory):
            raise ValueError("a model name and callable factory are required")
        self._factories[name] = factory

    def resolve(self, name: str | None = None, season_length: int | None = None) -> tuple[str, ForecastModel]:
        key = name or self.settings.forecasting_model
        factory = self._factories.get(key)
        if factory is None:
            raise ValueError(f"Unknown forecasting model '{key}'.")
        return key, factory(self.settings, season_length)

    def describe(self) -> list[str]:
        return sorted(self._factories)


def _round(value: float, digits: int = 6) -> float:
    return round(value, digits)


def _points(observations: Sequence[PriceObservation]) -> list[Point]:
    ordered = sorted(observations, key=lambda item: (item.observedAt, item.observationId))
    return [(item.observedAt, item.price) for item in ordered]


def _forecast_times(points: Sequence[Point], horizon: int) -> list[datetime]:
    if len(points) >= 2:
        deltas = [
            (points[index][0] - points[index - 1][0]).total_seconds()
            for index in range(1, len(points))
        ]
        positive = [value for value in deltas if value > 0]
        interval = timedelta(seconds=statistics.median(positive)) if positive else timedelta(days=1)
    else:
        interval = timedelta(days=1)
    last = points[-1][0]
    return [last + interval * (index + 1) for index in range(horizon)]


def _metrics(actual: Iterable[float], predicted: Iterable[float]) -> tuple[float, float, float | None, bool, str]:
    pairs = list(zip(actual, predicted))
    if not pairs:
        raise ValueError("cannot evaluate an empty prediction set")
    errors = [abs(value - estimate) for value, estimate in pairs]
    mae = _round(sum(errors) / len(errors))
    rmse = _round(math.sqrt(sum(error**2 for error in errors) / len(errors)))
    if any(value == 0 for value, _ in pairs):
        return mae, rmse, None, False, "MAPE is undefined when an observed price is zero."
    mape = _round(sum(abs((value - estimate) / value) for value, estimate in pairs) * 100 / len(pairs))
    return mae, rmse, mape, True, ""


class MarketForecastService:
    def __init__(self, settings: Settings | None = None, registry: ForecastPipelineRegistry | None = None) -> None:
        self.settings = settings or get_settings()
        self.registry = registry or ForecastPipelineRegistry(self.settings)

    @staticmethod
    def statistical_estimates(observations: Sequence[PriceObservation]) -> StatisticalEstimates:
        values = [item.price for item in observations]
        ordered = sorted(observations, key=lambda item: item.observedAt)
        return StatisticalEstimates(
            observationCount=len(values),
            currency=observations[0].currency,
            min=_round(min(values)),
            max=_round(max(values)),
            mean=_round(statistics.fmean(values)),
            median=_round(statistics.median(values)),
            standardDeviation=_round(statistics.pstdev(values) if len(values) > 1 else 0.0),
            oldestObservedAt=ordered[0].observedAt.isoformat(),
            latestObservedAt=ordered[-1].observedAt.isoformat(),
            sourceCount=len({item.source for item in observations}),
        )

    def _evaluate(
        self,
        observations: Sequence[PriceObservation],
        model_name: str,
        season_length: int | None,
    ) -> ForecastEvaluation:
        ordered = sorted(observations, key=lambda item: (item.observedAt, item.observationId))
        minimum = self.settings.forecasting_min_observations
        validation_size = self.settings.forecasting_validation_size
        evaluation = ForecastEvaluation(evaluated=False)
        if len(ordered) < minimum + validation_size:
            evaluation.limitations = [
                f"At least {minimum + validation_size} observations are required for time-based validation."
            ]
            return evaluation

        train, test = ordered[:-validation_size], ordered[-validation_size:]
        _, model = self.registry.resolve(model_name, season_length)
        train_points = _points(train)
        model.fit(train_points)
        predicted = model.predict(len(test))
        mae, rmse, mape, applicable, note = _metrics(
            [item.price for item in test], predicted
        )
        return ForecastEvaluation(
            evaluated=True,
            trainObservationIds=[item.observationId for item in train],
            testObservationIds=[item.observationId for item in test],
            mae=mae,
            rmse=rmse,
            mape=mape,
            mapeApplicable=applicable,
            mapeNote=note,
            limitations=[
                "Validation uses strictly later observations than training; no random shuffle is used.",
                "Metrics describe this supplied dataset only and are not a production accuracy claim.",
            ],
        )

    async def forecast(self, value: MarketForecastRequest) -> MarketForecastResult:
        requested_model = value.model or self.settings.forecasting_model
        model_name, model = self.registry.resolve(requested_model, value.seasonLength)
        observations = sorted(
            value.observations, key=lambda item: (item.observedAt, item.observationId)
        )
        points = _points(observations)
        model.fit(points)
        raw_predictions = model.predict(value.horizon)
        prediction_times = _forecast_times(points, value.horizon)
        predictions = [
            MlPrediction(
                forecastFor=moment.isoformat(),
                predictedPrice=_round(price),
                currency=observations[0].currency,
                basisObservationIds=[item.observationId for item in observations[-3:]],
            )
            for moment, price in zip(prediction_times, raw_predictions)
        ]
        return MarketForecastResult(
            productId=value.productId,
            region=value.region,
            historicalObservations=[item.model_dump(mode="json") for item in observations],
            statisticalEstimates=self.statistical_estimates(observations),
            mlPredictions=[item.model_dump(mode="json") for item in predictions],
            evaluation=self._evaluate(observations, requested_model, value.seasonLength),
            pipeline={
                "model": model_name,
                "configuredDefault": self.settings.forecasting_model,
                "availableModels": self.registry.describe(),
                "trainingObservations": len(observations),
                "horizon": value.horizon,
                "seasonLength": value.seasonLength,
            },
        )

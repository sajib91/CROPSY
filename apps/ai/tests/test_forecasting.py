import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.modules.forecasting import (
    ForecastPipelineRegistry,
    MarketForecastRequest,
    MarketForecastService,
    MovingAverageModel,
    PriceObservation,
    SeasonalNaiveModel,
    _metrics,
)


def observation(index: int, price: float, *, currency: str = "BDT") -> PriceObservation:
    moment = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=index)
    return PriceObservation(
        observationId=f"obs-{index:03d}",
        productId="product-rice",
        price=price,
        currency=currency,
        observedAt=moment,
        region="Sylhet",
        source="CROPSY marketplace listing",
        sourceReference=f"listing:{index}",
        collectionMethod="seller_submitted_listing",
        evidenceClass="historical_observation",
    )


def settings(**overrides: object) -> Settings:
    values = {
        "environment": "test",
        "forecasting_min_observations": 4,
        "forecasting_validation_size": 2,
    }
    values.update(overrides)
    return Settings(**values)


def test_forecast_separates_observations_estimates_and_predictions() -> None:
    service = MarketForecastService(settings())
    observations = [observation(index, 100 + index) for index in range(8)]
    result = asyncio.run(
        service.forecast(
            MarketForecastRequest(
                observations=observations,
                productId="product-rice",
                region="Sylhet",
                horizon=3,
                model="moving_average",
                language="bn",
            )
        )
    )
    dumped = result.model_dump(mode="json")
    assert len(dumped["historicalObservations"]) == 8
    assert all(
        item["evidenceClass"] == "historical_observation"
        for item in dumped["historicalObservations"]
    )
    assert dumped["statisticalEstimates"]["evidenceClass"] == "statistical_estimate"
    assert dumped["statisticalEstimates"]["observationCount"] == 8
    assert len(dumped["mlPredictions"]) == 3
    assert all(
        item["evidenceClass"] == "ml_prediction" and item["uncertain"] is True
        for item in dumped["mlPredictions"]
    )
    assert dumped["advisory"] is True
    assert "historical_observation" in dumped["evidenceClasses"]
    assert "llm_generated_explanation" in dumped["evidenceClasses"]
    assert dumped["llmExplanation"] is None


def test_forecast_uses_time_based_validation_and_reports_metrics() -> None:
    service = MarketForecastService(settings())
    observations = [observation(index, 100 + index) for index in range(8)]
    result = asyncio.run(
        service.forecast(
            MarketForecastRequest(
                observations=observations,
                horizon=2,
                model="moving_average",
            )
        )
    )
    evaluation = result.evaluation
    assert evaluation.evaluated is True
    assert evaluation.method == "time_based_split"
    assert evaluation.trainObservationIds == [f"obs-{index:03d}" for index in range(6)]
    assert evaluation.testObservationIds == ["obs-006", "obs-007"]
    assert evaluation.mae is not None and evaluation.mae >= 0
    assert evaluation.rmse is not None and evaluation.rmse >= evaluation.mae
    assert evaluation.mape is not None and evaluation.mapeApplicable is True
    assert any("strictly later" in item for item in evaluation.limitations)


def test_forecast_reports_insufficient_data_without_inventing_metrics() -> None:
    service = MarketForecastService(settings())
    result = asyncio.run(
        service.forecast(
            MarketForecastRequest(
                observations=[observation(0, 100.0), observation(1, 110.0)],
                horizon=2,
            )
        )
    )
    assert result.evaluation.evaluated is False
    assert result.evaluation.mae is None
    assert result.evaluation.rmse is None
    assert result.evaluation.mape is None
    assert result.evaluation.limitations
    assert len(result.mlPredictions) == 2
    assert all(item.uncertain for item in result.mlPredictions)


def test_mape_is_omitted_when_undefined() -> None:
    mae, rmse, mape, applicable, note = _metrics([0.0, 10.0], [1.0, 11.0])
    assert mae == 1.0
    assert rmse == 1.0
    assert mape is None
    assert applicable is False
    assert "undefined" in note


def test_model_registry_is_configurable_and_rejects_unknown_models() -> None:
    registry = ForecastPipelineRegistry(settings())
    assert set(registry.describe()) == {"moving_average", "seasonal_naive", "linear_trend"}
    name, model = registry.resolve("seasonal_naive", 2)
    assert name == "seasonal_naive"
    assert isinstance(model, SeasonalNaiveModel)
    assert registry.resolve("moving_average")[1].name == "moving_average"
    assert isinstance(MovingAverageModel(window=2), MovingAverageModel)
    with pytest.raises(ValueError, match="Unknown forecasting model"):
        registry.resolve("not-a-model")


def test_observations_require_provenance_and_positive_price() -> None:
    with pytest.raises(ValidationError):
        PriceObservation(
            observationId="bad",
            productId="product-rice",
            price=0,
            currency="BDT",
            observedAt=datetime.now(timezone.utc),
            source="",
            sourceReference="",
        )

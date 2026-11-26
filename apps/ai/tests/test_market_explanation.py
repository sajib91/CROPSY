import asyncio

from app.config import Settings
from app.models import LLMRequest, LLMResponse, Usage
from app.modules.llm_provider import LLMProviderManager
from app.modules.market_explanation import MarketExplanationRequest, MarketExplanationService
from app.modules.model_config import ModelRegistry


class CaptureProvider:
    provider_name = "capture"

    def __init__(self, text: str = "Collected observations show a narrow range.") -> None:
        self.text = text
        self.requests: list[LLMRequest] = []
        self.models: list[str] = []

    async def generate(self, request: LLMRequest, model: str) -> LLMResponse:
        self.requests.append(request)
        self.models.append(model)
        return LLMResponse(
            text=self.text,
            model=model,
            provider=self.provider_name,
            usage=Usage(provider=self.provider_name, model=model),
            advisory=True,
        )


def test_explanation_is_isolated_labelled_and_bounded_to_supplied_facts() -> None:
    settings = Settings(environment="test", llm_provider="mock")
    provider = CaptureProvider()
    llms = LLMProviderManager(settings)
    llms.register("mock", provider)
    service = MarketExplanationService(llms, ModelRegistry(settings))

    result = asyncio.run(
        service.explain(
            MarketExplanationRequest(
                productId="product-rice",
                region="Sylhet",
                language="bn",
                observations=[
                    {
                        "observationId": "obs-001",
                        "price": 100.0,
                        "currency": "BDT",
                        "observedAt": "2026-01-01T00:00:00+00:00",
                        "source": "CROPSY marketplace listing",
                        "sourceReference": "listing:1",
                        "evidenceClass": "historical_observation",
                    }
                ],
                statisticalEstimates={"mean": 100.0, "observationCount": 1},
                predictions=[
                    {
                        "forecastFor": "2026-01-02T00:00:00+00:00",
                        "predictedPrice": 102.0,
                        "evidenceClass": "ml_prediction",
                        "uncertain": True,
                    }
                ],
                evaluation={"evaluated": False},
            )
        )
    )

    dumped = result.model_dump(mode="json")
    assert dumped["evidenceClass"] == "llm_generated_explanation"
    assert dumped["advisory"] is True
    assert dumped["language"] == "bn"
    assert dumped["basedOn"]["observationIds"] == ["obs-001"]
    assert dumped["basedOn"]["predictionCount"] == 1
    assert any("LLM-generated" in item for item in dumped["limitations"])

    assert len(provider.requests) == 1
    prompt = provider.requests[0].prompt
    system_prompt = provider.requests[0].systemPrompt
    assert "Answer in Bengali" in prompt
    assert "SUPPLIED DATA" in prompt
    assert "listing:1" in prompt
    assert "prediction" in prompt.lower()
    assert "Do not introduce live prices" in system_prompt
    assert "Do not introduce" in system_prompt and "citations" in system_prompt

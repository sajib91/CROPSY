"""LLM-generated explanations for market analytics.

Explanations are deliberately isolated from observations, statistical
estimates, and ML predictions. The LLM receives only caller-supplied facts and
is never asked to produce a live quote or a citation.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from app.models import LLMRequest
from app.modules.llm_provider import LLMProviderManager
from app.modules.model_config import ModelRegistry


class MarketExplanationRequest(BaseModel):
    productId: str | None = Field(default=None, max_length=128)
    region: str | None = Field(default=None, max_length=200)
    language: str = Field(default="en", max_length=10)
    modelKey: str | None = Field(default=None, max_length=100)
    observations: list[dict[str, Any]] = Field(min_length=1, max_length=500)
    statisticalEstimates: dict[str, Any] = Field(default_factory=dict)
    predictions: list[dict[str, Any]] = Field(default_factory=list, max_length=12)
    evaluation: dict[str, Any] = Field(default_factory=dict)


class MarketExplanationResult(BaseModel):
    text: str
    evidenceClass: str = "llm_generated_explanation"
    advisory: bool = True
    language: str
    model: str
    provider: str
    basedOn: dict[str, Any] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list)


class MarketExplanationService:
    SYSTEM_PROMPT = (
        "You explain agricultural market data for farmers. Use only the supplied data. "
        "Do not introduce live prices, external facts, citations, source names, dates, or numbers "
        "that are not present in the supplied data. Distinguish observations from estimates and "
        "predictions. State uncertainty. Keep the answer short and advisory. "
        "If the supplied data is insufficient, say so."
    )

    def __init__(self, llms: LLMProviderManager, models: ModelRegistry) -> None:
        self.llms = llms
        self.models = models

    async def explain(self, value: MarketExplanationRequest) -> MarketExplanationResult:
        model_config = self.models.resolve(value.modelKey, task="general")
        facts = {
            "productId": value.productId,
            "region": value.region,
            "historicalObservations": value.observations,
            "statisticalEstimates": value.statisticalEstimates,
            "mlPredictions": value.predictions,
            "timeBasedEvaluation": value.evaluation,
        }
        language_note = "Answer in Bengali." if value.language == "bn" else "Answer in English."
        prompt = (
            f"{language_note}\nSUPPLIED DATA (JSON):\n"
            f"{json.dumps(facts, ensure_ascii=False, sort_keys=True)[:12000]}\n"
            "Explain what the supplied data shows. Clearly label any forward-looking statement "
            "as a prediction and do not present a prediction as an observation."
        )
        response = await self.llms.generate(
            LLMRequest(
                prompt=prompt,
                systemPrompt=self.SYSTEM_PROMPT,
                maxTokens=500,
                temperature=0.1,
                task="market-explanation",
            ),
            model=model_config.modelName,
        )
        return MarketExplanationResult(
            text=response.text,
            language=value.language,
            model=response.model,
            provider=response.provider,
            basedOn={
                "observationIds": [
                    item.get("observationId")
                    for item in value.observations
                    if item.get("observationId")
                ],
                "predictionCount": len(value.predictions),
                "evaluation": value.evaluation,
            },
            limitations=[
                "This text is LLM-generated and may contain errors; verify against the separated data fields.",
                "It is not a live market quote, agronomic requirement, or regulatory statement.",
            ],
        )

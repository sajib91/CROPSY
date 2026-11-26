from typing import Any, Literal

from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.errors import ConfigurationError


class ModelConfig(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    provider: Literal["mock", "http"]
    modelName: str = Field(min_length=1, max_length=200)
    tasks: list[str] = Field(default_factory=lambda: ["general"])
    maxTokens: int = Field(default=800, ge=1, le=8000)
    temperature: float = Field(default=0.1, ge=0, le=2)
    inputCostPerMillionTokensUsd: float = Field(default=0.0, ge=0)
    outputCostPerMillionTokensUsd: float = Field(default=0.0, ge=0)
    enabled: bool = True
    advisoryOnly: bool = True


class ModelRegistry:
    """Configurable model selection with no hard-coded provider credentials."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._models: dict[str, ModelConfig] = {}
        self._load_defaults()
        self._load_overrides()

    def _load_defaults(self) -> None:
        production = self.settings.environment == "production"
        defaults = [
            ModelConfig(
                key="advisory-local",
                provider="mock",
                modelName="cropsy-deterministic-advisory-v1",
                tasks=["general", "ask", "recommend", "classify", "ocr-review"],
                enabled=not production or self.settings.allow_mock_provider,
            ),
            ModelConfig(
                key="advisory-http",
                provider="http",
                modelName="configured-http-model",
                tasks=["general", "ask", "recommend", "classify", "ocr-review"],
                enabled=self.settings.llm_provider == "http",
            ),
        ]
        for model in defaults:
            self._models[model.key] = model

    def _load_overrides(self) -> None:
        for raw in self.settings.parsed_model_configs():
            model = ModelConfig(**raw)
            self._models[model.key] = model

    def register(self, model: ModelConfig) -> None:
        self._models[model.key] = model

    def get(self, key: str) -> ModelConfig:
        model = self._models.get(key)
        if model is None:
            raise ConfigurationError(f"Unknown model configuration '{key}'.")
        if not model.enabled:
            raise ConfigurationError(f"Model configuration '{key}' is disabled.")
        return model

    def resolve(self, key: str | None = None, task: str = "general") -> ModelConfig:
        if key:
            return self.get(key)
        if self.settings.llm_provider == "http":
            preferred = "advisory-http"
        else:
            preferred = "advisory-local"
        model = self._models.get(preferred)
        if model is not None and model.enabled and task in model.tasks:
            return model
        for candidate in self._models.values():
            if candidate.enabled and task in candidate.tasks:
                return candidate
        raise ConfigurationError(f"No enabled model supports task '{task}'.")

    def describe(self) -> list[dict[str, Any]]:
        return [
            model.model_dump(mode="json")
            for model in sorted(self._models.values(), key=lambda item: item.key)
        ]

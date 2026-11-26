import logging
from typing import Any, Protocol

import httpx

from app.config import Settings, get_settings
from app.errors import ConfigurationError, ProviderError
from app.models import LLMRequest, LLMResponse, Usage
from app.retry import retry_async

logger = logging.getLogger("cropsy.ai.llm")


class LLMProvider(Protocol):
    provider_name: str

    async def generate(self, request: LLMRequest, model: str) -> LLMResponse: ...


class MockLLMProvider:
    """Deterministic offline adapter used for tests and local development."""

    provider_name = "mock"

    async def generate(self, request: LLMRequest, model: str) -> LLMResponse:
        evidence_markers = ("VERIFIED EVIDENCE:", "যাচাইকৃত প্রমাণ:")
        evidence = ""
        for marker in evidence_markers:
            if marker in request.prompt:
                evidence = request.prompt.split(marker, 1)[1].strip()
                evidence = evidence[:1200]
                break
        if evidence:
            text = (
                "Advisory answer (deterministic offline adapter):\n"
                f"{evidence}\n\n"
                "Use only the accompanying verified citations and local agronomist review."
            )
        else:
            text = (
                "I cannot provide an agricultural recommendation without verified source evidence. "
                "This is an advisory response only."
            )
        return LLMResponse(
            text=text,
            model=model or "cropsy-deterministic-advisory-v1",
            provider=self.provider_name,
            usage=Usage(
                promptTokens=max(1, len(request.prompt) // 4),
                completionTokens=max(1, len(text) // 4),
                totalTokens=max(1, len(request.prompt) // 4) + max(1, len(text) // 4),
                estimatedCostUsd=0.0,
                provider=self.provider_name,
                model=model or "cropsy-deterministic-advisory-v1",
            ),
            advisory=True,
        )


class HttpLLMProvider:
    """OpenAI-compatible HTTP adapter; credentials stay entirely server-side."""

    provider_name = "http"

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        timeout_seconds: float,
        max_attempts: int,
        base_delay_seconds: float,
        max_delay_seconds: float,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.max_attempts = max_attempts
        self.base_delay_seconds = base_delay_seconds
        self.max_delay_seconds = max_delay_seconds

    async def generate(self, request: LLMRequest, model: str) -> LLMResponse:
        if not self.base_url:
            raise ConfigurationError("CROPSY_AI_LLM_BASE_URL is required for HTTP LLM provider.")
        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": request.systemPrompt or "You are an agricultural advisory assistant."},
                {"role": "user", "content": request.prompt},
            ],
            "max_tokens": request.maxTokens,
            "temperature": request.temperature,
        }
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"

        async def operation() -> httpx.Response:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                return await client.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                )

        try:
            response = await retry_async(
                operation,
                max_attempts=self.max_attempts,
                base_delay_seconds=self.base_delay_seconds,
                max_delay_seconds=self.max_delay_seconds,
            )
            if response.status_code >= 400:
                raise ProviderError(
                    "LLM provider rejected the request.",
                    details={"status": response.status_code},
                )
            body = response.json()
            text = body["choices"][0]["message"]["content"]
            raw_usage = body.get("usage") or {}
            prompt_tokens = int(raw_usage.get("prompt_tokens", len(request.prompt) // 4))
            completion_tokens = int(raw_usage.get("completion_tokens", len(text) // 4))
            return LLMResponse(
                text=str(text),
                model=str(body.get("model", model)),
                provider=self.provider_name,
                usage=Usage(
                    promptTokens=prompt_tokens,
                    completionTokens=completion_tokens,
                    totalTokens=prompt_tokens + completion_tokens,
                    estimatedCostUsd=0.0,
                    provider=self.provider_name,
                    model=str(body.get("model", model)),
                ),
                advisory=True,
            )
        except ProviderError:
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "LLM provider request failed.",
                details={"reason": type(error).__name__},
            ) from error


class LLMProviderManager:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._providers: dict[str, LLMProvider] = {}
        self._register_defaults()

    def _register_defaults(self) -> None:
        self._providers["mock"] = MockLLMProvider()
        self._providers["http"] = HttpLLMProvider(
            base_url=self.settings.llm_base_url,
            api_key=self.settings.llm_api_key.get_secret_value(),
            timeout_seconds=self.settings.llm_timeout_seconds,
            max_attempts=self.settings.retry_max_attempts,
            base_delay_seconds=self.settings.retry_base_delay_seconds,
            max_delay_seconds=self.settings.retry_max_delay_seconds,
        )

    def register(self, name: str, provider: LLMProvider) -> None:
        self._providers[name] = provider

    def resolve(self, provider_name: str | None = None) -> LLMProvider:
        name = provider_name or self.settings.llm_provider
        if name == "mock" and self.settings.environment == "production":
            if not self.settings.allow_mock_provider:
                raise ConfigurationError(
                    "Mock LLM provider is disabled in production.",
                    details={"provider": name},
                )
        provider = self._providers.get(name)
        if provider is None:
            raise ConfigurationError(f"Unknown LLM provider '{name}'.")
        return provider

    def describe(self) -> list[dict[str, Any]]:
        return [
            {
                "key": name,
                "provider": provider.provider_name,
                "configured": name != "http" or bool(self.settings.llm_base_url),
                "credentialsInResponse": False,
            }
            for name, provider in sorted(self._providers.items())
        ]

    async def generate(
        self,
        request: LLMRequest,
        *,
        model: str,
        provider_name: str | None = None,
    ) -> LLMResponse:
        provider = self.resolve(provider_name)
        logger.info(
            "llm generation started",
            extra={
                "extra_fields": {
                    "provider": provider.provider_name,
                    "model": model,
                    "task": request.task,
                }
            },
        )
        return await provider.generate(request, model)

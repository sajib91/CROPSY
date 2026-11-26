import hashlib
import math
from typing import Protocol

import httpx

from app.config import Settings, get_settings
from app.errors import ConfigurationError, ProviderError
from app.retry import retry_async

EMBEDDING_MODEL_DETERMINISTIC = "cropsy-deterministic-embedding-v1"
EMBEDDING_MODEL_HTTP = "configured-http-embedding"


class EmbeddingProvider(Protocol):
    provider_name: str
    model_name: str

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class DeterministicEmbeddingProvider:
    """Local fallback for development/tests; explicitly not semantic AI."""

    provider_name = "deterministic"
    model_name = EMBEDDING_MODEL_DETERMINISTIC

    def __init__(self, dimensions: int) -> None:
        self.dimensions = dimensions

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]

    def _vector(self, text: str) -> list[float]:
        tokens = text.lower().split()
        vector = [0.0] * self.dimensions
        for token in tokens or [text.lower()]:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            for index in range(self.dimensions):
                byte = digest[index % len(digest)]
                vector[index] += (byte / 127.5) - 1.0
        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            return vector
        return [value / norm for value in vector]


class HttpEmbeddingProvider:
    provider_name = "http"
    model_name = EMBEDDING_MODEL_HTTP

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        dimensions: int,
        timeout_seconds: float,
        max_attempts: int,
        base_delay_seconds: float,
        max_delay_seconds: float,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.dimensions = dimensions
        self.timeout_seconds = timeout_seconds
        self.max_attempts = max_attempts
        self.base_delay_seconds = base_delay_seconds
        self.max_delay_seconds = max_delay_seconds

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not self.base_url:
            raise ConfigurationError("CROPSY_AI_EMBEDDING_BASE_URL is required for HTTP embeddings.")
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        payload = {
            "model": self.model_name,
            "input": texts,
            "dimensions": self.dimensions,
        }

        async def operation() -> httpx.Response:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                return await client.post(
                    f"{self.base_url}/embeddings",
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
                    "Embedding provider rejected the request.",
                    details={"status": response.status_code},
                )
            rows = response.json()["data"]
            vectors = [[float(value) for value in row["embedding"]] for row in rows]
            if len(vectors) != len(texts) or any(len(vector) != self.dimensions for vector in vectors):
                raise ProviderError("Embedding provider returned vectors with unexpected shape.")
            return vectors
        except ProviderError:
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "Embedding provider request failed.",
                details={"reason": type(error).__name__},
            ) from error


class EmbeddingService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        deterministic = DeterministicEmbeddingProvider(self.settings.embedding_dimensions)
        http = HttpEmbeddingProvider(
            base_url=self.settings.embedding_base_url,
            api_key=self.settings.embedding_api_key.get_secret_value(),
            dimensions=self.settings.embedding_dimensions,
            timeout_seconds=self.settings.llm_timeout_seconds,
            max_attempts=self.settings.retry_max_attempts,
            base_delay_seconds=self.settings.retry_base_delay_seconds,
            max_delay_seconds=self.settings.retry_max_delay_seconds,
        )
        self._providers: dict[str, EmbeddingProvider] = {
            "deterministic": deterministic,
            "http": http,
        }

    def resolve(self, provider_name: str | None = None) -> EmbeddingProvider:
        name = provider_name or self.settings.embedding_provider
        if name == "deterministic" and self.settings.environment == "production":
            if not self.settings.allow_mock_provider:
                raise ConfigurationError(
                    "Deterministic embeddings are disabled in production.",
                    details={"provider": name},
                )
        provider = self._providers.get(name)
        if provider is None:
            raise ConfigurationError(f"Unknown embedding provider '{name}'.")
        return provider

    async def embed(
        self,
        texts: list[str],
        *,
        provider_name: str | None = None,
    ) -> tuple[list[list[float]], dict[str, object]]:
        if not texts:
            return [], {"provider": "", "model": "", "tokens": 0, "estimatedCostUsd": 0.0}
        provider = self.resolve(provider_name)
        vectors = await provider.embed(texts)
        estimated_tokens = sum(max(1, len(text) // 4) for text in texts)
        return vectors, {
            "provider": provider.provider_name,
            "model": provider.model_name,
            "tokens": estimated_tokens,
            "estimatedCostUsd": 0.0,
        }

    def describe(self) -> list[dict[str, str]]:
        return [
            {
                "key": name,
                "provider": provider.provider_name,
                "model": provider.model_name,
            }
            for name, provider in sorted(self._providers.items())
        ]

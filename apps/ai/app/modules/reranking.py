"""Reranking with a transparent lexical default and an HTTP BGE adapter."""

from typing import Any, Awaitable, Callable, Protocol

import httpx

from app.config import Settings, get_settings
from app.errors import ConfigurationError, ProviderError
from app.infrastructure.keyword_index import tokenize
from app.models import EvidenceChunk
from app.retry import retry_async

PostJson = Callable[[str, dict[str, Any], dict[str, str]], Awaitable[dict[str, Any]]]


class RankingProvider(Protocol):
    provider_name: str
    model_name: str

    async def rank(self, query: str, documents: list[str]) -> list[float]: ...


class LexicalRankingProvider:
    """Deterministic local baseline used only for development and tests."""

    provider_name = "lexical"
    model_name = "cropsy-lexical-rerank-v1"

    async def rank(self, query: str, documents: list[str]) -> list[float]:
        query_tokens = set(tokenize(query))
        if not query_tokens:
            return [0.5] * len(documents)
        scores: list[float] = []
        for document in documents:
            tokens = set(tokenize(document))
            overlap = len(query_tokens & tokens)
            scores.append(overlap / max(1, len(query_tokens)))
        return scores


class HttpBgeRankingProvider:
    """HTTP BGE cross-encoder adapter. Credentials remain server-side."""

    provider_name = "http-bge"
    model_name = "BAAI/bge-reranker-v2-m3"

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        api_key: str,
        timeout_seconds: float,
        max_attempts: int,
        base_delay_seconds: float,
        max_delay_seconds: float,
        post: PostJson | None = None,
    ) -> None:
        if not base_url:
            raise ConfigurationError("CROPSY_AI_RERANKER_BASE_URL is required for BGE reranking.")
        self.base_url = base_url.rstrip("/")
        self.model_name = model or self.model_name
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.max_attempts = max_attempts
        self.base_delay_seconds = base_delay_seconds
        self.max_delay_seconds = max_delay_seconds
        self._post = post or self._default_post

    async def _default_post(
        self,
        path: str,
        payload: dict[str, Any],
        headers: dict[str, str],
    ) -> dict[str, Any]:
        async def operation() -> httpx.Response:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                return await client.post(
                    f"{self.base_url}{path}",
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
                    "BGE reranker rejected the request.",
                    details={"status": response.status_code},
                )
            body = response.json()
        except ProviderError:
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "BGE reranker request failed.",
                details={"reason": type(error).__name__},
            ) from error
        if not isinstance(body, dict):
            raise ProviderError("BGE reranker returned an unexpected response shape.")
        return body

    @staticmethod
    def _extract_scores(body: dict[str, Any], expected: int) -> list[float]:
        raw = body.get("results")
        if isinstance(raw, list):
            rows = sorted(
                (
                    item
                    for item in raw
                    if isinstance(item, dict) and "index" in item
                ),
                key=lambda item: int(item["index"]),
            )
            scores = [float(item.get("relevance_score", 0.0)) for item in rows]
        elif isinstance(body.get("scores"), list):
            scores = [float(value) for value in body["scores"]]
        else:
            raise ProviderError("BGE reranker response did not contain relevance scores.")
        if len(scores) != expected:
            raise ProviderError("BGE reranker returned an unexpected number of scores.")
        return scores

    async def rank(self, query: str, documents: list[str]) -> list[float]:
        if not documents:
            return []
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        payload = {
            "model": self.model_name,
            "query": query,
            "documents": documents,
            "return_documents": False,
        }
        body = await self._post("/rerank", payload, headers)
        return self._extract_scores(body, len(documents))


class RerankingService:
    """Reranks only the supplied evidence; it never adds new sources."""

    def __init__(
        self,
        settings: Settings | None = None,
        provider: RankingProvider | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.provider = provider or self._build_provider()
        self.strategy = (
            f"bge-http-v1:{self.provider.model_name}"
            if self.provider.provider_name == "http-bge"
            else "deterministic-lexical-v1"
        )

    def _build_provider(self) -> RankingProvider:
        if self.settings.reranker_provider == "lexical":
            return LexicalRankingProvider()
        return HttpBgeRankingProvider(
            base_url=self.settings.reranker_base_url,
            model=self.settings.reranker_model,
            api_key=self.settings.reranker_api_key.get_secret_value(),
            timeout_seconds=self.settings.reranker_timeout_seconds,
            max_attempts=self.settings.retry_max_attempts,
            base_delay_seconds=self.settings.retry_base_delay_seconds,
            max_delay_seconds=self.settings.retry_max_delay_seconds,
        )

    @staticmethod
    def _normalize(scores: list[float]) -> list[float]:
        if not scores:
            return []
        low, high = min(scores), max(scores)
        if abs(high - low) < 1e-9:
            return [0.5] * len(scores)
        return [(score - low) / (high - low) for score in scores]

    async def rerank(
        self,
        query: str,
        evidence: list[EvidenceChunk],
        *,
        top_k: int,
    ) -> list[EvidenceChunk]:
        if not evidence:
            return []
        documents = [f"{item.section} {item.text}".strip() for item in evidence]
        raw_scores = await self.provider.rank(query, documents)

        if self.provider.provider_name == "lexical":
            final_scores = [
                min(1.0, item.score + max(0.0, min(1.0, raw)))
                for item, raw in zip(evidence, raw_scores)
            ]
        else:
            normalized = self._normalize(raw_scores)
            final_scores = [
                min(1.0, 0.35 * item.score + 0.65 * rank_score)
                for item, rank_score in zip(evidence, normalized)
            ]

        scored = list(zip(final_scores, evidence))
        scored.sort(key=lambda pair: (-pair[0], pair[1].chunkId))
        reranked: list[EvidenceChunk] = []
        for score, item in scored[:top_k]:
            item.score = round(score, 4)
            item.citation.score = round(score, 4)
            reranked.append(item)
        return reranked

    def describe(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy,
            "provider": self.provider.provider_name,
            "model": self.provider.model_name,
            "configured": (
                self.provider.provider_name != "http-bge"
                or bool(self.settings.reranker_base_url)
            ),
            "scoreInterpretation": "uncalibrated-relevance-order",
            "credentialsInResponse": "false",
        }

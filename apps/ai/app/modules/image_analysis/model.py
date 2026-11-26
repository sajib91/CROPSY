"""Replaceable image-classification / vision-language model adapters.

Business logic depends only on the ``ImageAnalysisModel`` protocol. A new
provider is added by registering an adapter; no service code changes are needed.
Every adapter labels output as advisory and never returns a confirmed diagnosis.
"""

from __future__ import annotations

import base64
import json
import re
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol

import httpx

from app.config import Settings, get_settings
from app.errors import ConfigurationError, ProviderError
from app.retry import retry_async

from .models import ClassificationCandidate, ModelAnalysisResult

DEFAULT_PROMPT_VERSION = "image-analysis-advisory-v1"

SYSTEM_INSTRUCTION = (
    "You are an advisory agricultural image observer. Describe only visible evidence. "
    "You may list candidate disease, pest, or nutrient issues, but never state a confirmed "
    "diagnosis, never prescribe chemicals, pesticides, dosages, or regulations, and never "
    "invent citations or scientific validation. If you report numeric confidence, it must be "
    "a plain number between 0 and 1 that you actually produced; otherwise omit it. Return "
    "strict JSON with keys: observations (string), candidates (array of objects with label, "
    "confidence, basis), limitations (array of strings)."
)

# Conservative screening only. Restricted sentences are removed from surfaced
# observations and reported; they are never converted into advice.
RESTRICTED_CLAIM_PATTERN = re.compile(
    r"\b(pesticide|insecticide|herbicide|fungicide|rodenticide|chemical|dosage|dose|"
    r"spray|spraying|mix\s+\d|apply\s+\d|\d+\s*(?:ml|g|kg|l|ppm)|urea|npk|"
    r"bordeaux|chlorothalonil|glyphosate|imidacloprid|confirmed diagnosis|"
    r"cure|guaranteed)\b",
    flags=re.I,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def screen_observations(text: str) -> tuple[str, bool]:
    """Remove restricted advisory claims and report that removal happened."""
    kept: list[str] = []
    removed = False
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text.strip()):
        if not sentence.strip():
            continue
        if RESTRICTED_CLAIM_PATTERN.search(sentence):
            removed = True
            continue
        kept.append(sentence.strip())
    return (" ".join(kept)[:4000], removed)


@dataclass(frozen=True)
class ModelAnalysisInput:
    content: bytes
    mime_type: str
    subject_type: str
    analysis_kind: str
    crop: str
    region: str
    question: str
    language: str
    prompt_version: str = DEFAULT_PROMPT_VERSION


class ImageAnalysisModel(Protocol):
    provider_name: str

    async def analyze(self, value: ModelAnalysisInput) -> ModelAnalysisResult: ...

    def describe(self) -> dict[str, Any]: ...


class UnavailableImageModel:
    """Explicit absent-model adapter. It produces no prediction or confidence."""

    provider_name = "none"
    model_name = "none"

    async def analyze(self, value: ModelAnalysisInput) -> ModelAnalysisResult:
        started = _now()
        return ModelAnalysisResult(
            status="unavailable",
            provider=self.provider_name,
            model=self.model_name,
            modelVersion="none",
            promptVersion=value.prompt_version,
            limitations=[
                "No image classification model is configured; no candidate was generated.",
                "Model confidence was not reported because inference did not run.",
                "Visual observations are advisory and are not a confirmed plant diagnosis.",
            ],
            inferenceId=f"inf-none-{secrets.token_hex(8)}",
            startedAt=started,
            finishedAt=_now(),
        )

    def describe(self) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "model": self.model_name,
            "configured": False,
            "inference": False,
            "diagnosisClaims": False,
            "credentialsInResponse": False,
        }


class HttpVisionLanguageModel:
    """OpenAI-compatible vision-language adapter for image classification.

    The deployed model identifier is supplied by configuration, stored with each
    inference, and never inferred from response text.
    """

    provider_name = "http"

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    @staticmethod
    def _parse_candidates(payload: Any) -> list[ClassificationCandidate]:
        candidates: list[ClassificationCandidate] = []
        raw = payload.get("candidates") if isinstance(payload, dict) else None
        if not isinstance(raw, list):
            return candidates
        for item in raw[:10]:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or "").strip()
            if not label:
                continue
            raw_confidence = item.get("confidence")
            confidence: float | None = None
            if isinstance(raw_confidence, (int, float)) and not isinstance(raw_confidence, bool):
                number = float(raw_confidence)
                if 0.0 <= number <= 1.0:
                    confidence = round(number, 6)
            candidates.append(
                ClassificationCandidate(
                    label=label[:300],
                    confidence=confidence,
                    confidenceBasis=(
                        "model_reported_uncalibrated" if confidence is not None else "not_reported"
                    ),
                    basis=str(item.get("basis") or "")[:1000],
                )
            )
        return candidates

    async def analyze(self, value: ModelAnalysisInput) -> ModelAnalysisResult:
        if not self.settings.image_analysis_base_url or not self.settings.image_analysis_model:
            raise ConfigurationError(
                "HTTP image analysis requires a configured base URL and model identifier."
            )
        started_at = _now()
        started = time.perf_counter()
        data_url = f"data:{value.mime_type};base64,{base64.b64encode(value.content).decode('ascii')}"
        context = (
            f"Subject: {value.subject_type}\nAnalysis focus: {value.analysis_kind}\n"
            f"Crop: {value.crop or 'not supplied'}\nRegion: {value.region or 'not supplied'}\n"
            f"Language: {value.language}\nQuestion: {value.question or 'Describe visible evidence.'}"
        )
        payload: dict[str, Any] = {
            "model": self.settings.image_analysis_model,
            "messages": [
                {"role": "system", "content": SYSTEM_INSTRUCTION},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": context},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
            "max_tokens": 800,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }
        headers = {"content-type": "application/json"}
        api_key = self.settings.image_analysis_api_key.get_secret_value()
        if api_key:
            headers["authorization"] = f"Bearer {api_key}"

        async def operation() -> httpx.Response:
            async with httpx.AsyncClient(
                timeout=self.settings.image_analysis_timeout_seconds
            ) as client:
                return await client.post(
                    f"{self.settings.image_analysis_base_url.rstrip('/')}/chat/completions",
                    json=payload,
                    headers=headers,
                )

        try:
            response = await retry_async(
                operation,
                max_attempts=self.settings.retry_max_attempts,
                base_delay_seconds=self.settings.retry_base_delay_seconds,
                max_delay_seconds=self.settings.retry_max_delay_seconds,
            )
            if response.status_code >= 400:
                raise ProviderError(
                    "Image analysis model rejected the request.",
                    details={"status": response.status_code},
                )
            body = response.json()
            raw_text = str(body["choices"][0]["message"]["content"])
        except ProviderError as error:
            return ModelAnalysisResult(
                status="unavailable",
                provider=self.provider_name,
                model=self.settings.image_analysis_model,
                modelVersion=self.settings.image_analysis_model,
                promptVersion=value.prompt_version,
                limitations=[
                    f"Image model request failed ({error.code}); no prediction was generated."
                ],
                inferenceId=f"inf-http-{secrets.token_hex(8)}",
                startedAt=started_at,
                finishedAt=_now(),
                latencyMs=round((time.perf_counter() - started) * 1000, 3),
            )
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            return ModelAnalysisResult(
                status="unavailable",
                provider=self.provider_name,
                model=self.settings.image_analysis_model,
                modelVersion=self.settings.image_analysis_model,
                promptVersion=value.prompt_version,
                limitations=[
                    "Image model request failed; no prediction was generated.",
                    f"Failure type: {type(error).__name__}.",
                ],
                inferenceId=f"inf-http-{secrets.token_hex(8)}",
                startedAt=started_at,
                finishedAt=_now(),
                latencyMs=round((time.perf_counter() - started) * 1000, 3),
            )

        parsed: Any = None
        try:
            cleaned = raw_text.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.I)
            parsed = json.loads(cleaned)
        except (ValueError, TypeError):
            parsed = None

        limitations = [
            "Model output is advisory and is not a confirmed diagnosis.",
            "Model confidence, when present, is uncalibrated and is not a probability.",
        ]
        if parsed is None:
            limitations.append(
                "The model did not return parseable structured output; no candidate was accepted."
            )
        if isinstance(parsed, dict):
            limitations.extend(
                str(item) for item in (parsed.get("limitations") or [])[:8] if str(item).strip()
            )
        observations = str(parsed.get("observations") or "") if isinstance(parsed, dict) else ""
        screened, restricted_removed = screen_observations(observations)
        warnings: list[str] = []
        if restricted_removed:
            warnings.append(
                "Restricted prescription or definitive-claim wording was removed from "
                "model observations."
            )
        raw_usage = body.get("usage") if isinstance(body, dict) else None
        usage: dict[str, Any] = {}
        if isinstance(raw_usage, dict):
            prompt_tokens = int(raw_usage.get("prompt_tokens", 0))
            completion_tokens = int(raw_usage.get("completion_tokens", 0))
            usage = {
                "promptTokens": prompt_tokens,
                "completionTokens": completion_tokens,
                "totalTokens": int(raw_usage.get("total_tokens", prompt_tokens + completion_tokens)),
                "estimatedCostUsd": float(raw_usage.get("estimated_cost_usd", 0.0)),
                "provider": self.provider_name,
                "model": str(body.get("model", self.settings.image_analysis_model)),
                "costBasis": (
                    "provider_reported"
                    if "estimated_cost_usd" in raw_usage
                    else "not_reported_zero_placeholder"
                ),
            }
        return ModelAnalysisResult(
            status="ok",
            provider=self.provider_name,
            model=str(body.get("model", self.settings.image_analysis_model)),
            modelVersion=str(body.get("model", self.settings.image_analysis_model)),
            promptVersion=value.prompt_version,
            observations=screened,
            candidates=self._parse_candidates(parsed),
            limitations=limitations,
            warnings=warnings,
            restrictedContentRemoved=restricted_removed,
            usage=usage,
            inferenceId=f"inf-http-{secrets.token_hex(8)}",
            startedAt=started_at,
            finishedAt=_now(),
            latencyMs=round((time.perf_counter() - started) * 1000, 3),
        )

    def describe(self) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "model": self.settings.image_analysis_model,
            "configured": bool(
                self.settings.image_analysis_base_url and self.settings.image_analysis_model
            ),
            "inference": True,
            "diagnosisClaims": False,
            "credentialsInResponse": False,
        }


class ImageAnalysisModelRegistry:
    """Single seam for replacing classification / vision-language models."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._models: dict[str, ImageAnalysisModel] = {}
        self._register_defaults()

    def _register_defaults(self) -> None:
        self._models["none"] = UnavailableImageModel()
        self._models["http"] = HttpVisionLanguageModel(self.settings)

    def register(self, name: str, model: ImageAnalysisModel) -> None:
        self._models[name] = model

    def resolve(self, name: str | None = None) -> ImageAnalysisModel:
        key = name or (
            self.settings.image_analysis_model_provider
            if self.settings.image_analysis_enabled
            else "none"
        )
        model = self._models.get(key)
        if model is None:
            raise ConfigurationError(f"Unknown image analysis model '{key}'.")
        return model

    def default_model_key(self) -> str:
        if not self.settings.image_analysis_enabled:
            return "none"
        return self.settings.image_analysis_model_provider

    def describe(self) -> dict[str, Any]:
        return {
            "models": [model.describe() for _, model in sorted(self._models.items())],
            "default": self.default_model_key(),
            "replacementPoint": "ImageAnalysisModelRegistry.register",
            "diagnosisClaims": False,
        }


__all__ = [
    "DEFAULT_PROMPT_VERSION",
    "HttpVisionLanguageModel",
    "ImageAnalysisModel",
    "ImageAnalysisModelRegistry",
    "ModelAnalysisInput",
    "UnavailableImageModel",
    "screen_observations",
]

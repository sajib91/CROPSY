import re
import time
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models import EvidenceChunk, Language, Usage
from app.modules.evaluation import EvaluationMonitoringService
from app.modules.knowledge import KnowledgeBaseService
from app.modules.llm_provider import LLMProviderManager
from app.modules.model_config import ModelRegistry
from app.modules.prompt import PromptManager
from app.tracing import Tracer

RecommendationType = Literal[
    "cultivation",
    "fertilizer",
    "pest",
    "disease",
    "soil",
    "irrigation",
    "market",
]

URL_PATTERN = re.compile(r"https?://\S+")
CITATION_LABEL_PATTERN = re.compile(r"\[(?:citation|reference|source)[^\]]*\]", flags=re.I)


class RecommendationInput(BaseModel):
    recommendationType: RecommendationType
    language: Language = "en"
    crop: str = Field(default="", max_length=200)
    region: str = Field(default="", max_length=200)
    season: str = Field(default="", max_length=200)
    soil: str = Field(default="", max_length=200)
    question: str = Field(default="", max_length=4000)
    topK: int = Field(default=5, ge=1, le=20)
    modelKey: str | None = Field(default=None, max_length=100)


class RecommendationResult(BaseModel):
    status: Literal["ok", "insufficient_evidence"]
    recommendationType: RecommendationType
    advisory: bool = True
    answer: str
    evidenceBasedNotes: list[str] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    usage: dict[str, Any] = Field(default_factory=dict)
    model: str = "none"
    provider: str = "none"
    promptVersion: str = "none"
    traceId: str


def build_context(value: RecommendationInput) -> str:
    parts = [
        f"type={value.recommendationType}",
        f"crop={value.crop or 'not supplied'}",
        f"region={value.region or 'not supplied'}",
        f"season={value.season or 'not supplied'}",
        f"soil={value.soil or 'not supplied'}",
        f"question={value.question or 'not supplied'}",
    ]
    return "; ".join(parts)


def format_evidence(evidence: list[EvidenceChunk]) -> str:
    return "\n\n".join(
        f"[{item.chunkId}] {item.citation.title} ({item.citation.sourceName}, "
        f"{item.citation.publishedAt})\n{item.text}"
        for item in evidence
    )


def sanitize_answer(answer: str, evidence: list[EvidenceChunk]) -> str:
    allowed_urls = {item.citation.sourceUrl for item in evidence if item.citation.sourceUrl}
    allowed_ids = {item.chunkId for item in evidence}

    def replace_url(match: re.Match[str]) -> str:
        return match.group(0) if match.group(0) in allowed_urls else "[unverified URL removed]"

    cleaned = URL_PATTERN.sub(replace_url, answer)
    cleaned = CITATION_LABEL_PATTERN.sub("", cleaned)
    for line in cleaned.splitlines():
        if re.search(r"\b(?:document|chunk)\s+id\b", line, flags=re.I):
            if not any(chunk_id in line for chunk_id in allowed_ids):
                cleaned = cleaned.replace(line, "").strip()
    return cleaned.strip()


class RecommendationService:
    def __init__(
        self,
        *,
        knowledge: KnowledgeBaseService,
        llms: LLMProviderManager,
        models: ModelRegistry,
        prompts: PromptManager,
        tracer: Tracer,
        monitoring: EvaluationMonitoringService,
    ) -> None:
        self.knowledge = knowledge
        self.llms = llms
        self.models = models
        self.prompts = prompts
        self.tracer = tracer
        self.monitoring = monitoring

    async def recommend(
        self,
        value: RecommendationInput,
        *,
        trace_id: str,
        organization_id: str = "system",
        user_id: str = "system",
    ) -> RecommendationResult:
        query_parts = [value.recommendationType, value.crop, value.question]
        query = " ".join(part for part in query_parts if part).strip()
        with self.tracer.span(trace_id, "recommendation.retrieve", query=query):
            evidence = await self.knowledge.retrieve(
                query,
                language=value.language,
                top_k=value.topK,
            )
        if not evidence:
            self.monitoring.record_error("insufficient_evidence")
            return RecommendationResult(
                status="insufficient_evidence",
                recommendationType=value.recommendationType,
                answer=(
                    "I do not have enough verified, licensed agricultural source evidence to "
                    "make this recommendation. No references have been generated."
                    if value.language != "bn"
                    else "এই সুপারিশের জন্য যাচাইকৃত ও লাইসেন্সকৃত পর্যাপ্ত কৃষি প্রমাণ নেই। কোনো উদ্ধৃতি তৈরি করা হয়নি।"
                ),
                limitations=[
                    "No verified evidence was available.",
                    "Advisory output only; consult a local agronomist.",
                ],
                traceId=trace_id,
            )

        model = self.models.resolve(value.modelKey, "recommend")
        template_key = "recommend.bn" if value.language == "bn" else "recommend.en"
        system, prompt, version = self.prompts.render(
            template_key,
            {
                "kind": value.recommendationType,
                "context": build_context(value),
                "evidence": format_evidence(evidence),
            },
        )
        from app.models import LLMRequest

        request = LLMRequest(
            prompt=prompt,
            systemPrompt=system,
            task="recommend",
            maxTokens=min(model.maxTokens, 1200),
            temperature=model.temperature,
        )
        started = time.perf_counter()
        try:
            with self.tracer.span(trace_id, "recommendation.generate", model=model.modelName):
                response = await self.llms.generate(
                    request,
                    model=model.modelName,
                    provider_name=model.provider,
                )
            status = "ok"
        except Exception:
            status = "error"
            self.monitoring.record_error("generation_error")
            raise
        finally:
            self.monitoring.record_generation(
                trace_id=trace_id,
                task="recommend",
                usage=response.usage if status == "ok" else Usage(),
                latency_ms=(time.perf_counter() - started) * 1000,
                status=status,
            )

        notes = [item.citation.excerpt for item in evidence[:6]]
        return RecommendationResult(
            status="ok",
            recommendationType=value.recommendationType,
            answer=sanitize_answer(response.text, evidence),
            evidenceBasedNotes=notes,
            citations=[item.citation.model_dump(mode="json") for item in evidence],
            limitations=[
                "Advisory only; not a substitute for local agronomist verification.",
                "Dosages and product claims are included only if present in cited verified sources.",
            ],
            usage=response.usage.model_dump(mode="json"),
            model=response.model,
            provider=response.provider,
            promptVersion=version,
            traceId=trace_id,
        )

    def describe(self) -> dict[str, Any]:
        return {
            "supportedTypes": sorted(
                [
                    "cultivation",
                    "fertilizer",
                    "pest",
                    "disease",
                    "soil",
                    "irrigation",
                    "market",
                ]
            ),
            "citationPolicy": "verified-sources-only",
            "responsePolicy": "advisory-only",
        }

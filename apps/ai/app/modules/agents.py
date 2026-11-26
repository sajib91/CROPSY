import time
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.errors import AiError
from app.models import EvidenceChunk, Language, LLMRequest, Usage
from app.modules.evaluation import EvaluationMonitoringService
from app.modules.knowledge import KnowledgeBaseService
from app.modules.llm_provider import LLMProviderManager
from app.modules.model_config import ModelRegistry
from app.modules.prompt import PromptManager
from app.modules.recommendations import (
    RecommendationInput,
    RecommendationResult,
    RecommendationService,
    format_evidence,
    sanitize_answer,
)
from app.tracing import Tracer


class AskInput(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    language: Language = "en"
    context: str = Field(default="", max_length=4000)
    topK: int = Field(default=5, ge=1, le=20)
    modelKey: str | None = Field(default=None, max_length=100)


class AskResult(BaseModel):
    status: Literal["ok", "insufficient_evidence"]
    advisory: bool = True
    answer: str
    citations: list[dict[str, Any]] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    usage: dict[str, Any] = Field(default_factory=dict)
    model: str = "none"
    provider: str = "none"
    promptVersion: str = "none"
    traceId: str


class AgentOrchestrator:
    """Evidence-first agent workflow with explicit traceability."""

    def __init__(
        self,
        *,
        knowledge: KnowledgeBaseService,
        llms: LLMProviderManager,
        models: ModelRegistry,
        prompts: PromptManager,
        tracer: Tracer,
        monitoring: EvaluationMonitoringService,
        recommendations: RecommendationService,
    ) -> None:
        self.knowledge = knowledge
        self.llms = llms
        self.models = models
        self.prompts = prompts
        self.tracer = tracer
        self.monitoring = monitoring
        self.recommendations = recommendations

    async def ask(
        self,
        value: AskInput,
        *,
        trace_id: str,
        organization_id: str = "system",
        user_id: str = "system",
    ) -> AskResult:
        with self.tracer.span(trace_id, "agent.retrieve", question=value.question):
            evidence = await self.knowledge.retrieve(
                value.question,
                language=value.language,
                top_k=value.topK,
            )
        if not evidence:
            self.monitoring.record_error("insufficient_evidence")
            return AskResult(
                status="insufficient_evidence",
                answer=(
                    "I cannot answer from verified agricultural sources because no eligible "
                    "evidence was found. No citations were generated."
                    if value.language != "bn"
                    else "যাচাইকৃত কৃষি উৎস থেকে কোনো যোগ্য প্রমাণ পাওয়া যায়নি, তাই উত্তর দিতে পারছি না। কোনো উদ্ধৃতি তৈরি করা হয়নি।"
                ),
                limitations=["No verified, licensed evidence matched the question."],
                traceId=trace_id,
            )

        model = self.models.resolve(value.modelKey, "ask")
        template_key = "ask.bn" if value.language == "bn" else "ask.en"
        system, prompt, version = self.prompts.render(
            template_key,
            {
                "question": value.question,
                "context": value.context or "none supplied",
                "evidence": format_evidence(evidence),
            },
        )
        request = LLMRequest(
            prompt=prompt,
            systemPrompt=system,
            task="ask",
            maxTokens=min(model.maxTokens, 1200),
            temperature=model.temperature,
        )
        started = time.perf_counter()
        response: Usage | None = None
        try:
            with self.tracer.span(trace_id, "agent.generate", model=model.modelName):
                generated = await self.llms.generate(
                    request,
                    model=model.modelName,
                    provider_name=model.provider,
                )
            response = generated
            status = "ok"
        except AiError:
            status = "error"
            self.monitoring.record_error("generation_error")
            raise
        except Exception:
            status = "error"
            self.monitoring.record_error("generation_error")
            raise
        finally:
            self.monitoring.record_generation(
                trace_id=trace_id,
                task="ask",
                usage=response.usage if response else Usage(),
                latency_ms=(time.perf_counter() - started) * 1000,
                status=status,
            )

        with self.tracer.span(trace_id, "agent.citation_guard", evidenceCount=len(evidence)):
            answer = sanitize_answer(generated.text, evidence)
        return AskResult(
            status="ok",
            answer=answer,
            citations=[item.citation.model_dump(mode="json") for item in evidence],
            limitations=[
                "Advisory output only; verify with a local agronomist before field use.",
                "Citations are limited to ingested, verified, licensed source chunks.",
            ],
            usage=generated.usage.model_dump(mode="json"),
            model=generated.model,
            provider=generated.provider,
            promptVersion=version,
            traceId=trace_id,
        )

    async def recommend(
        self,
        value: RecommendationInput,
        *,
        trace_id: str,
        organization_id: str = "system",
        user_id: str = "system",
    ) -> RecommendationResult:
        with self.tracer.span(trace_id, "agent.recommendation"):
            return await self.recommendations.recommend(
                value,
                trace_id=trace_id,
                organization_id=organization_id,
                user_id=user_id,
            )

    def trace(self, trace_id: str) -> list[dict[str, Any]]:
        return self.tracer.for_trace(trace_id)

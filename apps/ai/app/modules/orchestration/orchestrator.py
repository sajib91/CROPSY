"""Unified RAG orchestration across hybrid, graph, multimodal, and agentic paths."""

from __future__ import annotations

import time
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings, get_settings
from app.errors import AiError, UnauthorizedError
from app.infrastructure.graph_store import GraphScope
from app.models import EvidenceChunk, Language
from app.modules.agentic_rag.models import AgenticQueryRequest, AgenticRAGResult
from app.modules.agentic_rag.workflow import AgenticRAGService
from app.modules.evaluation import EvaluationMonitoringService
from app.modules.graph_rag.models import GraphRetrievalRequest
from app.modules.graph_rag.service import GraphRAGService
from app.modules.knowledge import KnowledgeBaseService
from app.modules.llm_provider import LLMProviderManager
from app.modules.model_config import ModelRegistry
from app.modules.multimodal_rag import (
    MultimodalRAGService,
    MultimodalRetrievalInput,
)
from app.modules.orchestration.evidence import ContextBundle, EvidenceFusion
from app.modules.orchestration.query_router import (
    QueryRouteDecision,
    QueryRouteInput,
    QueryRouter,
    Strategy,
)
from app.modules.recommendations import sanitize_answer
from app.models import LLMRequest
from app.tracing import Tracer

Status = Literal["ok", "insufficient_evidence", "awaiting_approval", "rejected", "fallback"]


class UnifiedQueryRequest(BaseModel):
    """Advisory request. Farmer and organization identifiers are never accepted."""

    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=8000)
    language: Language = "en"
    topK: int = Field(default=5, ge=1, le=20)
    documentTypes: list[str] = Field(default_factory=list, max_length=20)
    region: str = Field(default="", max_length=200)
    assetIds: list[str] = Field(default_factory=list, max_length=50)
    imageBase64: str = Field(default="", max_length=30_000_000)
    documentText: str = Field(default="", max_length=30000)
    useGraph: bool = True
    includeGlobal: bool = True
    requireApproval: bool = False
    modelKey: str | None = Field(default=None, max_length=100)


class ExecutionStep(BaseModel):
    strategy: str
    status: Literal["ok", "empty", "failed"]
    resultCount: int = 0
    latencyMs: float = Field(ge=0.0)
    error: str = ""


class ConfidenceAssessment(BaseModel):
    level: Literal["low", "moderate", "high"]
    basis: Literal["rule_based_retrieval_evidence"]
    score: float = Field(ge=0.0, le=1.0)
    supportingEvidenceCount: int
    citationEligibleCount: int
    limitations: list[str] = Field(default_factory=list)


class UnifiedRAGResult(BaseModel):
    status: Status
    advisory: bool = True
    answer: str
    route: QueryRouteDecision
    executedStrategies: list[ExecutionStep] = Field(default_factory=list)
    strategiesAttempted: list[str] = Field(default_factory=list)
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    graphEvidence: list[dict[str, Any]] = Field(default_factory=list)
    context: str = ""
    citations: list[dict[str, Any]] = Field(default_factory=list)
    sourceAttribution: list[dict[str, Any]] = Field(default_factory=list)
    confidence: ConfidenceAssessment
    limitations: list[str] = Field(default_factory=list)
    visualDisclaimer: str | None = None
    usage: dict[str, Any] = Field(default_factory=dict)
    approvalId: str | None = None
    traceId: str


class UnifiedOrchestrator:
    """Rule-routed orchestrator with multi-source fusion and bounded fallbacks."""

    def __init__(
        self,
        *,
        knowledge: KnowledgeBaseService,
        graph: GraphRAGService,
        multimodal: MultimodalRAGService,
        agentic: AgenticRAGService,
        llms: LLMProviderManager,
        models: ModelRegistry,
        tracer: Tracer,
        settings: Settings | None = None,
        router: QueryRouter | None = None,
        monitoring: EvaluationMonitoringService | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        if not self.settings.orchestration_enabled:
            raise AiError("Unified orchestration is disabled by configuration.", status_code=503)
        self.knowledge = knowledge
        self.graph = graph
        self.multimodal = multimodal
        self.agentic = agentic
        self.llms = llms
        self.models = models
        self.tracer = tracer
        self.router = router or QueryRouter()
        self.monitoring = monitoring
        self.fusion = EvidenceFusion()

    def _scope(self, trusted_organization_id: str) -> str:
        if not trusted_organization_id:
            raise UnauthorizedError(
                "Unified RAG requires an authenticated organization scope.",
                details={"reason": "missing_organization_scope"},
            )
        return trusted_organization_id

    def _span(self, trace_id: str, name: str, **details: Any):  # type: ignore[no-untyped-def]
        if self.tracer is not None and trace_id:
            return self.tracer.span(trace_id, name, **details)
        from contextlib import nullcontext

        return nullcontext()

    async def _hybrid(
        self, value: UnifiedQueryRequest, *, trace_id: str, organization_id: str
    ) -> tuple[list[EvidenceChunk], dict[str, Any]]:
        result = await self.knowledge.retrieve_detailed(
            value.query,
            language=value.language,
            top_k=value.topK,
            document_types=value.documentTypes,
            trace_id=trace_id,
        )
        return result.evidence, {"backend": self.knowledge.backend_status()}

    async def _multimodal(
        self, value: UnifiedQueryRequest, *, trace_id: str, organization_id: str
    ) -> tuple[list[EvidenceChunk], dict[str, Any]]:
        result = await self.multimodal.retrieve(
            MultimodalRetrievalInput(
                query=value.query,
                language=value.language,
                topK=value.topK,
                assetIds=value.assetIds,
                imageBase64=value.imageBase64,
            ),
            trusted_organization_id=organization_id,
            trace_id=trace_id,
        )
        return result.evidence, result.diagnostics

    async def _graph(
        self, value: UnifiedQueryRequest, *, trace_id: str, organization_id: str
    ) -> tuple[list[EvidenceChunk], dict[str, Any]]:
        request = GraphRetrievalRequest(
            query=value.query,
            organizationIds=[organization_id],
            includeGlobal=value.includeGlobal,
            topK=min(value.topK * 2, 50),
            maxHops=min(2, self.settings.graph_max_hops),
            verifiedOnly=False,
            includeCandidates=False,
        )
        context = await self.graph.retrieve(request, trusted_organization_id=organization_id)
        return [], {
            "graphContext": context.contextText,
            "graphEvidence": [item.model_dump(mode="json") for item in context.evidence],
            "limitations": list(context.limitations),
            "scope": GraphScope(
                organization_ids=(organization_id,), include_global=value.includeGlobal
            ).model_dump(mode="json"),
        }

    async def _agentic(
        self, value: UnifiedQueryRequest, *, trace_id: str, organization_id: str
    ) -> tuple[list[EvidenceChunk], dict[str, Any]]:
        request = AgenticQueryRequest(
            query=value.query,
            language=value.language,
            topK=value.topK,
            documentTypes=value.documentTypes,
            region=value.region,
            includeGlobal=value.includeGlobal,
            useGraph=value.useGraph and self.graph is not None,
            requireApproval=value.requireApproval,
            documentText=value.documentText,
        )
        result = await self.agentic.run(
            request,
            trace_id=trace_id,
            organization_id=organization_id,
            user_id="system",
        )
        evidence: list[EvidenceChunk] = []
        for item in result.evidence:
            try:
                evidence.append(EvidenceChunk.model_validate(item))
            except Exception:  # noqa: BLE001 - mixed evidence payloads from tools
                continue
        return evidence, {
            "agenticStatus": result.status,
            "selectedAgents": result.selectedAgents,
            "agentOutputs": result.agentOutputs,
            "graphEvidence": result.graphEvidence,
            "citations": result.citations,
            "limitations": result.limitations,
            "usage": result.usage,
            "approvalId": result.approvalId,
            "answer": result.answer,
        }

    async def _execute_strategy(
        self,
        strategy: Strategy,
        value: UnifiedQueryRequest,
        *,
        trace_id: str,
        organization_id: str,
    ) -> tuple[list[EvidenceChunk], dict[str, Any], ExecutionStep]:
        started = time.monotonic()
        try:
            with self._span(trace_id, f"orchestration.strategy.{strategy}", strategy=strategy):
                if strategy == "hybrid":
                    evidence, info = await self._hybrid(
                        value, trace_id=trace_id, organization_id=organization_id
                    )
                elif strategy == "graph_hybrid":
                    evidence, info = await self._hybrid(
                        value, trace_id=trace_id, organization_id=organization_id
                    )
                    graph_info = await self._graph(
                        value, trace_id=trace_id, organization_id=organization_id
                    )
                    info.update(graph_info[1])
                elif strategy == "multimodal":
                    evidence, info = await self._multimodal(
                        value, trace_id=trace_id, organization_id=organization_id
                    )
                    # Explicit asset filters keep multimodal results scoped to the
                    # supplied documents; otherwise add text retrieval as context.
                    if value.query.strip() and not value.assetIds:
                        hybrid_evidence, hybrid_info = await self._hybrid(
                            value, trace_id=trace_id, organization_id=organization_id
                        )
                        evidence = [*evidence, *hybrid_evidence]
                        info["hybrid"] = hybrid_info
                else:
                    evidence, info = await self._agentic(
                        value, trace_id=trace_id, organization_id=organization_id
                    )
            status = "ok" if evidence or info.get("graphEvidence") else "empty"
            error = ""
        except Exception as error:  # noqa: BLE001 - strategy fallback boundary
            evidence, info, status = [], {"errorType": type(error).__name__}, "failed"
            error = type(error).__name__
        latency = round((time.monotonic() - started) * 1000, 3)
        return evidence, info, ExecutionStep(
            strategy=strategy,
            status=status,
            resultCount=len(evidence) + len(info.get("graphEvidence") or []),
            latencyMs=latency,
            error=error,
        )

    def _confidence(
        self,
        evidence: list[Any],
        graph_evidence: list[dict[str, Any]],
        limitations: list[str],
    ) -> ConfidenceAssessment:
        scores = [float(item.evidence.score) for item in evidence]
        max_score = max(scores, default=0.0)
        eligible = sum(
            1
            for item in evidence
            if item.evidence.citation.sourceUrl
            and item.evidence.citation.licenseUrl
            and item.evidence.citation.licenseCode
        )
        count = len(evidence) + len(graph_evidence)
        if count == 0:
            level = "low"
        elif max_score >= 0.8 and eligible >= 2 and count >= 2:
            level = "moderate"
        else:
            level = "low"
        return ConfidenceAssessment(
            level=level,
            basis="rule_based_retrieval_evidence",
            score=round(max_score, 4),
            supportingEvidenceCount=count,
            citationEligibleCount=eligible,
            limitations=[
                "Confidence is a rule-based summary of retrieval scores, not a calibrated probability.",
                "A response is not scientifically validated unless independent verified evidence is supplied and reviewed.",
                *limitations,
            ],
        )

    async def _generate_answer(
        self,
        value: UnifiedQueryRequest,
        *,
        bundle: ContextBundle,
        graph_text: str,
        trace_id: str,
        organization_id: str,
    ) -> tuple[str, dict[str, Any], list[str]]:
        evidence = [item.evidence for item in bundle.evidence]
        if not evidence and not graph_text.strip():
            return (
                "I cannot answer this agricultural question because no usable cited evidence was retrieved.",
                {},
                ["No evidence was available for answer generation."],
            )
        model = self.models.resolve(value.modelKey, task="orchestration")
        system_prompt = (
            "You are an agricultural advisory assistant. Use only supplied evidence. "
            "Never invent citations, prices, weather, regulations, dosages, or diagnoses. "
            "If evidence is insufficient, say so. Label visual observations as advisory, "
            "never as a confirmed plant diagnosis. Do not claim scientific validation."
        )
        prompt = (
            f"Question: {value.query}\n\n"
            f"VERIFIED EVIDENCE (provenance-labelled):\n{bundle.context or 'none'}\n\n"
            f"GRAPH EVIDENCE:\n{graph_text or 'none'}\n\n"
            "Answer concisely in the question language, cite only supplied sources, "
            "and state uncertainty explicitly."
        )
        try:
            with self._span(trace_id, "orchestration.generate", evidenceCount=len(evidence)):
                response = await self.llms.generate(
                    LLMRequest(
                        prompt=prompt[:20000],
                        systemPrompt=system_prompt,
                        task="orchestration",
                    ),
                    model=model.modelName,
                )
            return sanitize_answer(response.text, evidence), response.usage.model_dump(mode="json"), []
        except Exception as error:  # noqa: BLE001 - generation fallback boundary
            fallback_lines = [
                "Evidence retrieved (advisory only; no generated synthesis was available):"
            ]
            fallback_lines.extend(
                f"- {item.evidence.citation.title}: {item.evidence.text[:300]}"
                for item in bundle.evidence[:3]
            )
            if graph_text.strip():
                fallback_lines.append(f"- Graph evidence: {graph_text[:500]}")
            return (
                "\n".join(fallback_lines),
                {},
                [f"Answer generation failed ({type(error).__name__}); showing retrieved evidence only."],
            )

    async def run(
        self,
        value: UnifiedQueryRequest,
        *,
        trace_id: str,
        organization_id: str,
        user_id: str = "system",
    ) -> UnifiedRAGResult:
        organization = self._scope(organization_id)
        route = self.router.route(
            QueryRouteInput(
                query=value.query,
                language=value.language,
                hasImages=bool(value.imageBase64),
                hasDocuments=bool(value.assetIds or value.documentText),
                requiresApproval=value.requireApproval,
            )
        )
        with self._span(
            trace_id,
            "orchestration.run",
            intent=route.intent,
            strategy=route.strategy,
            complexity=route.complexity,
        ):
            collected: dict[str, list[EvidenceChunk]] = {}
            source_lists: dict[str, list[EvidenceChunk]] = {}
            steps: list[ExecutionStep] = []
            info: dict[str, Any] = {}
            attempts = [route.strategy, *route.fallbackStrategies]
            if not self.settings.orchestration_fallback_enabled:
                attempts = [route.strategy]
            for strategy in attempts:
                evidence, strategy_info, step = await self._execute_strategy(
                    strategy,
                    value,
                    trace_id=trace_id,
                    organization_id=organization,
                )
                steps.append(step)
                info.update(strategy_info)
                if evidence:
                    source_lists[strategy] = evidence
                    collected[strategy] = evidence
                if step.status == "ok" and (evidence or strategy_info.get("graphEvidence")):
                    break

            fused = self.fusion.fuse(
                source_lists,
                max_items=self.settings.orchestration_max_evidence,
            )
            bundle = self.fusion.build_context(
                fused,
                max_characters=self.settings.orchestration_context_chars,
            )
            graph_text = str(info.get("graphContext", ""))
            graph_evidence = list(info.get("graphEvidence") or [])
            limitations = list(info.get("limitations") or [])
            if route.strategy == "multimodal" or value.imageBase64:
                limitations.append(
                    "Image-derived content is retrieved evidence or model observation, not a confirmed diagnosis."
                )
            if any(step.status == "failed" for step in steps) and any(
                step.status == "ok" for step in steps
            ):
                limitations.append("One or more retrieval strategies failed and a fallback was used.")

            agentic_status = str(info.get("agenticStatus", ""))
            if agentic_status in {"awaiting_approval", "rejected"}:
                confidence = self._confidence(fused, graph_evidence, limitations)
                return UnifiedRAGResult(
                    status=agentic_status,  # type: ignore[arg-type]
                    advisory=False,
                    answer=str(info.get("answer", "Agentic approval is required before finalizing this answer.")),
                    route=route,
                    executedStrategies=steps,
                    strategiesAttempted=attempts,
                    evidence=[item.evidence.model_dump(mode="json") for item in fused],
                    graphEvidence=graph_evidence,
                    context=bundle.context,
                    citations=bundle.citations,
                    sourceAttribution=bundle.sourceAttribution,
                    confidence=confidence,
                    limitations=limitations,
                    visualDisclaimer=(
                        "Visual model output is advisory and not a confirmed plant diagnosis."
                        if value.imageBase64
                        else None
                    ),
                    usage=dict(info.get("usage") or {}),
                    approvalId=info.get("approvalId"),
                    traceId=trace_id,
                )

            answer, usage, generation_limitations = await self._generate_answer(
                value,
                bundle=bundle,
                graph_text=graph_text,
                trace_id=trace_id,
                organization_id=organization,
            )
            limitations.extend(generation_limitations)
            confidence = self._confidence(fused, graph_evidence, limitations)
            status: Status = "ok" if (fused or graph_evidence) else "insufficient_evidence"
            if any(step.status == "failed" for step in steps) and status == "ok":
                status = "fallback"
            if self.monitoring is not None:
                self.monitoring.record_retrieval(
                    trace_id=trace_id,
                    query=value.query,
                    language=value.language,
                    intent=route.intent,
                    ranked_chunk_ids=[item.evidence.chunkId for item in fused],
                    scores=[item.evidence.score for item in fused],
                    backends={step.strategy: step.status for step in steps},
                    latency_ms=sum(step.latencyMs for step in steps),
                    result_count=len(fused),
                    insufficient_evidence=not fused and not graph_evidence,
                    filters={"organizationId": organization},
                    deduplication_removed=max(0, sum(len(items) for items in collected.values()) - len(fused)),
                    expansion_count=0,
                )
            return UnifiedRAGResult(
                status=status,
                advisory=True,
                answer=answer,
                route=route,
                executedStrategies=steps,
                strategiesAttempted=attempts,
                evidence=[item.evidence.model_dump(mode="json") for item in fused],
                graphEvidence=graph_evidence,
                context=bundle.context,
                citations=bundle.citations,
                sourceAttribution=bundle.sourceAttribution,
                confidence=confidence,
                limitations=sorted(set(limitations)),
                visualDisclaimer=(
                    "Visual model output is advisory and not a confirmed plant diagnosis."
                    if value.imageBase64
                    else None
                ),
                usage=usage,
                traceId=trace_id,
            )

    def describe(self) -> dict[str, Any]:
        return {
            "enabled": self.settings.orchestration_enabled,
            "router": self.router.describe(),
            "strategies": ["hybrid", "graph_hybrid", "multimodal", "agentic"],
            "multiSourceEvidenceFusion": True,
            "contextDeduplication": True,
            "citationPreservation": True,
            "confidence": "rule_based_not_calibrated",
            "fallbackEnabled": self.settings.orchestration_fallback_enabled,
            "executionMonitoring": True,
            "llmSelectsStrategy": False,
        }


__all__ = ["ConfidenceAssessment", "UnifiedOrchestrator", "UnifiedQueryRequest", "UnifiedRAGResult"]

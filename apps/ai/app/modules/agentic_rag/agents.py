"""Seven specialized LangGraph nodes for CROPSY agentic RAG."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from app.config import Settings, get_settings
from app.infrastructure.graph_store import GraphScope
from app.models import EvidenceChunk, LLMRequest, Usage
from app.modules.agentic_rag.models import AgenticState
from app.modules.agentic_rag.supervisor import WORK_AGENTS, Supervisor
from app.modules.agentic_rag.tools import ToolRegistry
from app.modules.evaluation import EvaluationMonitoringService
from app.modules.graph_rag.models import GraphApproval
from app.modules.llm_provider import LLMProviderManager
from app.modules.model_config import ModelRegistry
from app.modules.query_understanding import QueryUnderstanding, QueryUnderstandingService
from app.modules.recommendations import sanitize_answer
from app.modules.safety import SafetyPolicyService
from app.tracing import Tracer

NodeOperation = Callable[[AgenticState], Awaitable[dict[str, Any]]]

NO_EVIDENCE_ANSWER = {
    "en": (
        "I do not have enough verified, licensed source evidence to give an agricultural "
        "recommendation. No citations, prices, weather values, or dosages were generated."
    ),
    "bn": (
        "কৃষি সুপারিশ দেওয়ার জন্য পর্যাপ্ত যাচাইকৃত ও লাইসেন্সকৃত প্রমাণ নেই। "
        "কোনো উদ্ধৃতি, দাম, আবহাওয়া মান বা মাত্রা তৈরি করা হয়নি।"
    ),
}


@dataclass
class AgentDependencies:
    tools: ToolRegistry
    understanding: QueryUnderstandingService
    supervisor: Supervisor
    llms: LLMProviderManager
    models: ModelRegistry
    tracer: Tracer
    monitoring: EvaluationMonitoringService
    safety: SafetyPolicyService
    settings: Settings

    @classmethod
    def build(cls, tools: ToolRegistry, settings: Settings | None = None) -> "AgentDependencies":
        active = settings or get_settings()
        return cls(
            tools=tools,
            understanding=QueryUnderstandingService(
                enable_expansion=True,
                max_variants=3,
            ),
            supervisor=Supervisor(),
            llms=tools.llms,
            models=tools.models,
            tracer=tools.tracer,
            monitoring=tools.monitoring,
            safety=SafetyPolicyService(),
            settings=active,
        )


class SpecialistAgents:
    """Node functions. Each node returns only its state patch."""

    def __init__(self, dependencies: AgentDependencies) -> None:
        self.deps = dependencies

    async def _guarded(self, name: str, state: AgenticState, operation: NodeOperation) -> dict[str, Any]:
        attempts = dict(state.get("agentAttempts") or {})
        attempts[name] = int(attempts.get(name, 0)) + 1
        trace = list(state.get("executionTrace") or [])
        started = time.perf_counter()
        status = "ok"
        try:
            patch = await operation(state)
        except Exception as error:
            status = "error"
            patch = {}
            trace.append(
                {
                    "agent": name,
                    "status": status,
                    "error": type(error).__name__,
                    "durationMs": round((time.perf_counter() - started) * 1000, 3),
                }
            )
            return {
                **patch,
                "agentAttempts": attempts,
                "executionTrace": trace,
                "toolCalls": list(state.get("toolCalls") or []),
                "lastError": {"agent": name, "type": type(error).__name__},
                "currentNode": name,
            }
        trace.append(
            {
                "agent": name,
                "status": status,
                "attempt": attempts[name],
                "durationMs": round((time.perf_counter() - started) * 1000, 3),
            }
        )
        return {
            **patch,
            "agentAttempts": attempts,
            "executionTrace": trace,
            "toolCalls": list(state.get("toolCalls") or []),
            "lastError": None,
            "currentNode": name,
            **({"step": int(state.get("step", 0)) + 1} if name in WORK_AGENTS else {}),
        }

    async def query_understanding(self, state: AgenticState) -> dict[str, Any]:
        async def operation(current: AgenticState) -> dict[str, Any]:
            request = current["request"]
            result = self.deps.understanding.understand(
                request.query,
                language=request.language,
                region=request.region,
                document_types=request.documentTypes,
            )
            data = result.model_dump(mode="json")
            entities = [
                value
                for values in result.entities.values()
                for value in values
                if isinstance(value, str)
            ]
            return {"understanding": data, "graphEntities": entities, "step": 0}

        return await self._guarded("query_understanding", state, operation)

    async def supervisor(self, state: AgenticState) -> dict[str, Any]:
        async def operation(current: AgenticState) -> dict[str, Any]:
            understanding = QueryUnderstanding.model_validate(current["understanding"])
            selected = self.deps.supervisor.select(
                request=current["request"],
                understanding=understanding,
            )
            return {"selectedAgents": selected, "step": 0}

        return await self._guarded("supervisor", state, operation)

    async def knowledge_retrieval(self, state: AgenticState) -> dict[str, Any]:
        async def operation(current: AgenticState) -> dict[str, Any]:
            request = current["request"]
            result = await self.deps.tools.hybrid_retrieve(
                current,
                query=current["understanding"]["resolvedQuery"],
                language=request.language,
                top_k=request.topK,
                document_types=request.documentTypes,
                region=request.region,
                trace_id=current["traceId"],
            )
            evidence = [item.model_dump(mode="json") for item in result]
            graph_context: dict[str, Any] = {
                "contextText": "",
                "evidence": [],
                "citations": [],
                "limitations": ["Graph retrieval was not requested."],
                "evidenceClasses": [],
            }
            if request.useGraph:
                graph_context = await self.deps.tools.graph_retrieve(
                    current,
                    query=current["understanding"]["resolvedQuery"],
                    entities=current.get("graphEntities") or [],
                    scope=current["scope"],
                    min_confidence=self.deps.settings.graph_confidence_threshold,
                )
            validated_without_approval = [
                item
                for item in graph_context.get("evidence") or []
                if item.get("validated") and not item.get("verified")
            ]
            return {
                "vectorEvidence": evidence,
                "graphContext": graph_context,
                "graphEvidence": list(graph_context.get("evidence") or []),
                "approvalRequired": bool(request.requireApproval or validated_without_approval),
                "approvalId": f"approval-{current['traceId']}",
                "output_agricultural_knowledge_retrieval": {
                    "vectorEvidenceCount": len(evidence),
                    "graphEvidenceCount": len(graph_context.get("evidence") or []),
                    "backends": current.get("retrievalDiagnostics", {}).get("backends", {}),
                    "limitations": graph_context.get("limitations") or [],
                },
            }

        return await self._guarded("agricultural_knowledge_retrieval", state, operation)

    async def market_intelligence(self, state: AgenticState) -> dict[str, Any]:
        async def operation(current: AgenticState) -> dict[str, Any]:
            request = current["request"]
            observations = [item.model_dump(mode="json") for item in request.marketObservations]
            result = await self.deps.tools.forecast_market(
                current,
                observations=observations,
                region=request.region,
                language=request.language,
            )
            return {
                "marketResult": result,
                "output_market_intelligence": {
                    "status": result.get("status", "ok"),
                    "observationCount": len(observations),
                    "predictionCount": len(result.get("mlPredictions") or []),
                    "evidenceClasses": result.get("evidenceClasses") or [],
                    "limitations": result.get("limitations") or [],
                },
            }

        return await self._guarded("market_intelligence", state, operation)

    async def crop_advisory(self, state: AgenticState) -> dict[str, Any]:
        async def operation(current: AgenticState) -> dict[str, Any]:
            evidence = current.get("vectorEvidence") or []
            intent = current.get("understanding", {}).get("intent", "general")
            sources: list[str] = []
            for item in evidence[:5]:
                citation = item.get("citation") or {}
                title = str(citation.get("title") or "untitled source").strip()
                source_name = str(citation.get("sourceName") or "").strip()
                sources.append(f"{title} ({source_name})" if source_name else title)
            notes = [
                "Advisory output only; verify locally before applying any input or treatment."
            ]
            if intent != "general":
                notes.append(f"Retrieved evidence was filtered for intent '{intent}'.")
            return {
                "output_crop_advisory": {
                    "intent": intent,
                    "supportingSources": sources,
                    "advisoryNotes": notes,
                }
            }

        return await self._guarded("crop_advisory", state, operation)

    async def document_analysis(self, state: AgenticState) -> dict[str, Any]:
        async def operation(current: AgenticState) -> dict[str, Any]:
            text = current["request"].documentText.strip()
            if not text:
                return {
                    "output_document_analysis": {
                        "status": "no_document_supplied",
                        "claims": [],
                        "limitations": ["No document text was supplied for analysis."],
                    }
                }
            claims: list[dict[str, Any]] = []
            for sentence in [part.strip() for part in text.split("\n") if part.strip()][:20]:
                claims.append(
                    {
                        "text": sentence[:1000],
                        "status": "supplied_document_text",
                        "verified": False,
                        "citationEligible": False,
                    }
                )
            return {
                "output_document_analysis": {
                    "status": "analyzed",
                    "claimCount": len(claims),
                    "claims": claims,
                    "limitations": [
                        "Supplied document text is not treated as verified evidence unless it matches a licensed, verified source."
                    ],
                }
            }

        return await self._guarded("document_analysis", state, operation)

    async def evidence_verification(self, state: AgenticState) -> dict[str, Any]:
        async def operation(current: AgenticState) -> dict[str, Any]:
            issues: list[str] = []
            verified_vector: list[dict[str, Any]] = []
            for item in current.get("vectorEvidence") or []:
                citation = item.get("citation") or {}
                if not item.get("chunkId") or not item.get("documentId"):
                    issues.append("vector_evidence_missing_identity")
                    continue
                if not citation.get("sourceName") or not citation.get("licenseCode"):
                    issues.append("vector_evidence_missing_provenance")
                    continue
                verified_vector.append(item)
            verified_graph: list[dict[str, Any]] = []
            for item in current.get("graphEvidence") or []:
                if not item.get("verified") and not item.get("validated"):
                    issues.append("unverified_candidate_graph_relationship_excluded")
                    continue
                if not item.get("source") or not item.get("sourceReference"):
                    issues.append("graph_evidence_missing_provenance")
                    continue
                verified_graph.append(item)
            citations = sorted(
                {
                    str(item.get("citation", {}).get("sourceUrl") or item.get("citation", {}).get("title") or "")
                    for item in verified_vector
                }
                - {""}
            )
            has_market = bool(
                (current.get("marketResult") or {}).get("mlPredictions")
                or (current.get("marketResult") or {}).get("statisticalEstimates")
            )
            sufficient = bool(verified_vector or verified_graph or has_market)
            if not sufficient:
                issues.append("insufficient_verified_evidence")
            return {
                "verifiedVectorEvidence": verified_vector,
                "verifiedGraphEvidence": verified_graph,
                "citations": citations,
                "verification": {
                    "status": "ok" if sufficient else "insufficient_evidence",
                    "issues": sorted(set(issues)),
                    "vectorCount": len(verified_vector),
                    "graphCount": len(verified_graph),
                    "marketEvidence": has_market,
                },
            }

        return await self._guarded("evidence_verification", state, operation)

    async def approval_gate(self, state: AgenticState) -> dict[str, Any]:
        async def operation(current: AgenticState) -> dict[str, Any]:
            if not current.get("approvalRequired"):
                return {"status": "ok"}
            submitted = current["request"].approval
            if submitted is None:
                return {
                    "status": "awaiting_approval",
                    "answer": (
                        "This run requires human approval before an advisory is generated. "
                        "No answer was generated."
                    ),
                    "limitations": ["Human approval has not been submitted for this run."],
                }
            approval = GraphApproval.model_validate(submitted)
            expected_id = current.get("approvalId", "")
            if approval.approvalId != expected_id:
                return {
                    "status": "awaiting_approval",
                    "answer": "This run requires a matching human approval before an advisory is generated.",
                    "limitations": ["Approval id did not match this run."],
                }
            if approval.decision == "rejected":
                return {
                    "status": "rejected",
                    "answer": "The human reviewer rejected this advisory run. No answer was generated.",
                    "approval": approval.model_dump(mode="json"),
                    "limitations": ["Human approval was rejected."],
                }
            if not approval.approvedBy.strip():
                return {
                    "status": "awaiting_approval",
                    "answer": "This run requires an identified human approver.",
                    "limitations": ["Approval did not include an approver identity."],
                }
            verified_graph = [
                {**item, "verified": True, "evidenceClass": "verified_relationship"}
                for item in current.get("verifiedGraphEvidence") or []
                if item.get("validated") and not item.get("verified")
            ]
            return {
                "status": "ok",
                "approval": approval.model_dump(mode="json"),
                "verifiedGraphEvidence": verified_graph,
                "limitations": ["Human approval was applied to validated graph relationships."],
            }

        return await self._guarded("approval_gate", state, operation)

    async def response_generation(self, state: AgenticState) -> dict[str, Any]:
        async def operation(current: AgenticState) -> dict[str, Any]:
            verification = current.get("verification") or {}
            if verification.get("status") != "ok":
                return {
                    "status": "insufficient_evidence",
                    "answer": NO_EVIDENCE_ANSWER.get(current["request"].language, NO_EVIDENCE_ANSWER["en"]),
                }
            request = current["request"]
            evidence_chunks = [
                EvidenceChunk.model_validate(item) for item in current.get("verifiedVectorEvidence") or []
            ]
            safety_notes = self.deps.safety.evaluate(
                categories=current.get("understanding", {}).get("safetyCategories") or [],
                evidence=evidence_chunks,
                language=request.language,
                region=request.region,
                default_jurisdiction=self.deps.settings.retrieval_default_jurisdiction,
            )
            prompt = self._build_prompt(current, evidence_chunks, safety_notes)
            model = self.deps.models.resolve(request.modelKey, "ask")
            llm_request = LLMRequest(
                prompt=prompt,
                systemPrompt=(
                    "You are an agricultural advisory writer. Use only the supplied evidence. "
                    "Never invent citations, prices, weather values, chemical dosages, or regulations. "
                    "If evidence is insufficient, say so. This is advisory only."
                ),
                task="agentic_rag_response",
                maxTokens=min(model.maxTokens, 1200),
                temperature=model.temperature,
            )
            started = time.perf_counter()
            response = await self.deps.llms.generate(
                llm_request,
                model=model.modelName,
                provider_name=model.provider,
            )
            latency_ms = (time.perf_counter() - started) * 1000
            self.deps.monitoring.record_generation(
                trace_id=current["traceId"],
                task="agentic_rag_response",
                usage=response.usage,
                latency_ms=latency_ms,
            )
            answer = sanitize_answer(response.text, evidence_chunks)
            if not answer.strip():
                return {
                    "status": "fallback",
                    "answer": "",
                    "usage": accumulate_usage(current, response.usage),
                }
            return {
                "status": "ok",
                "answer": answer,
                "safetyNotes": [item.model_dump(mode="json") for item in safety_notes],
                "usage": accumulate_usage(current, response.usage),
                "generation": {
                    "model": response.model,
                    "provider": response.provider,
                    "promptVersion": "agentic-evidence-v1",
                },
            }

        return await self._guarded("response_generation", state, operation)

    async def fallback(self, state: AgenticState) -> dict[str, Any]:
        async def operation(current: AgenticState) -> dict[str, Any]:
            language = current["request"].language
            parts: list[str] = []
            for item in (current.get("verifiedVectorEvidence") or [])[:3]:
                citation = item.get("citation") or {}
                source = citation.get("title") or citation.get("sourceName") or "source"
                excerpt = str(item.get("text") or "").strip()[:400]
                if excerpt:
                    parts.append(f"{source}: {excerpt}")
            if parts:
                answer = (
                    "Evidence-only advisory (generation unavailable):\n" + "\n\n".join(parts)
                    if language != "bn"
                    else "প্রমাণ-ভিত্তিক পরামর্শ (উত্পাদন অনুপলব্ধ):\n" + "\n\n".join(parts)
                )
                status = "ok"
            else:
                answer = NO_EVIDENCE_ANSWER.get(language, NO_EVIDENCE_ANSWER["en"])
                status = "insufficient_evidence"
            return {
                "status": status,
                "answer": answer,
                "limitations": [
                    "Generation was unavailable; this answer uses retrieved evidence only."
                ],
            }

        return await self._guarded("fallback", state, operation)

    def _build_prompt(
        self,
        state: AgenticState,
        evidence: list[EvidenceChunk],
        safety_notes: list[Any],
    ) -> str:
        from app.modules.recommendations import format_evidence

        sections: list[str] = [f"Question: {state['request'].query}"]
        if evidence:
            sections.append(f"VERIFIED EVIDENCE:\n{format_evidence(evidence)}")
        graph_items = state.get("verifiedGraphEvidence") or []
        if graph_items:
            graph_lines = [
                f"{item.get('subject')} — {item.get('predicate')} — {item.get('object')} "
                f"({item.get('evidenceClass')}, {item.get('source')}, {item.get('sourceReference')})"
                for item in graph_items[:10]
            ]
            sections.append("PROVENANCE-LABELLED GRAPH EVIDENCE:\n" + "\n".join(graph_lines))
        market = state.get("marketResult") or {}
        if market.get("mlPredictions"):
            sections.append(
                "MARKET PREDICTIONS (not historical facts):\n"
                + "\n".join(
                    f"{item.get('forecastFor')}: {item.get('predictedPrice')} {item.get('currency')}"
                    for item in market["mlPredictions"][:5]
                )
            )
        if safety_notes:
            sections.append(
                "REQUIRED SAFETY NOTES:\n"
                + "\n".join(str(item.message) for item in safety_notes)
            )
        return "\n\n".join(sections)[: self.deps.settings.agentic_max_context_chars]


def accumulate_usage(state: AgenticState, usage: Usage) -> dict[str, Any]:
    current = dict(state.get("usage") or {})
    current["promptTokens"] = int(current.get("promptTokens", 0)) + usage.promptTokens
    current["completionTokens"] = int(current.get("completionTokens", 0)) + usage.completionTokens
    current["totalTokens"] = int(current.get("totalTokens", 0)) + usage.totalTokens
    current["estimatedCostUsd"] = float(current.get("estimatedCostUsd", 0.0)) + usage.estimatedCostUsd
    current["provider"] = usage.provider
    current["model"] = usage.model
    return current


__all__ = ["AgentDependencies", "SpecialistAgents", "accumulate_usage"]

"""LangGraph supervisor workflow for evidence-first agricultural advisory."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.config import Settings, get_settings
from app.errors import ConfigurationError, NotFoundError, UnauthorizedError
from app.infrastructure.graph_store import GraphScope
from app.modules.agentic_rag.agents import AgentDependencies, SpecialistAgents
from app.modules.agentic_rag.models import (
    AgentState,
    AgenticQueryRequest,
    AgenticRAGResult,
    PendingAgenticRun,
)
from app.modules.agentic_rag.supervisor import WORK_AGENTS
from app.modules.agentic_rag.tools import ToolRegistry, validate_tool_policy
from app.modules.graph_rag.models import GraphApproval
from app.modules.graph_rag.service import GraphRAGService
from app.tracing import Tracer

QUERY_UNDERSTANDING = "query_understanding"
SUPERVISOR = "supervisor"
KNOWLEDGE_RETRIEVAL = "agricultural_knowledge_retrieval"
MARKET_INTELLIGENCE = "market_intelligence"
CROP_ADVISORY = "crop_advisory"
DOCUMENT_ANALYSIS = "document_analysis"
EVIDENCE_VERIFICATION = "evidence_verification"
APPROVAL_GATE = "approval_gate"
RESPONSE_GENERATION = "response_generation"
FALLBACK = "fallback"

WORK_NODES = (
    KNOWLEDGE_RETRIEVAL,
    MARKET_INTELLIGENCE,
    CROP_ADVISORY,
    DOCUMENT_ANALYSIS,
)


def route_after_supervisor(state: AgentState) -> str:
    selected = list(state.get("selectedAgents") or [])
    return selected[0] if selected else EVIDENCE_VERIFICATION


def route_after_work(state: AgentState, *, max_attempts: int) -> str:
    current = str(state.get("currentNode") or "")
    attempts = int((state.get("agentAttempts") or {}).get(current, 0))
    if state.get("lastError") and current in WORK_NODES and attempts < max_attempts:
        return current
    selected = list(state.get("selectedAgents") or [])
    step = int(state.get("step", 0))
    if step < len(selected):
        return selected[step]
    return EVIDENCE_VERIFICATION


def route_after_verification(state: AgentState) -> str:
    if state.get("approvalRequired"):
        return APPROVAL_GATE
    if state.get("status") == "insufficient_evidence":
        return FALLBACK
    return RESPONSE_GENERATION


def route_after_approval(state: AgentState) -> str:
    status = state.get("status")
    if status in {"awaiting_approval", "rejected"}:
        return END
    if status == "fallback" or (state.get("verification") or {}).get("status") != "ok":
        return FALLBACK
    return RESPONSE_GENERATION


def route_after_generation(state: AgentState) -> str:
    return FALLBACK if state.get("status") == "fallback" else END


class AgenticRAGService:
    """Builds and executes the LangGraph agentic RAG workflow."""

    def __init__(
        self,
        *,
        tools: ToolRegistry,
        graph: GraphRAGService,
        tracer: Tracer,
        settings: Settings | None = None,
        monitor: Any | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        if not self.settings.agentic_rag_enabled:
            raise ConfigurationError("Agentic RAG is disabled by configuration.")
        validate_tool_policy()
        self.tools = tools
        self.graph = graph
        self.tracer = tracer
        self.dependencies = AgentDependencies.build(tools, self.settings)
        self.agents = SpecialistAgents(self.dependencies)
        self.monitor = monitor
        self._pending: dict[str, PendingAgenticRun] = {}
        self._graph = self._build_graph()

    def _build_graph(self) -> Any:
        builder = StateGraph(AgentState)
        builder.add_node(QUERY_UNDERSTANDING, self.agents.query_understanding)
        builder.add_node(SUPERVISOR, self.agents.supervisor)
        builder.add_node(KNOWLEDGE_RETRIEVAL, self.agents.knowledge_retrieval)
        builder.add_node(MARKET_INTELLIGENCE, self.agents.market_intelligence)
        builder.add_node(CROP_ADVISORY, self.agents.crop_advisory)
        builder.add_node(DOCUMENT_ANALYSIS, self.agents.document_analysis)
        builder.add_node(EVIDENCE_VERIFICATION, self.agents.evidence_verification)
        builder.add_node(APPROVAL_GATE, self.agents.approval_gate)
        builder.add_node(RESPONSE_GENERATION, self.agents.response_generation)
        builder.add_node(FALLBACK, self.agents.fallback)

        builder.add_edge(START, QUERY_UNDERSTANDING)
        builder.add_edge(QUERY_UNDERSTANDING, SUPERVISOR)
        builder.add_conditional_edges(SUPERVISOR, route_after_supervisor)
        for node in WORK_NODES:
            builder.add_conditional_edges(
                node,
                lambda state: route_after_work(
                    state, max_attempts=self.settings.agentic_max_agent_attempts
                ),
            )
        builder.add_conditional_edges(EVIDENCE_VERIFICATION, route_after_verification)
        builder.add_conditional_edges(APPROVAL_GATE, route_after_approval)
        builder.add_conditional_edges(RESPONSE_GENERATION, route_after_generation)
        builder.add_edge(FALLBACK, END)
        return builder.compile()

    def _scope(
        self,
        request: AgenticQueryRequest,
        *,
        trusted_organization_id: str,
    ) -> GraphScope:
        return self.graph.scope(
            organization_ids=request.organizationIds,
            include_global=request.includeGlobal,
            trusted_organization_id=trusted_organization_id,
        )

    def _initial_state(
        self,
        request: AgenticQueryRequest,
        *,
        trace_id: str,
        trusted_organization_id: str,
    ) -> AgentState:
        return AgentState(
            request=request,
            scope=self._scope(request, trusted_organization_id=trusted_organization_id),
            traceId=trace_id,
            step=0,
            agentAttempts={},
            executionTrace=[],
            toolCalls=[],
            vectorEvidence=[],
            graphEvidence=[],
            limitations=[],
            usage={},
        )

    async def run(
        self,
        request: AgenticQueryRequest,
        *,
        trace_id: str,
        organization_id: str = "system",
        user_id: str = "system",
    ) -> AgenticRAGResult:
        state = self._initial_state(
            request,
            trace_id=trace_id,
            trusted_organization_id=organization_id,
        )
        return await self._invoke(state, organization_id=organization_id, user_id=user_id)

    async def resume(
        self,
        approval: GraphApproval,
        *,
        trace_id: str,
        organization_id: str = "system",
        user_id: str = "system",
    ) -> AgenticRAGResult:
        pending = self._pending.get(approval.approvalId)
        if pending is None:
            raise NotFoundError(f"Agentic approval '{approval.approvalId}' was not found.")
        if pending.organizationId != organization_id:
            raise UnauthorizedError(
                "This approval belongs to another organization.",
                details={"reason": "cross_organization_approval_denied"},
            )
        if str(pending.state.get("traceId") or "") != trace_id:
            raise UnauthorizedError(
                "The approval trace does not match the pending run.",
                details={"reason": "approval_trace_mismatch"},
            )
        if pending.userId != user_id:
            raise UnauthorizedError(
                "Only the user who requested this run may approve it.",
                details={"reason": "cross_user_approval_denied"},
            )
        reviewers = self.settings.allowed_approval_reviewers()
        if user_id not in reviewers:
            raise UnauthorizedError(
                "The authenticated user is not an authorized reviewer.",
                details={"reason": "reviewer_not_allowed"},
            )
        # Reviewer identity and timestamp come from trusted internal context,
        # not from the caller-supplied approval body.
        reviewed = approval.model_copy(
            update={
                "approvedBy": user_id,
                "approvedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
        request = pending.request.model_copy(update={"approval": reviewed})
        state = AgentState(**dict(pending.state))
        state["request"] = request
        state["traceId"] = trace_id
        state["status"] = None
        state["lastError"] = None
        self._pending.pop(approval.approvalId, None)
        return await self._invoke(state, organization_id=organization_id, user_id=user_id)

    async def _invoke(
        self,
        state: AgentState,
        *,
        organization_id: str,
        user_id: str,
    ) -> AgenticRAGResult:
        trace_id = str(state.get("traceId") or "unknown")
        started = time.perf_counter()
        with self.tracer.span(trace_id, "agentic.workflow", agents=len(WORK_AGENTS)):
            final_state = dict(await self._graph.ainvoke(state))
        if self.monitor is not None and hasattr(self.monitor, "record"):
            self.monitor.record(
                trace_id=trace_id,
                result=final_state,
                latency_ms=(time.perf_counter() - started) * 1000,
            )
        status = str(final_state.get("status") or "ok")
        if status == "awaiting_approval":
            request = AgenticQueryRequest.model_validate(final_state["request"])
            self._remember_pending(
                approval_id=str(final_state.get("approvalId") or f"approval-{trace_id}"),
                organization_id=organization_id,
                user_id=user_id,
                request=request,
                state=final_state,
            )
        return self._result(final_state, trace_id=trace_id)

    def _remember_pending(
        self,
        *,
        approval_id: str,
        organization_id: str,
        user_id: str,
        request: AgenticQueryRequest,
        state: dict[str, Any],
    ) -> None:
        self._pending[approval_id] = PendingAgenticRun(
            approvalId=approval_id,
            organizationId=organization_id,
            userId=user_id,
            request=request,
            state=state,
            createdAt=datetime.now(timezone.utc).isoformat(),
        )
        if len(self._pending) > 100:
            oldest = sorted(self._pending.values(), key=lambda item: item.createdAt)[0]
            self._pending.pop(oldest.approvalId, None)

    @staticmethod
    def _result(state: dict[str, Any], *, trace_id: str) -> AgenticRAGResult:
        limitations: list[str] = []
        graph_context = state.get("graphContext") or {}
        limitations.extend(graph_context.get("limitations") or [])
        verification = state.get("verification") or {}
        limitations.extend(verification.get("issues") or [])
        for key, value in (state.get("agentOutputs") or {}).items():
            if isinstance(value, dict):
                limitations.extend(value.get("limitations") or [])
        limitations.extend(state.get("limitations") or [])
        selected = list(state.get("selectedAgents") or [])
        outputs = {
            key.removeprefix("output_"): value
            for key, value in state.items()
            if key.startswith("output_")
        }
        status = str(state.get("status") or "ok")
        return AgenticRAGResult(
            status=status,  # type: ignore[arg-type]
            advisory=status not in {"awaiting_approval", "rejected"},
            answer=str(state.get("answer") or ""),
            selectedAgents=[QUERY_UNDERSTANDING, SUPERVISOR, *selected, EVIDENCE_VERIFICATION, RESPONSE_GENERATION],
            agentOutputs=outputs,
            evidence=list(state.get("verifiedVectorEvidence") or state.get("vectorEvidence") or []),
            graphEvidence=list(state.get("verifiedGraphEvidence") or state.get("graphEvidence") or []),
            citations=list(state.get("citations") or []),
            limitations=sorted(set(str(item) for item in limitations)),
            safetyNotes=list(state.get("safetyNotes") or []),
            toolCalls=list(state.get("toolCalls") or []),
            executionTrace=list(state.get("executionTrace") or []),
            usage=dict(state.get("usage") or {}),
            approvalId=state.get("approvalId"),
            approval=state.get("approval"),
            traceId=trace_id,
        )

    def describe(self) -> dict[str, Any]:
        return {
            "workflow": "langgraph-stategraph-v1",
            "enabled": self.settings.agentic_rag_enabled,
            "agents": [
                QUERY_UNDERSTANDING,
                SUPERVISOR,
                *WORK_AGENTS,
                EVIDENCE_VERIFICATION,
                RESPONSE_GENERATION,
                FALLBACK,
            ],
            "maxAgentAttempts": self.settings.agentic_max_agent_attempts,
            "maxToolCalls": self.settings.agentic_max_tool_calls,
            "approvalGate": True,
            "tracing": True,
            "tokenAndCostTracking": True,
            "readOnlyTools": True,
        }


__all__ = ["AgenticRAGService", "WORK_NODES"]

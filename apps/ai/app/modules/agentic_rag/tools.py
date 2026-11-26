"""Read-only, allowlisted tool execution for agentic RAG."""

from __future__ import annotations

import time
from typing import Any, Awaitable, Callable

from app.errors import AiError, ConfigurationError
from app.infrastructure.graph_store import GraphScope
from app.models import EvidenceChunk, Language
from app.modules.agentic_rag.models import AgenticState
from app.modules.forecasting import MarketForecastRequest, MarketForecastService
from app.modules.graph_rag.models import GraphRetrievalRequest
from app.modules.graph_rag.service import GraphRAGService
from app.modules.evaluation import EvaluationMonitoringService
from app.modules.knowledge import KnowledgeBaseService
from app.modules.llm_provider import LLMProviderManager
from app.modules.model_config import ModelRegistry
from app.modules.retrieval import RetrievalOptions
from app.tracing import Tracer

ALLOWED_TOOLS = frozenset(
    {
        "hybrid_retrieve",
        "graph_retrieve",
        "market_forecast",
        "document_analyze",
        "evidence_verify",
    }
)

DENIED_TOOLS = frozenset(
    {
        "create_order",
        "cancel_order",
        "post_ledger",
        "create_listing",
        "update_listing",
        "delete_listing",
        "transfer_funds",
        "make_payment",
        "delete_document",
        "update_farm",
        "delete_farm",
    }
)

FORBIDDEN_ARGUMENT_KEYS = frozenset(
    {
        "farmId",
        "farmerId",
        "userId",
        "organizationId",
        "listingId",
        "orderId",
        "paymentId",
        "transactionId",
    }
)


class ToolPolicyError(AiError):
    code = "tool_policy_denied"
    status_code = 403


class ToolRegistry:
    """Executes only deterministic, read-only advisory tools."""

    def __init__(
        self,
        *,
        knowledge: KnowledgeBaseService,
        graph: GraphRAGService,
        forecasting: MarketForecastService,
        llms: LLMProviderManager,
        models: ModelRegistry,
        tracer: Tracer,
        monitoring: EvaluationMonitoringService,
        max_tool_calls: int,
    ) -> None:
        self.knowledge = knowledge
        self.graph = graph
        self.forecasting = forecasting
        self.llms = llms
        self.models = models
        self.tracer = tracer
        self.monitoring = monitoring
        self.max_tool_calls = max_tool_calls

    @staticmethod
    def assert_allowed(name: str, arguments: dict[str, Any]) -> None:
        if name in DENIED_TOOLS:
            raise ToolPolicyError(
                "The requested tool performs a business mutation and is not allowed.",
                details={"tool": name},
            )
        if name not in ALLOWED_TOOLS:
            raise ToolPolicyError(
                "The requested tool is not on the agent tool allowlist.",
                details={"tool": name},
            )
        forbidden = FORBIDDEN_ARGUMENT_KEYS & set(arguments)
        if forbidden:
            raise ToolPolicyError(
                "Agent tools may not receive farmer, organization, or business record identifiers.",
                details={"keys": sorted(forbidden)},
            )

    async def execute(
        self,
        state: AgenticState,
        *,
        name: str,
        arguments: dict[str, Any],
        handler: Callable[[dict[str, Any], GraphScope], Awaitable[dict[str, Any]]],
        scope: GraphScope,
    ) -> dict[str, Any]:
        self.assert_allowed(name, arguments)
        calls = list(state.get("toolCalls") or [])
        if len(calls) >= self.max_tool_calls:
            raise ToolPolicyError(
                "The agent tool call limit was reached.",
                details={"limit": self.max_tool_calls},
            )
        started = time.perf_counter()
        status = "ok"
        try:
            result = await handler(arguments, scope)
            return result
        except Exception as error:
            status = "error"
            raise
        finally:
            calls.append(
                {
                    "tool": name,
                    "arguments": _safe_arguments(arguments),
                    "status": status,
                    "durationMs": round((time.perf_counter() - started) * 1000, 3),
                }
            )
            state["toolCalls"] = calls

    async def hybrid_retrieve(
        self,
        state: AgenticState,
        *,
        query: str,
        language: Language,
        top_k: int,
        document_types: list[str],
        region: str,
        trace_id: str,
    ) -> list[EvidenceChunk]:
        options = RetrievalOptions(documentTypes=document_types, region=region)
        result = await self.execute(
            state,
            name="hybrid_retrieve",
            arguments={
                "queryLength": len(query),
                "language": language,
                "topK": top_k,
                "documentTypes": document_types,
                "region": region,
            },
            scope=GraphScope(),
            handler=_hybrid_handler(
                self.knowledge,
                query=query,
                language=language,
                top_k=top_k,
                document_types=document_types,
                options=options,
                trace_id=trace_id,
            ),
        )
        return [EvidenceChunk.model_validate(item) for item in result["evidence"]]

    async def graph_retrieve(
        self,
        state: AgenticState,
        *,
        query: str,
        entities: list[str],
        scope: GraphScope,
        min_confidence: float,
    ) -> dict[str, Any]:
        request = GraphRetrievalRequest(
            query=query,
            entities=entities[:20],
            organizationIds=list(scope.organization_ids),
            includeGlobal=scope.include_global,
            topK=20,
            minConfidence=min_confidence,
            verifiedOnly=False,
            includeCandidates=False,
        )
        result = await self.execute(
            state,
            name="graph_retrieve",
            arguments={
                "queryLength": len(query),
                "entityCount": len(request.entities),
                "minConfidence": min_confidence,
            },
            scope=scope,
            handler=_graph_handler(self.graph, request),
        )
        return result

    async def forecast_market(
        self,
        state: AgenticState,
        *,
        observations: list[dict[str, Any]],
        region: str,
        language: Language,
    ) -> dict[str, Any]:
        if not observations:
            return {
                "status": "insufficient_observations",
                "limitations": ["No market observations were supplied; no price was generated."],
                "evidenceClasses": [],
            }
        request = MarketForecastRequest.model_validate(
            {
                "observations": observations,
                "region": region or None,
                "language": language,
                "includeExplanation": False,
            }
        )
        return await self.execute(
            state,
            name="market_forecast",
            arguments={
                "observationCount": len(observations),
                "productId": request.productId,
                "region": request.region,
            },
            scope=GraphScope(),
            handler=_forecast_handler(self.forecasting, request),
        )


def _hybrid_handler(
    knowledge: KnowledgeBaseService,
    *,
    query: str,
    language: Language,
    top_k: int,
    document_types: list[str],
    options: RetrievalOptions,
    trace_id: str,
) -> Callable[[dict[str, Any], GraphScope], Awaitable[dict[str, Any]]]:
    async def handler(_arguments: dict[str, Any], _scope: GraphScope) -> dict[str, Any]:
        result = await knowledge.retrieve_detailed(
            query,
            language=language,
            top_k=top_k,
            document_types=document_types,
            options=options,
            trace_id=trace_id,
        )
        return {
            "evidence": [item.model_dump(mode="json") for item in result.evidence],
            "diagnostics": result.diagnostics.model_dump(mode="json"),
        }

    return handler


def _graph_handler(
    graph: GraphRAGService,
    request: GraphRetrievalRequest,
) -> Callable[[dict[str, Any], GraphScope], Awaitable[dict[str, Any]]]:
    async def handler(_arguments: dict[str, Any], scope: GraphScope) -> dict[str, Any]:
        trusted_id = next(iter(scope.organization_ids), "system")
        result = await graph.retrieve(request, trusted_organization_id=trusted_id)
        return result.model_dump(mode="json")

    return handler


def _forecast_handler(
    forecasting: MarketForecastService,
    request: MarketForecastRequest,
) -> Callable[[dict[str, Any], GraphScope], Awaitable[dict[str, Any]]]:
    async def handler(_arguments: dict[str, Any], _scope: GraphScope) -> dict[str, Any]:
        result = await forecasting.forecast(request)
        return result.model_dump(mode="json")

    return handler


def _safe_arguments(arguments: dict[str, Any]) -> dict[str, Any]:
    return {
        key: (f"<{len(value)} items>" if isinstance(value, list) else value)
        for key, value in arguments.items()
    }


def validate_tool_policy() -> dict[str, Any]:
    if ALLOWED_TOOLS & DENIED_TOOLS:
        raise ConfigurationError("Agent tool allowlist and denylist overlap.")
    return {
        "allowed": sorted(ALLOWED_TOOLS),
        "denied": sorted(DENIED_TOOLS),
        "readOnly": True,
    }


__all__ = [
    "ALLOWED_TOOLS",
    "DENIED_TOOLS",
    "ToolPolicyError",
    "ToolRegistry",
    "validate_tool_policy",
]

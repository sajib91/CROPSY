from pathlib import Path

from fastapi import APIRouter, Depends, Request

from app.container import AiContainer, get_container
from app.errors import NotFoundError
from app.modules.agents import AskInput
from app.modules.assistant import AssistantChatInput
from app.modules.evaluation import FeedbackInput
from app.modules.recommendations import RecommendationInput
from app.modules.retrieval import RetrievalOptions
from app.schemas.internal import (
    AskRequest,
    AssistantChatRequest,
    ConversationCreateRequest,
    DocumentProcessingInput,
    FeedbackRequest,
    MarketExplanationRequest,
    MarketForecastRequest,
    MultimodalInput,
    RecommendRequest,
    RetrieveRequest,
    RetrievalEvaluationRequest,
    WeatherAdvisoryRequest,
    WeatherLookup,
)
from app.security import InternalContext, require_internal

router = APIRouter(prefix="/internal", tags=["internal-ai"], dependencies=[Depends(require_internal)])
RETRIEVAL_DATASET_PATH = (
    Path(__file__).resolve().parents[2]
    / "evaluation"
    / "datasets"
    / "hybrid-retrieval-v1.json"
)


def _meta(context: InternalContext, **extra: object) -> dict[str, object]:
    return {
        "requestId": context.request_id,
        "organizationId": context.organization_id,
        "serviceId": context.service_id,
        **extra,
    }


def _trace_id(request: Request, context: InternalContext, container: AiContainer) -> str:
    supplied = getattr(request.state, "trace_id", "")
    return supplied or context.request_id or container.tracer.new_trace_id()


@router.post("/documents/ingest")
async def ingest_document(
    value: DocumentProcessingInput,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    value.ingestedBy = context.user_id
    result = await container.knowledge.ingest(value)
    return {
        "success": True,
        "data": result.model_dump(mode="json"),
        "meta": _meta(context),
    }


@router.get("/documents")
def list_documents(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": {"documents": container.knowledge.list_documents()},
        "meta": _meta(context),
    }


@router.get("/documents/{document_id}")
def get_document(
    document_id: str,
    version: str | None = None,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    record = container.knowledge.get_document(document_id, version)
    data = record.model_dump(mode="json")
    data["citationEligible"] = container.knowledge.citations_for(document_id, version) != []
    data["versions"] = container.knowledge._version_history.get(document_id, [])
    return {"success": True, "data": data, "meta": _meta(context)}


@router.get("/documents/{document_id}/citations")
def document_citations(
    document_id: str,
    version: str | None = None,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    citations = container.knowledge.citations_for(document_id, version)
    return {
        "success": True,
        "data": {"citations": [item.model_dump(mode="json") for item in citations]},
        "meta": _meta(context, citationCount=len(citations)),
    }


@router.post("/retrieve")
async def retrieve(
    request: Request,
    value: RetrieveRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    options = RetrievalOptions(
        **value.model_dump(
            exclude={"query", "language", "topK"},
        )
    )
    result = await container.knowledge.retrieve_detailed(
        value.query,
        language=value.language,
        top_k=value.topK,
        document_types=value.documentTypes,
        options=options,
        trace_id=_trace_id(request, context, container),
    )
    return {
        "success": True,
        "data": {
            "evidence": [item.model_dump(mode="json") for item in result.evidence],
            "diagnostics": result.diagnostics.model_dump(mode="json"),
            "backends": container.knowledge.backend_status(),
        },
        "meta": _meta(context, resultCount=len(result.evidence)),
    }


@router.post("/ask")
async def ask(
    request: Request,
    value: AskRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.agents.ask(
        AskInput(**value.model_dump()),
        trace_id=_trace_id(request, context, container),
        organization_id=context.organization_id,
        user_id=context.user_id,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/conversations")
async def create_conversation(
    value: ConversationCreateRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    conversation = await container.assistant.create_conversation(
        organization_id=context.organization_id,
        user_id=context.user_id,
        language=value.language,
        title=value.title,
    )
    return {
        "success": True,
        "data": conversation.model_dump(mode="json"),
        "meta": _meta(context),
    }


@router.get("/conversations")
async def list_conversations(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    conversations = await container.assistant.list_conversations(
        organization_id=context.organization_id,
        user_id=context.user_id,
    )
    return {
        "success": True,
        "data": {
            "conversations": [item.model_dump(mode="json") for item in conversations]
        },
        "meta": _meta(context, conversationCount=len(conversations)),
    }


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    conversation = await container.assistant.get_conversation(
        conversation_id,
        organization_id=context.organization_id,
        user_id=context.user_id,
    )
    return {
        "success": True,
        "data": conversation.model_dump(mode="json"),
        "meta": _meta(context),
    }


@router.post("/assistant/chat")
async def assistant_chat(
    request: Request,
    value: AssistantChatRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.assistant.chat(
        AssistantChatInput(**value.model_dump()),
        trace_id=_trace_id(request, context, container),
        organization_id=context.organization_id,
        user_id=context.user_id,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/recommend")
async def recommend(
    request: Request,
    value: RecommendRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.recommendations.recommend(
        RecommendationInput(**value.model_dump()),
        trace_id=_trace_id(request, context, container),
        organization_id=context.organization_id,
        user_id=context.user_id,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/multimodal/process")
async def process_multimodal(
    request: Request,
    value: MultimodalInput,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.multimodal.process(
        value,
        trace_id=_trace_id(request, context, container),
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/feedback")
def feedback(
    value: FeedbackRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = container.monitoring.record_feedback(
        FeedbackInput(
            **value.model_dump(),
            organizationId=context.organization_id,
            userId=context.user_id,
        )
    )
    return {"success": True, "data": result, "meta": _meta(context)}


@router.get("/traces/{trace_id}")
def get_trace(
    trace_id: str,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    spans = container.tracer.for_trace(trace_id)
    if not spans:
        raise NotFoundError(f"Trace '{trace_id}' was not found.")
    return {
        "success": True,
        "data": {
            "traceId": trace_id,
            "spans": spans,
            "usage": container.monitoring.trace_usage(trace_id),
        },
        "meta": _meta(context),
    }


@router.get("/evaluation")
def evaluation(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": container.monitoring.snapshot(),
        "meta": _meta(context),
    }


@router.post("/evaluation/retrieval")
async def evaluation_retrieval(
    request: Request,
    value: RetrievalEvaluationRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    trace_id = _trace_id(request, context, container)

    async def retrieve(query: str, language: str) -> list[str]:
        result = await container.knowledge.retrieve_detailed(
            query,
            language=language,  # type: ignore[arg-type]
            top_k=value.topK,
            trace_id=trace_id,
        )
        return [item.documentId for item in result.evidence]

    evaluation = await container.retrieval_evaluation.evaluate_file(
        RETRIEVAL_DATASET_PATH,
        retrieve,
        top_k=value.topK,
        backends=container.knowledge.backend_status(),
    )
    return {
        "success": True,
        "data": evaluation.model_dump(mode="json"),
        "meta": _meta(context, datasetId=evaluation.datasetId),
    }


@router.post("/market/forecast")
async def market_forecast(
    value: MarketForecastRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.forecasting.forecast(value)
    data = result.model_dump(mode="json")
    if value.includeExplanation:
        explanation = await container.market_explanation.explain(
            MarketExplanationRequest(
                productId=value.productId,
                region=value.region,
                language=value.language,
                observations=data["historicalObservations"],
                statisticalEstimates=data["statisticalEstimates"] or {},
                predictions=data["mlPredictions"],
                evaluation=data["evaluation"],
            )
        )
        data["llmExplanation"] = explanation.model_dump(mode="json")
    return {"success": True, "data": data, "meta": _meta(context)}


@router.post("/market/explain")
async def market_explain(
    value: MarketExplanationRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.market_explanation.explain(value)
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/weather/observations")
async def weather_observations(
    value: WeatherLookup,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.weather.observations(value)
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/weather/forecasts")
async def weather_forecasts(
    value: WeatherLookup,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.weather.forecasts(value)
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/weather/alerts")
async def weather_alerts(
    value: WeatherLookup,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.weather.alerts(value)
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/weather/advisory")
async def weather_advisory(
    value: WeatherAdvisoryRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.weather.advisory(value)
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.get("/models")
def models(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": {
            "models": container.models.describe(),
            "selected": container.models.resolve().model_dump(mode="json"),
            "llmProviders": container.llms.describe(),
            "embeddingProviders": container.embeddings.describe(),
        },
        "meta": _meta(context),
    }


@router.get("/prompts")
def prompts(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": {"prompts": container.prompts.describe()},
        "meta": _meta(context),
    }


@router.get("/capabilities")
def capabilities(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": {
            "modules": [
                "llm-provider-management",
                "model-configuration",
                "prompt-management",
                "embedding-generation",
                "document-processing",
                "retrieval-engine",
                "reranking",
                "agricultural-knowledge-base",
                "agent-orchestration",
                "multimodal-processing",
                "ai-recommendations",
                "evaluation-and-monitoring",
                "market-forecasting",
                "market-explanation",
                "weather-intelligence",
            ],
            "documentTypes": [
                "research_paper",
                "government_publication",
                "crop_cultivation_guideline",
                "fertilizer_recommendation",
                "pest_management",
                "disease_management",
                "agricultural_manual",
                "weather_guidance",
                "soil_management",
                "market_intelligence",
            ],
            "languages": ["en", "bn"],
            "retrievalPipeline": [
                "query_understanding",
                "query_transformation",
                "parallel_vector_and_keyword_retrieval",
                "result_fusion",
                "reranking",
                "context_selection",
                "generation",
                "citation_validation",
            ],
            "retrievalFeatures": [
                "qdrant_dense",
                "opensearch_keyword",
                "metadata_filters",
                "query_expansion",
                "bengali_english",
                "bge_reranking",
                "context_deduplication",
                "source_attribution",
            ],
            "retrievalMetrics": ["recallAtK", "precisionAtK", "mrr", "ndcgAtK"],
            "assistant": {
                "conversationHistory": True,
                "followUps": True,
                "claimsSeparated": ["established_fact", "prediction"],
            },
            "marketIntelligence": {
                "evidenceClasses": [
                    "historical_observation",
                    "statistical_estimate",
                    "ml_prediction",
                    "llm_generated_explanation",
                ],
                "forecastValidation": "time_based_split",
                "forecastMetrics": ["mae", "rmse", "mape"],
                "noLiveQuoteClaim": True,
            },
            "weatherIntelligence": {
                "evidenceClasses": [
                    "weather_observation",
                    "weather_forecast",
                    "weather_alert",
                    "ai_generated_recommendation",
                ],
                "provider": getattr(container.weather_provider, "backend_name", "none"),
                "noSyntheticWeather": True,
            },
            "citationPolicy": "verified-licensed-sources-only",
            "credentialPolicy": "server-side-only",
        },
        "meta": _meta(context),
    }

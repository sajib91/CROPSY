from pathlib import Path

from fastapi import APIRouter, Depends, Request

from app.container import AiContainer, get_container
from app.errors import NotFoundError
from app.modules.agents import AskInput
from app.modules.assistant import AssistantChatInput
from app.modules.evaluation import FeedbackInput
from app.modules.evaluation_framework.datasets import describe_datasets
from app.modules.recommendations import RecommendationInput
from app.modules.retrieval import RetrievalOptions
from app.schemas.internal import (
    AgenticApprovalRequest,
    AgenticQueryRequest,
    AskRequest,
    AssistantChatRequest,
    BaselineRequest,
    ComparisonRequest,
    ConversationCreateRequest,
    DocumentProcessingInput,
    EvaluationRunRequest,
    ExpertReviewDecision,
    ExpertReviewRequest,
    FeedbackRequest,
    GraphBuildRequest,
    GraphContextRequest,
    GraphExtractionRequest,
    GraphRetrievalRequest,
    HumanFeedbackInput,
    ImageAnalysisRequest,
    ImageFeedbackInput,
    MarketExplanationRequest,
    MarketForecastRequest,
    MultimodalAssetInput,
    MultimodalInput,
    MultimodalRetrievalInput,
    RecommendRequest,
    RetrieveRequest,
    RegressionRequest,
    RetrievalEvaluationRequest,
    UnifiedEvaluationRequest,
    UnifiedQueryRequest,
    WeatherAdvisoryRequest,
    WeatherLookup,
)
from app.security import InternalContext, require_internal

router = APIRouter(prefix="/internal", tags=["internal-ai"], dependencies=[Depends(require_internal)])
DATASET_DIR = Path(__file__).resolve().parents[2] / "evaluation" / "datasets"
RETRIEVAL_DATASET_PATH = DATASET_DIR / "hybrid-retrieval-v1.json"
TEXT_DATASET_PATH = DATASET_DIR / "text-retrieval-v1.json"
IMAGE_DATASET_PATH = DATASET_DIR / "image-retrieval-v1.json"
MULTIMODAL_QA_DATASET_PATH = DATASET_DIR / "multimodal-qa-v1.json"


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


@router.post("/multimodal/assets")
async def ingest_multimodal_asset(
    value: MultimodalAssetInput,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.multimodal_rag.ingest(
        value,
        trusted_organization_id=context.organization_id,
        trace_id=context.request_id,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/multimodal/retrieve")
async def retrieve_multimodal(
    request: Request,
    value: MultimodalRetrievalInput,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.multimodal_rag.retrieve(
        value,
        trusted_organization_id=context.organization_id,
        trace_id=_trace_id(request, context, container),
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/orchestration/run")
async def run_unified(
    request: Request,
    value: UnifiedQueryRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.orchestrator.run(
        value,
        trace_id=_trace_id(request, context, container),
        organization_id=context.organization_id,
        user_id=context.user_id,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.get("/orchestration/capabilities")
def orchestration_capabilities(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": {
            **container.orchestrator.describe(),
            "multimodal": container.multimodal_rag.describe(),
            "evaluation": container.multimodal_evaluation.describe(),
        },
        "meta": _meta(context),
    }


@router.post("/orchestration/evaluation")
async def run_unified_evaluation(
    request: Request,
    value: UnifiedEvaluationRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    trace_id = _trace_id(request, context, container)

    async def text_retrieve(query: str, language: str) -> list[str]:
        result = await container.knowledge.retrieve_detailed(
            query,
            language=language,  # type: ignore[arg-type]
            top_k=value.topK,
            trace_id=trace_id,
        )
        return [item.documentId for item in result.evidence]

    async def image_retrieve(query: str, language: str, top_k: int) -> list[str]:
        result = await container.multimodal_rag.retrieve(
            MultimodalRetrievalInput(query=query, language=language, topK=top_k),  # type: ignore[arg-type]
            trusted_organization_id=context.organization_id,
            trace_id=trace_id,
        )
        return [item.documentId for item in result.evidence]

    async def multimodal_ask(question: str, language: str, top_k: int) -> dict[str, object]:
        result = await container.orchestrator.run(
            UnifiedQueryRequest(
                query=question,
                language=language,  # type: ignore[arg-type]
                topK=top_k,
                documentText=question,
            ),
            trace_id=trace_id,
            organization_id=context.organization_id,
            user_id=context.user_id,
        )
        return result.model_dump(mode="json")

    if value.dataset == "text":
        evaluation = await container.multimodal_evaluation.evaluate_text_retrieval(
            TEXT_DATASET_PATH, text_retrieve, top_k=value.topK
        )
    elif value.dataset == "image":
        evaluation = await container.multimodal_evaluation.evaluate_image_retrieval(
            IMAGE_DATASET_PATH, image_retrieve, top_k=value.topK
        )
    else:
        evaluation = await container.multimodal_evaluation.evaluate_multimodal_qa(
            MULTIMODAL_QA_DATASET_PATH, multimodal_ask, top_k=value.topK
        )
    return {
        "success": True,
        "data": evaluation.model_dump(mode="json"),
        "meta": _meta(context, dataset=value.dataset),
    }


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


@router.post("/agentic/run")
async def agentic_run(
    request: Request,
    value: AgenticQueryRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.agentic.run(
        value,
        trace_id=_trace_id(request, context, container),
        organization_id=context.organization_id,
        user_id=context.user_id,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/agentic/approve")
async def agentic_approve(
    value: AgenticApprovalRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.agentic.resume(
        value.approval,
        trace_id=value.traceId,
        organization_id=context.organization_id,
        user_id=context.user_id,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/graph/extract")
async def graph_extract(
    value: GraphExtractionRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    value.organizationId = context.organization_id
    result = await container.graph.extract(value)
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/graph/build")
async def graph_build(
    value: GraphBuildRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    value.extraction.organizationId = context.organization_id
    result = await container.graph.build(
        value=value.extraction,
        trusted_organization_id=context.organization_id,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/graph/retrieve")
async def graph_retrieve(
    value: GraphRetrievalRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.graph.retrieve(value, trusted_organization_id=context.organization_id)
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/graph/context")
async def graph_context(
    request: Request,
    value: GraphContextRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    evidence = await container.knowledge.retrieve(
        value.query,
        language="en",
        top_k=value.topK,
        document_types=value.documentTypes,
        trace_id=_trace_id(request, context, container),
    )
    result = await container.graph.combined(
        query=value.query,
        vector_evidence=evidence,
        graph_value=value.graph,
        trusted_organization_id=context.organization_id,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.get("/graph/capabilities")
def graph_capabilities(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": container.graph.describe(),
        "meta": _meta(context),
    }


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
                "agentic-rag-workflow",
                "graph-rag",
                "multimodal-rag",
                "unified-rag-orchestration",
                "evaluation-datasets",
                "advisory-image-analysis",
                "ai-evaluation-framework",
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
            "agenticRag": container.agentic.describe(),
            "multimodalRag": container.multimodal_rag.describe(),
            "unifiedOrchestration": container.orchestrator.describe(),
            "graphRag": {
                "backend": getattr(container.graph_store, "backend_name", "none"),
                "evidenceClasses": [
                    "candidate_extraction",
                    "validated_extraction",
                    "verified_relationship",
                ],
                "humanApprovalForVerifiedRelationships": True,
                "tenantScopeEnforced": True,
            },
            "citationPolicy": "verified-licensed-sources-only",
            "credentialPolicy": "server-side-only",
        },
        "meta": _meta(context),
    }


# ---------------------------------------------------------------------------
# Advisory agricultural image analysis. Output is never a confirmed diagnosis.
# ---------------------------------------------------------------------------


@router.post("/image-analysis/analyze")
async def analyze_image(
    request: Request,
    value: ImageAnalysisRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = await container.image_analysis.analyze(
        value,
        trusted_organization_id=context.organization_id,
        trace_id=_trace_id(request, context, container),
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.get("/image-analysis/capabilities")
def image_analysis_capabilities(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": container.image_analysis.describe(),
        "meta": _meta(context),
    }


@router.post("/image-analysis/feedback")
def image_analysis_feedback(
    value: ImageFeedbackInput,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = container.image_analysis.record_feedback(
        value,
        trusted_organization_id=context.organization_id,
        user_id=context.user_id,
    )
    return {"success": True, "data": result, "meta": _meta(context)}


@router.post("/image-analysis/reviews")
def request_expert_review(
    value: ExpertReviewRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = container.image_analysis.request_review(
        value,
        trusted_organization_id=context.organization_id,
        user_id=context.user_id,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/image-analysis/reviews/decide")
def decide_expert_review(
    value: ExpertReviewDecision,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = container.image_analysis.decide_review(
        value, trusted_organization_id=context.organization_id
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.get("/image-analysis/reviews/{review_id}")
def get_expert_review(
    review_id: str,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = container.image_analysis.get_review(
        review_id, trusted_organization_id=context.organization_id
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


# ---------------------------------------------------------------------------
# Evaluation framework. Reports are derived only from completed real runs.
# ---------------------------------------------------------------------------


@router.get("/evaluation/framework/capabilities")
def evaluation_framework_capabilities(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": {
            "framework": container.evaluation_framework.describe(),
            "datasets": describe_datasets(),
            "promptVersions": container.prompt_versions.describe(),
            "agentMonitoring": container.agent_monitor.snapshot(),
            "scoresManufactured": False,
            "accuracyClaimed": False,
        },
        "meta": _meta(context),
    }


@router.post("/evaluation/framework/runs")
async def run_evaluation(
    request: Request,
    value: EvaluationRunRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    trace_id = _trace_id(request, context, container)
    result = await container.evaluation_framework.run(
        value.suite,
        container.evaluation_callbacks(
            organization_id=context.organization_id, trace_id=trace_id
        ),
        trusted_organization_id=context.organization_id,
        model_versions=value.modelVersions,
        prompt_versions=value.promptVersions,
        trace_id=trace_id,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.get("/evaluation/framework/runs/{run_id}")
def get_evaluation_run(
    run_id: str,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = container.evaluation_framework.get_run(
        run_id, trusted_organization_id=context.organization_id
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/evaluation/framework/feedback")
def record_evaluation_feedback(
    value: HumanFeedbackInput,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    result = container.evaluation_feedback.record(
        value,
        trusted_organization_id=context.organization_id,
        user_id=context.user_id,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.get("/evaluation/framework/baselines")
def list_regression_baselines(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    baselines = container.regression.list_baselines(
        trusted_organization_id=context.organization_id
    )
    return {
        "success": True,
        "data": {"baselines": [item.model_dump(mode="json") for item in baselines]},
        "meta": _meta(context),
    }


@router.post("/evaluation/framework/baselines")
def create_regression_baseline(
    value: BaselineRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    run = container.evaluation_framework.get_run(
        value.runId, trusted_organization_id=context.organization_id
    )
    baseline = container.regression.set_baseline(
        run, trusted_organization_id=context.organization_id
    )
    return {"success": True, "data": baseline.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/evaluation/framework/regression")
def check_regression(
    value: RegressionRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    run = container.evaluation_framework.get_run(
        value.runId, trusted_organization_id=context.organization_id
    )
    result = container.regression.compare(
        run,
        baseline_id=value.baselineId,
        trusted_organization_id=context.organization_id,
        tolerance=value.tolerance,
    )
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.post("/evaluation/framework/comparison")
def compare_evaluations(
    value: ComparisonRequest,
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    runs = [
        container.evaluation_framework.get_run(
            run_id, trusted_organization_id=context.organization_id
        )
        for run_id in value.runIds
    ]
    result = container.model_comparison.compare(runs)
    return {"success": True, "data": result.model_dump(mode="json"), "meta": _meta(context)}


@router.get("/evaluation/framework/diagnostics")
def retrieval_diagnostics(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": container.retrieval_diagnostics.snapshot(),
        "meta": _meta(context),
    }


@router.get("/evaluation/framework/dashboards/failures")
def failure_dashboard(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": container.failure_analysis.dashboard(
            trusted_organization_id=context.organization_id
        ),
        "meta": _meta(context),
    }


@router.get("/evaluation/framework/monitoring")
def agent_execution_monitoring(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": container.agent_monitor.snapshot(),
        "meta": _meta(context),
    }


@router.get("/evaluation/framework/prompts")
def evaluation_prompt_versions(
    context: InternalContext = Depends(require_internal),
    container: AiContainer = Depends(get_container),
) -> dict[str, object]:
    return {
        "success": True,
        "data": {"prompts": container.prompt_versions.describe()},
        "meta": _meta(context),
    }

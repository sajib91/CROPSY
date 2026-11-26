from functools import lru_cache
from typing import Any, Callable

from app.config import Settings, get_settings
from app.infrastructure.docling import DoclingPdfProcessor
from app.infrastructure.graph_store import build_graph_store
from app.infrastructure.keyword_index import InMemoryKeywordIndex, OpenSearchKeywordIndex
from app.infrastructure.ocr import TesseractOcrProcessor
from app.infrastructure.vector_store import InMemoryVectorIndex, QdrantVectorIndex
from app.infrastructure.weather import build_weather_provider
from app.modules.agentic_rag import AgenticQueryRequest, AgenticRAGService, ToolRegistry
from app.modules.agents import AgentOrchestrator
from app.modules.assistant import AgriculturalAssistantService
from app.modules.conversation import InMemoryConversationStore
from app.modules.documents import DocumentProcessingService
from app.modules.embeddings import EmbeddingService
from app.modules.evaluation import EvaluationMonitoringService
from app.modules.knowledge import KnowledgeBaseService
from app.modules.forecasting import ForecastPipelineRegistry, MarketForecastService
from app.modules.evaluation_framework import (
    AgentExecutionMonitor,
    EvaluationFrameworkService,
    FailureAnalysisService,
    HumanFeedbackCollector,
    ModelComparisonService,
    PromptVersionRegistry,
    RegressionService,
    RetrievalDiagnosticsService,
)
from app.modules.graph_rag import GraphRAGService
from app.modules.image_analysis import ImageAnalysisModelRegistry, ImageAnalysisService
from app.modules.llm_provider import LLMProviderManager
from app.modules.market_explanation import MarketExplanationService
from app.modules.model_config import ModelRegistry
from app.modules.multimodal import MultimodalProcessingService
from app.modules.multimodal_rag import MultimodalRAGService, MultimodalRetrievalInput
from app.modules.orchestration import (
    MultimodalEvaluationService,
    UnifiedOrchestrator,
    UnifiedQueryRequest,
)
from app.modules.prompt import ASK_SYSTEM_BN, ASK_SYSTEM_EN, PromptManager
from app.modules.query_understanding import QueryUnderstandingService
from app.modules.reranking import RerankingService
from app.modules.recommendations import RecommendationService
from app.modules.retrieval import RetrievalEngine, require_production_retrieval
from app.modules.retrieval_evaluation import RetrievalEvaluationService
from app.modules.safety import SafetyPolicyService
from app.modules.weather import WeatherIntelligenceService
from app.rate_limit import SlidingWindowRateLimiter, build_rate_limiter
from app.tracing import Tracer


class AiContainer:
    """Composition root for the CROPSY AI capability modules."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.tracer = Tracer(self.settings.max_trace_history)
        self.monitoring = EvaluationMonitoringService(self.settings.max_trace_history)
        self.rate_limiter = build_rate_limiter(self.settings)

        # Evaluation framework. Runs and reports exist only after real executions.
        self.evaluation_framework = EvaluationFrameworkService(self.settings)
        self.evaluation_feedback = HumanFeedbackCollector(self.settings)
        self.agent_monitor = AgentExecutionMonitor(self.settings.max_trace_history)
        self.retrieval_diagnostics = RetrievalDiagnosticsService(self.monitoring)
        self.regression = RegressionService()
        self.model_comparison = ModelComparisonService()
        self.prompt_versions = PromptVersionRegistry()
        self._register_default_prompt_versions()
        self.failure_analysis = FailureAnalysisService(
            runs=self.evaluation_framework,
            feedback=self.evaluation_feedback,
            agent_monitor=self.agent_monitor,
            monitoring=self.monitoring,
            retrieval_diagnostics=self.retrieval_diagnostics,
        )

        self.models = ModelRegistry(self.settings)
        self.prompts = PromptManager()
        self.llms = LLMProviderManager(self.settings)
        self.embeddings = EmbeddingService(self.settings)

        if self.settings.vector_backend == "qdrant":
            self.vector_index: Any = QdrantVectorIndex(
                url=self.settings.qdrant_url,
                collection=self.settings.qdrant_collection,
                dimensions=self.settings.embedding_dimensions,
                api_key=self.settings.qdrant_api_key.get_secret_value(),
                timeout_seconds=self.settings.retrieval_backend_timeout_seconds,
            )
        else:
            self.vector_index = InMemoryVectorIndex()

        if self.settings.keyword_backend == "opensearch":
            self.keyword_index: Any = OpenSearchKeywordIndex(
                url=self.settings.opensearch_url,
                index=self.settings.opensearch_index,
                username=self.settings.opensearch_username,
                password=self.settings.opensearch_password.get_secret_value(),
                timeout_seconds=self.settings.retrieval_backend_timeout_seconds,
            )
        else:
            self.keyword_index = InMemoryKeywordIndex()

        self.processing = DocumentProcessingService(self.settings)
        self.retrieval = RetrievalEngine(
            vector_index=self.vector_index,
            keyword_index=self.keyword_index,
            embeddings=self.embeddings,
            settings=self.settings,
            query_understanding=QueryUnderstandingService(
                enable_expansion=self.settings.retrieval_enable_query_expansion,
                max_variants=self.settings.retrieval_max_query_variants,
            ),
        )
        require_production_retrieval(self.retrieval, self.settings)
        self.reranking = RerankingService(self.settings)
        self.knowledge = KnowledgeBaseService(
            settings=self.settings,
            processing=self.processing,
            embeddings=self.embeddings,
            retrieval=self.retrieval,
            reranking=self.reranking,
            vector_index=self.vector_index,
            keyword_index=self.keyword_index,
            monitoring=self.monitoring,
            tracer=self.tracer,
        )
        self.recommendations = RecommendationService(
            knowledge=self.knowledge,
            llms=self.llms,
            models=self.models,
            prompts=self.prompts,
            tracer=self.tracer,
            monitoring=self.monitoring,
        )
        self.agents = AgentOrchestrator(
            knowledge=self.knowledge,
            llms=self.llms,
            models=self.models,
            prompts=self.prompts,
            tracer=self.tracer,
            monitoring=self.monitoring,
            recommendations=self.recommendations,
        )
        self.conversations = InMemoryConversationStore(
            max_conversations=1000,
            max_messages=self.settings.conversation_max_messages,
            ttl_seconds=self.settings.conversation_ttl_seconds,
        )
        self.assistant = AgriculturalAssistantService(
            knowledge=self.knowledge,
            llms=self.llms,
            models=self.models,
            prompts=self.prompts,
            tracer=self.tracer,
            monitoring=self.monitoring,
            conversations=self.conversations,
            understanding=QueryUnderstandingService(
                enable_expansion=self.settings.retrieval_enable_query_expansion,
                max_variants=self.settings.retrieval_max_query_variants,
            ),
            safety=SafetyPolicyService(),
        )
        self.retrieval_evaluation = RetrievalEvaluationService()
        self.multimodal = MultimodalProcessingService(self.settings, self.tracer)
        self.multimodal_rag = MultimodalRAGService(
            settings=self.settings,
            processing=self.processing,
            embeddings=self.embeddings,
            vector_index=self.vector_index,
            keyword_index=self.keyword_index,
            tracer=self.tracer,
        )
        self.multimodal_evaluation = MultimodalEvaluationService(self.retrieval_evaluation)

        self.forecast_registry = ForecastPipelineRegistry(self.settings)
        self.forecasting = MarketForecastService(self.settings, self.forecast_registry)
        self.market_explanation = MarketExplanationService(self.llms, self.models)
        self.weather_provider = build_weather_provider(self.settings)
        self.weather = WeatherIntelligenceService(self.weather_provider, self.settings)

        self.graph_store = build_graph_store(self.settings)
        self.graph = GraphRAGService(
            store=self.graph_store,
            knowledge=self.knowledge,
            llms=self.llms,
            models=self.models,
            settings=self.settings,
        )
        self.agent_tools = ToolRegistry(
            knowledge=self.knowledge,
            graph=self.graph,
            forecasting=self.forecasting,
            llms=self.llms,
            models=self.models,
            tracer=self.tracer,
            monitoring=self.monitoring,
            max_tool_calls=self.settings.agentic_max_tool_calls,
        )
        self.agentic = AgenticRAGService(
            tools=self.agent_tools,
            graph=self.graph,
            tracer=self.tracer,
            settings=self.settings,
            monitor=self.agent_monitor,
        )
        self.orchestrator = UnifiedOrchestrator(
            knowledge=self.knowledge,
            graph=self.graph,
            multimodal=self.multimodal_rag,
            agentic=self.agentic,
            llms=self.llms,
            models=self.models,
            tracer=self.tracer,
            settings=self.settings,
            monitoring=self.monitoring,
        )
        self.image_models = ImageAnalysisModelRegistry(self.settings)
        self.image_analysis = ImageAnalysisService(
            settings=self.settings,
            models=self.image_models,
            multimodal=self.multimodal_rag,
            monitoring=self.monitoring,
            tracer=self.tracer,
        )

    def _register_default_prompt_versions(self) -> None:
        self.prompt_versions.register(
            key="ask.en",
            version="1.0.0",
            system=ASK_SYSTEM_EN,
            user_template=(
                "Question: {question}\nContext: {context}\nVERIFIED EVIDENCE:\n{evidence}\n"
                "Write a concise advisory answer and cite only supplied source ids."
            ),
            activate=True,
        )
        self.prompt_versions.register(
            key="ask.bn",
            version="1.0.0",
            system=ASK_SYSTEM_BN,
            user_template=(
                "প্রশ্ন: {question}\nপ্রসঙ্গ: {context}\nযাচাইকৃত প্রমাণ:\n{evidence}\n"
                "সংক্ষিপ্ত পরামর্শ দিন এবং শুধু প্রদত্ত উৎস আইডি উল্লেখ করুন।"
            ),
            activate=True,
        )

    def evaluation_callbacks(
        self, *, organization_id: str, trace_id: str = "evaluation"
    ) -> dict[str, Callable[..., Any]]:
        """Real service callbacks for evaluation runs; no canned outputs exist."""

        async def retrieve(query: str, language: str, topK: int, **_: Any) -> dict[str, Any]:
            evidence = await self.knowledge.retrieve(
                query, language=language, top_k=topK, trace_id=trace_id
            )
            return {
                "rankedIds": [item.documentId for item in evidence],
                "evidence": [item.model_dump(mode="json") for item in evidence],
            }

        async def ask(question: str, language: str, topK: int, **_: Any) -> dict[str, Any]:
            result = await self.orchestrator.run(
                UnifiedQueryRequest(query=question, language=language, topK=topK),
                trace_id=trace_id,
                organization_id=organization_id,
            )
            return {
                "answer": result.answer,
                "citations": result.citations,
                "evidence": result.evidence,
                "usage": result.usage,
                "status": result.status,
            }

        async def multimodal(
            query: str, language: str, topK: int, assetIds: list[str], **_: Any
        ) -> dict[str, Any]:
            result = await self.multimodal_rag.retrieve(
                MultimodalRetrievalInput(
                    query=query, language=language, topK=topK, assetIds=assetIds
                ),
                trusted_organization_id=organization_id,
                trace_id=trace_id,
            )
            return {
                "rankedIds": [item.documentId for item in result.evidence],
                "evidence": [item.model_dump(mode="json") for item in result.evidence],
            }

        async def agent(
            query: str, language: str, topK: int, requireApproval: bool, **_: Any
        ) -> dict[str, Any]:
            result = await self.agentic.run(
                AgenticQueryRequest(
                    query=query,
                    language=language,
                    topK=topK,
                    requireApproval=requireApproval,
                ),
                trace_id=trace_id,
                organization_id=organization_id,
            )
            return {
                "status": result.status,
                "executionTrace": result.executionTrace,
                "toolCalls": result.toolCalls,
                "errors": [str(item.get("error")) for item in result.executionTrace if item.get("error")],
                "usage": result.usage,
            }

        return {
            "retrieve": retrieve,
            "ask": ask,
            "multimodal": multimodal,
            "agent": agent,
        }

    def readiness_checks(self) -> dict[str, str]:
        checks = {
            "process": "ok",
            "llmProvider": (
                "configured" if self.settings.llm_provider == "http" else "local-advisory"
            ),
            "embeddingProvider": (
                "configured"
                if self.settings.embedding_provider == "http"
                else "local-deterministic"
            ),
            "vectorIndex": getattr(self.vector_index, "backend_name", "unknown"),
            "keywordIndex": getattr(self.keyword_index, "backend_name", "unknown"),
            "reranker": self.reranking.describe()["provider"],
            "queryExpansion": (
                "enabled"
                if self.settings.retrieval_enable_query_expansion
                else "disabled"
            ),
            "conversationStore": self.conversations.backend_name,
            "marketForecasting": "local-deterministic",
            "weatherProvider": getattr(self.weather_provider, "backend_name", "unknown"),
            "graphBackend": getattr(self.graph_store, "backend_name", "unknown"),
            "agenticRag": "enabled" if self.settings.agentic_rag_enabled else "disabled",
            "multimodalRag": "enabled" if self.settings.multimodal_enabled else "disabled",
            "visionProvider": self.settings.vision_provider,
            "unifiedOrchestration": (
                "enabled" if self.settings.orchestration_enabled else "disabled"
            ),
            "imageAnalysis": (
                "enabled" if self.settings.image_analysis_enabled else "disabled"
            ),
            "imageAnalysisModel": self.settings.image_analysis_model_provider,
            "evaluationFramework": (
                "enabled" if self.settings.evaluation_framework_enabled else "disabled"
            ),
            "pdfProcessor": "available" if DoclingPdfProcessor.available() else "optional-not-installed",
            "ocr": "available" if TesseractOcrProcessor.available() else "optional-not-installed",
            "credentialsExposed": "false",
        }
        return checks


@lru_cache(maxsize=1)
def get_container() -> AiContainer:
    return AiContainer()

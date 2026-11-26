from functools import lru_cache
from typing import Any

from app.config import Settings, get_settings
from app.infrastructure.docling import DoclingPdfProcessor
from app.infrastructure.keyword_index import InMemoryKeywordIndex, OpenSearchKeywordIndex
from app.infrastructure.ocr import TesseractOcrProcessor
from app.infrastructure.vector_store import InMemoryVectorIndex, QdrantVectorIndex
from app.infrastructure.weather import build_weather_provider
from app.modules.agents import AgentOrchestrator
from app.modules.assistant import AgriculturalAssistantService
from app.modules.conversation import InMemoryConversationStore
from app.modules.documents import DocumentProcessingService
from app.modules.embeddings import EmbeddingService
from app.modules.evaluation import EvaluationMonitoringService
from app.modules.knowledge import KnowledgeBaseService
from app.modules.forecasting import ForecastPipelineRegistry, MarketForecastService
from app.modules.llm_provider import LLMProviderManager
from app.modules.market_explanation import MarketExplanationService
from app.modules.model_config import ModelRegistry
from app.modules.multimodal import MultimodalProcessingService
from app.modules.prompt import PromptManager
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

        self.forecast_registry = ForecastPipelineRegistry(self.settings)
        self.forecasting = MarketForecastService(self.settings, self.forecast_registry)
        self.market_explanation = MarketExplanationService(self.llms, self.models)
        self.weather_provider = build_weather_provider(self.settings)
        self.weather = WeatherIntelligenceService(self.weather_provider, self.settings)

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
            "pdfProcessor": "available" if DoclingPdfProcessor.available() else "optional-not-installed",
            "ocr": "available" if TesseractOcrProcessor.available() else "optional-not-installed",
            "credentialsExposed": "false",
        }
        return checks


@lru_cache(maxsize=1)
def get_container() -> AiContainer:
    return AiContainer()

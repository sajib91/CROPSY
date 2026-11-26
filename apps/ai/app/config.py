import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT_DIR / ".env"


class Settings(BaseSettings):
    """Validated settings for the AI service.

    Credentials are SecretStr fields and are never serialized into responses,
    logs, OpenAPI examples, or health checks.
    """

    host: str = Field(default="0.0.0.0", min_length=1)
    port: int = Field(default=4100, ge=1, le=65535)
    service_name: str = Field(default="cropsy-ai-service", min_length=1)
    log_level: Literal["critical", "error", "warning", "info", "debug", "trace"] = "info"
    environment: Literal["development", "test", "production"] = "development"
    api_prefix: str = Field(default="/api/v1", pattern=r"^/.+")

    # Service-to-service authentication.
    internal_service_id: str = Field(default="cropsy-business-api", min_length=1)
    internal_service_secret: SecretStr = Field(default=SecretStr(""), repr=False)
    internal_signature_tolerance_seconds: int = Field(default=300, ge=30, le=3600)

    # Generation and transport policies.
    llm_provider: Literal["mock", "http"] = "mock"
    llm_base_url: str = Field(default="")
    llm_api_key: SecretStr = Field(default=SecretStr(""), repr=False)
    llm_timeout_seconds: float = Field(default=30.0, gt=0, le=300)
    embedding_provider: Literal["deterministic", "http"] = "deterministic"
    embedding_base_url: str = Field(default="")
    embedding_api_key: SecretStr = Field(default=SecretStr(""), repr=False)
    embedding_dimensions: int = Field(default=256, ge=32, le=4096)
    model_configs_json: str = Field(default="")
    retry_max_attempts: int = Field(default=3, ge=1, le=10)
    retry_base_delay_seconds: float = Field(default=0.1, ge=0, le=10)
    retry_max_delay_seconds: float = Field(default=2.0, ge=0, le=60)
    allow_mock_provider: bool = False

    # Retrieval infrastructure. Optional integrations are lazily imported.
    vector_backend: Literal["memory", "qdrant"] = "memory"
    qdrant_url: str = Field(default="")
    qdrant_api_key: SecretStr = Field(default=SecretStr(""), repr=False)
    qdrant_collection: str = Field(default="cropsy_agricultural_chunks")
    keyword_backend: Literal["memory", "opensearch"] = "memory"
    opensearch_url: str = Field(default="")
    opensearch_index: str = Field(default="cropsy_agricultural_chunks")
    opensearch_username: str = Field(default="")
    opensearch_password: SecretStr = Field(default=SecretStr(""), repr=False)

    # Hybrid retrieval tuning. Request-level overrides are validated separately.
    retrieval_fusion_method: Literal["weighted", "rrf"] = "weighted"
    retrieval_fetch_k: int = Field(default=50, ge=10, le=200)
    retrieval_backend_timeout_seconds: float = Field(default=10.0, gt=0, le=300)
    retrieval_vector_weight: float = Field(default=0.65, ge=0.0, le=1.0)
    retrieval_keyword_weight: float = Field(default=0.35, ge=0.0, le=1.0)
    retrieval_rrf_k: int = Field(default=60, ge=1, le=500)
    retrieval_deduplication_threshold: float = Field(default=0.92, ge=0.5, le=1.0)
    retrieval_max_chunks_per_document: int = Field(default=3, ge=1, le=20)
    retrieval_min_score: float = Field(default=0.0, ge=0.0, le=1.0)
    retrieval_enable_query_expansion: bool = True
    retrieval_max_query_variants: int = Field(default=3, ge=1, le=8)
    retrieval_default_jurisdiction: str = Field(default="Bangladesh", max_length=100)

    # Reranking. HTTP BGE is the production path; lexical is local/advisory only.
    reranker_provider: Literal["lexical", "http"] = "lexical"
    reranker_model: str = Field(default="BAAI/bge-reranker-v2-m3", max_length=200)
    reranker_base_url: str = Field(default="")
    reranker_api_key: SecretStr = Field(default=SecretStr(""), repr=False)
    reranker_timeout_seconds: float = Field(default=20.0, gt=0, le=300)
    reranker_batch_size: int = Field(default=16, ge=1, le=128)

    # Conversation history is process-local by default; a durable adapter can be
    # injected through the AI container without changing service logic.
    conversation_store: Literal["memory"] = "memory"
    conversation_max_history_turns: int = Field(default=8, ge=1, le=50)
    conversation_max_messages: int = Field(default=100, ge=10, le=1000)
    conversation_ttl_seconds: int = Field(default=86400, ge=60, le=2592000)

    # Market forecasting. Models are deterministic local pipelines; forecasts
    # use only supplied observed prices and are always labelled as predictions.
    forecasting_model: Literal["moving_average", "seasonal_naive", "linear_trend"] = (
        "moving_average"
    )
    forecasting_default_horizon: int = Field(default=3, ge=1, le=12)
    forecasting_min_observations: int = Field(default=4, ge=2, le=100)
    forecasting_validation_size: int = Field(default=2, ge=1, le=50)

    # Weather provider. "none" is an explicit unavailable state; there is no
    # mock weather adapter and no invented weather value.
    weather_provider: Literal["none", "http"] = "none"
    weather_base_url: str = Field(default="")
    weather_api_key: SecretStr = Field(default=SecretStr(""), repr=False)
    weather_api_key_header: str = Field(default="x-api-key", min_length=1, max_length=100)
    weather_timeout_seconds: float = Field(default=10.0, gt=0, le=120)
    weather_observation_path: str = Field(default="/observations", pattern=r"^/.+")
    weather_forecast_path: str = Field(default="/forecasts", pattern=r"^/.+")
    weather_alerts_path: str = Field(default="/alerts", pattern=r"^/.+")
    weather_source_name: str = Field(default="", max_length=200)
    # Advisory thresholds are deployment configuration, not verified crop
    # requirements or regulations. Outputs remain recommendations only.
    weather_heavy_rain_mm: float = Field(default=50.0, ge=0, le=1000)
    weather_low_rain_mm: float = Field(default=1.0, ge=0, le=1000)
    weather_high_temperature_c: float = Field(default=38.0, ge=-100, le=100)
    weather_low_temperature_c: float = Field(default=5.0, ge=-100, le=100)
    weather_high_humidity_pct: float = Field(default=90.0, ge=0, le=100)

    # Agentic RAG and GraphRAG. Graph writes are idempotent and never perform
    # business transactions; LLM-extracted relationships remain unverified
    # candidates until validation and explicit human approval.
    agentic_rag_enabled: bool = True
    agentic_max_agent_attempts: int = Field(default=2, ge=1, le=5)
    agentic_max_tool_calls: int = Field(default=12, ge=1, le=50)
    agentic_max_context_chars: int = Field(default=12000, ge=2000, le=60000)
    graph_backend: Literal["memory", "none", "neo4j"] = "memory"
    graph_extraction_provider: Literal["deterministic", "llm"] = "deterministic"
    graph_confidence_threshold: float = Field(default=0.6, ge=0.0, le=1.0)
    graph_max_hops: int = Field(default=2, ge=1, le=6)
    graph_max_paths: int = Field(default=20, ge=1, le=100)
    graph_community_algorithm: Literal["connected_components", "label_propagation"] = (
        "connected_components"
    )
    neo4j_uri: str = Field(default="")
    neo4j_user: str = Field(default="")
    neo4j_password: SecretStr = Field(default=SecretStr(""), repr=False)
    neo4j_database: str = Field(default="neo4j", min_length=1)

    # Document processing. No OCR or PDF engine is faked when unavailable.
    ocr_mode: Literal["auto", "never", "always"] = "auto"
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, ge=1024, le=100 * 1024 * 1024)
    max_chunk_chars: int = Field(default=1200, ge=200, le=8000)
    chunk_overlap_chars: int = Field(default=150, ge=0, le=2000)

    # Multimodal RAG. Visual models are advisory only and never diagnose.
    multimodal_enabled: bool = True
    multimodal_max_assets: int = Field(default=1000, ge=1, le=100000)
    vision_provider: Literal["none", "http"] = "none"
    vision_base_url: str = Field(default="", max_length=1000)
    vision_model: str = Field(default="", max_length=200)
    vision_api_key: SecretStr = Field(default=SecretStr(""), repr=False)
    vision_timeout_seconds: float = Field(default=20.0, ge=1.0, le=120.0)
    vision_max_chars: int = Field(default=2000, ge=200, le=8000)

    # Unified orchestration. Rules are deterministic; the LLM never selects the
    # retrieval strategy.
    orchestration_enabled: bool = True
    orchestration_max_evidence: int = Field(default=12, ge=1, le=50)
    orchestration_context_chars: int = Field(default=12000, ge=2000, le=60000)
    orchestration_fallback_enabled: bool = True

    # Agricultural image analysis. The model is replaceable through the
    # ImageAnalysisModelRegistry; "none" is an explicit unavailable state.
    image_analysis_enabled: bool = True
    image_analysis_model_provider: Literal["none", "http"] = "none"
    image_analysis_model: str = Field(default="", max_length=200)
    image_analysis_base_url: str = Field(default="", max_length=1000)
    image_analysis_api_key: SecretStr = Field(default=SecretStr(""), repr=False)
    image_analysis_timeout_seconds: float = Field(default=20.0, ge=1.0, le=120.0)
    image_analysis_min_width: int = Field(default=64, ge=16, le=2000)
    image_analysis_min_height: int = Field(default=64, ge=16, le=2000)
    image_analysis_max_references: int = Field(default=5, ge=1, le=20)
    image_analysis_max_records: int = Field(default=500, ge=10, le=10000)

    # Evaluation framework. Every score is produced by an actual run; the
    # framework never seeds, estimates, or interpolates results.
    evaluation_framework_enabled: bool = True
    evaluation_framework_max_runs: int = Field(default=100, ge=1, le=1000)
    evaluation_framework_max_feedback: int = Field(default=1000, ge=10, le=50000)

    # Request protection and observability.
    rate_limit_max_requests: int = Field(default=120, ge=1, le=10000)
    rate_limit_window_seconds: int = Field(default=60, ge=1, le=3600)
    max_trace_history: int = Field(default=500, ge=10, le=5000)

    model_config = SettingsConfigDict(
        env_prefix="CROPSY_AI_",
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator("chunk_overlap_chars")
    @classmethod
    def overlap_must_be_smaller_than_chunks(cls, value: int, info: Any) -> int:
        max_chunk_chars = info.data.get("max_chunk_chars")
        if max_chunk_chars is not None and value >= max_chunk_chars:
            raise ValueError("chunk_overlap_chars must be smaller than max_chunk_chars")
        return value

    @model_validator(mode="after")
    def validate_production_configuration(self) -> "Settings":
        if self.forecasting_validation_size >= self.forecasting_min_observations:
            raise ValueError(
                "forecasting_validation_size must be smaller than forecasting_min_observations"
            )
        if abs(self.retrieval_vector_weight + self.retrieval_keyword_weight - 1.0) > 1e-6:
            raise ValueError(
                "retrieval_vector_weight and retrieval_keyword_weight must sum to 1.0"
            )
        if self.reranker_provider == "http" and not self.reranker_base_url:
            raise ValueError("CROPSY_AI_RERANKER_BASE_URL is required for HTTP BGE reranking")
        if self.environment != "production":
            return self
        secret = self.internal_service_secret.get_secret_value()
        if len(secret) < 32 or secret.startswith("dev-only-"):
            raise ValueError(
                "A strong CROPSY_AI_INTERNAL_SERVICE_SECRET is required in production"
            )
        if self.llm_provider == "http" and not self.llm_base_url:
            raise ValueError("CROPSY_AI_LLM_BASE_URL is required in production")
        if self.embedding_provider == "http" and not self.embedding_base_url:
            raise ValueError("CROPSY_AI_EMBEDDING_BASE_URL is required in production")
        if self.vector_backend == "qdrant" and not self.qdrant_url:
            raise ValueError("CROPSY_AI_QDRANT_URL is required in production")
        if self.keyword_backend == "opensearch" and not self.opensearch_url:
            raise ValueError("CROPSY_AI_OPENSEARCH_URL is required in production")
        if self.weather_provider == "http" and not self.weather_base_url:
            raise ValueError("CROPSY_AI_WEATHER_BASE_URL is required for HTTP weather provider")
        if self.vision_provider == "http" and not self.vision_base_url:
            raise ValueError("CROPSY_AI_VISION_BASE_URL is required for HTTP vision provider")
        if self.vision_provider == "http" and not self.vision_model:
            raise ValueError("CROPSY_AI_VISION_MODEL is required for HTTP vision provider")
        if self.image_analysis_model_provider == "http" and not self.image_analysis_base_url:
            raise ValueError(
                "CROPSY_AI_IMAGE_ANALYSIS_BASE_URL is required for the HTTP image model"
            )
        if self.image_analysis_model_provider == "http" and not self.image_analysis_model:
            raise ValueError("CROPSY_AI_IMAGE_ANALYSIS_MODEL is required for the HTTP image model")
        if self.agentic_rag_enabled and not self.allow_mock_provider:
            if self.graph_backend != "neo4j":
                raise ValueError(
                    "CROPSY_AI_GRAPH_BACKEND=neo4j is required in production unless mock "
                    "providers are explicitly allowed"
                )
            if not self.neo4j_uri or not self.neo4j_user:
                raise ValueError(
                    "CROPSY_AI_NEO4J_URI and CROPSY_AI_NEO4J_USER are required in production"
                )
            if not self.neo4j_password.get_secret_value():
                raise ValueError("CROPSY_AI_NEO4J_PASSWORD is required in production")
            if self.graph_extraction_provider == "llm" and self.llm_provider != "http":
                raise ValueError("LLM graph extraction requires CROPSY_AI_LLM_PROVIDER=http")
        return self

    def parsed_model_configs(self) -> list[dict[str, Any]]:
        if not self.model_configs_json.strip():
            return []
        parsed = json.loads(self.model_configs_json)
        if not isinstance(parsed, list) or not all(isinstance(item, dict) for item in parsed):
            raise ValueError("CROPSY_AI_MODEL_CONFIGS_JSON must be a JSON array of objects")
        return parsed


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

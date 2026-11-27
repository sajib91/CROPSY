"""Coordinated GraphRAG service: extraction, construction, retrieval, and fusion."""

from __future__ import annotations

from typing import Any

from app.config import Settings, get_settings
from app.errors import UnauthorizedError
from app.infrastructure.graph_store import GraphScope, GraphStore, GraphValidationIssue
from app.models import EvidenceChunk
from app.modules.graph_rag.communities import detect_communities
from app.modules.graph_rag.context import build_graph_context, fuse_contexts
from app.modules.graph_rag.construction import GraphConstructionService
from app.modules.graph_rag.extraction import extract_graph
from app.modules.graph_rag.models import (
    CombinedGraphContext,
    GraphBuildResult,
    GraphContext,
    GraphExtractionRequest,
    GraphExtractionResult,
    GraphRetrievalRequest,
)
from app.modules.graph_rag.resolution import EntityResolver
from app.modules.graph_rag.traversal import GraphTraversalService
from app.modules.knowledge import KnowledgeBaseService
from app.modules.llm_provider import LLMProviderManager
from app.modules.model_config import ModelRegistry


class GraphRAGService:
    def __init__(
        self,
        *,
        store: GraphStore,
        knowledge: KnowledgeBaseService,
        llms: LLMProviderManager,
        models: ModelRegistry,
        settings: Settings | None = None,
    ) -> None:
        self.store = store
        self.knowledge = knowledge
        self.llms = llms
        self.models = models
        self.settings = settings or get_settings()
        self.traversal = GraphTraversalService(store=store, settings=self.settings)
        self.construction = GraphConstructionService(store=store, settings=self.settings)
        self.resolver = EntityResolver(store)

    @staticmethod
    def scope(
        *,
        organization_ids: list[str],
        include_global: bool,
        trusted_organization_id: str,
    ) -> GraphScope:
        requested = set(organization_ids)
        allowed = {trusted_organization_id} if trusted_organization_id else set()
        if requested - allowed:
            raise UnauthorizedError(
                "Graph requests may not reference another organization's data.",
                details={"reason": "cross_organization_graph_scope_denied"},
            )
        return GraphScope(
            organization_ids=tuple(sorted(requested or allowed)),
            include_global=include_global,
        )

    async def extract(self, value: GraphExtractionRequest) -> GraphExtractionResult:
        return await extract_graph(
            value,
            llms=self.llms,
            models=self.models,
            settings=self.settings,
        )

    async def build(
        self,
        *,
        value: GraphExtractionRequest,
        trusted_organization_id: str = "system",
    ) -> GraphBuildResult:
        if value.organizationId and value.organizationId != trusted_organization_id:
            raise UnauthorizedError(
                "Graph build may not write into another organization's scope.",
                details={"reason": "cross_organization_graph_write_denied"},
            )
        extraction = await self.extract(value)
        scope = self.scope(
            organization_ids=[value.organizationId] if value.organizationId else [],
            include_global=not value.organizationId,
            trusted_organization_id=trusted_organization_id,
        )
        mapping, _ = await self.resolver.resolve(extraction.entities, scope=scope)
        return await self.construction.build(
            extraction=extraction,
            value=value,
            resolutions=mapping,
            scope=scope,
        )

    async def retrieve(
        self,
        value: GraphRetrievalRequest,
        *,
        trusted_organization_id: str = "system",
    ) -> GraphContext:
        scope = self.scope(
            organization_ids=value.organizationIds,
            include_global=value.includeGlobal,
            trusted_organization_id=trusted_organization_id,
        )
        subgraph = await self.traversal.retrieve_subgraph(value)
        return build_graph_context(
            query=value.query,
            subgraph=subgraph,
            value=value,
            settings=self.settings,
        )

    async def combined(
        self,
        *,
        query: str,
        vector_evidence: list[EvidenceChunk],
        graph_value: GraphRetrievalRequest,
        trusted_organization_id: str = "system",
    ) -> CombinedGraphContext:
        graph_context = await self.retrieve(graph_value, trusted_organization_id=trusted_organization_id)
        return fuse_contexts(
            query=query,
            vector_evidence=vector_evidence,
            graph_context=graph_context,
            settings=self.settings,
        )

    async def validate(self, *, scope: GraphScope) -> list[GraphValidationIssue]:
        return await self.store.validate(scope)

    async def stats(self, *, scope: GraphScope) -> dict[str, Any]:
        return await self.store.stats(scope)

    def describe(self) -> dict[str, Any]:
        return {
            "backend": self.store.describe(),
            "entities": [
                "Crop", "CropVariety", "PlantDisease", "Pest", "SoilType", "Fertilizer",
                "Nutrient", "AgriculturalPractice", "WeatherCondition", "GeographicRegion",
                "AgriculturalResearch", "ExpertRecommendation",
            ],
            "relationships": [
                "AFFECTS", "CAUSES", "TREATS", "REQUIRES", "GROWS_IN",
                "ASSOCIATED_WITH", "RECOMMENDED_FOR", "HAS_EVIDENCE", "FOUND_IN",
            ],
            "evidenceClasses": [
                "candidate_extraction", "validated_extraction", "verified_relationship",
                "verified_external_evidence",
            ],
            "policies": {
                "tenantScopeEnforced": True,
                "llmRelationshipsRequireValidation": True,
                "humanApprovalRequiredForVerifiedRelationship": True,
                "noBusinessTransactions": True,
            },
            "extractionProvider": self.settings.graph_extraction_provider,
            "confidenceThreshold": self.settings.graph_confidence_threshold,
            "maxHops": self.settings.graph_max_hops,
            "communityAlgorithm": self.settings.graph_community_algorithm,
        }


__all__ = ["GraphRAGService"]

"""Tenant-scoped, idempotent graph construction."""

from __future__ import annotations

from typing import Any

from app.config import Settings, get_settings
from app.infrastructure.graph_store import GraphEdge, GraphNode, GraphProvenance, GraphScope, GraphStore
from app.modules.graph_rag.models import (
    EntityResolution,
    GraphApproval,
    GraphBuildResult,
    GraphExtractionRequest,
    GraphExtractionResult,
    GraphValidationResult,
)
from app.modules.graph_rag.validation import validate_relationships


class GraphConstructionService:
    def __init__(self, *, store: GraphStore, settings: Settings | None = None) -> None:
        self.store = store
        self.settings = settings or get_settings()

    async def build(
        self,
        *,
        extraction: GraphExtractionResult,
        value: GraphExtractionRequest,
        resolutions: dict[str, EntityResolution],
        scope: GraphScope,
        approval: GraphApproval | None = None,
    ) -> GraphBuildResult:
        validation = validate_relationships(
            extraction.relationships,
            source_status=value.documentStatus,
            license_verified=value.licenseVerified,
            source_text=value.text,
            confidence_threshold=self.settings.graph_confidence_threshold,
            approval=approval,
            settings=self.settings,
        )
        limitations = [*extraction.limitations]
        if scope.include_global and not scope.organization_ids:
            limitations.append("Graph writes use global scope; no farmer-specific data was supplied.")
        if validation.requiresApproval:
            limitations.append(
                "Validated relationships are not verified scientific facts until human approval."
            )

        node_count = 0
        for resolution in resolutions.values():
            node = GraphNode(
                id=resolution.id,
                label=resolution.label,
                name=resolution.name,
                aliases=[resolution.mention] if resolution.mention != resolution.name else [],
                organizationId=value.organizationId,
                provenance=GraphProvenance(
                    source=value.source,
                    sourceReference=value.sourceReference,
                    sourceUrl=value.sourceUrl,
                    documentId=value.documentId,
                    chunkId=value.chunkId,
                    extractionMethod=extraction.extractionMethod,
                    evidenceClass="candidate_extraction",
                    confidence=resolution.confidence,
                    verified=False,
                    validated=resolution.verified,
                ),
            )
            if value.organizationId and not scope.allows(value.organizationId):
                limitations.append("Node skipped because its organization is outside the request scope.")
                continue
            await self.store.upsert_node(node)
            node_count += 1

        edge_count = 0
        for item in validation.accepted:
            subject = resolutions.get(self._key(str(item["subject"])))
            obj = resolutions.get(self._key(str(item["object"])))
            if not subject or not obj:
                continue
            if value.organizationId and not scope.allows(value.organizationId):
                continue
            edge = GraphEdge(
                id=str(item["id"]),
                subjectId=subject.id,
                predicate=item["predicate"],
                objectId=obj.id,
                organizationId=value.organizationId,
                provenance=GraphProvenance(
                    source=str(item["source"]),
                    sourceReference=str(item["sourceReference"]),
                    extractionMethod=item["extractionMethod"],
                    evidenceClass=item["evidenceClass"],
                    confidence=float(item["confidence"]),
                    verified=bool(item["verified"]),
                    validated=bool(item["validated"]),
                    validationMethod=str(item["validationMethod"]),
                    verifiedBy=str(item["verifiedBy"]),
                    verifiedAt=str(item["verifiedAt"]),
                ),
            )
            await self.store.upsert_edge(edge)
            edge_count += 1

        store_issues = await self.store.validate(scope)
        issues: list[dict[str, Any]] = [*validation.issues]
        issues.extend(issue.model_dump(mode="json") for issue in store_issues)
        if validation.requiresApproval:
            status = "awaiting_approval"
        elif not node_count and not edge_count:
            status = "no_candidates"
        else:
            status = "built"

        return GraphBuildResult(
            status=status,
            nodesWritten=node_count,
            relationshipsWritten=edge_count,
            verifiedRelationships=validation.verifiedCount,
            validation=validation.model_copy(update={"issues": issues}),
            limitations=limitations,
        )

    @staticmethod
    def _key(value: str) -> str:
        from app.infrastructure.graph_store import normalize_graph_text

        return normalize_graph_text(value)


__all__ = ["GraphConstructionService"]

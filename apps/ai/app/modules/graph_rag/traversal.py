"""Tenant-scoped graph traversal and retrieval."""

from __future__ import annotations

from app.config import Settings, get_settings
from app.infrastructure.graph_store import (
    GraphScope,
    GraphStore,
    GraphSubgraph,
)
from app.modules.graph_rag.models import GraphEvidenceItem, GraphRetrievalRequest
from app.modules.graph_rag.communities import detect_communities


class GraphTraversalService:
    def __init__(self, *, store: GraphStore, settings: Settings | None = None) -> None:
        self.store = store
        self.settings = settings or get_settings()

    async def retrieve_subgraph(self, value: GraphRetrievalRequest) -> GraphSubgraph:
        scope = GraphScope(
            organization_ids=tuple(value.organizationIds),
            include_global=value.includeGlobal,
        )
        seed_texts = list(value.entities)
        if value.query and value.query not in seed_texts:
            seed_texts.append(value.query)
        start_ids: list[str] = []
        seen_starts: set[str] = set()
        for text in seed_texts[:20]:
            for node in await self.store.find_nodes(text, scope, limit=5):
                if node.id not in seen_starts:
                    seen_starts.add(node.id)
                    start_ids.append(node.id)
        if not start_ids:
            return GraphSubgraph()
        hops = min(value.maxHops, self.settings.graph_max_hops)
        max_paths = min(value.topK, self.settings.graph_max_paths)
        predicates = tuple(str(item) for item in value.predicates)
        return await self.store.traverse(
            start_ids,
            scope,
            hops=hops,
            predicates=predicates,
            min_confidence=value.minConfidence,
            verified_only=value.verifiedOnly,
            max_paths=max_paths,
        )

    @staticmethod
    def evidence_items(subgraph: GraphSubgraph) -> list[GraphEvidenceItem]:
        nodes = {node.id: node for node in subgraph.nodes}
        items: list[GraphEvidenceItem] = []
        for edge in subgraph.edges:
            subject = nodes.get(edge.subjectId)
            obj = nodes.get(edge.objectId)
            if not subject or not obj:
                continue
            items.append(
                GraphEvidenceItem(
                    subject=subject.name,
                    predicate=edge.predicate,
                    object=obj.name,
                    confidence=edge.provenance.confidence,
                    evidenceClass=edge.provenance.evidenceClass,
                    verified=edge.provenance.verified,
                    validated=edge.provenance.validated,
                    source=edge.provenance.source,
                    sourceReference=edge.provenance.sourceReference,
                    documentId=edge.provenance.documentId,
                    chunkId=edge.provenance.chunkId,
                    hop=subgraph.distances.get(edge.objectId, 0),
                )
            )
        items.sort(key=lambda item: (-item.confidence, item.subject, item.predicate, item.object))
        return items


__all__ = ["GraphTraversalService", "detect_communities"]

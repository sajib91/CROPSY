"""Graph context generation and vector+graph fusion."""

from __future__ import annotations

from typing import Any

from app.config import Settings, get_settings
from app.infrastructure.graph_store import GraphSubgraph
from app.models import EvidenceChunk
from app.modules.graph_rag.communities import detect_communities
from app.modules.graph_rag.models import (
    CombinedGraphContext,
    GraphContext,
    GraphEvidenceItem,
    GraphRetrievalRequest,
)
from app.modules.graph_rag.traversal import GraphTraversalService


def format_graph_evidence(items: list[GraphEvidenceItem]) -> str:
    lines: list[str] = []
    for index, item in enumerate(items, start=1):
        status = "VERIFIED" if item.verified else "VALIDATED (not verified)" if item.validated else "UNVERIFIED CANDIDATE"
        lines.append(
            f"[G{index}] {status}: {item.subject} — {item.predicate} — {item.object}. "
            f"confidence={item.confidence:.2f}; evidenceClass={item.evidenceClass}; "
            f"source={item.source}; reference={item.sourceReference}."
        )
    return "\n".join(lines)


def build_graph_context(
    *,
    query: str,
    subgraph: GraphSubgraph,
    value: GraphRetrievalRequest,
    settings: Settings | None = None,
) -> GraphContext:
    active = settings or get_settings()
    items = GraphTraversalService.evidence_items(subgraph)
    if not value.includeCandidates:
        items = [item for item in items if item.validated or item.verified]
    items = items[: value.topK]
    communities = detect_communities(subgraph, settings=active) if value.includeCommunities else []
    limitations: list[str] = []
    if any(not item.verified for item in items):
        limitations.append("Graph relationships without verified status are not scientific facts.")
    if any(item.evidenceClass == "candidate_extraction" for item in items):
        limitations.append(
            "Candidate extractions are shown only as candidates and require validation and human approval."
        )
    if not items:
        limitations.append("No tenant-visible graph evidence satisfied the requested filters.")
    context_text = format_graph_evidence(items)
    if communities:
        summaries = "; ".join(
            f"{community.id}: {community.size} nodes ({', '.join(community.labels) or 'unlabelled'})"
            for community in communities[:5]
        )
        context_text = f"{context_text}\nGraph communities: {summaries}" if context_text else f"Graph communities: {summaries}"
    return GraphContext(
        query=query,
        entities=list(value.entities),
        evidence=items,
        communities=communities,
        contextText=context_text[: active.agentic_max_context_chars],
        citations=sorted({item.sourceReference for item in items if item.sourceReference}),
        limitations=limitations,
        evidenceClasses=sorted({item.evidenceClass for item in items}),
        stats={
            "nodeCount": len(subgraph.nodes),
            "edgeCount": len(subgraph.edges),
            "evidenceCount": len(items),
            "communityCount": len(communities),
        },
    )


def format_vector_evidence(evidence: list[EvidenceChunk]) -> str:
    lines: list[str] = []
    for index, item in enumerate(evidence, start=1):
        citation = item.citation
        lines.append(
            f"[V{index}] {citation.title} ({citation.sourceName}, {citation.publishedAt}); "
            f"chunk={item.chunkId}; section={item.section or 'n/a'}\n{item.text}"
        )
    return "\n\n".join(lines)


def fuse_contexts(
    *,
    query: str,
    vector_evidence: list[EvidenceChunk],
    graph_context: GraphContext,
    settings: Settings | None = None,
) -> CombinedGraphContext:
    active = settings or get_settings()
    vector_text = format_vector_evidence(vector_evidence)
    graph_text = graph_context.contextText
    parts: list[str] = []
    if vector_text:
        parts.append(f"VERIFIED/LICENSED VECTOR EVIDENCE:\n{vector_text}")
    if graph_text:
        parts.append(f"GRAPH EVIDENCE (provenance-labelled):\n{graph_text}")
    limitations = [
        "Only verified, licensed vector evidence may support an advisory claim.",
        "Graph relationships require provenance and evidence-class inspection before use.",
        *graph_context.limitations,
    ]
    if not vector_evidence and not graph_context.evidence:
        limitations.append("No usable evidence was retrieved; do not generate an advisory claim.")
    return CombinedGraphContext(
        contextText="\n\n".join(parts)[: active.agentic_max_context_chars],
        vectorEvidence=[item.model_dump(mode="json") for item in vector_evidence],
        graphEvidence=[item.model_dump(mode="json") for item in graph_context.evidence],
        evidenceClasses=sorted(
            set(graph_context.evidenceClasses)
            | {"verified_licensed_vector_evidence" if vector_evidence else "none"}
        ),
        counts={
            "vectorEvidence": len(vector_evidence),
            "graphEvidence": len(graph_context.evidence),
            "graphNodes": graph_context.stats.get("nodeCount", 0),
        },
        limitations=limitations,
        advisory=bool(vector_evidence or graph_context.evidence),
    )


def truncate_context(value: str, settings: Settings | None = None) -> str:
    active = settings or get_settings()
    return value[: active.agentic_max_context_chars]


def dump_unknown(value: Any) -> Any:
    return value


__all__ = [
    "build_graph_context",
    "format_graph_evidence",
    "format_vector_evidence",
    "fuse_contexts",
    "truncate_context",
]

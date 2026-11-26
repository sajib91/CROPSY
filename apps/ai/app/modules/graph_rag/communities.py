"""Graph community detection for agricultural subgraphs."""

from __future__ import annotations

from collections import defaultdict

from app.config import Settings, get_settings
from app.infrastructure.graph_store import GraphCommunity, GraphSubgraph


def connected_components(subgraph: GraphSubgraph) -> list[GraphCommunity]:
    adjacency: dict[str, set[str]] = defaultdict(set)
    for node in subgraph.nodes:
        adjacency.setdefault(node.id, set())
    for edge in subgraph.edges:
        adjacency.setdefault(edge.subjectId, set()).add(edge.objectId)
        adjacency.setdefault(edge.objectId, set()).add(edge.subjectId)
    seen: set[str] = set()
    communities: list[GraphCommunity] = []
    for start in sorted(adjacency):
        if start in seen:
            continue
        stack = [start]
        members: list[str] = []
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            members.append(current)
            stack.extend(sorted(adjacency.get(current, set()) - seen))
        labels_by_id = {node.id: node.label for node in subgraph.nodes}
        labels = sorted({labels_by_id[member] for member in members if member in labels_by_id})
        edges_in = sum(
            1
            for edge in subgraph.edges
            if edge.subjectId in set(members) and edge.objectId in set(members)
        )
        communities.append(
            GraphCommunity(
                id=f"community-{len(communities) + 1}",
                node_ids=sorted(members),
                labels=labels,
                size=len(members),
                score=float(edges_in),
            )
        )
    return communities


def label_propagation(subgraph: GraphSubgraph, *, iterations: int = 5) -> list[GraphCommunity]:
    """Deterministic label propagation over the undirected subgraph."""
    labels = {node.id: node.id for node in subgraph.nodes}
    neighbors: dict[str, set[str]] = defaultdict(set)
    for edge in subgraph.edges:
        neighbors[edge.subjectId].add(edge.objectId)
        neighbors[edge.objectId].add(edge.subjectId)
    for _ in range(iterations):
        changed = False
        for node_id in sorted(labels):
            counts: dict[str, int] = {}
            for neighbor in sorted(neighbors.get(node_id, set())):
                label = labels.get(neighbor)
                if label is not None:
                    counts[label] = counts.get(label, 0) + 1
            if not counts:
                continue
            best = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0][0]
            if labels[node_id] != best:
                labels[node_id] = best
                changed = True
        if not changed:
            break
    grouped: dict[str, list[str]] = defaultdict(list)
    for node_id, label in labels.items():
        grouped[label].append(node_id)
    labels_by_id = {node.id: node.label for node in subgraph.nodes}
    communities: list[GraphCommunity] = []
    for index, (label, members) in enumerate(sorted(grouped.items()), start=1):
        edges_in = sum(
            1
            for edge in subgraph.edges
            if edge.subjectId in set(members) and edge.objectId in set(members)
        )
        communities.append(
            GraphCommunity(
                id=f"community-{index}",
                node_ids=sorted(members),
                labels=sorted({labels_by_id[item] for item in members if item in labels_by_id}),
                size=len(members),
                score=float(edges_in),
            )
        )
    return communities


def detect_communities(
    subgraph: GraphSubgraph,
    *,
    settings: Settings | None = None,
) -> list[GraphCommunity]:
    active = settings or get_settings()
    if active.graph_community_algorithm == "label_propagation":
        return label_propagation(subgraph)
    return connected_components(subgraph)


__all__ = ["connected_components", "detect_communities", "label_propagation"]

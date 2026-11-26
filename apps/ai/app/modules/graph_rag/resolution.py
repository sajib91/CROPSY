"""Deterministic entity resolution against tenant-scoped graph nodes."""

from __future__ import annotations

import hashlib

from app.infrastructure.graph_store import (
    GraphScope,
    GraphStore,
    normalize_graph_text,
)
from app.modules.graph_rag.models import EntityMention, EntityResolution

RESOLUTION_METHODS = frozenset({"existing_exact", "canonical_new"})


class EntityResolver:
    """Resolves aliases to existing nodes or stable canonical identifiers."""

    def __init__(self, store: GraphStore) -> None:
        self.store = store

    async def resolve(
        self,
        mentions: list[EntityMention],
        *,
        scope: GraphScope,
    ) -> tuple[dict[str, EntityResolution], list[EntityResolution]]:
        mapping: dict[str, EntityResolution] = {}
        resolved: list[EntityResolution] = []
        for mention in mentions:
            key = normalize_graph_text(mention.text)
            if not key or key in mapping:
                continue
            candidates = await self.store.find_nodes(mention.text, scope, limit=5)
            existing = next(
                (
                    node
                    for node in candidates
                    if node.label == mention.label
                    and key in {
                        normalize_graph_text(node.name),
                        *(normalize_graph_text(alias) for alias in node.aliases),
                    }
                ),
                None,
            )
            if existing is not None:
                item = EntityResolution(
                    mention=mention.text,
                    id=existing.id,
                    name=existing.name,
                    label=existing.label,
                    confidence=max(mention.confidence, 0.9),
                    method="existing_exact",
                    verified=existing.provenance.verified,
                )
            else:
                raw = f"entity|{mention.label}|{key}"
                item = EntityResolution(
                    mention=mention.text,
                    id=f"node-{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:24]}",
                    name=mention.text.strip(),
                    label=mention.label,
                    confidence=mention.confidence,
                    method="canonical_new",
                    verified=False,
                )
            mapping[key] = item
            resolved.append(item)
        return mapping, resolved


__all__ = ["EntityResolver"]

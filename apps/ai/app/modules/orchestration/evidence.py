"""Deterministic multi-source evidence fusion and citation-preserving context."""

from typing import Any

from pydantic import BaseModel, Field

from app.models import EvidenceChunk


class FusedEvidence(BaseModel):
    evidence: EvidenceChunk
    strategies: list[str] = Field(default_factory=list)
    fusionScore: float = Field(ge=0.0, le=1.0)


class ContextBundle(BaseModel):
    context: str
    evidence: list[FusedEvidence] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    sourceAttribution: list[dict[str, Any]] = Field(default_factory=list)
    duplicatesRemoved: int = 0
    truncated: bool = False


class EvidenceFusion:
    """Merge ranked evidence without inventing relevance or provenance."""

    def fuse(
        self,
        source_lists: dict[str, list[EvidenceChunk]],
        max_items: int = 12,
    ) -> list[FusedEvidence]:
        if max_items < 1:
            return []
        merged: dict[str, FusedEvidence] = {}
        for strategy, items in source_lists.items():
            seen_in_strategy: set[str] = set()
            for rank, evidence in enumerate(items, start=1):
                key = evidence.chunkId or f"{evidence.documentId}:{evidence.text[:80]}"
                if key in seen_in_strategy:
                    continue
                seen_in_strategy.add(key)
                strategy_score = evidence.score / (1.0 + 0.02 * (rank - 1))
                existing = merged.get(key)
                if existing is None:
                    merged[key] = FusedEvidence(
                        evidence=evidence,
                        strategies=[strategy],
                        fusionScore=round(min(1.0, strategy_score), 4),
                    )
                    continue
                if strategy not in existing.strategies:
                    existing.strategies.append(strategy)
                ranking_bonus = 0.05 * (len(existing.strategies) - 1)
                next_score = max(existing.fusionScore, strategy_score) + ranking_bonus
                if strategy_score > existing.evidence.score:
                    existing.evidence = evidence
                existing.fusionScore = round(min(1.0, next_score), 4)
        return sorted(
            merged.values(),
            key=lambda item: (-item.fusionScore, item.evidence.chunkId),
        )[:max_items]

    def build_context(
        self,
        fused: list[FusedEvidence],
        max_characters: int = 12000,
    ) -> ContextBundle:
        if max_characters < 1:
            max_characters = 12000
        lines: list[str] = []
        used = 0
        truncated = False
        for item in fused:
            citation = item.evidence.citation
            source = (
                f"[{item.evidence.chunkId} | {citation.title} | "
                f"{citation.sourceName} | v{citation.version}"
                + (f" | p.{item.evidence.page}" if item.evidence.page else "")
                + f"] ({'/'.join(item.strategies)})"
            )
            snippet = item.evidence.text.strip()
            block = f"{source}\n{snippet}"
            if used + len(block) > max_characters:
                truncated = True
                break
            lines.append(block)
            used += len(block) + 2

        return ContextBundle(
            context="\n\n".join(lines),
            evidence=fused,
            citations=[item.evidence.citation.model_dump(mode="json") for item in fused],
            sourceAttribution=[
                {
                    "chunkId": item.evidence.chunkId,
                    "assetId": item.evidence.documentId,
                    "documentId": item.evidence.documentId,
                    "version": item.evidence.version,
                    "title": item.evidence.citation.title,
                    "sourceName": item.evidence.citation.sourceName,
                    "sourceUrl": item.evidence.citation.sourceUrl,
                    "publisher": item.evidence.citation.publisher,
                    "licenseCode": item.evidence.citation.licenseCode,
                    "page": item.evidence.page,
                    "strategies": list(item.strategies),
                }
                for item in fused
            ],
            duplicatesRemoved=0,
            truncated=truncated,
        )


__all__ = ["ContextBundle", "EvidenceFusion", "FusedEvidence"]

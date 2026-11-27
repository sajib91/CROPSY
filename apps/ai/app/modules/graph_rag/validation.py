"""Graph relationship validation with strict evidence-class promotion rules."""

from __future__ import annotations

from typing import Any

from app.config import Settings, get_settings
from app.infrastructure.graph_store import edge_id
from app.modules.graph_rag.models import (
    GraphValidationResult,
    RelationshipMention,
)


def _issue(code: str, message: str, relationship: RelationshipMention) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "subject": relationship.subject,
        "predicate": relationship.predicate,
        "object": relationship.object,
        "source": relationship.source,
        "sourceReference": relationship.sourceReference,
    }


def validate_relationships(
    relationships: list[RelationshipMention],
    *,
    source_text: str,
    confidence_threshold: float | None = None,
    settings: Settings | None = None,
) -> GraphValidationResult:
    """Validate grounding only.

    There is no server-side source registry for caller-supplied graph text, so
    relationships can never be promoted to validated or verified evidence here.
    Verification assertions from request bodies are deliberately not accepted.
    """

    active = settings or get_settings()
    threshold = (
        active.graph_confidence_threshold if confidence_threshold is None else confidence_threshold
    )
    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    source_grounded = source_text.strip() != ""

    for relationship in relationships:
        snippet = relationship.evidenceSnippet.strip()
        if not source_grounded or snippet not in source_text:
            rejected.append(
                {
                    "subject": relationship.subject,
                    "predicate": relationship.predicate,
                    "object": relationship.object,
                    "reason": "evidence_not_grounded_in_source",
                }
            )
            issues.append(
                _issue(
                    "evidence_not_grounded",
                    "Evidence snippet is not in the source text.",
                    relationship,
                )
            )
            continue
        if relationship.confidence < threshold:
            issues.append(
                _issue(
                    "below_confidence_threshold",
                    f"Extraction confidence {relationship.confidence:.2f} is below {threshold:.2f}.",
                    relationship,
                )
            )
        issues.append(
            _issue(
                "source_not_verified",
                "The source was not verified by a trusted registry; only candidate extractions are allowed.",
                relationship,
            )
        )
        accepted.append(
            {
                "id": edge_id(
                    relationship.subject,
                    relationship.predicate,
                    relationship.object,
                    relationship.sourceReference,
                ),
                "subject": relationship.subject,
                "predicate": relationship.predicate,
                "object": relationship.object,
                "organizationId": None,
                "confidence": relationship.confidence,
                "evidenceClass": "candidate_extraction",
                "validated": False,
                "verified": False,
                "validationMethod": "",
                "verifiedBy": "",
                "verifiedAt": "",
                "source": relationship.source,
                "sourceReference": relationship.sourceReference,
                "extractionMethod": relationship.extractionMethod,
                "evidenceSnippet": snippet,
            }
        )

    return GraphValidationResult(
        accepted=accepted,
        rejected=rejected,
        issues=issues,
        requiresApproval=False,
        verifiedCount=0,
        validatedCount=0,
    )


__all__ = ["validate_relationships"]

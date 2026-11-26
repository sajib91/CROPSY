"""Graph relationship validation with strict evidence-class promotion rules."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.config import Settings, get_settings
from app.infrastructure.graph_store import edge_id
from app.modules.graph_rag.models import (
    SOURCE_GROUNDED,
    GraphApproval,
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
    source_status: str,
    license_verified: bool,
    source_text: str,
    confidence_threshold: float | None = None,
    approval: GraphApproval | None = None,
    settings: Settings | None = None,
) -> GraphValidationResult:
    active = settings or get_settings()
    threshold = active.graph_confidence_threshold if confidence_threshold is None else confidence_threshold
    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    required_approval_ids: set[str] = set()
    source_grounded = normalize = source_text.strip() != ""
    approval_scopes = {str(item) for item in approval.scope} if approval else set()
    approved = approval is not None and approval.decision == "approved"

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
            issues.append(_issue("evidence_not_grounded", "Evidence snippet is not in the source text.", relationship))
            continue

        edge_id_value = edge_id(
            relationship.subject,
            relationship.predicate,
            relationship.object,
            relationship.sourceReference,
        )
        evidence_class = "candidate_extraction"
        validated = False
        verified = False
        validation_method = ""
        verified_by = ""
        verified_at = ""
        confidence = relationship.confidence

        if not license_verified or source_status != "verified":
            issues.append(
                _issue(
                    "source_not_verified",
                    "Source status or license does not permit evidence validation.",
                    relationship,
                )
            )
        elif confidence < threshold:
            issues.append(
                _issue(
                    "below_confidence_threshold",
                    f"Extraction confidence {confidence:.2f} is below {threshold:.2f}.",
                    relationship,
                )
            )
        else:
            evidence_class = "validated_extraction"
            validated = True
            validation_method = SOURCE_GROUNDED
            required_approval_ids.add(edge_id_value)
            if approved and edge_id_value in approval_scopes:
                evidence_class = "verified_relationship"
                verified = True
                verified_by = approval.approvedBy
                verified_at = approval.approvedAt or datetime.now(timezone.utc).isoformat()
            else:
                issues.append(
                    _issue(
                        "human_approval_required",
                        "Relationship may be used only as validated extraction until a human approves it.",
                        relationship,
                    )
                )

        accepted.append(
            {
                "id": edge_id_value,
                "subject": relationship.subject,
                "predicate": relationship.predicate,
                "object": relationship.object,
                "organizationId": None,
                "confidence": confidence,
                "evidenceClass": evidence_class,
                "validated": validated,
                "verified": verified,
                "validationMethod": validation_method,
                "verifiedBy": verified_by,
                "verifiedAt": verified_at,
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
        requiresApproval=bool(required_approval_ids - approval_scopes) if relationships else False,
        verifiedCount=sum(1 for item in accepted if item["verified"]),
        validatedCount=sum(1 for item in accepted if item["validated"]),
    )


__all__ = ["validate_relationships"]

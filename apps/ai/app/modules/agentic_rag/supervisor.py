"""Deterministic supervisor that selects agents from the user query."""

from __future__ import annotations

import re
from typing import Any

from app.modules.agentic_rag.models import AgenticQueryRequest
from app.modules.query_understanding import QueryUnderstanding

WORK_AGENTS = (
    "agricultural_knowledge_retrieval",
    "market_intelligence",
    "crop_advisory",
    "document_analysis",
)

MARKET_PATTERN = re.compile(
    r"\b(price|market|cost|rate|trade|sell|buy|demand|forecast|বাজার|দাম|মূল্য)\b",
    flags=re.I,
)
DOCUMENT_PATTERN = re.compile(
    r"\b(document|pdf|report|research|paper|အ|নথি|প্রতিবেদন|গবেষণা)\b",
    flags=re.I,
)
ADVISORY_PATTERN = re.compile(
    r"\b(grow| cultivation|fertilizer|pest|disease|soil|irrigat|variety|seed|harvest|"
    r"চাষ|সার|কীট|রোগ|মাটি|সেচ|জাত|বীজ|ফলন)\b",
    flags=re.I,
)
GRAPH_PATTERN = re.compile(
    r"\b(graph|relationship|related|knowledge graph|সম্পর্ক|গ্রাফ)\b",
    flags=re.I,
)


class Supervisor:
    """Selects the minimum sufficient specialist set, never business actors."""

    @staticmethod
    def select(
        *,
        request: AgenticQueryRequest,
        understanding: QueryUnderstanding,
    ) -> list[str]:
        query = f"{understanding.resolvedQuery} {request.query}"
        selected: list[str] = ["agricultural_knowledge_retrieval"]
        reasons: dict[str, str] = {
            "agricultural_knowledge_retrieval": "source-grounded evidence is required for every advisory"
        }
        if MARKET_PATTERN.search(query) or understanding.intent == "market":
            selected.append("market_intelligence")
            reasons["market_intelligence"] = "market terms or intent detected"
        if ADVISORY_PATTERN.search(query) or understanding.intent != "general":
            selected.append("crop_advisory")
            reasons["crop_advisory"] = "crop advisory intent detected"
        if request.documentText.strip() or DOCUMENT_PATTERN.search(query):
            selected.append("document_analysis")
            reasons["document_analysis"] = "supplied document text or document terms detected"
        if request.useGraph and GRAPH_PATTERN.search(query):
            reasons["agricultural_knowledge_retrieval"] += "; graph traversal requested"
        return selected

    @staticmethod
    def describe() -> dict[str, Any]:
        return {
            "strategy": "deterministic-intent-supervisor-v1",
            "workAgents": list(WORK_AGENTS),
            "alwaysIncludes": ["agricultural_knowledge_retrieval", "evidence_verification", "response_generation"],
            "deniedCapabilities": [
                "financial_transactions",
                "order_mutations",
                "listing_mutations",
                "destructive_business_operations",
                "cross_tenant_farmer_data_access",
            ],
        }


__all__ = ["Supervisor", "WORK_AGENTS"]

"""Configurable intent, complexity, and retrieval-strategy routing."""

from dataclasses import dataclass
import re
from typing import Any, Literal

from pydantic import BaseModel, Field

Intent = Literal[
    "agricultural_question",
    "multi_hop_question",
    "image_question",
    "document_question",
    "complex_multi_step",
]
Strategy = Literal["hybrid", "graph_hybrid", "multimodal", "agentic"]

INTENTS: tuple[Intent, ...] = (
    "agricultural_question",
    "multi_hop_question",
    "image_question",
    "document_question",
    "complex_multi_step",
)
STRATEGIES: tuple[Strategy, ...] = ("hybrid", "graph_hybrid", "multimodal", "agentic")

_COMPLEX_TERMS = (
    "compare",
    "relationship",
    "across",
    "combined",
    "integrate",
    "investigate",
    "diagnose",
    "plan",
    "workflow",
    "step by step",
    "first then",
    "why and how",
)
_MULTI_HOP_TERMS = (
    "related to",
    "affects",
    "impact of",
    "connection",
    "which practices",
    "through the supply chain",
    "cascade",
    "downstream",
    "upstream",
)
_DOCUMENT_TERMS = (
    "document",
    "uploaded",
    "attachment",
    "pdf",
    "research paper",
    "report",
    "table",
    "chart",
    "figure",
    "page",
)
_IMAGE_TERMS = (
    "image",
    "photo",
    "picture",
    "leaf",
    "crop photo",
    "visual",
    "screenshot",
)
_QUESTION_TERMS = ("what", "why", "how", "when", "which", "who", "can", "should", "is", "are")


class QueryRouteInput(BaseModel):
    query: str = Field(min_length=1, max_length=8000)
    language: str = Field(default="en", max_length=10)
    hasImages: bool = False
    hasDocuments: bool = False
    requiresApproval: bool = False


class QueryRouteDecision(BaseModel):
    intent: Intent
    complexity: Literal["simple", "moderate", "complex"]
    complexityScore: float = Field(ge=0.0, le=1.0)
    strategy: Strategy
    matchedRules: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str = Field(max_length=500)
    fallbackStrategies: list[Strategy] = Field(default_factory=list)


@dataclass(frozen=True)
class _Rule:
    rule_id: str
    intent: Intent
    strategy: Strategy
    minimum_score: float


DEFAULT_RULES: tuple[_Rule, ...] = (
    _Rule("R1-complex-approval", "complex_multi_step", "agentic", 0.34),
    _Rule("R2-image", "image_question", "multimodal", 0.34),
    _Rule("R3-document", "document_question", "multimodal", 0.34),
    _Rule("R4-multi-hop", "multi_hop_question", "graph_hybrid", 0.34),
    _Rule("R5-simple", "agricultural_question", "hybrid", 0.0),
)

_FALLBACKS: dict[Strategy, tuple[Strategy, ...]] = {
    "agentic": ("graph_hybrid", "hybrid"),
    "graph_hybrid": ("hybrid",),
    "multimodal": ("hybrid",),
    "hybrid": (),
}


def _score_terms(normalized: str, terms: tuple[str, ...]) -> float:
    hits = sum(1 for term in terms if term in normalized)
    if not terms or not hits:
        return 0.0
    return min(1.0, hits / 2.0)


class QueryRouter:
    """Deterministic router driven by configurable threshold rules.

    No LLM is used to select the strategy; the returned confidence is a
    transparent rule-coverage signal, not a calibrated probability.
    """

    def __init__(self, rules: tuple[_Rule, ...] = DEFAULT_RULES) -> None:
        self.rules = rules
        self._by_id = {rule.rule_id: rule for rule in rules}

    def route(self, payload: QueryRouteInput) -> QueryRouteDecision:
        query = payload.query.strip()
        normalized = query.lower()
        word_count = len(normalized.split())

        image_signal = 1.0 if payload.hasImages else _score_terms(normalized, _IMAGE_TERMS)
        document_signal = 1.0 if payload.hasDocuments else _score_terms(normalized, _DOCUMENT_TERMS)
        multi_hop_signal = _score_terms(normalized, _MULTI_HOP_TERMS)
        complex_signal = _score_terms(normalized, _COMPLEX_TERMS)
        if word_count >= 35:
            complex_signal = min(1.0, complex_signal + 0.25)
        if len(re.findall(r"\?|;| then | and then ", normalized)) >= 2:
            complex_signal = min(1.0, complex_signal + 0.2)
        question_signal = _score_terms(normalized, _QUESTION_TERMS)

        complexity_score = round(
            min(
                1.0,
                0.12
                + (0.28 * complex_signal)
                + (0.22 * multi_hop_signal)
                + (0.12 * question_signal)
                + (0.06 if payload.requiresApproval else 0.0)
                + (0.08 if image_signal or document_signal else 0.0),
            ),
            3,
        )
        complexity = (
            "complex"
            if complexity_score >= 0.6
            else "moderate"
            if complexity_score >= 0.35
            else "simple"
        )

        matched_rules: list[str] = []
        decision: tuple[Intent, Strategy] | None = None

        def apply(rule_id: str, intent: Intent, strategy: Strategy, signal: float) -> None:
            nonlocal decision
            rule = self._by_id[rule_id]
            threshold_met = signal >= rule.minimum_score and (
                rule.minimum_score == 0.0 or signal > 0.0
            )
            if decision is None and threshold_met:
                decision = (rule.intent, rule.strategy)
                matched_rules.append(rule_id)

        apply("R1-complex-approval", "complex_multi_step", "agentic", 1.0 if payload.requiresApproval else complex_signal)
        apply("R2-image", "image_question", "multimodal", image_signal)
        apply("R3-document", "document_question", "multimodal", document_signal)
        apply("R4-multi-hop", "multi_hop_question", "graph_hybrid", multi_hop_signal)
        apply("R5-simple", "agricultural_question", "hybrid", 1.0)

        if decision is None:
            decision = ("agricultural_question", "hybrid")
            matched_rules.append("R5-simple")

        intent, strategy = decision
        fallback = list(_FALLBACKS[strategy])
        if payload.hasImages and strategy != "multimodal" and "multimodal" not in fallback:
            fallback.insert(0, "multimodal")
        if payload.hasDocuments and strategy != "multimodal" and "multimodal" not in fallback:
            fallback.insert(0, "multimodal")

        confidence = round(
            min(
                1.0,
                max(
                    0.25,
                    max(
                        image_signal if intent == "image_question" else 0.0,
                        document_signal if intent == "document_question" else 0.0,
                        multi_hop_signal if intent == "multi_hop_question" else 0.0,
                        complex_signal if intent == "complex_multi_step" else 0.0,
                        question_signal if intent == "agricultural_question" else 0.0,
                    )
                    + (0.1 if matched_rules else 0.0),
                ),
            ),
            3,
        )
        rationale = (
            f"Rules matched: {', '.join(matched_rules)}; complexity={complexity}; "
            f"signals image={round(image_signal, 2)}, document={round(document_signal, 2)}, "
            f"multi_hop={round(multi_hop_signal, 2)}, complex={round(complex_signal, 2)}."
        )
        return QueryRouteDecision(
            intent=intent,
            complexity=complexity,
            complexityScore=complexity_score,
            strategy=strategy,
            matchedRules=matched_rules,
            confidence=confidence,
            rationale=rationale[:500],
            fallbackStrategies=fallback,
        )

    def describe(self) -> dict[str, Any]:
        return {
            "router": "rules-v1",
            "intentClassification": True,
            "complexityEstimation": True,
            "llmBasedSelection": False,
            "rules": [
                {
                    "ruleId": rule.rule_id,
                    "intent": rule.intent,
                    "strategy": rule.strategy,
                    "minimumScore": rule.minimum_score,
                }
                for rule in self.rules
            ],
        }


__all__ = [
    "DEFAULT_RULES",
    "INTENTS",
    "QueryRouteDecision",
    "QueryRouteInput",
    "QueryRouter",
    "STRATEGIES",
]

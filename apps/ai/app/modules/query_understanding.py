"""Deterministic query understanding and expansion for agricultural RAG.

Expansion is intentionally lexicon-based and auditable: it never calls a model to
invent source-like terms. Every variant returned here can be inspected through
retrieval diagnostics.
"""

import re
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.modules.documents import detect_language

IntentType = Literal[
    "cultivation",
    "fertilizer",
    "pest",
    "disease",
    "irrigation",
    "soil",
    "harvest",
    "input",
    "market",
    "general",
]

SafetyCategory = Literal["pesticide", "fertilizer", "chemical", "diagnosis"]

INTENT_TERMS: dict[str, tuple[str, ...]] = {
    "cultivation": ("crop", "cultivation", "grow", "sow", "variety", "chash", "চাষ", "বীজ", " ফসল"),
    "fertilizer": ("fertilizer", "nutrient", "npk", "urea", " manure", "সার", "ইউরিয়া"),
    "pest": ("pest", "insect", "bug", "কীট", "পোকা", "কীটনাশক"),
    "disease": ("disease", "blast", "fungus", "rot", " symptom", "রোগ", "ছত্রাক", "পচা"),
    "irrigation": ("irrigat", "water schedule", "watering", "সেচ", "পানি"),
    "soil": ("soil", "ph", "organic matter", "মাটি", "মাটির"),
    "harvest": ("harvest", "post harvest", "yield", "ফসল কাটা", "ফলন"),
    "input": ("seed", "input", "product", "label", "বীজ", "কীটনাশক"),
    "market": ("market", "price", "rate", "trade", "বাজার", "দাম", "মূল্য"),
}

SAFETY_TERMS: dict[str, tuple[str, ...]] = {
    "pesticide": ("pesticide", "insecticide", "herbicide", "fungicide", "কীটনাশক", "ছত্রাকনাশক"),
    "fertilizer": ("fertilizer", "urea", "npk", "dose", "dosage", "সার", "ইউরিয়া", "মাত্রা"),
    "chemical": ("chemical", "spray", "solution", "mixture", "রাসায়নিক", "স্প্রে", "মিশ্রণ"),
    "diagnosis": ("what is wrong", "identify", "spots", "wilting", "diagnos", "কী হয়েছে", "দাগ", "শুকিয়ে"),
}

QUERY_SYNONYMS: dict[str, tuple[str, ...]] = {
    "rice": ("rice", "paddy", "ধান", "চাল", "rice cultivation"),
    "irrigation": ("irrigat", "watering", "সেচ", "পানি দিন", "water management"),
    "fertilizer": ("fertilizer", "nutrient", "সার", "npk", "নিউট্রেন্ট"),
    "pesticide": ("pesticide", "insecticide", "কীটনাশক", "পোকা দমন"),
    "pest": ("pest", "insect", "কীট", "পোকা"),
    "disease": ("disease", "blast", "রোগ", "ছত্রাক"),
    "soil": ("soil", "মাটি", "soil test", "মাটি পরীক্ষা"),
    "market": ("market", "price", "বাজার", "দাম", "মূল্য"),
    "harvest": ("harvest", "yield", "ফসল কাটা", "ফলন"),
    "seed": ("seed", "বীজ", "certified seed"),
    "cultivation": ("cultivat", "grow", "চাষ", "crop production"),
}

FOLLOW_UP_PATTERN = re.compile(
    r"^(it|that|this|they|there|then|what about|how about|and|but|also|same|above|"
    r"এটি|ওটি|তা|তাই|এখন|আর|কেমন|তবে)\b",
    flags=re.I,
)


class QueryUnderstanding(BaseModel):
    originalQuery: str
    resolvedQuery: str
    language: Literal["en", "bn", "both"]
    queryLanguages: list[str] = Field(default_factory=list, max_length=3)
    intent: IntentType = "general"
    entities: dict[str, list[str]] = Field(default_factory=dict)
    expandedQueries: list[str] = Field(default_factory=list, max_length=8)
    safetyCategories: list[SafetyCategory] = Field(default_factory=list)
    isFollowUp: bool = False
    signals: dict[str, Any] = Field(default_factory=dict)


class QueryUnderstandingService:
    """Undertands intent, resolves follow-ups, and builds bounded query variants."""

    def __init__(
        self,
        *,
        enable_expansion: bool = True,
        max_variants: int = 3,
    ) -> None:
        self.enable_expansion = enable_expansion
        self.max_variants = max(1, min(8, max_variants))

    @staticmethod
    def _last_user_message(history: list[dict[str, Any]] | None) -> str:
        for item in reversed(history or []):
            role = str(item.get("role", "")).lower()
            content = str(item.get("content", "")).strip()
            if role == "user" and content:
                return content
        return ""

    @staticmethod
    def _score_terms(text: str, terms: dict[str, tuple[str, ...]]) -> tuple[str | None, int]:
        lowered = text.lower()
        best: tuple[str | None, int] = (None, 0)
        for key, words in terms.items():
            score = sum(1 for word in words if word.strip() in lowered)
            if score > best[1]:
                best = (key, score)
        return best

    @classmethod
    def _looks_like_follow_up(cls, query: str, history: list[dict[str, Any]] | None) -> bool:
        previous = cls._last_user_message(history)
        return bool(previous) and bool(FOLLOW_UP_PATTERN.match(query.strip()))

    @staticmethod
    def _is_bengali(text: str) -> bool:
        return any("\u0980" <= char <= "\u09ff" for char in text)

    def understand(
        self,
        query: str,
        *,
        language: Literal["en", "bn", "both"] = "en",
        history: list[dict[str, Any]] | None = None,
        region: str = "",
        document_types: list[str] | None = None,
        max_variants: int | None = None,
    ) -> QueryUnderstanding:
        clean = query.strip()
        is_follow_up = self._looks_like_follow_up(clean, history)
        anchor = self._last_user_message(history)[:240] if is_follow_up else ""
        resolved = f"{anchor}: {clean}" if anchor else clean

        declared: Literal["en", "bn", "both"] = language
        if declared == "both":
            effective: Literal["en", "bn", "both"] = "both"
        elif declared == "bn" and not self._is_bengali(clean):
            effective = "bn"
        elif declared == "en" and self._is_bengali(clean):
            effective = "bn"
        else:
            effective = declared
        query_languages = (
            ["bn", "en"] if effective == "both" else [effective]
        )

        variants_limit = self.max_variants if max_variants is None else max(1, min(8, max_variants))
        expansions = (
            self._expand(resolved, effective, variants_limit)
            if self.enable_expansion
            else []
        )
        intent, _ = self._score_terms(resolved, INTENT_TERMS)
        safety_categories = [
            category
            for category, _score in (
                (name, self._score_terms(resolved, {name: words})[1])
                for name, words in SAFETY_TERMS.items()
            )
            if _score > 0
        ]

        entities: dict[str, list[str]] = {}
        for crop, aliases in QUERY_SYNONYMS.items():
            if crop in {"irrigation", "fertilizer", "pesticide", "pest", "disease", "soil", "market", "harvest", "seed", "cultivation"}:
                continue
            if any(alias.strip() in resolved.lower() for alias in aliases):
                entities.setdefault("crop", []).append(crop)
        if region.strip():
            entities["region"] = [region.strip()]
        if document_types:
            entities["documentTypes"] = list(document_types)

        return QueryUnderstanding(
            originalQuery=clean,
            resolvedQuery=resolved,
            language=effective,
            queryLanguages=query_languages,
            intent=intent or "general",
            entities=entities,
            expandedQueries=expansions,
            safetyCategories=safety_categories,  # type: ignore[arg-type]
            isFollowUp=is_follow_up,
            signals={
                "hasDigits": bool(re.search(r"\d", clean)),
                "hasSafetySignal": bool(safety_categories),
                "historyTurns": len(history or []),
                "anchorUsed": bool(anchor),
            },
        )

    def _expand(
        self,
        query: str,
        language: Literal["en", "bn", "both"],
        max_variants: int | None = None,
    ) -> list[str]:
        limit = self.max_variants if max_variants is None else max_variants
        lowered = query.lower()
        variants: list[str] = [query]
        for aliases in QUERY_SYNONYMS.values():
            if len(variants) >= limit:
                break
            if not any(alias.strip() in lowered for alias in aliases):
                continue
            if language == "bn":
                candidates = [alias for alias in aliases if self._is_bengali(alias)]
            elif language == "en":
                candidates = [alias for alias in aliases if not self._is_bengali(alias)]
            else:
                candidates = list(aliases)
            for candidate in candidates:
                candidate = candidate.strip()
                if candidate and candidate.lower() not in lowered:
                    variants.append(f"{query} {candidate}")
                    break
        return variants[:limit]

    def describe(self) -> dict[str, Any]:
        return {
            "strategy": "deterministic-lexicon-v1",
            "expansionEnabled": self.enable_expansion,
            "maxVariants": self.max_variants,
            "safetyCategories": sorted(SAFETY_TERMS),
        }

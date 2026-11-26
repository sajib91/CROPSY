"""Auditable agricultural entity and relationship extraction."""

from __future__ import annotations

import json
import re
from typing import Any

from app.config import Settings, get_settings
from app.errors import ProviderError
from app.infrastructure.graph_store import normalize_graph_text
from app.models import LLMRequest
from app.modules.graph_rag.models import (
    EntityMention,
    GraphExtractionRequest,
    GraphExtractionResult,
    RelationshipMention,
)
from app.modules.llm_provider import LLMProviderManager
from app.modules.model_config import ModelRegistry

ENTITY_TERMS: dict[str, tuple[str, ...]] = {
    "Crop": (
        "rice", "paddy", " maize", "corn", "wheat", "jute", "potato", "tomato", "banana",
        "lentil", "chickpea", "mustard", "sugarcane", "ধান", "চাল", "ভুট্টা", "গম", "পটাটো",
        "টমেটো", "কলা", "মসুর", "ছোলা", "সরিষে",
    ),
    "CropVariety": ("variety", "hybrid", "cultivar", "জাত", "হাইব্রিড"),
    "PlantDisease": (
        "blast", "blight", "rust", "rot", "fungus", "fungal", "bacterial", "virus", "disease",
        "ছত্রাক", "রোগ", "পচা", "ব্লাস্ট",
    ),
    "Pest": ("pest", "insect", "bug", "aphid", "moth", "larva", "কীট", "পোকা", "মথ"),
    "SoilType": ("soil", "clay", "loam", "sandy", "peat", "মাটি", "কাদামাটি", "বালি"),
    "Fertilizer": ("fertilizer", "urea", "npk", "compost", "manure", "সার", "ইউরিয়া", "কম্পোস্ট"),
    "Nutrient": ("nitrogen", "phosphorus", "potassium", "nutrient", "npk", "নাইট্রোজেন", "ফসফরাস", "পটাসিয়াম"),
    "AgriculturalPractice": (
        "irrigation", "sowing", "transplant", "harvest", "pruning", "drainage", "soil test",
        "crop rotation", "সেচ", "রোপণ", "ফসল কাটা", "মাটি পরীক্ষা",
    ),
    "WeatherCondition": ("rain", "rainfall", "drought", "flood", "humidity", "temperature", "বৃষ্টি", "খরা", "বন্যা", "আর্দ্রতা"),
    "GeographicRegion": ("sylhet", "dhaka", "rajshahi", "khulna", "barisal", "rangpur", "bangladesh", "সিলেট", "ঢাকা", "রাজশাহী", "বাংলাদেশ"),
    "AgriculturalResearch": ("research", "study", "trial", "experiment", "গবেষণা", "পরীক্ষা"),
    "ExpertRecommendation": ("recommend", "guideline", "advisory", "extension", "সুপারিশ", "নির্দেশিকা"),
}

LABEL_PRIORITY = (
    "CropVariety",
    "AgriculturalResearch",
    "ExpertRecommendation",
    "AgriculturalPractice",
    "PlantDisease",
    "Pest",
    "SoilType",
    "Fertilizer",
    "Nutrient",
    "WeatherCondition",
    "GeographicRegion",
    "Crop",
)

RELATION_PATTERNS: tuple[tuple[str, str, str, float], ...] = (
    ("AFFECTS", r"(?P<s>\w+) affects (?P<o>\w+)", 0.72),
    ("CAUSES", r"(?P<s>\w+) causes (?P<o>\w+)", 0.72),
    ("TREATS", r"(?P<s>\w+) treats (?P<o>\w+)", 0.72),
    ("REQUIRES", r"(?P<s>\w+) requires (?P<o>\w+)", 0.72),
    ("GROWS_IN", r"(?P<s>\w+) grows in (?P<o>\w+)", 0.76),
    ("FOUND_IN", r"(?P<s>\w+) found in (?P<o>\w+)", 0.70),
    ("RECOMMENDED_FOR", r"recommend(?:ed)? for (?P<o>\w+)", 0.68),
    ("HAS_EVIDENCE", r"evidence for (?P<o>\w+)", 0.66),
    ("ASSOCIATED_WITH", r"(?P<s>\w+) associated with (?P<o>\w+)", 0.62),
)

SENTENCE_SPLIT = re.compile(r"(?<=[.!?।])\s+|\n+")
WORD_PATTERN = re.compile(r"[\w\u0980-\u09ff-]+", flags=re.UNICODE)


def _sentences(text: str) -> list[str]:
    return [part.strip() for part in SENTENCE_SPLIT.split(text) if part.strip()]


def _find_mentions(
    text: str,
    *,
    enabled_labels: set[str],
    source: str,
    source_reference: str,
) -> list[EntityMention]:
    mentions: list[EntityMention] = []
    for label in LABEL_PRIORITY:
        if enabled_labels and label not in enabled_labels:
            continue
        for term in ENTITY_TERMS[label]:
            for match in re.finditer(re.escape(term), text, flags=re.IGNORECASE):
                span = match.group(0).strip()
                if not span:
                    continue
                mentions.append(
                    EntityMention(
                        text=span,
                        label=label,  # type: ignore[arg-type]
                        confidence=0.72 if len(span.split()) > 1 else 0.58,
                        evidenceSnippet=text[:1000],
                        source=source,
                        sourceReference=source_reference,
                    )
                )
    deduplicated: dict[tuple[str, str], EntityMention] = {}
    for mention in mentions:
        key = (normalize_graph_text(mention.text), mention.label)
        existing = deduplicated.get(key)
        if existing is None or len(mention.text) > len(existing.text):
            deduplicated[key] = mention
    return list(deduplicated.values())


def _resolve_label(phrase: str, mentions: list[EntityMention]) -> EntityMention | None:
    normalized = normalize_graph_text(phrase)
    exact = [item for item in mentions if normalize_graph_text(item.text) == normalized]
    if exact:
        return max(exact, key=lambda item: len(item.text))
    partial = [
        item
        for item in mentions
        if normalized and (
            normalized in normalize_graph_text(item.text)
            or normalize_graph_text(item.text) in normalized
        )
    ]
    return max(partial, key=lambda item: len(item.text)) if partial else None


def deterministic_extract(value: GraphExtractionRequest) -> GraphExtractionResult:
    enabled_labels = set(value.entityTypes)
    enabled_predicates = set(value.relationTypes)
    entities: list[EntityMention] = []
    relationships: list[RelationshipMention] = []
    for sentence in _sentences(value.text):
        local_entities = _find_mentions(
            sentence,
            enabled_labels=enabled_labels,
            source=value.source,
            source_reference=value.sourceReference,
        )
        entities.extend(local_entities)
        for predicate, pattern, confidence in RELATION_PATTERNS:
            if enabled_predicates and predicate not in enabled_predicates:
                continue
            for match in re.finditer(pattern, sentence, flags=re.IGNORECASE):
                subject_phrase = match.groupdict().get("s") or ""
                object_phrase = match.group("o")
                subject = _resolve_label(subject_phrase, local_entities) if subject_phrase else None
                obj = _resolve_label(object_phrase, local_entities)
                if subject is None or obj is None:
                    continue
                if normalize_graph_text(subject.text) == normalize_graph_text(obj.text):
                    continue
                relationships.append(
                    RelationshipMention(
                        subject=subject.text,
                        predicate=predicate,  # type: ignore[arg-type]
                        object=obj.text,
                        confidence=confidence,
                        evidenceSnippet=sentence[:1000],
                        source=value.source,
                        sourceReference=value.sourceReference,
                        extractionMethod="deterministic",
                    )
                )
    unique_entities: dict[tuple[str, str], EntityMention] = {
        (normalize_graph_text(item.text), item.label): item for item in entities
    }
    unique_relations: dict[tuple[str, str, str], RelationshipMention] = {
        (
            normalize_graph_text(item.subject),
            item.predicate,
            normalize_graph_text(item.object),
        ): item
        for item in relationships
    }
    return GraphExtractionResult(
        entities=list(unique_entities.values()),
        relationships=list(unique_relations.values()),
        extractionMethod="deterministic",
        limitations=[
            "Extraction is lexicon-grounded; unmatched agricultural concepts are not inferred."
        ],
    )


LLM_EXTRACTION_INSTRUCTIONS = """
Extract only entities and relationships explicitly present in SOURCE TEXT.
Allowed entity labels: {labels}
Allowed predicates: {predicates}
Return strict JSON only with keys "entities" and "relationships".
Each entity requires text, label, confidence (0-1), evidenceSnippet.
Each relationship requires subject, predicate, object, confidence (0-1), evidenceSnippet.
Use evidenceSnippet verbatim from SOURCE TEXT. Do not translate, invent, summarize,
normalize to a different fact, or add facts not written in SOURCE TEXT.
Never assert scientific verification. If nothing is present, return empty arrays.
""".strip()


def _strip_json_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _grounded(value: str, source: str) -> bool:
    return bool(value.strip()) and normalize_graph_text(value) in normalize_graph_text(source)


async def llm_extract(
    value: GraphExtractionRequest,
    *,
    llms: LLMProviderManager,
    models: ModelRegistry,
    settings: Settings | None = None,
) -> GraphExtractionResult:
    active = settings or get_settings()
    model = models.resolve(value.modelKey, "classify")
    prompt = (
        f"{LLM_EXTRACTION_INSTRUCTIONS.format(labels=', '.join(LABEL_PRIORITY), predicates=', '.join(item[0] for item in RELATION_PATTERNS))}\n\n"
        f"SOURCE TEXT:\n{value.text}"
    )
    response = await llms.generate(
        LLMRequest(
            prompt=prompt,
            systemPrompt="You perform conservative information extraction, not advisory generation.",
            task="graph_extraction",
            maxTokens=min(model.maxTokens, 1600),
            temperature=0.0,
        ),
        model=model.modelName,
        provider_name=model.provider,
    )
    try:
        parsed = json.loads(_strip_json_fence(response.text))
    except json.JSONDecodeError as error:
        raise ProviderError(
            "Graph extraction response was not valid JSON.",
            details={"reason": "invalid_json"},
        ) from error
    if not isinstance(parsed, dict):
        raise ProviderError(
            "Graph extraction response must be a JSON object.",
            details={"reason": "invalid_shape"},
        )

    entities: list[EntityMention] = []
    for item in parsed.get("entities") or []:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", ""))
        snippet = str(item.get("evidenceSnippet", ""))
        text = str(item.get("text", ""))
        if label not in ENTITY_TERMS or not _grounded(text, value.text) or not _grounded(snippet, value.text):
            continue
        confidence = min(0.85, max(0.0, float(item.get("confidence", 0.5))))
        entities.append(
            EntityMention(
                text=text,
                label=label,  # type: ignore[arg-type]
                confidence=confidence,
                evidenceSnippet=snippet[:1000],
                source=value.source,
                sourceReference=value.sourceReference,
            )
        )

    relationships: list[RelationshipMention] = []
    for item in parsed.get("relationships") or []:
        if not isinstance(item, dict):
            continue
        subject = str(item.get("subject", ""))
        obj = str(item.get("object", ""))
        predicate = str(item.get("predicate", ""))
        snippet = str(item.get("evidenceSnippet", ""))
        allowed = {entry[0] for entry in RELATION_PATTERNS}
        if (
            predicate not in allowed
            or not _grounded(subject, value.text)
            or not _grounded(obj, value.text)
            or not _grounded(snippet, value.text)
            or normalize_graph_text(subject) == normalize_graph_text(obj)
        ):
            continue
        confidence = min(0.85, max(0.0, float(item.get("confidence", 0.5))))
        relationships.append(
            RelationshipMention(
                subject=subject,
                predicate=predicate,  # type: ignore[arg-type]
                object=obj,
                confidence=confidence,
                evidenceSnippet=snippet[:1000],
                source=value.source,
                sourceReference=value.sourceReference,
                extractionMethod="llm",
            )
        )

    return GraphExtractionResult(
        entities=entities,
        relationships=relationships,
        extractionMethod="llm",
        limitations=[
            "LLM output was accepted only where strings were grounded verbatim in source text.",
            "All extracted relationships remain unverified until validation and human approval.",
        ],
        usage=response.usage.model_dump(mode="json"),
    )


async def extract_graph(
    value: GraphExtractionRequest,
    *,
    llms: LLMProviderManager | None = None,
    models: ModelRegistry | None = None,
    settings: Settings | None = None,
) -> GraphExtractionResult:
    active = settings or get_settings()
    if active.graph_extraction_provider == "llm":
        if llms is None or models is None:
            raise ProviderError("LLM graph extraction requires configured LLM services.")
        return await llm_extract(value, llms=llms, models=models, settings=active)
    return deterministic_extract(value)


__all__ = ["deterministic_extract", "extract_graph", "llm_extract"]

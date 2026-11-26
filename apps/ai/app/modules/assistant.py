"""CROPSY AI Agricultural Assistant: conversational, evidence-first advisory service."""

import re
import time
import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.errors import AiError
from app.models import EvidenceChunk, Language, LLMRequest, LLMResponse, Usage, utc_now
from app.modules.conversation import (
    Conversation,
    ConversationMessage,
    ConversationStore,
)
from app.modules.evaluation import EvaluationMonitoringService
from app.modules.knowledge import KnowledgeBaseService
from app.modules.llm_provider import LLMProviderManager
from app.modules.model_config import ModelRegistry
from app.modules.prompt import PromptManager
from app.modules.query_understanding import (
    QueryUnderstanding,
    QueryUnderstandingService,
)
from app.modules.recommendations import (
    CITATION_LABEL_PATTERN,
    URL_PATTERN,
    format_evidence,
    sanitize_answer,
)
from app.modules.retrieval import RetrievalOptions
from app.modules.safety import SafetyNote, SafetyPolicyService
from app.tracing import Tracer

ClaimKind = Literal["established_fact", "prediction"]
ClaimStatus = Literal["source_supported", "uncertain"]

INTENT_DOCUMENT_TYPES: dict[str, list[str]] = {
    "cultivation": ["crop_cultivation_guideline", "agricultural_manual"],
    "fertilizer": [
        "fertilizer_recommendation",
        "soil_management",
        "government_publication",
    ],
    "pest": ["pest_management", "research_paper", "government_publication"],
    "disease": ["disease_management", "research_paper", "government_publication"],
    "irrigation": ["crop_cultivation_guideline", "weather_guidance", "soil_management"],
    "soil": ["soil_management", "fertilizer_recommendation"],
    "harvest": ["crop_cultivation_guideline", "agricultural_manual"],
    "input": ["agricultural_manual", "government_publication"],
    "market": ["market_intelligence", "government_publication"],
}

SAFETY_DOCUMENT_TYPES = [
    "government_publication",
    "fertilizer_recommendation",
    "pest_management",
    "disease_management",
]

LABELLED_CLAIM_PATTERN = re.compile(
    r"^\s*\[(FACT|PREDICTION)\]\s*(.+)$",
    flags=re.I | re.M,
)

PREDICTION_TERMS = (
    "forecast",
    "predict",
    "outlook",
    "expected",
    "likely",
    "will",
    "পূর্বাভাস",
    "সম্ভাব্য",
    "হতে পারে",
)


class AssistantChatInput(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    language: Language = "en"
    conversationId: str | None = Field(default=None, max_length=128)
    topK: int = Field(default=5, ge=1, le=20)
    modelKey: str | None = Field(default=None, max_length=100)
    region: str = Field(default="", max_length=200)
    documentTypes: list[str] = Field(default_factory=list, max_length=20)
    maxHistoryTurns: int = Field(default=8, ge=1, le=50)
    includeHistory: bool = True


class AssistantClaim(BaseModel):
    kind: ClaimKind
    text: str = Field(min_length=1, max_length=4000)
    status: ClaimStatus
    sourceChunkIds: list[str] = Field(default_factory=list)
    sourceDocumentIds: list[str] = Field(default_factory=list)
    relevanceScore: float = Field(default=0.0, ge=0.0, le=1.0)
    asOf: str = Field(default="", max_length=50)
    timeframe: str = Field(default="not specified", max_length=100)


class UncertaintyWarning(BaseModel):
    code: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=1000)


class AssistantResult(BaseModel):
    status: Literal["ok", "insufficient_evidence"]
    advisory: bool = True
    answer: str
    conversationId: str
    messageId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    language: str = "en"
    detectedLanguage: str = "en"
    intent: str = "general"
    resolvedQuery: str = ""
    expandedQueries: list[str] = Field(default_factory=list)
    isFollowUp: bool = False
    facts: list[AssistantClaim] = Field(default_factory=list)
    predictions: list[AssistantClaim] = Field(default_factory=list)
    uncertainties: list[UncertaintyWarning] = Field(default_factory=list)
    safetyNotes: list[SafetyNote] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    retrieval: dict[str, Any] = Field(default_factory=dict)
    citationValidation: dict[str, Any] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list)
    usage: dict[str, Any] = Field(default_factory=dict)
    model: str = "none"
    provider: str = "none"
    promptVersion: str = "none"
    traceId: str


class AgriculturalAssistantService:
    """Orchestrates understanding, hybrid retrieval, generation, and citation guards."""

    def __init__(
        self,
        *,
        knowledge: KnowledgeBaseService,
        llms: LLMProviderManager,
        models: ModelRegistry,
        prompts: PromptManager,
        tracer: Tracer,
        monitoring: EvaluationMonitoringService,
        conversations: ConversationStore,
        understanding: QueryUnderstandingService | None = None,
        safety: SafetyPolicyService | None = None,
    ) -> None:
        self.knowledge = knowledge
        self.llms = llms
        self.models = models
        self.prompts = prompts
        self.tracer = tracer
        self.monitoring = monitoring
        self.conversations = conversations
        self.understanding = understanding or QueryUnderstandingService()
        self.safety = safety or SafetyPolicyService()
        self.default_jurisdiction = knowledge.settings.retrieval_default_jurisdiction

    async def create_conversation(
        self,
        *,
        organization_id: str,
        user_id: str,
        language: str = "en",
        title: str = "",
    ) -> Conversation:
        return await self.conversations.create(
            organization_id=organization_id,
            user_id=user_id,
            language=language,
            title=title,
        )

    async def get_conversation(
        self,
        conversation_id: str,
        *,
        organization_id: str,
        user_id: str,
    ) -> Conversation:
        return await self.conversations.get(
            conversation_id,
            organization_id=organization_id,
            user_id=user_id,
        )

    async def list_conversations(
        self,
        *,
        organization_id: str,
        user_id: str,
    ) -> list[Conversation]:
        return await self.conversations.list(
            organization_id=organization_id,
            user_id=user_id,
        )

    async def chat(
        self,
        value: AssistantChatInput,
        *,
        trace_id: str,
        organization_id: str = "system",
        user_id: str = "system",
    ) -> AssistantResult:
        conversation: Conversation | None = None
        history: list[dict[str, Any]] = []
        with self.tracer.span(trace_id, "assistant.context"):
            if value.conversationId:
                conversation = await self.conversations.get(
                    value.conversationId,
                    organization_id=organization_id,
                    user_id=user_id,
                )
                if value.includeHistory:
                    history = self.conversations.history(
                        conversation,
                        max_turns=value.maxHistoryTurns,
                    )
            else:
                conversation = await self.conversations.create(
                    organization_id=organization_id,
                    user_id=user_id,
                    language=value.language,
                    title=value.message[:120],
                )

        with self.tracer.span(trace_id, "assistant.understanding"):
            understanding = self.understanding.understand(
                value.message,
                language=value.language,
                history=history,
                region=value.region,
                document_types=value.documentTypes,
            )

        document_types = self._document_types(understanding, value.documentTypes)
        options = RetrievalOptions(
            documentTypes=document_types,
            region=value.region,
        )
        with self.tracer.span(trace_id, "assistant.retrieve"):
            retrieval = await self.knowledge.retrieve_detailed(
                understanding.resolvedQuery,
                language=understanding.language,
                top_k=value.topK,
                options=options,
                trace_id=trace_id,
            )
        evidence = retrieval.evidence

        with self.tracer.span(trace_id, "assistant.safety"):
            safety_notes = self.safety.evaluate(
                categories=list(understanding.safetyCategories),
                evidence=evidence,
                language=value.language,
                region=value.region,
                default_jurisdiction=self.default_jurisdiction,
            )

        if not evidence:
            self.monitoring.record_error("insufficient_evidence")
            answer = self._insufficient_answer(value.language)
            result = AssistantResult(
                status="insufficient_evidence",
                answer=answer,
                conversationId=conversation.conversationId,
                language=value.language,
                detectedLanguage=understanding.language,
                intent=understanding.intent,
                resolvedQuery=understanding.resolvedQuery,
                expandedQueries=understanding.expandedQueries,
                isFollowUp=understanding.isFollowUp,
                uncertainties=self._uncertainties(
                    language=value.language,
                    understanding=understanding,
                    evidence=[],
                    has_predictions=False,
                ),
                safetyNotes=safety_notes,
                retrieval=retrieval.diagnostics.model_dump(mode="json"),
                limitations=[self._advisory_limitation(value.language)],
                traceId=trace_id,
            )
            await self._persist(
                conversation.conversationId,
                organization_id,
                user_id,
                value,
                result,
            )
            return result

        model = self.models.resolve(value.modelKey, "ask")
        template_key = "assistant.bn" if value.language == "bn" else "assistant.en"
        history_text = self._format_history(history, value.language)
        safety_text = (
            "\n".join(f"- {note.message}" for note in safety_notes)
            or ("None supplied" if value.language != "bn" else "কোনো নির্দেশনা নেই")
        )
        system, prompt, version = self.prompts.render(
            template_key,
            {
                "question": value.message,
                "resolvedQuery": understanding.resolvedQuery,
                "history": history_text,
                "safety": safety_text,
                "evidence": format_evidence(evidence),
            },
        )
        request = LLMRequest(
            prompt=prompt,
            systemPrompt=system,
            task="ask",
            maxTokens=min(model.maxTokens, 1200),
            temperature=model.temperature,
        )

        started = time.perf_counter()
        response: LLMResponse | None = None
        status = "ok"
        try:
            with self.tracer.span(trace_id, "assistant.generate", model=model.modelName):
                generated = await self.llms.generate(
                    request,
                    model=model.modelName,
                    provider_name=model.provider,
                )
            response = generated
        except AiError:
            status = "error"
            self.monitoring.record_error("generation_error")
            raise
        except Exception:
            status = "error"
            self.monitoring.record_error("generation_error")
            raise
        finally:
            self.monitoring.record_generation(
                trace_id=trace_id,
                task="assistant",
                usage=response.usage if response else Usage(),
                latency_ms=(time.perf_counter() - started) * 1000,
                status=status,
            )

        with self.tracer.span(trace_id, "assistant.citation_guard"):
            answer, citation_validation = validate_answer_citations(
                generated.text, evidence
            )
        with self.tracer.span(trace_id, "assistant.claims", evidenceCount=len(evidence)):
            facts, predictions = build_claims(
                answer,
                evidence,
                understanding=understanding,
                language=value.language,
            )

        citations = [item.citation.model_dump(mode="json") for item in evidence]
        result = AssistantResult(
            status="ok",
            answer=answer,
            conversationId=conversation.conversationId,
            language=value.language,
            detectedLanguage=understanding.language,
            intent=understanding.intent,
            resolvedQuery=understanding.resolvedQuery,
            expandedQueries=understanding.expandedQueries,
            isFollowUp=understanding.isFollowUp,
            facts=facts,
            predictions=predictions,
            uncertainties=self._uncertainties(
                language=value.language,
                understanding=understanding,
                evidence=evidence,
                has_predictions=bool(predictions),
            ),
            safetyNotes=safety_notes,
            citations=citations,
            evidence=[
                {
                    "chunkId": item.chunkId,
                    "documentId": item.documentId,
                    "section": item.section,
                    "language": item.language,
                    "score": item.score,
                    "sourceName": item.citation.sourceName,
                    "jurisdiction": item.citation.jurisdiction,
                    "publishedAt": item.citation.publishedAt,
                }
                for item in evidence
            ],
            retrieval=retrieval.diagnostics.model_dump(mode="json"),
            citationValidation=citation_validation,
            limitations=[
                self._advisory_limitation(value.language),
                (
                    "Citations are limited to ingested, verified, licensed source chunks."
                    if value.language != "bn"
                    else "উদ্ধৃতি শুধুমাত্র যাচাইকৃত ও লাইসেন্সকৃত উৎসের অংশ থেকে নেওয়া হয়।"
                ),
            ],
            usage=generated.usage.model_dump(mode="json"),
            model=generated.model,
            provider=generated.provider,
            promptVersion=version,
            traceId=trace_id,
        )
        await self._persist(
            conversation.conversationId,
            organization_id,
            user_id,
            value,
            result,
        )
        return result

    @staticmethod
    def _document_types(
        understanding: QueryUnderstanding,
        supplied: list[str],
    ) -> list[str]:
        if supplied:
            return list(supplied)
        types = list(INTENT_DOCUMENT_TYPES.get(understanding.intent, []))
        if understanding.safetyCategories:
            for document_type in SAFETY_DOCUMENT_TYPES:
                if document_type not in types:
                    types.append(document_type)
        return types[:20]

    @staticmethod
    def _format_history(history: list[dict[str, Any]], language: str) -> str:
        if not history:
            return "none" if language != "bn" else "কোনো ইতিহাস নেই"
        return "\n".join(
            f"{item['role']}: {str(item['content'])[:500]}" for item in history
        )

    @staticmethod
    def _insufficient_answer(language: str) -> str:
        if language == "bn":
            return (
                "যাচাইকৃত কৃষি উৎস থেকে পর্যাপ্ত প্রমাণ পাওয়া যায়নি, তাই উত্তর দিতে পারছি না। "
                "কোনো উদ্ধৃতি তৈরি করা হয়নি। স্থানীয় কৃষি বিশেষজ্ঞের সাথে যোগাযোগ করুন।"
            )
        return (
            "I cannot answer from verified agricultural sources because the available "
            "evidence is insufficient. No citations were generated. Please consult a local "
            "agronomist or extension service."
        )

    @staticmethod
    def _advisory_limitation(language: str) -> str:
        if language == "bn":
            return "এটি শুধু পরামর্শ; ক্ষেত্রে ব্যবহারের আগে স্থানীয় কৃষি বিশেষজ্ঞের যাচাই নিন।"
        return "Advisory output only; verify with a local agronomist before field use."

    def _uncertainties(
        self,
        *,
        language: str,
        understanding: QueryUnderstanding,
        evidence: list[EvidenceChunk],
        has_predictions: bool,
    ) -> list[UncertaintyWarning]:
        warnings = [
            UncertaintyWarning(
                code="advisory_only",
                message=(
                    "This answer is decision support, not a guaranteed outcome."
                    if language != "bn"
                    else "এই উত্তর সহায়তামূলক; কোনো ফলাফলের গ্যারান্টি নয়।"
                ),
            )
        ]
        if "diagnosis" in understanding.safetyCategories:
            warnings.append(
                UncertaintyWarning(
                    code="diagnosis_unconfirmed",
                    message=(
                        "Any pest or disease identification is unconfirmed and must be verified locally."
                        if language != "bn"
                        else "কীট বা রোগের যেকোনো শনাক্তকরণ অনিশ্চিত; স্থানীয়ভাবে যাচাই করতে হবে।"
                    ),
                )
            )
        if has_predictions:
            warnings.append(
                UncertaintyWarning(
                    code="prediction_not_guaranteed",
                    message=(
                        "Predictions are estimates, not guaranteed outcomes; verify current local data."
                        if language != "bn"
                        else "পূর্বাভাস অনুমান, নিশ্চিত ফলাফল নয়; বর্তমান স্থানীয় তথ্য যাচাই করুন।"
                    ),
                )
            )
        if evidence and max(item.score for item in evidence) < 0.35:
            warnings.append(
                UncertaintyWarning(
                    code="low_relevance_evidence",
                    message=(
                        "Retrieved evidence has low relevance; treat this answer as weak support."
                        if language != "bn"
                        else "প্রাপ্ত প্রমাণের প্রাসঙ্গিকতা কম; এই উত্তর দুর্বল সহায়তা হিসেবে বিবেচনা করুন।"
                    ),
                )
            )
        return warnings

    async def _persist(
        self,
        conversation_id: str,
        organization_id: str,
        user_id: str,
        value: AssistantChatInput,
        result: AssistantResult,
    ) -> None:
        await self.conversations.append(
            conversation_id,
            ConversationMessage(
                role="user",
                content=value.message,
                language=value.language,
                traceId=result.traceId,
            ),
            organization_id=organization_id,
            user_id=user_id,
        )
        await self.conversations.append(
            conversation_id,
            ConversationMessage(
                messageId=result.messageId,
                role="assistant",
                content=result.answer,
                language=value.language,
                citations=result.citations,
                traceId=result.traceId,
            ),
            organization_id=organization_id,
            user_id=user_id,
        )

    def describe(self) -> dict[str, Any]:
        return {
            "strategy": "conversational-hybrid-rag-v1",
            "languages": ["en", "bn"],
            "capabilities": [
                "crop_cultivation",
                "fertilizer",
                "pest_guidance",
                "plant_disease_guidance",
                "irrigation",
                "soil_management",
                "harvest_planning",
                "agricultural_inputs",
                "market_information",
                "general_agriculture",
            ],
            "safetyPolicy": self.safety.describe(),
            "conversationBackend": self.conversations.backend_name,
            "advisoryOnly": True,
        }


def validate_answer_citations(
    answer: str,
    evidence: list[EvidenceChunk],
) -> tuple[str, dict[str, Any]]:
    """Strip unsupported URLs/labels and report what was removed."""
    allowed_urls = {item.citation.sourceUrl for item in evidence if item.citation.sourceUrl}
    allowed_ids = {item.chunkId for item in evidence}
    found_urls = URL_PATTERN.findall(answer)
    removed_urls = [url for url in found_urls if url not in allowed_urls]
    found_labels = CITATION_LABEL_PATTERN.findall(answer)
    cleaned = sanitize_answer(answer, evidence)
    accepted_ids = sorted(chunk_id for chunk_id in allowed_ids if chunk_id in cleaned)
    return cleaned, {
        "allowedChunkIds": sorted(allowed_ids),
        "acceptedChunkIds": accepted_ids,
        "removedUnverifiedUrls": len(removed_urls),
        "removedCitationLabels": len(found_labels),
        "citationEligibleSources": len({item.documentId for item in evidence}),
    }


def build_claims(
    answer: str,
    evidence: list[EvidenceChunk],
    *,
    understanding: QueryUnderstanding,
    language: str,
) -> tuple[list[AssistantClaim], list[AssistantClaim]]:
    """Derives structured facts/predictions only from supplied evidence."""
    if not evidence:
        return [], []
    allowed_ids = {item.chunkId for item in evidence}
    by_id = {item.chunkId: item for item in evidence}
    facts: list[AssistantClaim] = []
    predictions: list[AssistantClaim] = []

    for match in LABELLED_CLAIM_PATTERN.finditer(answer):
        kind = match.group(1).lower()
        text = sanitize_answer(match.group(2).strip(), evidence)
        if not text:
            continue
        referenced = [
            candidate
            for candidate in re.findall(r"\[([^\]]+)\]", match.group(2))
            if candidate in allowed_ids
        ]
        if not referenced:
            if kind == "fact":
                continue
            referenced = [evidence[0].chunkId]
        items = [by_id[chunk_id] for chunk_id in referenced if chunk_id in by_id]
        claim = AssistantClaim(
            kind="established_fact" if kind == "fact" else "prediction",
            text=text,
            status="source_supported" if kind == "fact" else "uncertain",
            sourceChunkIds=[item.chunkId for item in items],
            sourceDocumentIds=[item.documentId for item in items],
            relevanceScore=max((item.score for item in items), default=0.0),
            asOf=items[0].citation.publishedAt if items else "",
        )
        if claim.kind == "established_fact":
            facts.append(claim)
        else:
            predictions.append(claim)

    if not facts:
        for item in evidence[:5]:
            facts.append(
                AssistantClaim(
                    kind="established_fact",
                    text=sanitize_answer(item.citation.excerpt or item.text, evidence),
                    status="source_supported",
                    sourceChunkIds=[item.chunkId],
                    sourceDocumentIds=[item.documentId],
                    relevanceScore=item.score,
                    asOf=item.citation.publishedAt,
                )
            )

    wants_prediction = (
        understanding.intent == "market"
        or any(term in understanding.originalQuery.lower() for term in PREDICTION_TERMS)
    )
    if wants_prediction and not predictions:
        top = evidence[0]
        text = (
            "Forecast-related guidance is an estimate, not a guaranteed outcome: "
            f"{top.citation.excerpt[:300]}"
            if language != "bn"
            else f"পূর্বাভাসমূলক পরামর্শ অনুমানমাত্র, নিশ্চিত ফলাফল নয়: {top.citation.excerpt[:300]}"
        )
        predictions.append(
            AssistantClaim(
                kind="prediction",
                text=sanitize_answer(text, evidence),
                status="uncertain",
                sourceChunkIds=[top.chunkId],
                sourceDocumentIds=[top.documentId],
                relevanceScore=top.score,
                asOf=top.citation.publishedAt,
            )
        )
    return facts, predictions

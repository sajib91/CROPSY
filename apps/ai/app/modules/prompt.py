from string import Formatter
from typing import Any

from pydantic import BaseModel, Field

from app.errors import ConfigurationError

ASK_SYSTEM_EN = (
    "You are CROPSY's agricultural advisory assistant. Answer only from the supplied "
    "VERIFIED EVIDENCE. If the evidence is insufficient, say so explicitly. Never invent "
    "citations, studies, agencies, dosages, or URLs. State that output is advisory and "
    "recommend local agronomist verification."
)
ASK_SYSTEM_BN = (
    "আপনি CROPSY-এর কৃষি পরামর্শ সহকারী। শুধুমাত্র প্রদত্ত যাচাইকৃত প্রমাণের ভিত্তিতে "
    "উত্তর দিন। প্রমাণ অপর্যাপ্ত হলে স্পষ্টভাবে জানান। কখনো শিক্ষাগত উদ্ধৃতি, সংস্থা, "
    "মাত্রা বা লিংক তৈরি করবেন না। এটি শুধু পরামর্শ এবং স্থানীয় কৃষি বিশেষজ্ঞের "
    "যাচাই প্রয়োজন বলে উল্লেখ করুন।"
)

ASSISTANT_SYSTEM_EN = (
    "You are the CROPSY AI Agricultural Assistant. Use only the supplied VERIFIED "
    "EVIDENCE and prior conversation turns. Separate established facts from predictions: "
    "prefix fact lines with [FACT] and forecast or outlook lines with [PREDICTION]. "
    "Never present an uncertain pest or disease diagnosis as confirmed. For pesticides, "
    "fertilizers, or chemicals, follow the supplied safety notes, prioritize verified local "
    "guidance, and never invent dosages or regulations. If evidence is insufficient, say so "
    "explicitly. Output is advisory only."
)

ASSISTANT_SYSTEM_BN = (
    "আপনি CROPSY কৃষি সহকারী। শুধুমাত্র প্রদত্ত যাচাইকৃত প্রমাণ ও আগের কথোপকথন ব্যবহার "
    "করুন। সুপ্রতিষ্ঠিত তথ্য ও পূর্বাভাস আলাদা করুন: তথ্যের লাইন [FACT] এবং পূর্বাভাসের "
    "লাইন [PREDICTION] দিয়ে শুরু করুন। অনিশ্চিত কীট বা রোগ নির্ণয়কে নিশ্চিত বলে উপস্থাপন "
    "করবেন না। কীটনাশক, সার বা রাসায়নিকের ক্ষেত্রে প্রদত্ত নিরাপত্তা নির্দেশনা মানুন, "
    "যাচাইকৃত স্থানীয় তথ্য অগ্রাধিকার দিন এবং মাত্রা বা বিধি তৈরি করবেন না। প্রমাণ "
    "অপর্যাপ্ত হলে স্পষ্টভাবে জানান। এটি শুধু পরামর্শ।"
)


class PromptTemplate(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    version: str = Field(default="1.0.0", max_length=50)
    language: str = Field(default="en", max_length=10)
    system: str = Field(min_length=1)
    userTemplate: str = Field(min_length=1)


class PromptManager:
    def __init__(self) -> None:
        self._templates: dict[str, PromptTemplate] = {}
        self._load_defaults()

    def _load_defaults(self) -> None:
        templates = [
            PromptTemplate(
                key="ask.en",
                system=ASK_SYSTEM_EN,
                userTemplate=(
                    "Question: {question}\nContext: {context}\n"
                    "VERIFIED EVIDENCE:\n{evidence}\n"
                    "Write a concise advisory answer. Cite only supplied source ids."
                ),
            ),
            PromptTemplate(
                key="ask.bn",
                language="bn",
                system=ASK_SYSTEM_BN,
                userTemplate=(
                    "প্রশ্ন: {question}\nপ্রসঙ্গ: {context}\n"
                    "যাচাইকৃত প্রমাণ:\n{evidence}\n"
                    "সংক্ষিপ্ত পরামর্শ দিন। শুধু প্রদত্ত উৎস আইডি উল্লেখ করুন।"
                ),
            ),
            PromptTemplate(
                key="assistant.en",
                system=ASSISTANT_SYSTEM_EN,
                userTemplate=(
                    "Resolved question: {resolvedQuery}\n"
                    "Original question: {question}\n"
                    "Conversation history: {history}\n"
                    "Safety notes: {safety}\n"
                    "VERIFIED EVIDENCE:\n{evidence}\n"
                    "Answer with [FACT] and, where relevant, [PREDICTION] lines. "
                    "Cite only supplied source ids."
                ),
            ),
            PromptTemplate(
                key="assistant.bn",
                language="bn",
                system=ASSISTANT_SYSTEM_BN,
                userTemplate=(
                    "সমাধানকৃত প্রশ্ন: {resolvedQuery}\n"
                    "মূল প্রশ্ন: {question}\n"
                    "কথোপকথন ইতিহাস: {history}\n"
                    "নিরাপত্তা নির্দেশনা: {safety}\n"
                    "যাচাইকৃত প্রমাণ:\n{evidence}\n"
                    "[FACT] এবং প্রয়োজনে [PREDICTION] লাইন ব্যবহার করে উত্তর দিন। "
                    "শুধু প্রদত্ত উৎস আইডি উল্লেখ করুন।"
                ),
            ),
            PromptTemplate(
                key="recommend.en",
                system=ASK_SYSTEM_EN,
                userTemplate=(
                    "Recommendation type: {kind}\nContext: {context}\n"
                    "VERIFIED EVIDENCE:\n{evidence}\n"
                    "Return practical steps and cautions grounded only in this evidence."
                ),
            ),
            PromptTemplate(
                key="recommend.bn",
                language="bn",
                system=ASK_SYSTEM_BN,
                userTemplate=(
                    "সুপারিশের ধরন: {kind}\nপ্রসঙ্গ: {context}\n"
                    "যাচাইকৃত প্রমাণ:\n{evidence}\n"
                    "শুধু এই প্রমাণের ভিত্তিতে ব্যবহারিক পদক্ষেপ ও সতর্কতা দিন।"
                ),
            ),
        ]
        for template in templates:
            self._templates[template.key] = template

    def register(self, template: PromptTemplate) -> None:
        self._templates[template.key] = template

    def render(
        self,
        key: str,
        values: dict[str, Any],
        *,
        version: str | None = None,
    ) -> tuple[str, str, str]:
        template = self._templates.get(key)
        if template is None:
            raise ConfigurationError(f"Unknown prompt template '{key}'.")
        if version is not None and version != template.version:
            raise ConfigurationError(f"Prompt template '{key}' version mismatch.")
        required = {
            field
            for _, field, _, _ in Formatter().parse(template.userTemplate)
            if field
        }
        missing = sorted(required - set(values))
        if missing:
            raise ConfigurationError(
                f"Prompt template '{key}' is missing values: {', '.join(missing)}."
            )
        return (
            template.system,
            template.userTemplate.format(**values),
            template.version,
        )

    def describe(self) -> list[dict[str, Any]]:
        return [
            {
                "key": template.key,
                "version": template.version,
                "language": template.language,
            }
            for template in sorted(self._templates.values(), key=lambda item: item.key)
        ]

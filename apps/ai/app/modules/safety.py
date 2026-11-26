"""Conservative safety policy for agricultural chemical and diagnosis guidance."""

from typing import Any

from pydantic import BaseModel, Field

from app.models import EvidenceChunk


class SafetyNote(BaseModel):
    category: str = Field(min_length=1, max_length=100)
    severity: str = Field(default="warning", pattern="^(info|warning|caution)$")
    message: str = Field(min_length=1, max_length=1200)


EN_MESSAGES = {
    "pesticide": (
        "Use only pesticides registered for this crop and pest in your jurisdiction. "
        "Follow the approved label, required protective equipment, application interval, "
        "and current local regulations. Do not infer a dosage from this advisory alone."
    ),
    "fertilizer": (
        "Base nutrient applications on a recent soil test and locally verified guidance. "
        "Do not use an unverified dosage; check product registration and current local rules."
    ),
    "chemical": (
        "Chemical handling requires label-compliant protective equipment, storage, disposal, "
        "and observation of applicable regulations. Verify with a local agronomist before use."
    ),
    "diagnosis": (
        "Pest or disease diagnosis from text is uncertain. This is not a confirmed diagnosis; "
        "have a local agronomist or extension service inspect the crop before treatment."
    ),
    "local_evidence": (
        "No evidence published for the requested locality was retrieved. National or regional "
        "guidance may not apply locally; verify with a local authority."
    ),
}

BN_MESSAGES = {
    "pesticide": (
        "শুধুমাত্র আপনার অঞ্চলে এই ফসল ও কীটের জন্য নিবন্ধিত কীটনাশক ব্যবহার করুন। "
        "অনুমোদিত লেবেল, প্রয়োজনীয় সুরক্ষা সরঞ্জাম, প্রয়োগ সময় এবং বর্তমান স্থানীয় "
        "বিধি মেনে চলুন। এই পরামর্শ থেকে মাত্রা নির্ধারণ করবেন না।"
    ),
    "fertilizer": (
        "সাম্প্রতিক মাটি পরীক্ষা ও স্থানীয় যাচাইকৃত নির্দেশিকার ভিত্তিতে সার প্রয়োগ করুন। "
        "অযাচাইকৃত মাত্রা ব্যবহার করবেন না; পণ্য নিবন্ধন ও বর্তমান স্থানীয় বিধি যাচাই করুন।"
    ),
    "chemical": (
        "রাসায়নিক ব্যবহারের জন্য লেবেল অনুযায়ী সুরক্ষা সরঞ্জাম, সংরক্ষণ, বর্জ্য ব্যবস্থাপনা "
        "ও প্রযোজ্য বিধি মানতে হবে। ব্যবহারের আগে স্থানীয় কৃষি বিশেষজ্ঞের সাথে যাচাই করুন।"
    ),
    "diagnosis": (
        "পাঠ্য থেকে কীট বা রোগ নির্ণয় অনিশ্চিত। এটি নিশ্চিত নির্ণয় নয়; চিকিৎসার আগে "
        "স্থানীয় কৃষি বিশেষজ্ঞ বা সম্প্রসারণ পরিষেবা দ্বারা ফসল পরিদর্শন করান।"
    ),
    "local_evidence": (
        "আপনার নির্দিষ্ট এলাকার জন্য প্রকাশিত প্রমাণ পাওয়া যায়নি। জাতীয় বা আঞ্চলিক "
        "নির্দেশিকা স্থানীয়ভাবে প্রযোজ্য নাও হতে পারে; স্থানীয় কর্তৃপক্ষের সাথে যাচাই করুন।"
    ),
}


class SafetyPolicyService:
    """Adds mandatory caution notes without changing or inventing source content."""

    def evaluate(
        self,
        *,
        categories: list[str],
        evidence: list[EvidenceChunk],
        language: str,
        region: str = "",
        default_jurisdiction: str = "Bangladesh",
    ) -> list[SafetyNote]:
        messages = BN_MESSAGES if language == "bn" else EN_MESSAGES
        notes: list[SafetyNote] = []
        seen: set[str] = set()
        for category in categories:
            if category not in messages or category in seen:
                continue
            seen.add(category)
            notes.append(
                SafetyNote(
                    category=category,
                    severity="caution" if category == "diagnosis" else "warning",
                    message=messages[category],
                )
            )
        if categories and region.strip():
            needle = region.strip().lower()
            jurisdictions = " ".join(
                item.citation.jurisdiction.lower() for item in evidence
            )
            if needle not in jurisdictions:
                notes.append(
                    SafetyNote(
                        category="local_evidence",
                        severity="warning",
                        message=messages["local_evidence"],
                    )
                )
        elif categories and evidence and not any(
            item.citation.jurisdiction for item in evidence
        ):
            default_needle = default_jurisdiction.lower()
            if not any(
                default_needle in item.citation.jurisdiction.lower()
                for item in evidence
            ):
                notes.append(
                    SafetyNote(
                        category="local_evidence",
                        severity="warning",
                        message=messages["local_evidence"],
                    )
                )
        return notes

    @staticmethod
    def describe() -> dict[str, Any]:
        return {
            "strategy": "deterministic-safety-policy-v1",
            "categories": sorted(EN_MESSAGES),
            "enforcement": "advisory-only; no confirmed diagnosis or unverified dosage",
        }

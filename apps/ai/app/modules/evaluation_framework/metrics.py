"""Deterministic metric computation from observed evaluation-run outputs.

Every metric here is computed from a value produced during the run. There are no
default, seeded, or estimated scores.
"""

from __future__ import annotations

import re
from typing import Any

from app.modules.evaluation_framework.models import CaseResult, EvaluationCase
from app.modules.retrieval_evaluation import (
    RelevanceJudgment,
    RetrievalEvaluationService,
)

BENGALI_RANGE = re.compile(r"[\u0980-\u09ff]")
LATIN_RANGE = re.compile(r"[A-Za-z]")
LOWER_IS_BETTER = {
    "latencyMs",
    "tokensPerRequest",
    "costUsdPerRequest",
    "unverifiedCitationRate",
}


def _lower(value: Any) -> str:
    return str(value or "").casefold()


def _answer(observed: dict[str, Any]) -> str:
    return str(observed.get("answer") or "")


def _citations(observed: dict[str, Any]) -> list[dict[str, Any]]:
    raw = observed.get("citations") or []
    return [item for item in raw if isinstance(item, dict)]


def _citation_ids(item: dict[str, Any]) -> set[str]:
    return {
        str(item[key])
        for key in ("assetId", "documentId", "chunkId", "sourceId")
        if item.get(key)
    }


def score_retrieval(case: EvaluationCase, observed: dict[str, Any]) -> CaseResult:
    ranked = [str(item) for item in (observed.get("rankedIds") or [])]
    expected = case.expected.get("relevantDocumentIds") or []
    top_k = int(case.input.get("topK") or 5)
    metrics = RetrievalEvaluationService.score_query(
        RelevanceJudgment(
            queryId=case.caseId,
            query=str(case.input.get("query") or ""),
            language=str(case.input.get("language") or "en"),
            relevantDocumentIds=[str(item) for item in expected],
        ),
        ranked,
        top_k=top_k,
    )
    min_recall = float(case.expected.get("minRecallAtK") or 0.0)
    limitations = ["Document-level lexical ranking judgment; no semantic relevance is inferred."]
    return CaseResult(
        caseId=case.caseId,
        category=case.category,
        passed=metrics.recallAtK >= min_recall,
        metrics={
            "recallAtK": metrics.recallAtK,
            "precisionAtK": metrics.precisionAtK,
            "mrr": metrics.mrr,
            "ndcgAtK": metrics.ndcgAtK,
        },
        observed={"rankedIds": ranked[:top_k], "relevantIds": list(expected)},
        limitations=limitations,
    )


def score_multimodal(case: EvaluationCase, observed: dict[str, Any]) -> CaseResult:
    ranked = [str(item) for item in (observed.get("rankedIds") or [])]
    expected = [str(item) for item in (case.expected.get("relevantAssetIds") or [])]
    top_k = int(case.input.get("topK") or 5)
    hits = len(set(expected) & set(ranked[:top_k]))
    recall = hits / min(len(expected), top_k) if expected else 0.0
    first_rank = next(
        (rank for rank, item in enumerate(ranked[:top_k], start=1) if item in set(expected)),
        None,
    )
    mrr = (1.0 / first_rank) if first_rank else 0.0
    min_recall = float(case.expected.get("minRecallAtK") or 0.0)
    return CaseResult(
        caseId=case.caseId,
        category=case.category,
        passed=recall >= min_recall,
        metrics={"recallAtK": round(recall, 6), "mrr": round(mrr, 6)},
        observed={"rankedIds": ranked[:top_k], "relevantAssetIds": expected},
        limitations=[
            "Visual matches use deterministic signatures; semantic similarity is not claimed."
        ],
    )


def score_answer_relevance(case: EvaluationCase, observed: dict[str, Any]) -> CaseResult:
    answer = _lower(_answer(observed))
    required = [str(item) for item in (case.expected.get("requiredTerms") or [])]
    forbidden = [str(item) for item in (case.expected.get("forbiddenTerms") or [])]
    coverage = (
        sum(1 for term in required if _lower(term) in answer) / len(required)
        if required
        else 0.0
    )
    no_forbidden = 1.0 if not any(_lower(term) in answer for term in forbidden) else 0.0
    minimum = float(case.expected.get("minCoverage") or 0.0)
    return CaseResult(
        caseId=case.caseId,
        category=case.category,
        passed=coverage >= minimum and no_forbidden == 1.0,
        metrics={
            "answerTermCoverage": round(coverage, 6),
            "noForbiddenClaims": no_forbidden,
        },
        observed={"answerChars": len(answer), "requiredTermCount": len(required)},
        limitations=["Lexical term coverage is not a human or semantic relevance judgment."],
    )


def score_factual_correctness(case: EvaluationCase, observed: dict[str, Any]) -> CaseResult:
    answer = _lower(_answer(observed))
    facts = [str(item) for item in (case.expected.get("expectedFacts") or [])]
    contradictions = [str(item) for item in (case.expected.get("contradictionTerms") or [])]
    coverage = (
        sum(1 for fact in facts if _lower(fact) in answer) / len(facts) if facts else 0.0
    )
    no_contradiction = (
        1.0 if not any(_lower(term) in answer for term in contradictions) else 0.0
    )
    minimum = float(case.expected.get("minFactCoverage") or 0.0)
    return CaseResult(
        caseId=case.caseId,
        category=case.category,
        passed=coverage >= minimum and no_contradiction == 1.0,
        metrics={
            "factTermCoverage": round(coverage, 6),
            "noContradictoryClaims": no_contradiction,
        },
        observed={"checkedFacts": len(facts), "checkedContradictions": len(contradictions)},
        limitations=[
            "String matching checks fixture facts only; it is not scientific validation."
        ],
    )


def score_citation_correctness(case: EvaluationCase, observed: dict[str, Any]) -> CaseResult:
    citations = _citations(observed)
    expected = {str(item) for item in (case.expected.get("expectedCitationIds") or [])}
    found: set[str] = set()
    eligible = 0
    for item in citations:
        found.update(_citation_ids(item))
        if item.get("sourceUrl") and item.get("licenseUrl") and item.get("licenseCode"):
            eligible += 1
    hit_rate = len(expected & found) / len(expected) if expected else 0.0
    eligibility_rate = eligible / len(citations) if citations else 0.0
    unverified_rate = 1.0 - eligibility_rate
    require_eligible = bool(case.expected.get("requireEligibleCitation"))
    passed = hit_rate == 1.0 and (not require_eligible or eligibility_rate == 1.0)
    return CaseResult(
        caseId=case.caseId,
        category=case.category,
        passed=passed,
        metrics={
            "expectedCitationHitRate": round(hit_rate, 6),
            "citationEligibilityRate": round(eligibility_rate, 6),
            "unverifiedCitationRate": round(unverified_rate, 6),
        },
        observed={"citationCount": len(citations), "expectedIds": sorted(expected)},
        limitations=["Eligibility requires source URL, license URL, and license code."],
    )


def score_groundedness(case: EvaluationCase, observed: dict[str, Any]) -> CaseResult:
    facts = [str(item) for item in (case.expected.get("expectedFacts") or [])]
    evidence = [
        str(item.get("text") or item.get("excerpt") or "")
        for item in (observed.get("evidence") or [])
        if isinstance(item, dict)
    ]
    evidence_text = " \n ".join(evidence).casefold()
    answer = _lower(_answer(observed))
    support = (
        sum(1 for fact in facts if _lower(fact) in evidence_text) / len(facts)
        if facts
        else 0.0
    )
    answer_facts = [fact for fact in facts if _lower(fact) in answer]
    answer_support = (
        sum(1 for fact in answer_facts if _lower(fact) in evidence_text) / len(answer_facts)
        if answer_facts
        else 0.0
    )
    minimum = float(case.expected.get("minSupportRate") or 0.0)
    require_evidence = bool(case.expected.get("requireEvidenceForAnswer"))
    passed = (
        support >= minimum
        and (not require_evidence or bool(evidence_text.strip()))
        and (not answer_facts or answer_support >= minimum)
    )
    return CaseResult(
        caseId=case.caseId,
        category=case.category,
        passed=passed,
        metrics={
            "evidenceFactSupport": round(support, 6),
            "answerFactSupport": round(answer_support, 6),
        },
        observed={"evidenceChunks": len(evidence), "checkedFacts": len(facts)},
        limitations=["Support is determined by fixture-term containment, not entailment."],
    )


def score_language_quality(case: EvaluationCase, observed: dict[str, Any]) -> CaseResult:
    answer = _answer(observed)
    expected_language = str(case.expected.get("language") or case.input.get("language") or "en")
    bengali = len(BENGALI_RANGE.findall(answer))
    latin = len(LATIN_RANGE.findall(answer))
    letters = bengali + latin
    ratio = (bengali / letters if expected_language == "bn" else latin / letters) if letters else 0.0
    markers = [str(item) for item in (case.expected.get("forbiddenMarkers") or [])]
    no_markers = 1.0 if not any(marker in answer for marker in markers) else 0.0
    minimum_ratio = float(case.expected.get("minScriptRatio") or 0.0)
    minimum_length = int(case.expected.get("minLength") or 0)
    length_ok = 1.0 if len(answer.strip()) >= minimum_length else 0.0
    return CaseResult(
        caseId=case.caseId,
        category=case.category,
        passed=ratio >= minimum_ratio and no_markers == 1.0 and length_ok == 1.0,
        metrics={
            "scriptRatio": round(ratio, 6),
            "noInternalMarkers": no_markers,
            "lengthSatisfied": length_ok,
        },
        observed={
            "language": expected_language,
            "bengaliCharacters": bengali,
            "latinCharacters": latin,
            "answerChars": len(answer),
        },
        limitations=["Script ratio and marker checks do not assess grammar or fluency."],
    )


def score_agent_reliability(case: EvaluationCase, observed: dict[str, Any]) -> CaseResult:
    status = str(observed.get("status") or "")
    allowed = {str(item) for item in (case.expected.get("expectedStatuses") or [])}
    steps = [item for item in (observed.get("executionTrace") or []) if isinstance(item, dict)]
    tool_calls = [item for item in (observed.get("toolCalls") or []) if isinstance(item, dict)]
    errors = [
        str(item)
        for item in (observed.get("errors") or [])
        if str(item).strip()
    ]
    errors.extend(
        str(step.get("error"))
        for step in steps
        if step.get("status") == "error" and step.get("error")
    )
    min_steps = int(case.expected.get("minTraceSteps") or 0)
    max_tools = int(case.expected.get("maxToolCalls") or 0)
    max_errors = int(case.expected.get("maxErrors") or 0)
    status_ok = 1.0 if status in allowed else 0.0
    trace_ok = 1.0 if len(steps) >= min_steps else 0.0
    budget_ok = 1.0 if len(tool_calls) <= max_tools else 0.0
    error_free = 1.0 if len(errors) <= max_errors else 0.0
    return CaseResult(
        caseId=case.caseId,
        category=case.category,
        passed=all(value == 1.0 for value in (status_ok, trace_ok, budget_ok, error_free)),
        metrics={
            "statusMatch": status_ok,
            "traceCompleteness": trace_ok,
            "toolBudgetRespected": budget_ok,
            "errorFree": error_free,
        },
        observed={
            "status": status,
            "traceSteps": len(steps),
            "toolCalls": len(tool_calls),
            "errors": errors[:10],
        },
        limitations=["Reliability is measured from the recorded run, not from estimated success."],
    )


def score_performance(case: EvaluationCase, observed: dict[str, Any]) -> CaseResult:
    usage = observed.get("usage") if isinstance(observed.get("usage"), dict) else {}
    latency = float(observed.get("latencyMs") or 0.0)
    tokens = int(usage.get("totalTokens") or 0)
    cost = float(usage.get("estimatedCostUsd") or 0.0)
    max_latency = float(case.expected.get("maxLatencyMs") or 0.0)
    require_usage = bool(case.expected.get("requireUsageReported"))
    max_cost = float(case.expected.get("maxCostUsdPerRequest") or 0.0)
    usage_ok = 1.0 if (not require_usage or bool(usage)) else 0.0
    passed = latency <= max_latency and usage_ok == 1.0 and cost <= max_cost
    return CaseResult(
        caseId=case.caseId,
        category=case.category,
        passed=passed,
        metrics={
            "latencyMs": round(latency, 3),
            "tokensPerRequest": tokens,
            "costUsdPerRequest": round(cost, 6),
            "thresholdSatisfied": 1.0 if passed else 0.0,
        },
        observed={
            "usageReported": bool(usage),
            "provider": str(usage.get("provider") or "unknown"),
            "model": str(usage.get("model") or "unknown"),
        },
        limitations=[
            "Cost is provider-reported only; a zero value may mean the provider did not report cost.",
            "Latency is wall-clock time measured around this evaluation callback.",
        ],
    )


SCORERS = {
    "retrieval": score_retrieval,
    "answer_relevance": score_answer_relevance,
    "factual_correctness": score_factual_correctness,
    "citation_correctness": score_citation_correctness,
    "groundedness": score_groundedness,
    "language_quality": score_language_quality,
    "multimodal_retrieval": score_multimodal,
    "agent_reliability": score_agent_reliability,
    "performance": score_performance,
}


__all__ = [
    "LOWER_IS_BETTER",
    "SCORERS",
    "score_agent_reliability",
    "score_answer_relevance",
    "score_citation_correctness",
    "score_factual_correctness",
    "score_groundedness",
    "score_language_quality",
    "score_multimodal",
    "score_performance",
    "score_retrieval",
]

"""Separate reproducible datasets for text, image, and multimodal QA evaluation."""

from __future__ import annotations

import inspect
import json
from pathlib import Path
from typing import Any, Awaitable, Callable

from pydantic import BaseModel, Field

from app.models import utc_now
from app.modules.retrieval_evaluation import RetrievalEvaluationService


class ImageRelevanceJudgment(BaseModel):
    queryId: str = Field(min_length=1, max_length=128)
    query: str = Field(min_length=1, max_length=4000)
    imageDescription: str = Field(default="", max_length=1000)
    relevantAssetIds: list[str] = Field(default_factory=list, min_length=1)
    notes: str = Field(default="", max_length=500)


class ImageRetrievalDataset(BaseModel):
    datasetId: str = Field(min_length=1, max_length=128)
    version: str = Field(min_length=1, max_length=50)
    queries: list[ImageRelevanceJudgment] = Field(default_factory=list, min_length=1)


class MultimodalQACase(BaseModel):
    caseId: str = Field(min_length=1, max_length=128)
    question: str = Field(min_length=1, max_length=4000)
    expectedAssetIds: list[str] = Field(default_factory=list, min_length=1)
    requiredTerms: list[str] = Field(default_factory=list, max_length=20)
    forbiddenTerms: list[str] = Field(default_factory=list, max_length=20)
    requiresVisualDisclaimer: bool = False
    notes: str = Field(default="", max_length=500)


class MultimodalQADataset(BaseModel):
    datasetId: str = Field(min_length=1, max_length=128)
    version: str = Field(min_length=1, max_length=50)
    cases: list[MultimodalQACase] = Field(default_factory=list, min_length=1)


class EvaluationSummary(BaseModel):
    datasetId: str
    version: str
    evaluatedAt: str = Field(default_factory=lambda: utc_now().isoformat())
    caseCount: int
    metrics: dict[str, float]
    details: list[dict[str, Any]] = Field(default_factory=list)


ImageRetrieveFn = Callable[..., Awaitable[list[str]]]
MultimodalAskFn = Callable[..., Awaitable[dict[str, Any]]]


def _load(path: str | Path) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Evaluation dataset must be a JSON object.")
    return payload


def _recall(ranked: list[str], expected: list[str], k: int) -> float:
    if not expected:
        return 0.0
    hits = len(set(expected) & set(ranked[:k]))
    return hits / min(len(expected), k)


def _mrr(ranked: list[str], expected: list[str]) -> float:
    for index, item in enumerate(ranked, start=1):
        if item in expected:
            return 1.0 / index
    return 0.0


async def _call(fn: Callable[..., Any], **kwargs: Any) -> Any:
    signature = inspect.signature(fn)
    accepted = {
        key: value for key, value in kwargs.items() if key in signature.parameters
    }
    result = fn(**accepted)
    if inspect.isawaitable(result):
        return await result
    return result


class MultimodalEvaluationService:
    def __init__(self, retrieval_evaluation: RetrievalEvaluationService | None = None) -> None:
        self.retrieval_evaluation = retrieval_evaluation or RetrievalEvaluationService()

    async def evaluate_text_retrieval(
        self,
        path: str | Path,
        retrieve_fn: Callable[[str, str], Awaitable[list[str]]],
        *,
        top_k: int = 5,
    ) -> EvaluationSummary:
        result = await self.retrieval_evaluation.evaluate_file(path, retrieve_fn, top_k=top_k)
        return EvaluationSummary(
            datasetId=result.datasetId,
            version=result.datasetVersion,
            caseCount=result.queryCount,
            metrics={key: float(value) for key, value in result.metrics.items()},
            details=[item.model_dump(mode="json") for item in result.perQuery],
        )

    async def evaluate_image_retrieval(
        self,
        path: str | Path,
        retrieve_fn: ImageRetrieveFn,
        *,
        top_k: int = 5,
    ) -> EvaluationSummary:
        dataset = ImageRetrievalDataset(**_load(path))
        details: list[dict[str, Any]] = []
        recalls: list[float] = []
        reciprocal_ranks: list[float] = []
        for judgment in dataset.queries:
            ranked = list(await _call(retrieve_fn, query=judgment.query, language="en", top_k=top_k))
            recall = _recall(ranked, judgment.relevantAssetIds, top_k)
            mrr = _mrr(ranked, judgment.relevantAssetIds)
            recalls.append(recall)
            reciprocal_ranks.append(mrr)
            details.append(
                {
                    "queryId": judgment.queryId,
                    "rankedAssetIds": ranked[:top_k],
                    "relevantAssetIds": judgment.relevantAssetIds,
                    "recallAtK": round(recall, 4),
                    "mrr": round(mrr, 4),
                }
            )
        count = len(dataset.queries)
        return EvaluationSummary(
            datasetId=dataset.datasetId,
            version=dataset.version,
            caseCount=count,
            metrics={
                "recallAtK": round(sum(recalls) / count, 4),
                "mrr": round(sum(reciprocal_ranks) / count, 4),
            },
            details=details,
        )

    async def evaluate_multimodal_qa(
        self,
        path: str | Path,
        ask_fn: MultimodalAskFn,
        *,
        top_k: int = 5,
    ) -> EvaluationSummary:
        dataset = MultimodalQADataset(**_load(path))
        details: list[dict[str, Any]] = []
        citation_hits: list[float] = []
        required_term_rates: list[float] = []
        forbidden_term_rates: list[float] = []
        disclaimer_rates: list[float] = []
        for case in dataset.cases:
            response = await _call(
                ask_fn,
                question=case.question,
                query=case.question,
                language="en",
                top_k=top_k,
            )
            if not isinstance(response, dict):
                response = {}
            answer = str(response.get("answer", ""))
            citations = response.get("citations") or []
            source_ids = {
                str(item.get("assetId") or item.get("documentId") or item.get("chunkId"))
                for item in citations
                if isinstance(item, dict)
            }
            source_ids.update(
                str(item) for item in (response.get("assetIds") or []) if isinstance(item, str)
            )
            citation_hit = (
                1.0 if set(case.expectedAssetIds) & source_ids else 0.0
            )
            required = (
                1.0
                if all(term.casefold() in answer.casefold() for term in case.requiredTerms)
                else 0.0
            )
            forbidden = (
                1.0
                if not any(term.casefold() in answer.casefold() for term in case.forbiddenTerms)
                else 0.0
            )
            disclaimer = (
                1.0
                if not case.requiresVisualDisclaimer
                or (
                    "not a confirmed" in answer.casefold()
                    or "advisory" in answer.casefold()
                )
                else 0.0
            )
            citation_hits.append(citation_hit)
            required_term_rates.append(required)
            forbidden_term_rates.append(forbidden)
            disclaimer_rates.append(disclaimer)
            details.append(
                {
                    "caseId": case.caseId,
                    "citationHit": citation_hit,
                    "requiredTermsSatisfied": required,
                    "noForbiddenClaims": forbidden,
                    "disclaimerSatisfied": disclaimer,
                }
            )
        count = len(dataset.cases)
        return EvaluationSummary(
            datasetId=dataset.datasetId,
            version=dataset.version,
            caseCount=count,
            metrics={
                "citationAttributionRate": round(sum(citation_hits) / count, 4),
                "requiredTermRate": round(sum(required_term_rates) / count, 4),
                "noForbiddenClaimRate": round(sum(forbidden_term_rates) / count, 4),
                "disclaimerRate": round(sum(disclaimer_rates) / count, 4),
            },
            details=details,
        )

    def describe(self) -> dict[str, Any]:
        return {
            "datasets": [
                "text-retrieval-v1.json",
                "image-retrieval-v1.json",
                "multimodal-qa-v1.json",
            ],
            "metrics": [
                "recallAtK",
                "mrr",
                "citationAttributionRate",
                "noForbiddenClaimRate",
                "disclaimerRate",
            ],
        }


__all__ = [
    "EvaluationSummary",
    "ImageRetrievalDataset",
    "MultimodalEvaluationService",
    "MultimodalQADataset",
]

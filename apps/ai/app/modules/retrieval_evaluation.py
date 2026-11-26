"""Offline retrieval evaluation with explicit, reproducible ranking metrics."""

import inspect
import json
import math
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable

from pydantic import BaseModel, Field

from app.models import utc_now

RetrieveFn = Callable[[str, str], Any]


class RelevanceJudgment(BaseModel):
    queryId: str = Field(min_length=1, max_length=128)
    query: str = Field(min_length=1, max_length=4000)
    language: str = Field(default="en", max_length=10)
    relevantDocumentIds: list[str] = Field(default_factory=list, min_length=1)
    relevantChunkIds: list[str] = Field(default_factory=list)
    notes: str = Field(default="", max_length=500)


class RetrievalDataset(BaseModel):
    datasetId: str = Field(min_length=1, max_length=128)
    version: str = Field(min_length=1, max_length=50)
    queries: list[RelevanceJudgment] = Field(default_factory=list, min_length=1)


class QueryMetrics(BaseModel):
    queryId: str
    precisionAtK: float
    recallAtK: float
    mrr: float
    ndcgAtK: float
    relevantRetrieved: int
    relevantTotal: int
    retrievedDocumentIds: list[str] = Field(default_factory=list)


class RetrievalEvaluationResult(BaseModel):
    datasetId: str
    datasetVersion: str
    topK: int
    evaluatedAt: str
    queryCount: int
    metrics: dict[str, float]
    perQuery: list[QueryMetrics]
    evaluated: bool = True
    accuracyClaimed: bool = False
    limitations: list[str] = Field(default_factory=list)


def load_retrieval_dataset(path: str | Path) -> RetrievalDataset:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return RetrievalDataset(**payload)


async def _resolve(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


class RetrievalEvaluationService:
    """Measures retrieved rankings; it never converts a small test set into an accuracy claim."""

    def metric_names(self) -> list[str]:
        return ["recallAtK", "precisionAtK", "mrr", "ndcgAtK"]

    @staticmethod
    def _dcg(flags: list[bool], k: int) -> float:
        return sum(
            (1.0 if flag else 0.0) / math.log2(rank + 2)
            for rank, flag in enumerate(flags[:k])
        )

    @classmethod
    def score_query(
        cls,
        judgment: RelevanceJudgment,
        retrieved_document_ids: Iterable[str],
        *,
        top_k: int,
    ) -> QueryMetrics:
        ordered: list[str] = []
        for document_id in retrieved_document_ids:
            if document_id not in ordered:
                ordered.append(document_id)
        hits = [document_id in set(judgment.relevantDocumentIds) for document_id in ordered]
        at_k = hits[:top_k]
        relevant_retrieved = sum(1 for hit in at_k if hit)
        relevant_total = len(set(judgment.relevantDocumentIds))
        first_rank = next((rank for rank, hit in enumerate(at_k, start=1) if hit), None)
        ideal = [True] * min(relevant_total, top_k)
        ideal_dcg = cls._dcg(ideal, top_k)
        return QueryMetrics(
            queryId=judgment.queryId,
            precisionAtK=round(relevant_retrieved / top_k, 6),
            recallAtK=(
                round(relevant_retrieved / relevant_total, 6) if relevant_total else 0.0
            ),
            mrr=round(1.0 / first_rank, 6) if first_rank else 0.0,
            ndcgAtK=round(cls._dcg(at_k, top_k) / ideal_dcg, 6) if ideal_dcg else 0.0,
            relevantRetrieved=relevant_retrieved,
            relevantTotal=relevant_total,
            retrievedDocumentIds=ordered[:top_k],
        )

    async def evaluate(
        self,
        judgments: Iterable[RelevanceJudgment],
        retrieve: RetrieveFn,
        *,
        top_k: int,
        dataset_id: str = "ad-hoc",
        dataset_version: str = "unversioned",
        backends: dict[str, str] | None = None,
    ) -> RetrievalEvaluationResult:
        per_query: list[QueryMetrics] = []
        for judgment in judgments:
            retrieved = await _resolve(retrieve(judgment.query, judgment.language))
            document_ids = (
                retrieved
                if isinstance(retrieved, list)
                else [str(item.get("documentId", "")) for item in retrieved]
                if isinstance(retrieved, dict)
                else []
            )
            per_query.append(
                self.score_query(judgment, document_ids, top_k=top_k)
            )
        count = len(per_query)
        metrics = {
            name: (
                round(sum(getattr(item, name) for item in per_query) / count, 6)
                if count
                else 0.0
            )
            for name in self.metric_names()
        }
        limitations = [
            "Binary document-level judgments; chunk-level correctness is not measured.",
            "Metrics apply only to this dataset and the configured retrieval backends.",
            "No production accuracy claim is made without a representative, independently judged dataset.",
        ]
        if backends:
            limitations.append(
                f"Backends evaluated: vector={backends.get('vector', 'unknown')}, "
                f"keyword={backends.get('keyword', 'unknown')}."
            )
        return RetrievalEvaluationResult(
            datasetId=dataset_id,
            datasetVersion=dataset_version,
            topK=top_k,
            evaluatedAt=utc_now().isoformat(),
            queryCount=count,
            metrics=metrics,
            perQuery=per_query,
            accuracyClaimed=False,
            limitations=limitations,
        )

    async def evaluate_file(
        self,
        path: str | Path,
        retrieve: RetrieveFn,
        *,
        top_k: int,
        backends: dict[str, str] | None = None,
    ) -> RetrievalEvaluationResult:
        dataset = load_retrieval_dataset(path)
        return await self.evaluate(
            dataset.queries,
            retrieve,
            top_k=top_k,
            dataset_id=dataset.datasetId,
            dataset_version=dataset.version,
            backends=backends,
        )

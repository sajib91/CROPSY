"""Versioned evaluation datasets loaded from disk; scores are never stored here."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.modules.evaluation_framework.models import EvaluationDataset, EvaluationSuite

DATASET_DIR = Path(__file__).resolve().parents[3] / "evaluation" / "datasets"

SUITE_DATASETS: dict[EvaluationSuite, str] = {
    "retrieval": "eval-retrieval-v1.json",
    "answer_relevance": "eval-answer-relevance-v1.json",
    "factual_correctness": "eval-factual-correctness-v1.json",
    "citation_correctness": "eval-citation-correctness-v1.json",
    "groundedness": "eval-groundedness-v1.json",
    "language_quality": "eval-language-quality-v1.json",
    "multimodal_retrieval": "eval-multimodal-retrieval-v1.json",
    "agent_reliability": "eval-agent-reliability-v1.json",
    "performance": "eval-performance-v1.json",
}


def load_dataset(suite: EvaluationSuite) -> EvaluationDataset:
    filename = SUITE_DATASETS.get(suite)
    if filename is None:
        raise ValueError(f"Unsupported evaluation suite '{suite}'.")
    payload = json.loads((DATASET_DIR / filename).read_text(encoding="utf-8"))
    dataset = EvaluationDataset(**payload)
    if dataset.suite != suite:
        raise ValueError(
            f"Dataset '{dataset.datasetId}' declares suite '{dataset.suite}', expected '{suite}'."
        )
    return dataset


def describe_datasets() -> list[dict[str, Any]]:
    described: list[dict[str, Any]] = []
    for suite, filename in SUITE_DATASETS.items():
        path = DATASET_DIR / filename
        if not path.exists():
            described.append(
                {
                    "suite": suite,
                    "file": filename,
                    "available": False,
                    "reason": "dataset_file_missing",
                }
            )
            continue
        dataset = EvaluationDataset(**json.loads(path.read_text(encoding="utf-8")))
        described.append(
            {
                "suite": suite,
                "file": filename,
                "available": True,
                "datasetId": dataset.datasetId,
                "version": dataset.version,
                "caseCount": len(dataset.cases),
                "languages": sorted(
                    {
                        str(case.input.get("language") or "en")
                        for case in dataset.cases
                    }
                ),
            }
        )
    return described


__all__ = ["DATASET_DIR", "SUITE_DATASETS", "describe_datasets", "load_dataset"]

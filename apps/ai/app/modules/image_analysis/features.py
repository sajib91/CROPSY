"""Deterministic visual descriptors extracted from uploaded image bytes."""

from __future__ import annotations

import importlib.util
from io import BytesIO
from typing import Any

from app.infrastructure.image_embeddings import ImageEmbeddingService

from .models import VisualFeatures


class VisualFeatureExtractor:
    """Produces real measurable descriptors and an explicit image signature.

    The signature supports image-to-image retrieval and deduplication only. It
    is not a semantic embedding and is never presented as learned understanding.
    """

    def __init__(self, embeddings: ImageEmbeddingService | None = None) -> None:
        self.embeddings = embeddings or ImageEmbeddingService()

    async def extract(self, content: bytes) -> VisualFeatures:
        signature = await self.embeddings.embed(content)
        result = VisualFeatures(
            status="partial",
            signatureModel=self.embeddings.provider.model_name,
            signatureDimensions=len(signature),
        )
        if importlib.util.find_spec("PIL") is None:
            result.limitations.append(
                "Pillow is not installed; color and edge descriptors were not computed."
            )
            return result
        try:
            from PIL import Image, ImageFilter, ImageStat  # type: ignore[import-not-found]

            with Image.open(BytesIO(content)) as image:
                rgb = image.convert("RGB")
                histogram: list[int] = []
                for channel in rgb.split():
                    counts = channel.histogram()
                    bucket = [0] * 8
                    for index, count in enumerate(counts):
                        bucket[min(index * 8 // 256, 7)] += count
                    total = sum(bucket) or 1
                    histogram.extend(round(value / total, 6) for value in bucket)
                mean_luminance = float(ImageStat.Stat(rgb.convert("L")).mean[0])
                edges = rgb.convert("L").filter(ImageFilter.FIND_EDGES)
                edge_histogram = edges.histogram()
                edge_density = sum(edge_histogram[33:]) / (sum(edge_histogram) or 1)
            result.colorHistogram = histogram
            result.meanLuminance = round(mean_luminance, 4)
            result.edgeDensity = round(edge_density, 6)
            result.status = "extracted"
        except Exception:  # noqa: BLE001 - third-party adapter boundary
            result.limitations.append("Image decoding failed; only the byte signature was extracted.")
        return result


__all__: list[Any] = ["VisualFeatureExtractor"]

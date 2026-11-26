"""Explicit deterministic image signatures; never presented as semantic embeddings."""

import hashlib
import importlib.util
from io import BytesIO
from typing import Any, Protocol

from app.config import Settings, get_settings

IMAGE_EMBEDDING_MODEL = "cropsy-deterministic-image-signature-v1"


class ImageEmbeddingProvider(Protocol):
    model_name: str

    async def embed_image(self, content: bytes) -> list[float]: ...


class DeterministicImageEmbeddingProvider:
    """Local visual signature for deduplication and image-to-image retrieval.

    It is not a learned model and is not described as a semantic embedding.
    """

    model_name = IMAGE_EMBEDDING_MODEL

    def __init__(self, dimensions: int) -> None:
        self.dimensions = dimensions

    async def embed_image(self, content: bytes) -> list[float]:
        digest = hashlib.sha256(content).digest()
        vector = [((digest[index % len(digest)] / 255.0) - 0.5) for index in range(self.dimensions)]
        norm = sum(value * value for value in vector) ** 0.5
        if norm == 0:
            return vector
        return [round(value / norm, 6) for value in vector]

    def describe(self) -> dict[str, Any]:
        return {
            "model": self.model_name,
            "semantic": False,
            "use": "image_signature_and_deduplication",
            "pillowAvailable": importlib.util.find_spec("PIL") is not None,
        }


class ImageEmbeddingService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.provider = DeterministicImageEmbeddingProvider(self.settings.embedding_dimensions)

    async def embed(self, content: bytes) -> list[float]:
        return await self.provider.embed_image(content)

    def describe(self) -> dict[str, Any]:
        return self.provider.describe()


def perceptual_thumbprint(content: bytes, size: int = 16) -> list[float]:
    """Optional luminance thumbnail signature when Pillow is installed."""
    if importlib.util.find_spec("PIL") is None:
        return []
    try:
        from PIL import Image  # type: ignore[import-not-found]

        with Image.open(BytesIO(content)) as image:
            gray = image.convert("L").resize((size, size))
            return [value / 255.0 for value in gray.getdata()]
    except Exception:  # noqa: BLE001 - third-party adapter boundary
        return []


__all__ = [
    "IMAGE_EMBEDDING_MODEL",
    "ImageEmbeddingProvider",
    "ImageEmbeddingService",
    "perceptual_thumbprint",
]

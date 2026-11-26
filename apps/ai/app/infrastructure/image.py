"""Optional-image preprocessing adapters. Missing libraries are reported honestly."""

import base64
import binascii
import hashlib
import importlib.util
from dataclasses import dataclass
from typing import Any

from app.errors import DocumentError

IMAGE_MIME_TYPES: tuple[str, ...] = (
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
)
PDF_MIME_TYPES: tuple[str, ...] = ("application/pdf",)
TEXT_MIME_TYPES: tuple[str, ...] = (
    "text/plain",
    "text/csv",
    "text/markdown",
    "text/html",
)

_MAGIC: tuple[tuple[bytes, str], ...] = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"RIFF", "image/webp"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"%PDF-", "application/pdf"),
)


@dataclass(frozen=True)
class PreprocessedImage:
    mimeType: str
    width: int | None
    height: int | None
    bytesLength: int
    contentHash: str
    transform: str
    content: bytes


class ImagePreprocessor:
    """Decode, verify, normalize, and hash uploaded image bytes."""

    @classmethod
    def available(cls) -> bool:
        return importlib.util.find_spec("PIL") is not None

    def decode(self, content_base64: str) -> bytes:
        try:
            return base64.b64decode(content_base64, validate=True)
        except (binascii.Error, ValueError) as error:
            raise DocumentError("contentBase64 is not valid base64.") from error

    def preprocess(self, content_base64: str, *, expected_mime: str = "") -> PreprocessedImage:
        content = self.decode(content_base64)
        if not content:
            raise DocumentError("Uploaded image is empty.")
        detected = next((mime for magic, mime in _MAGIC if content.startswith(magic)), "")
        if expected_mime and expected_mime in IMAGE_MIME_TYPES and detected and detected != expected_mime:
            raise DocumentError("Declared image MIME type does not match file contents.")
        if not detected and expected_mime not in TEXT_MIME_TYPES:
            raise DocumentError("Uploaded asset has an unsupported binary format.")
        mime = detected or expected_mime
        width: int | None = None
        height: int | None = None
        normalized = content
        transform = "none"
        if detected in IMAGE_MIME_TYPES and self.available():
            try:
                from io import BytesIO

                from PIL import Image, ImageOps  # type: ignore[import-not-found]

                with Image.open(BytesIO(content)) as image:
                    image = ImageOps.exif_transpose(image)
                    width, height = image.size
                    if image.mode not in {"RGB", "L"}:
                        image = image.convert("RGB")
                    output = BytesIO()
                    image.save(output, format=image.format or "PNG")
                    normalized = output.getvalue()
                    transform = "exif-transpose"
            except Exception:  # noqa: BLE001 - third-party adapter boundary
                # Preserve the original bytes rather than pretending normalization
                # succeeded. Retrieval still records that no transform was applied.
                normalized = content
                transform = "original-preserved"
        return PreprocessedImage(
            mimeType=mime,
            width=width,
            height=height,
            bytesLength=len(content),
            contentHash=hashlib.sha256(content).hexdigest(),
            transform=transform,
            content=normalized,
        )

    def describe(self) -> dict[str, Any]:
        return {
            "processor": "cropsy-image-preprocessor-v1",
            "pillowAvailable": self.available(),
            "supportedMimeTypes": list(IMAGE_MIME_TYPES),
        }


__all__ = ["IMAGE_MIME_TYPES", "ImagePreprocessor", "PreprocessedImage"]

import importlib.util
from typing import Any

from app.errors import IntegrationUnavailableError, ProviderError


class TesseractOcrProcessor:
    """Lazy OCR adapter. It never returns guessed text when OCR is unavailable."""

    processor_name = "tesseract-ocr-v1"

    @classmethod
    def available(cls) -> bool:
        return (
            importlib.util.find_spec("pytesseract") is not None
            and importlib.util.find_spec("PIL") is not None
        )

    async def extract_images(self, images: list[bytes]) -> dict[str, Any]:
        if not images:
            raise IntegrationUnavailableError("OCR requires at least one rendered page image.")
        if not self.available():
            raise IntegrationUnavailableError(
                "OCR requires the optional pytesseract and Pillow dependencies.",
                details={"processor": self.processor_name},
            )

        try:
            from io import BytesIO

            from PIL import Image  # type: ignore[import-not-found]
            import pytesseract  # type: ignore[import-not-found]

            pages: list[dict[str, Any]] = []
            for index, image_bytes in enumerate(images, start=1):
                with Image.open(BytesIO(image_bytes)) as image:
                    text = pytesseract.image_to_string(image, lang="eng+ben")
                pages.append({"page": index, "text": text.strip()})
            return {
                "text": "\n\n".join(page["text"] for page in pages if page["text"]),
                "pages": pages,
                "processor": self.processor_name,
            }
        except IntegrationUnavailableError:
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "OCR could not process the supplied images.",
                details={"processor": self.processor_name, "reason": type(error).__name__},
            ) from error

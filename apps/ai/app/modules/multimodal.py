import base64
import binascii
import hashlib
import re
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.errors import DocumentError
from app.infrastructure.docling import DoclingPdfProcessor
from app.infrastructure.ocr import TesseractOcrProcessor
from app.models import DocumentType, Language
from app.modules.documents import (
    CLASSIFICATION_TERMS,
    classify_document,
    extract_document_metadata,
    extract_tables,
)
from app.tracing import Tracer

TaskType = Literal["ocr", "classify", "extract"]


class MultimodalInput(BaseModel):
    mimeType: str = Field(min_length=1, max_length=150)
    filename: str = Field(default="", max_length=300)
    language: Language = "en"
    task: TaskType = "extract"
    contentBase64: str = Field(min_length=1, max_length=30_000_000)
    ocrPagesBase64: list[str] = Field(default_factory=list, max_length=20)


class MultimodalResult(BaseModel):
    status: str
    advisory: bool = True
    processor: str
    mimeType: str
    extractedText: str
    tables: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    classification: dict[str, Any] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list)
    traceId: str


class MultimodalProcessingService:
    def __init__(self, settings: Settings | None = None, tracer: Tracer | None = None) -> None:
        self.settings = settings or get_settings()
        self.tracer = tracer or Tracer(self.settings.max_trace_history)
        self.pdf_processor = DoclingPdfProcessor()
        self.ocr_processor = TesseractOcrProcessor()

    def _decode(self, encoded: str) -> bytes:
        try:
            return base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as error:
            raise DocumentError("contentBase64 is not valid base64.") from error

    async def process(self, value: MultimodalInput, *, trace_id: str) -> MultimodalResult:
        content = self._decode(value.contentBase64)
        if len(content) > self.settings.max_upload_bytes:
            raise DocumentError("Multimodal input exceeds the configured size limit.")
        mime = value.mimeType.lower()
        with self.tracer.span(trace_id, "multimodal.extract", mimeType=mime, task=value.task):
            if mime.startswith("image/"):
                if value.task == "extract" and not mime.endswith("pdf"):
                    raise DocumentError("Image input requires task 'ocr' or 'classify'.")
                ocr = await self.ocr_processor.extract_images([content])
                text = ocr["text"]
                tables: list[dict[str, Any]] = []
                processor = ocr["processor"]
            elif mime == "application/pdf" or value.filename.lower().endswith(".pdf"):
                extracted = await self.pdf_processor.extract(
                    content,
                    value.filename,
                    ocr_mode=self.settings.ocr_mode,
                )
                text = extracted["text"]
                tables = extracted["tables"]
                processor = extracted["processor"]
                if not text.strip() and self.settings.ocr_mode != "never":
                    if not value.ocrPagesBase64:
                        from app.errors import IntegrationUnavailableError

                        raise IntegrationUnavailableError(
                            "PDF has no extractable text and no rendered OCR pages were supplied.",
                            details={"ocrMode": self.settings.ocr_mode},
                        )
                    images = [self._decode(page) for page in value.ocrPagesBase64]
                    ocr = await self.ocr_processor.extract_images(images)
                    text = ocr["text"]
                    tables.append({"index": len(tables), "ocrPages": ocr["pages"]})
                    processor = f"{processor}+{ocr['processor']}"
            else:
                try:
                    text = content.decode("utf-8")
                except UnicodeDecodeError as error:
                    raise DocumentError("Unsupported binary MIME type.") from error
                tables = extract_tables(text, mime)
                processor = "decoded-utf8-v1"

        if not text.strip():
            raise DocumentError("No content could be extracted from the supplied input.")
        metadata = extract_document_metadata(text, value.language)
        metadata["contentHash"] = hashlib.sha256(content).hexdigest()
        declared: DocumentType = "other"
        classified, confidence = classify_document(value.filename, text, declared)
        return MultimodalResult(
            status="ok",
            processor=processor,
            mimeType=mime,
            extractedText=text[:50_000],
            tables=tables[:100],
            metadata=metadata,
            classification={"documentType": classified, "confidence": confidence},
            limitations=[
                "Extracted content is advisory and may require human verification.",
                "No visual interpretation is added beyond extracted text and tables.",
            ],
            traceId=trace_id,
        )

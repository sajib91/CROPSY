import base64
import binascii
import csv
import hashlib
import io
import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.config import Settings, get_settings
from app.errors import DocumentError, IntegrationUnavailableError
from app.infrastructure.docling import DoclingPdfProcessor
from app.infrastructure.ocr import TesseractOcrProcessor
from app.models import (
    DocumentChunk,
    DocumentRecord,
    DocumentStatus,
    DocumentType,
    Language,
    LicenseMetadata,
    Provenance,
    SourceMetadata,
    utc_now,
)

DOCUMENT_TYPES: tuple[DocumentType, ...] = (
    "research_paper",
    "government_publication",
    "crop_cultivation_guideline",
    "fertilizer_recommendation",
    "pest_management",
    "disease_management",
    "agricultural_manual",
    "weather_guidance",
    "soil_management",
    "market_intelligence",
    "other",
)

CLASSIFICATION_TERMS: dict[DocumentType, tuple[str, ...]] = {
    "research_paper": ("abstract", "methodology", "journal", "study", "experiment"),
    "government_publication": ("ministry", "government", "department", "official", "notification"),
    "crop_cultivation_guideline": ("cultivation", "sowing", "planting", "harvest", "crop"),
    "fertilizer_recommendation": ("fertilizer", "nutrient", "npk", "urea", "compost"),
    "pest_management": ("pest", "insect", "aphid", "trap", "pesticide"),
    "disease_management": ("disease", "fungus", "blight", "symptom", "pathogen"),
    "agricultural_manual": ("manual", "handbook", "procedure", "instruction"),
    "weather_guidance": ("weather", "rainfall", "temperature", "forecast", "monsoon"),
    "soil_management": ("soil", "ph", "organic matter", "irrigation", "drainage"),
    "market_intelligence": ("market", "price", "demand", "supply", "trade"),
}

TEXT_MIME_TYPES = {"text/plain", "text/csv", "application/json", "text/markdown", "text/html"}


class DocumentProcessingInput(BaseModel):
    documentId: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=500)
    documentType: DocumentType
    language: Language
    version: str = Field(min_length=1, max_length=100)
    status: DocumentStatus
    source: SourceMetadata
    license: LicenseMetadata
    ingestedBy: str = Field(default="system", min_length=1, max_length=128)
    sourceVersion: str = Field(default="", max_length=100)
    mimeType: str = Field(default="text/plain", max_length=150)
    filename: str = Field(default="", max_length=300)
    text: str = Field(default="", max_length=20_000_000)
    contentBase64: str = Field(default="", max_length=30_000_000)
    ocrPagesBase64: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("text", "contentBase64")
    @classmethod
    def require_payload(cls, value: str, info: Any) -> str:
        return value

    @field_validator("ocrPagesBase64")
    @classmethod
    def limit_ocr_pages(cls, value: list[str]) -> list[str]:
        if len(value) > 20:
            raise ValueError("At most 20 OCR page images may be submitted per request.")
        return value


def detect_language(text: str, declared: Language) -> Language:
    bengali = len(re.findall(r"[\u0980-\u09ff]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    if bengali > latin:
        return "bn"
    if declared == "both":
        return "both"
    return declared


def classify_document(title: str, text: str, declared: DocumentType) -> tuple[DocumentType, float]:
    haystack = f"{title}\n{text[:8000]}".lower()
    scores: dict[DocumentType, int] = {}
    for kind, terms in CLASSIFICATION_TERMS.items():
        scores[kind] = sum(1 for term in terms if term in haystack)
    best = max(scores, key=lambda key: scores[key])
    if scores[best] == 0:
        return declared, 0.2
    confidence = min(0.95, 0.4 + scores[best] * 0.1)
    if scores.get(declared, 0) == scores[best]:
        return declared, confidence
    return best, confidence


def extract_tables(text: str, mime_type: str) -> list[dict[str, Any]]:
    if mime_type == "text/csv":
        rows = list(csv.reader(io.StringIO(text)))
        if not rows:
            return []
        return [
            {
                "index": 0,
                "header": rows[0],
                "rows": rows[1:],
            }
        ]
    tables: list[dict[str, Any]] = []
    lines = text.splitlines()
    index = 0
    while index < len(lines) - 1:
        if "|" in lines[index] and re.match(r"^\s*\|?[\s:|-]+\|?\s*$", lines[index + 1]):
            header = [cell.strip() for cell in lines[index].strip("|").split("|")]
            rows: list[list[str]] = []
            cursor = index + 2
            while cursor < len(lines) and "|" in lines[cursor]:
                rows.append([cell.strip() for cell in lines[cursor].strip("|").split("|")])
                cursor += 1
            tables.append({"index": len(tables), "header": header, "rows": rows})
            index = cursor
        else:
            index += 1
    return tables


def extract_document_metadata(text: str, language: Language) -> dict[str, Any]:
    title_match = re.search(r"(?im)^\s*(?:title|শিরোনাম)\s*[:：]\s*(.+)$", text)
    author_match = re.search(r"(?im)^\s*(?:author|লেখক)\s*[:：]\s*(.+)$", text)
    return {
        "detectedLanguage": detect_language(text, language),
        "declaredTitle": title_match.group(1).strip() if title_match else None,
        "declaredAuthor": author_match.group(1).strip() if author_match else None,
        "characterCount": len(text),
        "wordCount": len(text.split()),
        "containsBengaliScript": bool(re.search(r"[\u0980-\u09ff]", text)),
    }


def chunk_text(
    text: str,
    *,
    max_chars: int,
    overlap: int,
) -> list[tuple[str, str]]:
    """Return (section, chunk) pairs with bounded overlap."""
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n+", text) if part.strip()]
    if not paragraphs:
        paragraphs = [text.strip()]
    chunks: list[tuple[str, str]] = []
    current = ""
    section = ""
    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= max_chars:
            current = candidate
            if not section:
                section = paragraph.splitlines()[0][:200]
            continue
        if current:
            chunks.append((section, current))
            tail = current[-overlap:] if overlap else ""
            current = f"{tail}\n\n{paragraph}".strip() if tail else paragraph
            section = paragraph.splitlines()[0][:200]
        else:
            # A single very long paragraph is split on word boundaries.
            words = paragraph.split()
            cursor = 0
            while cursor < len(words):
                piece = " ".join(words[cursor : cursor + max_chars // 5])
                chunks.append((section, piece[:max_chars]))
                cursor += max(1, (max_chars - overlap) // 5)
            current = ""
    if current:
        chunks.append((section, current))
    return [(section, chunk) for section, chunk in chunks if chunk]


class DocumentProcessingService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.pdf_processor = DoclingPdfProcessor()
        self.ocr_processor = TesseractOcrProcessor()

    def _decode(self, encoded: str) -> bytes:
        try:
            return base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as error:
            raise DocumentError("contentBase64 or OCR page is not valid base64.") from error

    async def extract(self, value: DocumentProcessingInput) -> dict[str, Any]:
        mime = value.mimeType.lower()
        if value.text.strip():
            return {
                "text": value.text,
                "tables": extract_tables(value.text, mime),
                "metadata": extract_document_metadata(value.text, value.language),
                "processor": "supplied-text-v1",
            }

        if mime == "application/pdf" or value.filename.lower().endswith(".pdf"):
            if not value.contentBase64:
                raise DocumentError("PDF ingestion requires contentBase64.")
            content = self._decode(value.contentBase64)
            if len(content) > self.settings.max_upload_bytes:
                raise DocumentError("PDF exceeds the configured upload size limit.")
            extracted = await self.pdf_processor.extract(
                content,
                value.filename,
                ocr_mode=self.settings.ocr_mode,
            )
            if not extracted["text"].strip() and self.settings.ocr_mode != "never":
                if not value.ocrPagesBase64:
                    raise IntegrationUnavailableError(
                        "PDF has no extractable text and no rendered OCR pages were supplied.",
                        details={"ocrMode": self.settings.ocr_mode},
                    )
                images = [self._decode(page) for page in value.ocrPagesBase64]
                ocr = await self.ocr_processor.extract_images(images)
                extracted["text"] = ocr["text"]
                extracted["tables"].append({"index": len(extracted["tables"]), "ocrPages": ocr["pages"]})
                extracted["processor"] = f"{extracted['processor']}+{ocr['processor']}"
            if not extracted["text"].strip():
                raise DocumentError("Document contains no extractable text.")
            extracted["metadata"] = {
                **extracted["metadata"],
                **extract_document_metadata(extracted["text"], value.language),
            }
            return extracted

        if mime in TEXT_MIME_TYPES or not value.contentBase64:
            raise DocumentError("No extractable document content was supplied.")

        content = self._decode(value.contentBase64)
        if len(content) > self.settings.max_upload_bytes:
            raise DocumentError("Document exceeds the configured upload size limit.")
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as error:
            raise DocumentError("Binary document content requires a supported processor.") from error
        return {
            "text": text,
            "tables": extract_tables(text, mime),
            "metadata": extract_document_metadata(text, value.language),
            "processor": "decoded-utf8-v1",
        }

    async def process(self, value: DocumentProcessingInput) -> tuple[DocumentRecord, list[DocumentChunk]]:
        extracted = await self.extract(value)
        text = extracted["text"].strip()
        if not text:
            raise DocumentError("Document contains no extractable text.")
        content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        classified, confidence = classify_document(value.title, text, value.documentType)
        provenance = Provenance(
            source=value.source,
            license=value.license,
            ingestedBy=value.ingestedBy,
            originalFilename=value.filename,
            contentHash=content_hash,
            sourceVersion=value.sourceVersion,
        )
        record = DocumentRecord(
            documentId=value.documentId,
            title=value.title,
            documentType=value.documentType,
            classifiedType=classified,
            classificationConfidence=round(confidence, 3),
            language=value.language,
            version=value.version,
            status=value.status,
            provenance=provenance,
            text=text,
            tables=extracted["tables"],
            extractedMetadata=extracted["metadata"],
            processor=extracted["processor"],
            createdAt=utc_now(),
            updatedAt=utc_now(),
        )

        raw_chunks = chunk_text(
            text,
            max_chars=self.settings.max_chunk_chars,
            overlap=self.settings.chunk_overlap_chars,
        )
        chunks = [
            DocumentChunk(
                chunkId=f"{value.documentId}:{value.version}:{index}",
                documentId=value.documentId,
                version=value.version,
                text=chunk,
                position=index,
                language=detect_language(chunk, value.language),
                section=section,
                metadata={
                    "title": value.title,
                    "documentType": value.documentType,
                    "processor": extracted["processor"],
                    "contentHash": content_hash,
                },
            )
            for index, (section, chunk) in enumerate(raw_chunks)
        ]
        record.chunkIds = [chunk.chunkId for chunk in chunks]
        return record, chunks

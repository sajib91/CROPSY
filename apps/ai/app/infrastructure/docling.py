import importlib.util
import tempfile
from pathlib import Path
from typing import Any

from app.errors import IntegrationUnavailableError, ProviderError


class DoclingPdfProcessor:
    """Lazy Docling adapter. A missing engine is reported, never simulated."""

    processor_name = "docling-pdf-v1"

    @classmethod
    def available(cls) -> bool:
        return importlib.util.find_spec("docling") is not None

    async def extract(
        self,
        content: bytes,
        filename: str,
        *,
        ocr_mode: str = "auto",
    ) -> dict[str, Any]:
        if not self.available():
            raise IntegrationUnavailableError(
                "PDF processing requires the optional Docling dependency.",
                details={"processor": self.processor_name},
            )

        suffix = Path(filename or "document.pdf").suffix or ".pdf"
        try:
            from docling.document_converter import DocumentConverter  # type: ignore[import-not-found]

            with tempfile.TemporaryDirectory(prefix="cropsy-docling-") as directory:
                path = Path(directory) / f"document{suffix}"
                path.write_bytes(content)
                result = DocumentConverter().convert(str(path))
                document = result.document
                text = ""
                if hasattr(document, "export_to_markdown"):
                    text = document.export_to_markdown() or ""
                if not text and hasattr(document, "export_to_text"):
                    text = document.export_to_text() or ""

                tables: list[dict[str, Any]] = []
                for index, table in enumerate(getattr(document, "tables", []) or []):
                    cells: list[list[str]] = []
                    for row in getattr(table, "data", {}).get("grid", []):
                        cells.append(
                            [
                                str(getattr(cell, "text", "") or "")
                                for cell in row.get("cells", [])
                            ]
                        )
                    tables.append(
                        {
                            "index": index,
                            "page": getattr(table, "page", None),
                            "cells": cells,
                            "markdown": (
                                table.export_to_markdown()
                                if hasattr(table, "export_to_markdown")
                                else ""
                            ),
                        }
                    )

                metadata: dict[str, Any] = {
                    "pageCount": len(getattr(document, "pages", []) or []) or None,
                    "ocrMode": ocr_mode,
                }
                return {
                    "text": text,
                    "tables": tables,
                    "metadata": metadata,
                    "processor": self.processor_name,
                }
        except IntegrationUnavailableError:
            raise
        except Exception as error:  # noqa: BLE001 - third-party adapter boundary
            raise ProviderError(
                "Docling could not process the supplied PDF.",
                details={"processor": self.processor_name, "reason": type(error).__name__},
            ) from error

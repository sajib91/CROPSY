"""Honest image-quality validation. Missing image libraries are reported, not simulated."""

from __future__ import annotations

import importlib.util
from io import BytesIO
from typing import Any

from app.config import Settings, get_settings
from app.infrastructure.image import IMAGE_MIME_TYPES, PreprocessedImage

from .models import ImageQualityReport, QualityCheck


def _image_metrics(content: bytes) -> dict[str, float] | None:
    if importlib.util.find_spec("PIL") is None:
        return None
    try:
        from PIL import Image, ImageFilter, ImageStat  # type: ignore[import-not-found]

        with Image.open(BytesIO(content)) as image:
            gray = image.convert("L")
            mean = float(ImageStat.Stat(gray).mean[0])
            edges = gray.filter(ImageFilter.FIND_EDGES)
            histogram = edges.histogram()
            total = sum(histogram) or 1
            density = sum(histogram[33:]) / total
        return {"meanLuminance": round(mean, 4), "edgeDensity": round(density, 6)}
    except Exception:  # noqa: BLE001 - third-party adapter boundary
        return None


class ImageQualityValidator:
    """Decodes measurable quality signals from the uploaded bytes only."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def validate(self, image: PreprocessedImage) -> tuple[ImageQualityReport, dict[str, float] | None]:
        checks: list[QualityCheck] = []
        limitations: list[str] = []
        critical_failed = False
        soft_failed = False
        unknown = False

        format_ok = image.mimeType in IMAGE_MIME_TYPES
        checks.append(
            QualityCheck(
                name="format",
                status="pass" if format_ok else "fail",
                observed=image.mimeType,
                threshold="png|jpeg|webp|gif",
                basis="magic-byte detection",
            )
        )
        critical_failed = critical_failed or not format_ok

        size_ok = 0 < image.bytesLength <= self.settings.max_upload_bytes
        checks.append(
            QualityCheck(
                name="fileSize",
                status="pass" if size_ok else "fail",
                observed=f"{image.bytesLength} bytes",
                threshold=f"1..{self.settings.max_upload_bytes} bytes",
                basis="decoded byte count",
            )
        )
        critical_failed = critical_failed or not size_ok

        if image.width is None or image.height is None:
            checks.append(
                QualityCheck(
                    name="dimensions",
                    status="unknown",
                    observed="not decoded",
                    threshold=(
                        f"{self.settings.image_analysis_min_width}x"
                        f"{self.settings.image_analysis_min_height}"
                    ),
                    basis="image library unavailable or decode failed",
                )
            )
            unknown = True
            limitations.append("Image dimensions could not be decoded; quality is undetermined.")
        else:
            dimensions_ok = (
                image.width >= self.settings.image_analysis_min_width
                and image.height >= self.settings.image_analysis_min_height
            )
            checks.append(
                QualityCheck(
                    name="dimensions",
                    status="pass" if dimensions_ok else "fail",
                    observed=f"{image.width}x{image.height}",
                    threshold=(
                        f">={self.settings.image_analysis_min_width}x"
                        f"{self.settings.image_analysis_min_height}"
                    ),
                    basis="decoded pixel dimensions",
                )
            )
            critical_failed = critical_failed or not dimensions_ok

        metrics = _image_metrics(image.content)
        if metrics is None:
            checks.append(
                QualityCheck(
                    name="luminance",
                    status="unknown",
                    observed="unavailable",
                    threshold="15..245 mean (advisory)",
                    basis="Pillow not installed or decode failed",
                )
            )
            checks.append(
                QualityCheck(
                    name="detail",
                    status="unknown",
                    observed="unavailable",
                    threshold="edge density > 0.005 (advisory)",
                    basis="Pillow not installed or decode failed",
                )
            )
            unknown = True
            limitations.append(
                "Pillow is not available; luminance and sharpness proxies were not measured."
            )
        else:
            mean = metrics["meanLuminance"]
            edge = metrics["edgeDensity"]
            light_ok = 15.0 <= mean <= 245.0
            checks.append(
                QualityCheck(
                    name="luminance",
                    status="pass" if light_ok else "fail",
                    observed=str(mean),
                    threshold="15..245 mean (advisory)",
                    basis="measured grayscale mean",
                )
            )
            detail_ok = edge > 0.005
            checks.append(
                QualityCheck(
                    name="detail",
                    status="pass" if detail_ok else "fail",
                    observed=str(edge),
                    threshold="edge density > 0.005 (advisory)",
                    basis="measured high-frequency edge ratio",
                )
            )
            soft_failed = soft_failed or not light_ok or not detail_ok
            if not light_ok:
                limitations.append("Image appears unusually dark or overexposed.")
            if not detail_ok:
                limitations.append("Image contains very little measurable detail; it may be blurred.")

        if critical_failed:
            status: Any = "rejected"
        elif soft_failed:
            status = "degraded"
        elif unknown:
            status = "undetermined"
        else:
            status = "acceptable"

        report = ImageQualityReport(
            status=status,
            mimeType=image.mimeType,
            width=image.width,
            height=image.height,
            bytesLength=image.bytesLength,
            contentHash=image.contentHash,
            checks=checks,
            limitations=limitations,
        )
        return report, metrics


__all__ = ["ImageQualityValidator"]

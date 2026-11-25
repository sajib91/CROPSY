from datetime import datetime, timezone
from time import monotonic
from typing import Literal

from fastapi import APIRouter

from app.config import get_settings
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])
_started_at = monotonic()


def _response(
    status: Literal["ok", "ready"], checks: dict[str, str] | None = None
) -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        success=True,
        data={
            "status": status,
            "service": settings.service_name,
            "timestamp": datetime.now(timezone.utc),
            "uptimeSeconds": max(0.0, monotonic() - _started_at),
            "checks": checks,
        },
    )


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return _response("ok")


@router.get("/health/ready", response_model=HealthResponse)
def ready() -> HealthResponse:
    return _response("ready", {"process": "ok"})

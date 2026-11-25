from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class HealthData(BaseModel):
    status: Literal["ok", "ready"]
    service: str = Field(min_length=1)
    timestamp: datetime
    uptimeSeconds: float = Field(ge=0)
    checks: dict[str, str] | None = None


class HealthResponse(BaseModel):
    success: Literal[True]
    data: HealthData

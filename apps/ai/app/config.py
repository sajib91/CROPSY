from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT_DIR / ".env"


class Settings(BaseSettings):
    """Validated settings for the AI service."""

    host: str = Field(default="0.0.0.0", min_length=1)
    port: int = Field(default=4100, ge=1, le=65535)
    service_name: str = Field(default="cropsy-ai-service", min_length=1)
    log_level: Literal["critical", "error", "warning", "info", "debug", "trace"] = "info"

    model_config = SettingsConfigDict(
        env_prefix="CROPSY_AI_",
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


def get_settings() -> Settings:
    return Settings()

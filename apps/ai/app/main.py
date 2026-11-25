from fastapi import FastAPI

from app.config import get_settings
from app.routes.health import router as health_router

settings = get_settings()

app = FastAPI(
    title=settings.service_name,
    version="0.1.0",
    description="CROPSY AI service foundation. No AI workflows are implemented yet.",
)

app.include_router(health_router, prefix="/api/v1")

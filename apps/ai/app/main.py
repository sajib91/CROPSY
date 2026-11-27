import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.container import get_container
from app.errors import AiError, error_payload
from app.logging import configure_logging, log_event
from app.middleware import RequestContextMiddleware
from app.routes.health import router as health_router
from app.routes.internal import router as internal_router

settings = get_settings()
configure_logging(settings.service_name, settings.log_level)
logger = logging.getLogger("cropsy.ai")

app = FastAPI(
    title=settings.service_name,
    version="0.1.0",
    description=(
        "Authenticated CROPSY AI microservice with provenance-gated agricultural "
        "knowledge, market forecasting, and weather intelligence capabilities."
    ),
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

container = get_container()
app.add_middleware(
    RequestContextMiddleware,
    settings=settings,
    rate_limiter=container.rate_limiter,
    org_rate_limiter=container.org_rate_limiter,
)


@app.exception_handler(AiError)
async def ai_error_handler(request: Request, error: AiError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    log_event(
        logger,
        logging.WARNING,
        "ai request rejected",
        requestId=request_id,
        code=error.code,
    )
    return JSONResponse(
        status_code=error.status_code,
        content=error_payload(error, request_id),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request,
    error: RequestValidationError,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    details = [
        {
            "location": list(item.get("loc", [])),
            "message": item.get("msg", "Invalid value"),
            "type": item.get("type", "value_error"),
        }
        for item in error.errors()
    ]
    payload = {
        "success": False,
        "error": {
            "code": "validation_error",
            "message": "Request validation failed.",
            "status": 400,
            "details": details,
        },
    }
    if request_id:
        payload["meta"] = {"requestId": request_id}
    return JSONResponse(status_code=400, content=payload)


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, error: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    logger.exception(
        "unhandled AI service error",
        extra={"extra_fields": {"requestId": request_id, "errorType": type(error).__name__}},
    )
    payload = {
        "success": False,
        "error": {
            "code": "internal_error",
            "message": "The AI service encountered an unexpected error.",
            "status": 500,
        },
    }
    if request_id:
        payload["meta"] = {"requestId": request_id}
    return JSONResponse(status_code=500, content=payload)


app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(internal_router, prefix=settings.api_prefix)

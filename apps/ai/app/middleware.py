import logging
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import Settings, get_settings
from app.errors import AiError, error_payload
from app.logging import log_event
from app.rate_limit import SlidingWindowRateLimiter
from app.security import verify_internal_request

logger = logging.getLogger("cropsy.ai.http")


class RequestContextMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        *,
        settings: Settings | None = None,
        rate_limiter: SlidingWindowRateLimiter | None = None,
        org_rate_limiter: SlidingWindowRateLimiter | None = None,
    ) -> None:
        super().__init__(app)
        self.settings = settings or get_settings()
        self.rate_limiter = rate_limiter
        self.org_rate_limiter = org_rate_limiter

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        started = time.perf_counter()
        request_id = request.headers.get("x-request-id", "").strip() or str(uuid.uuid4())
        request.state.request_id = request_id

        rate_headers: dict[str, str] = {}
        if self.rate_limiter is not None and not request.url.path.endswith("/health"):
            # Identity headers are trusted only when the whole request verifies
            # against the internal shared secret. Unsigned callers share a
            # conservative gateway-IP fallback and cannot spoof a user or org.
            try:
                context = verify_internal_request(
                    headers={key.lower(): value for key, value in request.headers.items()},
                    method=request.method,
                    path=request.url.path,
                    body=await request.body(),
                    settings=self.settings,
                )
            except AiError:
                context = None
            path = request.url.path
            if context is not None:
                key = f"org:{context.organization_id}:user:{context.user_id}:{path}"
            else:
                host = request.client.host if request.client else "unknown"
                key = f"ip:{host}:{path}"
            try:
                limits = self.rate_limiter.check(key)
                rate_headers = {
                    "x-ratelimit-limit": str(limits["limit"]),
                    "x-ratelimit-remaining": str(limits["remaining"]),
                    "x-ratelimit-reset": str(limits["resetSeconds"]),
                }
                if context is not None and self.org_rate_limiter is not None:
                    self.org_rate_limiter.check(f"org:{context.organization_id}")
            except AiError as error:
                response = JSONResponse(
                    status_code=error.status_code,
                    content=error_payload(error, request_id),
                )
                response.headers["x-request-id"] = request_id
                response.headers.update(rate_headers)
                return response

        trace_id = request.headers.get("x-trace-id", "").strip()
        if trace_id:
            request.state.trace_id = trace_id

        try:
            response = await call_next(request)
        except AiError as error:
            response = JSONResponse(
                status_code=error.status_code,
                content=error_payload(error, request_id),
            )

        duration_ms = (time.perf_counter() - started) * 1000
        response.headers["x-request-id"] = request_id
        response.headers.update(rate_headers)
        log_event(
            logger,
            logging.INFO,
            "http request completed",
            requestId=request_id,
            method=request.method,
            path=request.url.path,
            statusCode=response.status_code,
            durationMs=round(duration_ms, 3),
        )
        return response

from typing import Any


class AiError(Exception):
    """Base class for AI service errors with a stable machine-readable code."""

    code = "ai_error"
    status_code = 500

    def __init__(
        self,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}
        if status_code is not None:
            self.status_code = status_code


class ConfigurationError(AiError):
    code = "configuration_error"
    status_code = 500


class UnauthorizedError(AiError):
    code = "unauthorized"
    status_code = 401


class RateLimitError(AiError):
    code = "rate_limited"
    status_code = 429


class NotFoundError(AiError):
    code = "not_found"
    status_code = 404


class ProviderError(AiError):
    code = "provider_error"
    status_code = 502


class IntegrationUnavailableError(AiError):
    code = "integration_unavailable"
    status_code = 503


class DocumentError(AiError):
    code = "document_error"
    status_code = 400


def error_payload(error: AiError, request_id: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "success": False,
        "error": {
            "code": error.code,
            "message": error.message,
            "status": error.status_code,
        },
    }
    if error.details:
        payload["error"]["details"] = error.details
    if request_id:
        payload["meta"] = {"requestId": request_id}
    return payload


def success_payload(data: Any, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"success": True, "data": data}
    if meta is not None:
        payload["meta"] = meta
    return payload

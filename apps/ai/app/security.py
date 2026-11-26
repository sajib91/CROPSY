import hashlib
import hmac
import re
import time
from dataclasses import dataclass

from fastapi import Request

from app.config import Settings, get_settings
from app.errors import UnauthorizedError

SERVICE_ID_HEADER = "x-cropsy-service-id"
TIMESTAMP_HEADER = "x-cropsy-timestamp"
SIGNATURE_HEADER = "x-cropsy-signature"
REQUEST_ID_HEADER = "x-request-id"
ORGANIZATION_ID_HEADER = "x-organization-id"
USER_ID_HEADER = "x-user-id"

ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")


@dataclass(frozen=True)
class InternalContext:
    service_id: str
    request_id: str
    organization_id: str
    user_id: str
    timestamp: int


def _required_header(headers: dict[str, str], name: str) -> str:
    value = headers.get(name, "").strip()
    if not value or not ID_PATTERN.fullmatch(value):
        raise UnauthorizedError(f"Missing or invalid {name} header.")
    return value


def build_signature_base(
    method: str,
    path: str,
    timestamp: str,
    body: bytes,
) -> str:
    body_hash = hashlib.sha256(body).hexdigest()
    return f"{method.upper()}\n{path}\n{timestamp}\n{body_hash}"


def sign_internal_request(
    *,
    secret: str,
    method: str,
    path: str,
    timestamp: str,
    body: bytes,
) -> str:
    base = build_signature_base(method, path, timestamp, body)
    return hmac.new(secret.encode("utf-8"), base.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_internal_request(
    *,
    headers: dict[str, str],
    method: str,
    path: str,
    body: bytes,
    settings: Settings | None = None,
) -> InternalContext:
    active = settings or get_settings()
    expected_secret = active.internal_service_secret.get_secret_value()
    if not expected_secret:
        raise UnauthorizedError("Internal service authentication is not configured.")

    service_id = _required_header(headers, SERVICE_ID_HEADER)
    if not hmac.compare_digest(service_id, active.internal_service_id):
        raise UnauthorizedError("Unknown internal service identity.")

    timestamp_raw = _required_header(headers, TIMESTAMP_HEADER)
    try:
        timestamp = int(timestamp_raw)
    except ValueError as error:
        raise UnauthorizedError("Invalid x-cropsy-timestamp header.") from error

    now = int(time.time())
    if abs(now - timestamp) > active.internal_signature_tolerance_seconds:
        raise UnauthorizedError("Stale x-cropsy-timestamp header.")

    signature = headers.get(SIGNATURE_HEADER, "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", signature):
        raise UnauthorizedError("Missing or invalid x-cropsy-signature header.")

    expected = sign_internal_request(
        secret=expected_secret,
        method=method,
        path=path,
        timestamp=timestamp_raw,
        body=body,
    )
    if not hmac.compare_digest(signature, expected):
        raise UnauthorizedError("Internal request signature does not match.")

    return InternalContext(
        service_id=service_id,
        request_id=_required_header(headers, REQUEST_ID_HEADER),
        organization_id=_required_header(headers, ORGANIZATION_ID_HEADER),
        user_id=_required_header(headers, USER_ID_HEADER),
        timestamp=timestamp,
    )


async def require_internal(request: Request) -> InternalContext:
    return verify_internal_request(
        headers={key.lower(): value for key, value in request.headers.items()},
        method=request.method,
        path=request.url.path,
        body=await request.body(),
    )

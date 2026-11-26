import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar

from app.errors import AiError, ProviderError

T = TypeVar("T")


async def retry_async(
    operation: Callable[[], Awaitable[T]],
    *,
    max_attempts: int,
    base_delay_seconds: float,
    max_delay_seconds: float,
    retryable: tuple[type[Exception], ...] = (ProviderError, TimeoutError, OSError),
) -> T:
    """Run an async operation with bounded exponential backoff."""
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await operation()
        except retryable as error:  # noqa: BLE001 - bounded re-raise below
            last_error = error
            if attempt == max_attempts or isinstance(error, AiError) and error.status_code < 500:
                break
            delay = min(max_delay_seconds, base_delay_seconds * (2 ** (attempt - 1)))
            if delay > 0:
                await asyncio.sleep(delay)
    assert last_error is not None
    raise last_error

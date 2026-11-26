import threading
import time
from collections import defaultdict, deque

from app.config import Settings, get_settings
from app.errors import RateLimitError


class SlidingWindowRateLimiter:
    """Process-local sliding-window limiter suitable for a single AI replica."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> dict[str, int]:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self.max_requests:
                retry_after = max(1, int(hits[0] + self.window_seconds - now) + 1)
                raise RateLimitError(
                    "Too many AI requests.",
                    details={"retryAfterSeconds": retry_after},
                )
            hits.append(now)
            if len(self._hits) > 2048:
                for stale_key in [item for item, values in self._hits.items() if not values]:
                    self._hits.pop(stale_key, None)
            return {
                "limit": self.max_requests,
                "remaining": self.max_requests - len(hits),
                "resetSeconds": self.window_seconds,
            }


def build_rate_limiter(settings: Settings | None = None) -> SlidingWindowRateLimiter:
    active = settings or get_settings()
    return SlidingWindowRateLimiter(
        max_requests=active.rate_limit_max_requests,
        window_seconds=active.rate_limit_window_seconds,
    )

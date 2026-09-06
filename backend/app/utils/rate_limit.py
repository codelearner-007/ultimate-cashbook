import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException


class InMemoryRateLimiter:
    """Simple fixed-count/sliding-window limiter keyed by an arbitrary string (e.g. user_id).

    Per-process only — fine for a single Render dyno, resets on restart, and does not
    coordinate across multiple instances. It exists to blunt request-spam abuse of
    heavy endpoints (like report rendering) without adding a Redis dependency.
    """

    def __init__(self, max_calls: int, window_seconds: float):
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > self.window_seconds:
                hits.popleft()
            if len(hits) >= self.max_calls:
                raise HTTPException(
                    status_code=429,
                    detail="Too many report requests — please wait a moment and try again.",
                )
            hits.append(now)

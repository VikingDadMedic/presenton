import math
import os
import time
import uuid
from dataclasses import dataclass
from threading import Lock

from fastapi import HTTPException


DEFAULT_SHOWCASE_ASK_RATE_LIMIT_REQUESTS = 30
DEFAULT_SHOWCASE_ASK_RATE_LIMIT_WINDOW_SECONDS = 60


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        parsed = int(raw)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


SHOWCASE_ASK_RATE_LIMIT_REQUESTS = _int_env(
    "SHOWCASE_ASK_RATE_LIMIT_REQUESTS",
    DEFAULT_SHOWCASE_ASK_RATE_LIMIT_REQUESTS,
)
SHOWCASE_ASK_RATE_LIMIT_WINDOW_SECONDS = _int_env(
    "SHOWCASE_ASK_RATE_LIMIT_WINDOW_SECONDS",
    DEFAULT_SHOWCASE_ASK_RATE_LIMIT_WINDOW_SECONDS,
)


@dataclass
class _BucketState:
    tokens: float
    last_refill_at: float


class InMemoryTokenBucketLimiter:
    def __init__(self, *, capacity: int, window_seconds: int):
        self.capacity = float(max(1, capacity))
        self.window_seconds = float(max(1, window_seconds))
        self.refill_tokens_per_second = self.capacity / self.window_seconds
        self._buckets: dict[str, _BucketState] = {}
        self._lock = Lock()

    def _refill(self, bucket: _BucketState, now: float) -> None:
        elapsed = max(0.0, now - bucket.last_refill_at)
        if elapsed <= 0:
            return
        bucket.tokens = min(
            self.capacity,
            bucket.tokens + (elapsed * self.refill_tokens_per_second),
        )
        bucket.last_refill_at = now

    def consume(self, key: str, tokens: float = 1.0) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _BucketState(tokens=self.capacity, last_refill_at=now)
                self._buckets[key] = bucket
            else:
                self._refill(bucket, now)

            if bucket.tokens >= tokens:
                bucket.tokens -= tokens
                return True, 0

            missing_tokens = tokens - bucket.tokens
            retry_after_seconds = max(
                1,
                math.ceil(missing_tokens / self.refill_tokens_per_second),
            )
            return False, retry_after_seconds


SHOWCASE_ASK_LIMITER = InMemoryTokenBucketLimiter(
    capacity=SHOWCASE_ASK_RATE_LIMIT_REQUESTS,
    window_seconds=SHOWCASE_ASK_RATE_LIMIT_WINDOW_SECONDS,
)


def enforce_showcase_ask_rate_limit(presentation_id: uuid.UUID) -> None:
    allowed, retry_after_seconds = SHOWCASE_ASK_LIMITER.consume(str(presentation_id))
    if allowed:
        return

    raise HTTPException(
        status_code=429,
        detail="Too many showcase ask requests for this presentation. Please retry shortly.",
        headers={"Retry-After": str(retry_after_seconds)},
    )

"""Pure helpers for Call 3 streaming parallelization (Phase C.2).

The streaming path used to fire Call 3 sequentially via `for ... await`. With
8 slides and 5-10s per LLM call, that meant 40-80s of wall-clock LLM time
when 4-8 of those calls could overlap. This module supplies:

  - `parse_content_model_concurrency` — bounded parser for the new
    CONTENT_MODEL_CONCURRENCY env var with safe defaults.
  - `OrderedSlideEmitter` — a small buffer that accepts per-slide results
    in *completion* order and emits them in *index* order, so the SSE
    stream remains slide-by-slide even when calls return out-of-order.
  - `Call3SlideResult` — the result envelope (ok | error) that the producer
    puts on the queue and the consumer drains.

These helpers are pure (no IO, no asyncio fixtures) so they can be unit
tested without spinning up the full SSE handler.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, Iterator, Literal, Optional, TypeVar

CONTENT_MODEL_CONCURRENCY_DEFAULT = 4
CONTENT_MODEL_CONCURRENCY_MAX = 12

T = TypeVar("T")


def parse_content_model_concurrency(
    raw: Optional[str],
    *,
    default: int = CONTENT_MODEL_CONCURRENCY_DEFAULT,
    max_value: int = CONTENT_MODEL_CONCURRENCY_MAX,
) -> int:
    """Resolve the Call 3 concurrency limit from a string env value.

    Defaults to 4 when unset / non-numeric / out of range. Caps at
    CONTENT_MODEL_CONCURRENCY_MAX (12) so a misconfigured deployment
    cannot DoS itself by firing 100 simultaneous LLM requests.
    """
    if raw is None:
        return default
    text = str(raw).strip()
    if not text:
        return default
    try:
        n = int(text)
    except (TypeError, ValueError):
        return default
    if n < 1:
        return 1
    if n > max_value:
        return max_value
    return n


@dataclass(frozen=True)
class Call3SlideResult(Generic[T]):
    """Envelope for a single slide's Call 3 outcome.

    `index` is the slide's original position in the structure (0-based).
    `status` distinguishes success ("ok") from per-slide failure ("error").
    `payload` carries the slide content (on ok) or an error message string
    (on error). Per-slide errors are buffered + emitted as structured SSE
    events; they must NOT abort the whole stream.
    """

    index: int
    status: Literal["ok", "error"]
    payload: T


class OrderedSlideEmitter(Generic[T]):
    """Buffer for emitting parallel-completion results in slide-index order.

    Producer side: parallel Call 3 tasks complete in arbitrary order (slide
    3 may finish before slide 0). Each completed task hands its result to
    `add(...)`, which returns the prefix of slides ready for in-order
    emission. The consumer-side SSE loop iterates that prefix and yields
    the matching SSE chunks.

    Invariants:
      - `next_emit_index` only increments — once a slide is emitted, its
        slot is freed and never re-used.
      - `add(...)` for an already-emitted index is a no-op (defensive).
      - `is_complete` flips true once every index from 0 to `total - 1`
        has been emitted.
    """

    def __init__(self, total: int) -> None:
        if total < 0:
            raise ValueError("total must be non-negative")
        self._total = total
        self._buffered: dict[int, Call3SlideResult[T]] = {}
        self._next_emit_index = 0

    @property
    def total(self) -> int:
        return self._total

    @property
    def next_emit_index(self) -> int:
        return self._next_emit_index

    @property
    def is_complete(self) -> bool:
        return self._next_emit_index >= self._total

    def add(
        self, result: Call3SlideResult[T]
    ) -> Iterator[Call3SlideResult[T]]:
        """Stage a result and yield any slides now ready for in-order emit.

        Returns an iterator (not a list) so callers can stream-process
        multiple ready slides in a single completion event without
        materializing a full list. Exhausting the iterator advances the
        internal cursor; partial consumption is also safe but leaves the
        cursor at the partial position (subsequent `add` calls re-attempt
        the unconsumed slide).
        """
        if result.index < self._next_emit_index:
            # Slide already emitted (or out-of-range) — defensive no-op.
            return iter(())
        if result.index >= self._total:
            return iter(())
        self._buffered[result.index] = result
        return self._drain_ready()

    def _drain_ready(self) -> Iterator[Call3SlideResult[T]]:
        while self._next_emit_index in self._buffered:
            popped = self._buffered.pop(self._next_emit_index)
            self._next_emit_index += 1
            yield popped

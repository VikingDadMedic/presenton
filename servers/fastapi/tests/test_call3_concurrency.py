"""Phase C.2 test guards: Call 3 streaming parallelization helpers."""

from utils.call3_concurrency import (
    CONTENT_MODEL_CONCURRENCY_DEFAULT,
    CONTENT_MODEL_CONCURRENCY_MAX,
    Call3SlideResult,
    OrderedSlideEmitter,
    parse_content_model_concurrency,
)


# ----- parse_content_model_concurrency -----

def test_concurrency_defaults_when_unset():
    assert (
        parse_content_model_concurrency(None)
        == CONTENT_MODEL_CONCURRENCY_DEFAULT
    )


def test_concurrency_defaults_when_blank():
    assert (
        parse_content_model_concurrency("")
        == CONTENT_MODEL_CONCURRENCY_DEFAULT
    )
    assert (
        parse_content_model_concurrency("   ")
        == CONTENT_MODEL_CONCURRENCY_DEFAULT
    )


def test_concurrency_defaults_when_non_numeric():
    assert (
        parse_content_model_concurrency("eight")
        == CONTENT_MODEL_CONCURRENCY_DEFAULT
    )


def test_concurrency_clamps_to_one_minimum():
    assert parse_content_model_concurrency("0") == 1
    assert parse_content_model_concurrency("-3") == 1


def test_concurrency_caps_at_max():
    assert (
        parse_content_model_concurrency("100")
        == CONTENT_MODEL_CONCURRENCY_MAX
    )
    assert parse_content_model_concurrency("999999") == 12


def test_concurrency_passes_through_valid_range():
    for n in (1, 4, 8, 12):
        assert parse_content_model_concurrency(str(n)) == n


# ----- OrderedSlideEmitter -----


def _ok(i, payload="content"):
    return Call3SlideResult(index=i, status="ok", payload=payload)


def _err(i, message):
    return Call3SlideResult(index=i, status="error", payload=message)


def test_ordered_emitter_emits_in_order_when_arriving_in_order():
    emitter = OrderedSlideEmitter(total=3)
    emitted = []
    for i in range(3):
        emitted.extend(list(emitter.add(_ok(i, payload=f"slide-{i}"))))
    assert [r.index for r in emitted] == [0, 1, 2]
    assert [r.payload for r in emitted] == ["slide-0", "slide-1", "slide-2"]
    assert emitter.is_complete


def test_ordered_emitter_buffers_out_of_order_completion():
    """Slide 2 finishes first, then 0, then 1. Emit must still be 0,1,2."""
    emitter = OrderedSlideEmitter(total=3)

    drained = list(emitter.add(_ok(2, payload="late-2")))
    assert drained == [], "slide 2 cannot emit before 0 and 1"
    assert not emitter.is_complete
    assert emitter.next_emit_index == 0

    drained = list(emitter.add(_ok(0, payload="first-0")))
    assert [r.index for r in drained] == [0]
    assert emitter.next_emit_index == 1

    drained = list(emitter.add(_ok(1, payload="middle-1")))
    # Both slide 1 (newly added) and slide 2 (buffered) emit now.
    assert [r.index for r in drained] == [1, 2]
    assert [r.payload for r in drained] == ["middle-1", "late-2"]
    assert emitter.is_complete


def test_ordered_emitter_per_slide_error_isolation():
    """A failure on slide 1 does NOT abort the stream; emitter still emits
    slides 0, error-marker for 1, then slide 2 in order."""
    emitter = OrderedSlideEmitter(total=3)

    # Out-of-order arrivals: 2 ok, 0 ok, 1 error.
    assert list(emitter.add(_ok(2, payload="iceland"))) == []
    assert [r.index for r in emitter.add(_ok(0, payload="kyoto"))] == [0]
    drained = list(emitter.add(_err(1, message="LLM timeout")))
    # The error result emits in its slot, then slide 2 follows.
    assert [r.index for r in drained] == [1, 2]
    assert drained[0].status == "error"
    assert drained[0].payload == "LLM timeout"
    assert drained[1].status == "ok"
    assert drained[1].payload == "iceland"
    assert emitter.is_complete


def test_ordered_emitter_5_slide_deck_one_failure_isolated():
    """End-to-end: 5-slide deck, slide 3 fails, others succeed in chaotic
    order. Final sequence must be [0, 1, 2, error@3, 4]."""
    emitter = OrderedSlideEmitter(total=5)
    arrival_order = [
        _ok(4, payload="cuisine"),
        _ok(0, payload="hero"),
        _err(3, message="provider 503"),
        _ok(2, payload="day-1"),
        _ok(1, payload="highlights"),
    ]
    final: list[Call3SlideResult] = []
    for r in arrival_order:
        final.extend(list(emitter.add(r)))

    assert [r.index for r in final] == [0, 1, 2, 3, 4]
    assert [r.status for r in final] == ["ok", "ok", "ok", "error", "ok"]
    assert final[3].payload == "provider 503"
    assert emitter.is_complete


def test_ordered_emitter_ignores_duplicate_or_already_emitted_index():
    emitter = OrderedSlideEmitter(total=2)
    list(emitter.add(_ok(0)))
    # Re-adding slide 0 after it was already emitted is a no-op.
    drained = list(emitter.add(_ok(0)))
    assert drained == []
    drained = list(emitter.add(_ok(1)))
    assert [r.index for r in drained] == [1]
    assert emitter.is_complete


def test_ordered_emitter_ignores_out_of_range_index():
    emitter = OrderedSlideEmitter(total=2)
    drained = list(emitter.add(_ok(7, payload="oob")))
    assert drained == []
    list(emitter.add(_ok(0)))
    list(emitter.add(_ok(1)))
    assert emitter.is_complete


def test_ordered_emitter_zero_slide_deck_is_already_complete():
    emitter = OrderedSlideEmitter(total=0)
    assert emitter.is_complete
    assert emitter.next_emit_index == 0

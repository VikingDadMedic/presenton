"""Phase 9.5 chat per-turn safety guards.

Two guards are exercised here:

1. ``stream_reply`` wraps the tool loop in an ``asyncio.wait_for``-based
   producer/consumer with a wall-clock deadline (``CHAT_TURN_TIMEOUT_SECONDS``
   env var, default 90s). When the deadline fires the generator emits an
   ``("error", ...)`` event and exits without persisting a turn.
2. ``_iterate_tool_loop_events`` enforces a per-turn ``saveSlide`` budget
   (``CHAT_MAX_SLIDES_PER_TURN`` env var, default 5). Calls beyond the budget
   are short-circuited to a tool-level error result so the LLM keeps control
   of the turn and can recover gracefully.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.chat.service import (
    DEFAULT_CHAT_TURN_TIMEOUT_SECONDS,
    DEFAULT_MAX_SLIDES_PER_TURN,
    PresentationChatService,
)


def _make_service() -> PresentationChatService:
    sql_session = MagicMock()
    presentation_id = uuid.uuid4()
    return PresentationChatService(
        sql_session=sql_session,
        presentation_id=presentation_id,
        conversation_id=None,
    )


# ---------------------------------------------------------------------------
# 1. Wall-clock timeout
# ---------------------------------------------------------------------------


def _slow_tool_loop_factory(sleep_seconds: float):
    """Returns a coroutine factory matching ``_iterate_tool_loop_events``'s
    signature that simulates an LLM call hung past the deadline.
    """

    async def _slow(_messages, _final_state):
        # Use a sleep substantially larger than the test timeout so the
        # consumer's wait_for cancellation kicks in deterministically.
        await asyncio.sleep(sleep_seconds)
        if False:  # pragma: no cover - keep this an async generator
            yield

    return _slow


def test_stream_reply_timeout_emits_error_frame_and_exits(monkeypatch):
    monkeypatch.setenv("CHAT_TURN_TIMEOUT_SECONDS", "0.05")

    service = _make_service()

    # ``_prepare_turn_context`` would normally hit the DB; bypass it.
    fake_conversation_id = uuid.uuid4()
    service._prepare_turn_context = AsyncMock(  # type: ignore[method-assign]
        return_value=(fake_conversation_id, [])
    )

    # Tool loop never yields — simulate a hung LLM call.
    service._iterate_tool_loop_events = _slow_tool_loop_factory(  # type: ignore[method-assign]
        sleep_seconds=10.0
    )

    persist_mock = AsyncMock()
    service._persist_turn = persist_mock  # type: ignore[method-assign]

    async def _drive():
        events: list[tuple] = []
        async for evt in service.stream_reply("hello"):
            events.append(evt)
        return events

    events = asyncio.run(_drive())

    assert events[0] == ("status", "Reading deck context")

    # Final event must be the error frame; persist must NOT have been called.
    assert any(
        evt_type == "error" and "90s timeout" in (value or "")
        for evt_type, value in events
    ), events
    assert not any(evt_type == "complete" for evt_type, _ in events)
    persist_mock.assert_not_awaited()


def test_chat_turn_timeout_default_is_90_seconds():
    """Guard against silent default drift — the plan specifies 90s."""

    assert DEFAULT_CHAT_TURN_TIMEOUT_SECONDS == 90.0


def test_max_slides_per_turn_default_is_five():
    """Guard against silent default drift — the plan specifies 5."""

    assert DEFAULT_MAX_SLIDES_PER_TURN == 5


# ---------------------------------------------------------------------------
# 2. saveSlide-per-turn budget
# ---------------------------------------------------------------------------


def _make_save_slide_tool_call(idx: int) -> SimpleNamespace:
    return SimpleNamespace(
        id=f"call_{idx}",
        name="saveSlide",
        arguments=json.dumps(
            {
                "content": json.dumps(
                    {"title": f"slide {idx}", "__speaker_note__": "n"}
                ),
                "layout_id": "layout-a",
                "index": idx,
                "replace_old_slide_at_index": False,
            }
        ),
    )


def _build_stream_events_for_round(*, tool_calls: list, content: str = "") -> list:
    """Construct the iterable of events that ``stream_generate_events`` would
    yield for a single round.

    A round always finishes with a ``"completion"`` event whose
    ``tool_calls`` (if any) drive the next iteration. A round with no
    tool calls yields a final ``"content"`` event with ``content`` text and
    a completion that has empty ``tool_calls``.
    """

    events: list = []
    if content:
        events.append(SimpleNamespace(type="content", chunk=content))
    events.append(
        SimpleNamespace(
            type="completion",
            tool_calls=list(tool_calls),
            messages=None,
            content=content,
        )
    )
    return events


def _drive_iterate_tool_loop(service, *, rounds: list[list]) -> tuple[list, dict]:
    """Drives ``_iterate_tool_loop_events`` against a synthetic LLM stream.

    ``rounds`` is a list of per-round event lists. The N-th call to
    ``stream_generate_events`` yields the N-th list.
    """

    tool_results: list[dict] = []

    async def _fake_execute_tool_call(tool_call):
        result = {
            "ok": True,
            "tool": tool_call.name,
            "result": {"saved": True, "id": tool_call.id},
        }
        tool_results.append({"call_id": tool_call.id, "name": tool_call.name})
        return result

    service._tools.execute_tool_call = _fake_execute_tool_call  # type: ignore[method-assign]
    service._tools.get_tool_definitions = MagicMock(return_value=[])  # type: ignore[method-assign]

    rounds_iter = iter(rounds)

    async def _fake_stream_generate_events(_client, **_kwargs):
        round_events = next(rounds_iter)
        for event in round_events:
            yield event

    final_state: dict = {"response_text": None, "called_tools": []}

    async def _drive():
        with patch(
            "services.chat.service.get_client",
            MagicMock(return_value=MagicMock()),
        ), patch(
            "services.chat.service.get_llm_config",
            MagicMock(return_value=MagicMock()),
        ), patch(
            "services.chat.service.get_model",
            MagicMock(return_value="model-x"),
        ), patch(
            "services.chat.service.get_generate_kwargs",
            MagicMock(return_value={}),
        ), patch(
            "services.chat.service.stream_generate_events",
            _fake_stream_generate_events,
        ), patch(
            "services.chat.service.WebSearchTool",
            MagicMock(return_value=MagicMock()),
        ):
            collected: list = []
            async for evt in service._iterate_tool_loop_events([], final_state):
                collected.append(evt)
            return collected

    asyncio.run(_drive())
    return tool_results, final_state


def test_save_slide_budget_six_attempts_blocks_sixth(monkeypatch):
    """With default budget = 5, the 6th saveSlide attempt is short-circuited
    to a tool-level error while attempts 1-5 actually execute.
    """

    monkeypatch.delenv("CHAT_MAX_SLIDES_PER_TURN", raising=False)

    service = _make_service()

    # Round 1: model emits 6 saveSlide tool calls.
    six_save_calls = [_make_save_slide_tool_call(i) for i in range(6)]
    # Round 2: no tool calls, final content message.
    rounds = [
        _build_stream_events_for_round(tool_calls=six_save_calls),
        _build_stream_events_for_round(tool_calls=[], content="done"),
    ]

    tool_results, final_state = _drive_iterate_tool_loop(service, rounds=rounds)

    # Exactly 5 saveSlides reach the real handler (calls 0..4).
    executed_ids = [entry["call_id"] for entry in tool_results]
    assert executed_ids == [f"call_{i}" for i in range(5)], executed_ids

    # The final response_text reflects round 2's content.
    assert final_state["response_text"] == "done"

    # All 6 are listed in called_tools (the trace yields names regardless of
    # whether the call was budget-rejected — telemetry parity matters).
    assert final_state["called_tools"].count("saveSlide") == 6


def test_save_slide_budget_lower_count_succeeds(monkeypatch):
    """Three saveSlide calls all execute when the budget is 5."""

    monkeypatch.delenv("CHAT_MAX_SLIDES_PER_TURN", raising=False)

    service = _make_service()

    three_save_calls = [_make_save_slide_tool_call(i) for i in range(3)]
    rounds = [
        _build_stream_events_for_round(tool_calls=three_save_calls),
        _build_stream_events_for_round(tool_calls=[], content="ok"),
    ]

    tool_results, final_state = _drive_iterate_tool_loop(service, rounds=rounds)

    executed_ids = [entry["call_id"] for entry in tool_results]
    assert executed_ids == ["call_0", "call_1", "call_2"]
    assert final_state["response_text"] == "ok"


def test_save_slide_budget_env_override_two(monkeypatch):
    """``CHAT_MAX_SLIDES_PER_TURN=2`` overrides the default 5."""

    monkeypatch.setenv("CHAT_MAX_SLIDES_PER_TURN", "2")

    service = _make_service()

    three_save_calls = [_make_save_slide_tool_call(i) for i in range(3)]
    rounds = [
        _build_stream_events_for_round(tool_calls=three_save_calls),
        _build_stream_events_for_round(tool_calls=[], content="ok"),
    ]

    tool_results, _ = _drive_iterate_tool_loop(service, rounds=rounds)

    executed_ids = [entry["call_id"] for entry in tool_results]
    # First two execute; third is short-circuited.
    assert executed_ids == ["call_0", "call_1"]


def test_save_slide_budget_overflow_message_carries_env_var_name(monkeypatch):
    """The overflow tool-result must carry the env-var name so the LLM
    log + future debugging surface know which knob to tune.
    """

    monkeypatch.setenv("CHAT_MAX_SLIDES_PER_TURN", "1")

    service = _make_service()

    two_save_calls = [_make_save_slide_tool_call(i) for i in range(2)]
    rounds = [
        _build_stream_events_for_round(tool_calls=two_save_calls),
        _build_stream_events_for_round(tool_calls=[], content="ok"),
    ]

    # Capture the messages list in real time so we can inspect the
    # ToolResponseMessage payload that's sent back to the LLM.
    captured_tool_response_payloads: list[str] = []

    async def _fake_execute(_tool_call):
        return {"ok": True, "tool": "saveSlide", "result": {"saved": True}}

    service._tools.execute_tool_call = _fake_execute  # type: ignore[method-assign]
    service._tools.get_tool_definitions = MagicMock(return_value=[])  # type: ignore[method-assign]

    rounds_iter = iter(rounds)

    async def _fake_stream(_client, **_kwargs):
        for event in next(rounds_iter):
            yield event

    final_state: dict = {"response_text": None, "called_tools": []}

    async def _drive():
        with patch(
            "services.chat.service.get_client",
            MagicMock(return_value=MagicMock()),
        ), patch(
            "services.chat.service.get_llm_config",
            MagicMock(return_value=MagicMock()),
        ), patch(
            "services.chat.service.get_model",
            MagicMock(return_value="model-x"),
        ), patch(
            "services.chat.service.get_generate_kwargs",
            MagicMock(return_value={}),
        ), patch(
            "services.chat.service.stream_generate_events",
            _fake_stream,
        ), patch(
            "services.chat.service.WebSearchTool",
            MagicMock(return_value=MagicMock()),
        ):
            async for evt in service._iterate_tool_loop_events([], final_state):
                # The trace events include the per-call result message; the
                # full tool result payload is appended as a ToolResponseMessage
                # in the messages list, so we capture that out-of-band by
                # surfacing a copy through final_state.
                if isinstance(evt, tuple) and evt[0] == "trace":
                    payload = evt[1]
                    if (
                        isinstance(payload, dict)
                        and payload.get("kind") == "tool_call"
                        and payload.get("status") == "error"
                    ):
                        captured_tool_response_payloads.append(payload["message"])

    asyncio.run(_drive())

    # We expect at least one error trace whose message documents the env var.
    assert any(
        "CHAT_MAX_SLIDES_PER_TURN" in msg for msg in captured_tool_response_payloads
    ), captured_tool_response_payloads

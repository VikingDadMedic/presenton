import uuid

import pytest
from fastapi import HTTPException

from api.v1.ppt.endpoints.narration import (
    _enforce_monthly_character_budget_or_raise,
    _record_narration_usage,
    _resolve_character_count,
)
from models.sql.narration_usage_log import NarrationUsageLog


class _DummySession:
    def __init__(self, scalar_value: int):
        self.scalar_value = scalar_value
        self.added = []

    async def scalar(self, _statement):
        return self.scalar_value

    def add(self, item):
        self.added.append(item)


@pytest.mark.anyio
async def test_enforce_monthly_budget_raises_when_limit_exceeded(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_MONTHLY_CHARACTER_BUDGET", "100")
    session = _DummySession(scalar_value=95)

    with pytest.raises(HTTPException) as exc:
        await _enforce_monthly_character_budget_or_raise(
            session,
            estimated_characters=10,
        )

    assert exc.value.status_code == 400
    assert "Monthly ElevenLabs narration character budget exceeded" in str(exc.value.detail)


@pytest.mark.anyio
async def test_record_narration_usage_adds_log_row():
    session = _DummySession(scalar_value=0)
    presentation_id = uuid.uuid4()
    slide_id = uuid.uuid4()

    await _record_narration_usage(
        session,
        presentation_id=presentation_id,
        slide_id=slide_id,
        voice_id="voice_123",
        model_id="eleven_v3",
        character_count=321,
        request_id="req-abc",
    )

    assert len(session.added) == 1
    usage_row = session.added[0]
    assert isinstance(usage_row, NarrationUsageLog)
    assert usage_row.presentation_id == presentation_id
    assert usage_row.slide_id == slide_id
    assert usage_row.character_count == 321
    assert usage_row.request_id == "req-abc"


# -----------------------------------------------------------------------------
# Regression tests for the v1d production fix where ElevenLabs response headers
# occasionally omit "x-character-count". Without the fallback to len(text), the
# bulk narration response and the usage summary both reported 0 characters even
# when audio was successfully generated. See commit 1635a50d.
# -----------------------------------------------------------------------------


def test_resolve_character_count_uses_header_when_valid():
    headers = {"x-character-count": "517"}
    assert _resolve_character_count(headers, "ignored text") == 517


def test_resolve_character_count_falls_back_when_header_missing():
    # ElevenLabs intermittently omits this header on eleven_v3 responses.
    headers = {}
    text = "Hello there, traveler."
    assert _resolve_character_count(headers, text) == len(text)


def test_resolve_character_count_falls_back_when_header_zero():
    headers = {"x-character-count": "0"}
    text = "x" * 42
    assert _resolve_character_count(headers, text) == 42


def test_resolve_character_count_falls_back_when_header_non_numeric():
    headers = {"x-character-count": "n/a"}
    text = "fallback"
    assert _resolve_character_count(headers, text) == len(text)


def test_resolve_character_count_handles_none_headers():
    assert _resolve_character_count(None, "hello") == 5

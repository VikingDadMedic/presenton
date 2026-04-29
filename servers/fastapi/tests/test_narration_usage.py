import uuid

import pytest
from fastapi import HTTPException

from api.v1.ppt.endpoints.narration import (
    _enforce_monthly_character_budget_or_raise,
    _record_narration_usage,
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

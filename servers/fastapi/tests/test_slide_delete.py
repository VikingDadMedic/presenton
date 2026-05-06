"""Coverage for `DELETE /api/v1/ppt/slide/{id}`.

Phase 10.6 of the Phase 10 final consolidation plan. Adds the standalone
slide-delete REST endpoint that mirrors the chat `deleteSlide` tool's
cleanup contract via the shared `clear_slide_with_narration` helper.

Tests run the FastAPI handler directly with mocked session + helper
(FastAPI's `TestClient` would require full app + DB setup; the unit
approach matches the surrounding `test_slide_edit_pipeline.py` style).
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.responses import Response

from api.v1.ppt.endpoints.slide import delete_slide
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel


def _make_presentation() -> PresentationModel:
    return PresentationModel(
        id=uuid.uuid4(),
        content="Trip context",
        n_slides=1,
        language="English",
        title="Trip",
    )


def _make_slide(presentation_id: uuid.UUID, *, narration_audio_url: str | None = None) -> SlideModel:
    slide = SlideModel(
        id=uuid.uuid4(),
        presentation=presentation_id,
        layout_group="travel",
        layout="travel-itinerary:DestinationHeroLayout",
        index=0,
        content={"title": "Slide title"},
        speaker_note="A narration line.",
        properties=None,
    )
    if narration_audio_url is not None:
        slide.narration_audio_url = narration_audio_url
        slide.narration_text_hash = "abc123"
    return slide


class FakeAsyncSession:
    """Minimal async-session double that satisfies the handler's `.get(...)` calls."""

    def __init__(self, *, slide: SlideModel | None, presentation: PresentationModel | None):
        self._slide = slide
        self._presentation = presentation
        self.deleted: list[Any] = []
        self.commit_count = 0

    async def get(self, model_cls, lookup_id):
        if model_cls is SlideModel:
            return self._slide
        if model_cls is PresentationModel:
            return self._presentation
        return None

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        self.commit_count += 1


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_delete_slide_happy_path_returns_204_and_invokes_helper():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(slide=slide, presentation=presentation)
    helper_mock = AsyncMock()

    with patch(
        "api.v1.ppt.endpoints.slide.clear_slide_with_narration", helper_mock
    ):
        response = _run(delete_slide(slide_id=slide.id, sql_session=session))

    helper_mock.assert_awaited_once_with(slide, session)
    assert isinstance(response, Response)
    assert response.status_code == 204
    assert response.body == b""


# ---------------------------------------------------------------------------
# 404 paths
# ---------------------------------------------------------------------------


def test_delete_slide_returns_404_when_slide_missing():
    session = FakeAsyncSession(slide=None, presentation=None)
    helper_mock = AsyncMock()

    with patch(
        "api.v1.ppt.endpoints.slide.clear_slide_with_narration", helper_mock
    ):
        with pytest.raises(HTTPException) as exc_info:
            _run(delete_slide(slide_id=uuid.uuid4(), sql_session=session))

    helper_mock.assert_not_awaited()
    assert exc_info.value.status_code == 404
    assert "Slide not found" in exc_info.value.detail


def test_delete_slide_returns_404_when_presentation_missing():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(slide=slide, presentation=None)
    helper_mock = AsyncMock()

    with patch(
        "api.v1.ppt.endpoints.slide.clear_slide_with_narration", helper_mock
    ):
        with pytest.raises(HTTPException) as exc_info:
            _run(delete_slide(slide_id=slide.id, sql_session=session))

    helper_mock.assert_not_awaited()
    assert exc_info.value.status_code == 404
    assert "Presentation not found" in exc_info.value.detail


# ---------------------------------------------------------------------------
# Cleanup contract
# ---------------------------------------------------------------------------


def test_delete_slide_clears_narration_audio_file_and_columns():
    """End-to-end through the helper: narration audio file is removed
    and narration_* columns are zeroed by `_clear_slide_narration`.
    """
    import os
    import tempfile
    from services import slide_edit_pipeline

    presentation = _make_presentation()
    audio_dir = tempfile.mkdtemp()
    audio_path = os.path.join(audio_dir, "test_slide.mp3")
    with open(audio_path, "wb") as audio_handle:
        audio_handle.write(b"fake-mp3")

    slide = _make_slide(
        presentation.id,
        narration_audio_url="/app_data/audio/test_slide.mp3",
    )
    assert slide.narration_audio_url is not None
    assert slide.narration_text_hash is not None
    session = FakeAsyncSession(slide=slide, presentation=presentation)

    # Patch _clear_slide_narration's audio_directory lookup so it points at
    # our tempdir, then exercise the real helper to verify the cleanup
    # contract end-to-end (file removal + column reset).
    with patch(
        "api.v1.ppt.endpoints.narration.get_audio_directory", return_value=audio_dir
    ):
        response = _run(delete_slide(slide_id=slide.id, sql_session=session))

    assert response.status_code == 204
    # Helper should have removed the audio file
    assert not os.path.isfile(audio_path)
    # And cleared the narration columns
    assert slide.narration_audio_url is None
    assert slide.narration_text_hash is None
    assert slide.narration_generated_at is None


def test_delete_slide_persists_via_session_delete_and_commit():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(slide=slide, presentation=presentation)

    # Use real helper but stub out narration cleanup (no audio file)
    with patch("services.slide_edit_pipeline._clear_slide_narration"):
        response = _run(delete_slide(slide_id=slide.id, sql_session=session))

    assert response.status_code == 204
    assert session.deleted == [slide]
    assert session.commit_count == 1

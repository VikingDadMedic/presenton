"""Phase 9.3 grafting parity coverage.

Asserts that chat ``saveSlide`` (replace path) routes through
``apply_slide_edit_with_pipeline`` and ``deleteSlide`` routes through
``clear_slide_with_narration``, so chat-driven edits get the same travel-aware
pipeline (auto-IPA + narration clear + asset diff + mem0 store) as direct
``/slide/edit`` edits.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.chat.memory_layer import PresentationChatMemoryLayer


@pytest.fixture(autouse=True)
def _ensure_app_data_directory(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path))


def _layout_dict(layout_id: str = "layout-a") -> dict:
    return {
        "name": "test-layout",
        "ordered": False,
        "slides": [
            {
                "id": layout_id,
                "name": "Test Slide",
                "description": "Test description",
                "json_schema": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "__speaker_note__": {"type": "string"},
                    },
                    "required": ["title"],
                },
            }
        ],
    }


def _make_presentation(**overrides) -> PresentationModel:
    base = dict(
        id=uuid.uuid4(),
        content="Trip notes.",
        n_slides=1,
        language="English",
        title="Test deck",
        layout=_layout_dict(),
        enriched_data={"destination_name": "Lisbon"},
        narration_tone="travel_companion",
    )
    base.update(overrides)
    return PresentationModel(**base)


def _make_slide(presentation_id: uuid.UUID, *, layout: str = "layout-a") -> SlideModel:
    return SlideModel(
        id=uuid.uuid4(),
        presentation=presentation_id,
        layout_group="travel",
        layout=layout,
        index=0,
        content={"title": "Old", "__speaker_note__": "Old narration."},
        speaker_note="Old narration.",
        narration_audio_url="/app_data/audio/some/slide_0.mp3",
    )


class FakeAsyncSession:
    def __init__(self, presentation: PresentationModel, slide: SlideModel | None = None):
        self.presentation = presentation
        self.slide = slide
        self.added: list = []
        self.added_all: list = []
        self.commit_count = 0
        self.deleted: list = []

    async def get(self, model, _id):
        if model is PresentationModel:
            return self.presentation
        if model is SlideModel:
            return self.slide
        return None

    async def scalar(self, _query):
        return self.slide

    async def scalars(self, _query):
        result = MagicMock()
        result.all = MagicMock(return_value=[self.slide] if self.slide else [])
        return result

    def add(self, obj):
        self.added.append(obj)

    def add_all(self, objs):
        self.added_all.extend(objs)

    async def commit(self):
        self.commit_count += 1

    async def delete(self, obj):
        self.deleted.append(obj)

    async def refresh(self, _obj):
        return None


def _patch_chat_save_slide(*, ipa_speaker: str = "ipa-augmented narration."):
    ipa_mock = AsyncMock(return_value=ipa_speaker)
    asset_mock = AsyncMock(return_value=[])
    mem0_mock = MagicMock()
    mem0_mock.retrieve_context = AsyncMock(return_value="")
    mem0_mock.store_slide_edit = AsyncMock()
    narration_mock = MagicMock()

    return {
        "ipa": patch(
            "services.slide_edit_pipeline.augment_speaker_note_with_ipa",
            ipa_mock,
        ),
        "assets": patch(
            "services.slide_edit_pipeline.process_old_and_new_slides_and_fetch_assets",
            asset_mock,
        ),
        "mem0": patch(
            "services.slide_edit_pipeline.MEM0_PRESENTATION_MEMORY_SERVICE",
            mem0_mock,
        ),
        "narration": patch(
            "services.slide_edit_pipeline._clear_slide_narration",
            narration_mock,
        ),
        "_mocks": {
            "ipa": ipa_mock,
            "assets": asset_mock,
            "mem0": mem0_mock,
            "narration": narration_mock,
        },
    }


def _enter(bundle):
    contexts = []
    for key in ("ipa", "assets", "mem0", "narration"):
        ctx = bundle[key]
        ctx.__enter__()
        contexts.append(ctx)
    return contexts


def _exit(contexts):
    for ctx in contexts:
        ctx.__exit__(None, None, None)


def test_chat_save_slide_replace_triggers_ipa_augmentation():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(presentation=presentation, slide=slide)
    layer = PresentationChatMemoryLayer(session, presentation.id)

    bundle = _patch_chat_save_slide(ipa_speaker="<phoneme>tagged</phoneme> narration.")
    contexts = _enter(bundle)
    try:
        result = asyncio.run(
            layer.save_slide(
                content={
                    "title": "New title",
                    "__speaker_note__": "Plain narration without ipa hints.",
                },
                layout_id="layout-a",
                index=0,
                replace_old_slide_at_index=True,
            )
        )
    finally:
        _exit(contexts)

    bundle["_mocks"]["ipa"].assert_awaited_once()
    ipa_call_kwargs = bundle["_mocks"]["ipa"].call_args.kwargs
    assert ipa_call_kwargs["destination"] == presentation.enriched_data
    assert result["saved"] is True
    assert result["action"] == "replaced"


def test_chat_save_slide_replace_clears_narration_audio():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(presentation=presentation, slide=slide)
    layer = PresentationChatMemoryLayer(session, presentation.id)

    bundle = _patch_chat_save_slide()
    contexts = _enter(bundle)
    try:
        asyncio.run(
            layer.save_slide(
                content={
                    "title": "New",
                    "__speaker_note__": "Some narration.",
                },
                layout_id="layout-a",
                index=0,
                replace_old_slide_at_index=True,
            )
        )
    finally:
        _exit(contexts)

    bundle["_mocks"]["narration"].assert_called_once()
    call_args = bundle["_mocks"]["narration"].call_args
    assert call_args.kwargs.get("also_remove_file") is True


def test_chat_save_slide_replace_stores_mem0_entry():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(presentation=presentation, slide=slide)
    layer = PresentationChatMemoryLayer(session, presentation.id)

    bundle = _patch_chat_save_slide()
    contexts = _enter(bundle)
    try:
        asyncio.run(
            layer.save_slide(
                content={
                    "title": "New",
                    "__speaker_note__": "Some narration.",
                },
                layout_id="layout-a",
                index=0,
                replace_old_slide_at_index=True,
            )
        )
    finally:
        _exit(contexts)

    bundle["_mocks"]["mem0"].store_slide_edit.assert_awaited_once()
    store_call_kwargs = bundle["_mocks"]["mem0"].store_slide_edit.call_args.kwargs
    assert store_call_kwargs["presentation_id"] == presentation.id
    assert store_call_kwargs["slide_index"] == 0
    assert store_call_kwargs["edit_prompt"] == "[chat saveSlide]"


def test_chat_save_slide_replace_skips_call6_layout_repick():
    """When chat saves a slide, the layout has already been chosen by the
    chat LLM via getAvailableLayouts. The pipeline must NOT trigger Call 6
    (LLM layout repick) — saveSlide passes layout_override + skip_layout_repick.
    """
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(presentation=presentation, slide=slide)
    layer = PresentationChatMemoryLayer(session, presentation.id)

    bundle = _patch_chat_save_slide()
    contexts = _enter(bundle)
    layout_repick_mock = AsyncMock()
    layout_patch = patch(
        "services.slide_edit_pipeline.get_slide_layout_from_prompt",
        layout_repick_mock,
    )
    layout_patch.__enter__()
    try:
        asyncio.run(
            layer.save_slide(
                content={
                    "title": "x",
                    "__speaker_note__": "y narration",
                },
                layout_id="layout-a",
                index=0,
                replace_old_slide_at_index=True,
            )
        )
    finally:
        layout_patch.__exit__(None, None, None)
        _exit(contexts)

    layout_repick_mock.assert_not_awaited()


def test_chat_save_slide_skips_call4_llm_rewrite():
    """saveSlide content is supplied by the chat LLM directly. The pipeline
    must NOT invoke Call 4 (get_edited_slide_content) — chat already produced
    the content via its own tool-loop LLM call.
    """
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(presentation=presentation, slide=slide)
    layer = PresentationChatMemoryLayer(session, presentation.id)

    bundle = _patch_chat_save_slide()
    contexts = _enter(bundle)
    edit_mock = AsyncMock()
    edit_patch = patch(
        "services.slide_edit_pipeline.get_edited_slide_content",
        edit_mock,
    )
    edit_patch.__enter__()
    try:
        asyncio.run(
            layer.save_slide(
                content={
                    "title": "x",
                    "__speaker_note__": "y narration",
                },
                layout_id="layout-a",
                index=0,
                replace_old_slide_at_index=True,
            )
        )
    finally:
        edit_patch.__exit__(None, None, None)
        _exit(contexts)

    edit_mock.assert_not_awaited()


def test_chat_save_slide_replace_returns_chat_error_shape_when_slide_missing():
    presentation = _make_presentation()
    session = FakeAsyncSession(presentation=presentation, slide=None)
    layer = PresentationChatMemoryLayer(session, presentation.id)

    bundle = _patch_chat_save_slide()
    contexts = _enter(bundle)
    try:
        result = asyncio.run(
            layer.save_slide(
                content={"title": "x", "__speaker_note__": "y narration"},
                layout_id="layout-a",
                index=99,
                replace_old_slide_at_index=True,
            )
        )
    finally:
        _exit(contexts)

    assert result["saved"] is False
    assert "No existing slide found" in result["message"]
    assert result["validation_errors"] == []


def test_chat_delete_slide_clears_narration_audio_and_deletes():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(presentation=presentation, slide=slide)
    layer = PresentationChatMemoryLayer(session, presentation.id)

    with patch(
        "services.slide_edit_pipeline._clear_slide_narration"
    ) as narration_mock:
        result = asyncio.run(layer.delete_slide(index=0))

    narration_mock.assert_called_once_with(slide, also_remove_file=True)
    assert session.deleted == [slide]
    assert result["deleted"] is True


def test_chat_delete_slide_returns_error_when_index_missing():
    presentation = _make_presentation()
    session = FakeAsyncSession(presentation=presentation, slide=None)
    layer = PresentationChatMemoryLayer(session, presentation.id)

    with patch(
        "services.slide_edit_pipeline._clear_slide_narration"
    ) as narration_mock:
        result = asyncio.run(layer.delete_slide(index=99))

    narration_mock.assert_not_called()
    assert result["deleted"] is False
    assert "No slide found" in result["message"]

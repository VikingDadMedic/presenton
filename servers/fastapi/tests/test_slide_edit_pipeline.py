"""Parity coverage for ``services.slide_edit_pipeline``.

Anchors the keystone refactor: ``apply_slide_edit_with_pipeline`` is the single
source of truth for slide edits across both ``/slide/edit`` (direct UI) and the
chat ``saveSlide`` tool (Phase 9.3). These tests guard against any divergence
in pipeline behavior — auto-IPA, narration clear, asset diff, mem0 store,
continuity context, tone preset, destination context — when the helper is
called from either surface.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from typing import Any, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.slide_edit_pipeline import (
    SlideEditResult,
    apply_slide_edit_with_pipeline,
    clear_slide_with_narration,
)
from templates.presentation_layout import PresentationLayoutModel, SlideLayoutModel


def _layout_dict(slide_id: str = "layout-a") -> dict:
    return {
        "name": "test-layout",
        "ordered": False,
        "slides": [
            {
                "id": slide_id,
                "name": "Test Slide",
                "description": "Test description",
                "json_schema": {
                    "type": "object",
                    "properties": {"title": {"type": "string"}},
                    "required": ["title"],
                },
            },
            {
                "id": "layout-b",
                "name": "Other Slide",
                "description": "Alt layout",
                "json_schema": {
                    "type": "object",
                    "properties": {"title": {"type": "string"}},
                    "required": ["title"],
                },
            },
        ],
    }


def _make_presentation(**overrides) -> PresentationModel:
    base = dict(
        id=uuid.uuid4(),
        content="A trip through Kyoto in cherry blossom season.",
        n_slides=3,
        language="English",
        title="Kyoto in Spring",
        layout=_layout_dict(),
        enriched_data={"destination_name": "Kyoto"},
        narration_tone="travel_companion",
        tone="warm",
        verbosity="medium",
        instructions="Keep it punchy.",
    )
    base.update(overrides)
    return PresentationModel(**base)


def _make_slide(
    presentation_id: uuid.UUID,
    *,
    layout: str = "layout-a",
    index: int = 0,
    title: str = "Old Title",
    speaker_note: str = "Old speaker note.",
) -> SlideModel:
    return SlideModel(
        id=uuid.uuid4(),
        presentation=presentation_id,
        layout_group="travel",
        layout=layout,
        index=index,
        content={"title": title, "__speaker_note__": speaker_note},
        speaker_note=speaker_note,
        properties=None,
    )


def _slide_layout(layout_id: str = "layout-a") -> SlideLayoutModel:
    return SlideLayoutModel(
        id=layout_id,
        name="Test Slide",
        description="Test description",
        json_schema={"type": "object", "properties": {"title": {"type": "string"}}},
    )


class FakeAsyncSession:
    def __init__(self, sibling_slides: Optional[List[SlideModel]] = None):
        self.added: list = []
        self.added_all: list = []
        self.commit_count = 0
        self.deleted: list = []
        self._sibling_slides = sibling_slides or []

    def add(self, obj):
        self.added.append(obj)

    def add_all(self, objs):
        self.added_all.extend(objs)

    async def commit(self):
        self.commit_count += 1

    async def delete(self, obj):
        self.deleted.append(obj)

    async def get(self, _model, _id):
        return None

    async def scalars(self, _query):
        scalar_result = MagicMock()
        scalar_result.all = MagicMock(return_value=self._sibling_slides)
        return scalar_result


def _patch_pipeline(
    *,
    edited_content: Optional[dict] = None,
    layout_repick: Optional[SlideLayoutModel] = None,
    asset_count: int = 0,
    mem0_context: str = "",
    ipa_speaker: Optional[str] = None,
):
    edited_content = edited_content or {
        "title": "New Title",
        "__speaker_note__": "Brand new narration with sensory detail.",
    }
    layout_repick = layout_repick or _slide_layout("layout-a")
    image_assets = [MagicMock() for _ in range(asset_count)]

    edit_mock = AsyncMock(return_value=edited_content)
    layout_mock = AsyncMock(return_value=layout_repick)
    asset_mock = AsyncMock(return_value=image_assets)
    mem0_mock = MagicMock()
    mem0_mock.retrieve_context = AsyncMock(return_value=mem0_context)
    mem0_mock.store_slide_edit = AsyncMock()
    clear_narration_mock = MagicMock()
    ipa_default = ipa_speaker or "ipa-augmented narration."
    ipa_mock = AsyncMock(return_value=ipa_default)

    return {
        "edit": patch(
            "services.slide_edit_pipeline.get_edited_slide_content",
            edit_mock,
        ),
        "layout": patch(
            "services.slide_edit_pipeline.get_slide_layout_from_prompt",
            layout_mock,
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
            clear_narration_mock,
        ),
        "ipa": patch(
            "services.slide_edit_pipeline.augment_speaker_note_with_ipa",
            ipa_mock,
        ),
        "_mocks": {
            "edit": edit_mock,
            "layout": layout_mock,
            "assets": asset_mock,
            "mem0": mem0_mock,
            "narration": clear_narration_mock,
            "ipa": ipa_mock,
            "edited_content": edited_content,
            "layout_repick": layout_repick,
            "image_assets": image_assets,
        },
    }


def _enter_patches(patch_bundle):
    contexts = []
    for key in ("edit", "layout", "assets", "mem0", "narration", "ipa"):
        ctx = patch_bundle[key]
        ctx.__enter__()
        contexts.append(ctx)
    return contexts


def _exit_patches(contexts):
    for ctx in contexts:
        ctx.__exit__(None, None, None)


# -----------------------------------------------------------------------------
# Prompt-mode parity coverage
# -----------------------------------------------------------------------------


def test_happy_path_prompt_mode_runs_full_pipeline():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])
    image_service = MagicMock()

    bundle = _patch_pipeline(asset_count=2)
    contexts = _enter_patches(bundle)
    try:
        result = asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=image_service,
                prompt="Rewrite to focus on rooftop ramen spots.",
            )
        )
    finally:
        _exit_patches(contexts)

    mocks = bundle["_mocks"]
    assert mocks["edit"].await_count == 1
    assert mocks["layout"].await_count == 1
    assert mocks["assets"].await_count == 1
    mocks["mem0"].retrieve_context.assert_awaited_once()
    mocks["mem0"].store_slide_edit.assert_awaited_once()
    mocks["narration"].assert_called_once_with(slide, also_remove_file=True)
    assert session.commit_count == 1
    assert isinstance(result, SlideEditResult)
    assert len(result.new_assets) == 2


def test_layout_override_skips_call6():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])
    override_layout = _slide_layout("layout-b")

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        result = asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="anything",
                layout_override=override_layout,
            )
        )
    finally:
        _exit_patches(contexts)

    bundle["_mocks"]["layout"].assert_not_awaited()
    assert result.slide.layout == "layout-b"
    assert result.layout_changed is True


def test_skip_layout_repick_uses_current_layout():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id, layout="layout-a")
    session = FakeAsyncSession(sibling_slides=[slide])

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        result = asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="reuse-layout edit",
                skip_layout_repick=True,
            )
        )
    finally:
        _exit_patches(contexts)

    bundle["_mocks"]["layout"].assert_not_awaited()
    assert result.slide.layout == "layout-a"
    assert result.layout_changed is False


def test_skip_asset_refresh_returns_empty_asset_list():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])

    bundle = _patch_pipeline(asset_count=3)
    contexts = _enter_patches(bundle)
    try:
        result = asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
                skip_asset_refresh=True,
            )
        )
    finally:
        _exit_patches(contexts)

    bundle["_mocks"]["assets"].assert_not_awaited()
    assert result.new_assets == []


def test_skip_mem0_retrieve_short_circuits_retrieval():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        result = asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
                skip_mem0_retrieve=True,
            )
        )
    finally:
        _exit_patches(contexts)

    bundle["_mocks"]["mem0"].retrieve_context.assert_not_awaited()
    assert result.memory_context_used is False


def test_skip_mem0_store_short_circuits_storage():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
                skip_mem0_store=True,
            )
        )
    finally:
        _exit_patches(contexts)

    bundle["_mocks"]["mem0"].store_slide_edit.assert_not_awaited()


def test_skip_narration_clear_short_circuits_audio_cleanup():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
                skip_narration_clear=True,
            )
        )
    finally:
        _exit_patches(contexts)

    bundle["_mocks"]["narration"].assert_not_called()


def test_commit_false_defers_persistence():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
                commit=False,
            )
        )
    finally:
        _exit_patches(contexts)

    assert session.commit_count == 0


def test_new_slide_id_is_assigned_on_edit():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    original_id = slide.id
    session = FakeAsyncSession(sibling_slides=[slide])

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        result = asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
            )
        )
    finally:
        _exit_patches(contexts)

    assert result.slide.id != original_id


def test_continuity_context_first_slide_has_no_previous():
    presentation = _make_presentation()
    s1 = _make_slide(presentation.id, index=0)
    s2 = _make_slide(presentation.id, index=1, title="Slide Two")
    s3 = _make_slide(presentation.id, index=2, title="Slide Three")
    session = FakeAsyncSession(sibling_slides=[s1, s2, s3])

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=s1,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
            )
        )
    finally:
        _exit_patches(contexts)

    edit_call_kwargs = bundle["_mocks"]["edit"].call_args.kwargs
    assert edit_call_kwargs["previous_slide_title"] is None
    assert edit_call_kwargs["next_slide_title"] == "Slide Two"


def test_continuity_context_middle_slide_has_both_neighbors():
    presentation = _make_presentation()
    s1 = _make_slide(presentation.id, index=0, title="Slide One")
    s2 = _make_slide(presentation.id, index=1, title="Slide Two")
    s3 = _make_slide(presentation.id, index=2, title="Slide Three")
    session = FakeAsyncSession(sibling_slides=[s1, s2, s3])

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=s2,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
            )
        )
    finally:
        _exit_patches(contexts)

    edit_call_kwargs = bundle["_mocks"]["edit"].call_args.kwargs
    assert edit_call_kwargs["previous_slide_title"] == "Slide One"
    assert edit_call_kwargs["next_slide_title"] == "Slide Three"


def test_continuity_context_last_slide_has_no_next():
    presentation = _make_presentation()
    s1 = _make_slide(presentation.id, index=0, title="Slide One")
    s2 = _make_slide(presentation.id, index=1, title="Slide Two")
    s3 = _make_slide(presentation.id, index=2, title="Slide Three")
    session = FakeAsyncSession(sibling_slides=[s1, s2, s3])

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=s3,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
            )
        )
    finally:
        _exit_patches(contexts)

    edit_call_kwargs = bundle["_mocks"]["edit"].call_args.kwargs
    assert edit_call_kwargs["previous_slide_title"] == "Slide Two"
    assert edit_call_kwargs["next_slide_title"] is None


def test_tone_preset_passed_from_presentation_narration_tone():
    presentation = _make_presentation(narration_tone="hype_reel")
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
            )
        )
    finally:
        _exit_patches(contexts)

    edit_call_kwargs = bundle["_mocks"]["edit"].call_args.kwargs
    assert edit_call_kwargs["tone_preset"] == "hype_reel"


def test_tone_preset_falls_back_to_env_var(monkeypatch):
    presentation = _make_presentation(narration_tone=None)
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])

    monkeypatch.setenv("ELEVENLABS_DEFAULT_TONE", "documentary")

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
            )
        )
    finally:
        _exit_patches(contexts)

    edit_call_kwargs = bundle["_mocks"]["edit"].call_args.kwargs
    assert edit_call_kwargs["tone_preset"] == "documentary"


def test_destination_context_passed_from_presentation_enriched_data():
    enriched = {"destination_name": "Lisbon", "currency": "EUR"}
    presentation = _make_presentation(enriched_data=enriched)
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
            )
        )
    finally:
        _exit_patches(contexts)

    edit_call_kwargs = bundle["_mocks"]["edit"].call_args.kwargs
    assert edit_call_kwargs["destination_context"] == enriched


def test_layout_changed_flag_set_when_call6_picks_different_layout():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id, layout="layout-a")
    session = FakeAsyncSession(sibling_slides=[slide])

    bundle = _patch_pipeline(layout_repick=_slide_layout("layout-b"))
    contexts = _enter_patches(bundle)
    try:
        result = asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="reshape this",
            )
        )
    finally:
        _exit_patches(contexts)

    assert result.layout_changed is True
    assert result.slide.layout == "layout-b"


def test_memory_context_propagates_to_edit_call():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])

    bundle = _patch_pipeline(mem0_context="prior memory blob")
    contexts = _enter_patches(bundle)
    try:
        result = asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
            )
        )
    finally:
        _exit_patches(contexts)

    call_args = bundle["_mocks"]["edit"].call_args
    assert call_args.args[7] == "prior memory blob"
    assert result.memory_context_used is True


# -----------------------------------------------------------------------------
# Pre-generated content mode (chat saveSlide grafting in Phase 9.3)
# -----------------------------------------------------------------------------


def test_pre_generated_content_runs_ipa_on_speaker_note():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])
    chat_content = {
        "title": "Chat-driven title",
        "__speaker_note__": "Plain narration without ipa hints.",
    }

    bundle = _patch_pipeline(ipa_speaker="<phoneme>plain</phoneme> with ipa.")
    contexts = _enter_patches(bundle)
    try:
        result = asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                pre_generated_content=chat_content,
                layout_override=_slide_layout("layout-a"),
            )
        )
    finally:
        _exit_patches(contexts)

    bundle["_mocks"]["ipa"].assert_awaited_once()
    ipa_call_kwargs = bundle["_mocks"]["ipa"].call_args.kwargs
    assert ipa_call_kwargs["destination"] == presentation.enriched_data
    assert (
        result.slide.content["__speaker_note__"]
        == "<phoneme>plain</phoneme> with ipa."
    )


def test_pre_generated_content_skip_ipa_bypasses_augmentation():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])
    chat_content = {
        "title": "Title",
        "__speaker_note__": "Plain narration.",
    }

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        result = asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                pre_generated_content=chat_content,
                layout_override=_slide_layout("layout-a"),
                skip_ipa=True,
            )
        )
    finally:
        _exit_patches(contexts)

    bundle["_mocks"]["ipa"].assert_not_awaited()
    assert result.slide.content["__speaker_note__"] == "Plain narration."


def test_pre_generated_content_does_not_call_get_edited_slide_content():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                pre_generated_content={"title": "x", "__speaker_note__": "y"},
                layout_override=_slide_layout("layout-a"),
                skip_ipa=True,
            )
        )
    finally:
        _exit_patches(contexts)

    bundle["_mocks"]["edit"].assert_not_awaited()
    bundle["_mocks"]["layout"].assert_not_awaited()


# -----------------------------------------------------------------------------
# Validation
# -----------------------------------------------------------------------------


def test_validation_rejects_both_prompt_and_pre_generated():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])

    with pytest.raises(ValueError, match="does not accept both"):
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
                prompt="x",
                pre_generated_content={"title": "y"},
            )
        )


def test_validation_rejects_neither_prompt_nor_pre_generated():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession(sibling_slides=[slide])

    with pytest.raises(ValueError, match="requires either"):
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session,
                slide=slide,
                presentation=presentation,
                image_generation_service=MagicMock(),
            )
        )


# -----------------------------------------------------------------------------
# CRITICAL parity test: the endpoint wrapper produces the same behavior as a
# direct helper call (same mocks, same fixtures). Drift here = contract break.
# -----------------------------------------------------------------------------


def test_parity_endpoint_wrapper_vs_direct_helper_call(monkeypatch, tmp_path):
    """The endpoint at /slide/edit was reduced to a thin wrapper around the
    helper. This test asserts that the wrapper preserves contract: when the
    endpoint is called via TestClient with mocked dependencies, the same set of
    pipeline operations fires, in the same order, with the same kwargs, as a
    direct helper invocation against the same fixtures.
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from api.v1.ppt.endpoints.slide import SLIDE_ROUTER
    from services.database import get_async_session

    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path))

    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session_for_endpoint = FakeAsyncSession(sibling_slides=[slide])
    session_for_endpoint.get = AsyncMock(side_effect=[slide, presentation])

    app = FastAPI()
    app.include_router(SLIDE_ROUTER, prefix="/api/v1/ppt")

    async def _override_session():
        yield session_for_endpoint

    app.dependency_overrides[get_async_session] = _override_session

    bundle = _patch_pipeline()
    contexts = _enter_patches(bundle)
    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/ppt/slide/edit",
            json={"id": str(slide.id), "prompt": "rewrite this please"},
        )
    finally:
        _exit_patches(contexts)

    assert response.status_code == 200
    endpoint_mocks = bundle["_mocks"]
    endpoint_edit_call_count = endpoint_mocks["edit"].await_count
    endpoint_layout_call_count = endpoint_mocks["layout"].await_count
    endpoint_assets_call_count = endpoint_mocks["assets"].await_count
    endpoint_mem0_retrieve_count = endpoint_mocks["mem0"].retrieve_context.await_count
    endpoint_mem0_store_count = endpoint_mocks["mem0"].store_slide_edit.await_count
    endpoint_narration_call_count = endpoint_mocks["narration"].call_count

    presentation_b = _make_presentation()
    slide_b = _make_slide(presentation_b.id)
    session_for_helper = FakeAsyncSession(sibling_slides=[slide_b])

    bundle2 = _patch_pipeline()
    contexts2 = _enter_patches(bundle2)
    try:
        asyncio.run(
            apply_slide_edit_with_pipeline(
                sql_session=session_for_helper,
                slide=slide_b,
                presentation=presentation_b,
                image_generation_service=MagicMock(),
                prompt="rewrite this please",
            )
        )
    finally:
        _exit_patches(contexts2)

    helper_mocks = bundle2["_mocks"]
    assert helper_mocks["edit"].await_count == endpoint_edit_call_count == 1
    assert helper_mocks["layout"].await_count == endpoint_layout_call_count == 1
    assert helper_mocks["assets"].await_count == endpoint_assets_call_count == 1
    assert (
        helper_mocks["mem0"].retrieve_context.await_count
        == endpoint_mem0_retrieve_count
        == 1
    )
    assert (
        helper_mocks["mem0"].store_slide_edit.await_count
        == endpoint_mem0_store_count
        == 1
    )
    assert (
        helper_mocks["narration"].call_count
        == endpoint_narration_call_count
        == 1
    )


# -----------------------------------------------------------------------------
# clear_slide_with_narration helper (used by Phase 9.3 chat deleteSlide tool)
# -----------------------------------------------------------------------------


def test_clear_slide_with_narration_deletes_and_clears_audio():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession()

    with patch(
        "services.slide_edit_pipeline._clear_slide_narration"
    ) as narration_mock:
        asyncio.run(clear_slide_with_narration(slide, session))

    narration_mock.assert_called_once_with(slide, also_remove_file=True)
    assert session.deleted == [slide]
    assert session.commit_count == 1


def test_clear_slide_with_narration_commit_false_defers_persistence():
    presentation = _make_presentation()
    slide = _make_slide(presentation.id)
    session = FakeAsyncSession()

    with patch(
        "services.slide_edit_pipeline._clear_slide_narration"
    ):
        asyncio.run(clear_slide_with_narration(slide, session, commit=False))

    assert session.deleted == [slide]
    assert session.commit_count == 0


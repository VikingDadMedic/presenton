"""Shared slide-edit pipeline.

Both `/slide/edit` (direct UI edit) and the chat `saveSlide` tool route through
``apply_slide_edit_with_pipeline`` so the travel-aware augmentations
(auto-IPA, narration clear, asset diff, mem0 store, continuity context, tone
preset, destination context) run on every edit surface.

Two operating modes:

- prompt-mode: caller passes ``prompt: str``. The helper invokes Call 4 (LLM
  content rewrite via ``get_edited_slide_content``) and, if ``skip_layout_repick``
  is False, Call 6 (layout repick via ``get_slide_layout_from_prompt``).
- pre-generated-mode: caller passes ``pre_generated_content: dict`` and
  optionally ``layout_override: SlideLayoutModel``. Used by the chat saveSlide
  tool, which has already produced the new content via its own LLM loop.
  The helper still runs auto-IPA on the speaker note, asset diff, narration
  clear, persistence, and mem0 store.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass, field
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from api.v1.ppt.endpoints.narration import _clear_slide_narration
from models.sql.image_asset import ImageAsset
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.auto_ipa_service import augment_speaker_note_with_ipa
from services.image_generation_service import ImageGenerationService
from services.mem0_presentation_memory_service import (
    MEM0_PRESENTATION_MEMORY_SERVICE,
)
from templates.presentation_layout import SlideLayoutModel
from utils.llm_calls.edit_slide import get_edited_slide_content
from utils.llm_calls.select_slide_type_on_edit import get_slide_layout_from_prompt
from utils.process_slides import process_old_and_new_slides_and_fetch_assets


def _extract_slide_title(slide: SlideModel) -> str:
    content = slide.content or {}
    title = content.get("title") if isinstance(content, dict) else None
    if isinstance(title, str) and title.strip():
        return title.strip()
    return f"Slide {slide.index + 1}"


def _build_presentation_synopsis(presentation: PresentationModel) -> str:
    if presentation.title and presentation.content:
        return f"{presentation.title.strip()}: {presentation.content.strip()[:420]}"
    if presentation.title:
        return presentation.title.strip()
    if presentation.content:
        return presentation.content.strip()[:420]
    return "Presentation narrative flow."


def _resolve_current_layout(
    presentation: PresentationModel,
    slide: SlideModel,
) -> SlideLayoutModel:
    presentation_layout = presentation.get_layout()
    for layout in presentation_layout.slides:
        if layout.id == slide.layout:
            return layout
    raise ValueError(
        f"Slide layout {slide.layout!r} not found in presentation {presentation.id} layout"
    )


@dataclass
class SlideEditResult:
    slide: SlideModel
    new_assets: List[ImageAsset] = field(default_factory=list)
    layout_changed: bool = False
    memory_context_used: bool = False


async def apply_slide_edit_with_pipeline(
    *,
    sql_session: AsyncSession,
    slide: SlideModel,
    presentation: PresentationModel,
    image_generation_service: ImageGenerationService,
    prompt: Optional[str] = None,
    pre_generated_content: Optional[dict] = None,
    layout_override: Optional[SlideLayoutModel] = None,
    skip_layout_repick: bool = False,
    skip_asset_refresh: bool = False,
    skip_mem0_retrieve: bool = False,
    skip_mem0_store: bool = False,
    skip_narration_clear: bool = False,
    skip_ipa: bool = False,
    commit: bool = True,
) -> SlideEditResult:
    """Apply a slide edit through the full travel-aware pipeline."""
    if prompt is None and pre_generated_content is None:
        raise ValueError(
            "apply_slide_edit_with_pipeline requires either `prompt` or `pre_generated_content`"
        )
    if prompt is not None and pre_generated_content is not None:
        raise ValueError(
            "apply_slide_edit_with_pipeline does not accept both `prompt` and `pre_generated_content`"
        )

    memory_context = ""
    if prompt is not None and not skip_mem0_retrieve:
        memory_context = await MEM0_PRESENTATION_MEMORY_SERVICE.retrieve_context(
            presentation.id,
            prompt,
        )

    if layout_override is not None:
        slide_layout = layout_override
    elif skip_layout_repick or prompt is None:
        slide_layout = _resolve_current_layout(presentation, slide)
    else:
        presentation_layout = presentation.get_layout()
        slide_layout = await get_slide_layout_from_prompt(
            prompt,
            presentation_layout,
            slide,
            memory_context,
        )

    layout_changed = slide_layout.id != slide.layout

    if prompt is not None:
        sibling_slides = list(
            (
                await sql_session.scalars(
                    select(SlideModel)
                    .where(SlideModel.presentation == presentation.id)
                    .order_by(SlideModel.index)
                )
            ).all()
        )
        current_pos = next(
            (idx for idx, sibling in enumerate(sibling_slides) if sibling.id == slide.id),
            None,
        )
        previous_slide_title = (
            _extract_slide_title(sibling_slides[current_pos - 1])
            if current_pos is not None and current_pos > 0
            else None
        )
        next_slide_title = (
            _extract_slide_title(sibling_slides[current_pos + 1])
            if current_pos is not None and current_pos + 1 < len(sibling_slides)
            else None
        )

        edited_slide_content = await get_edited_slide_content(
            prompt,
            slide,
            presentation.language,
            slide_layout,
            presentation.tone,
            presentation.verbosity,
            presentation.instructions,
            memory_context,
            template=slide.layout_group or "",
            previous_slide_title=previous_slide_title,
            next_slide_title=next_slide_title,
            presentation_synopsis=_build_presentation_synopsis(presentation),
            tone_preset=presentation.narration_tone or os.getenv("ELEVENLABS_DEFAULT_TONE"),
            destination_context=presentation.enriched_data,
        )
    else:
        edited_slide_content = pre_generated_content
        if (
            not skip_ipa
            and isinstance(edited_slide_content, dict)
        ):
            speaker_note = edited_slide_content.get("__speaker_note__")
            if isinstance(speaker_note, str) and speaker_note.strip():
                edited_slide_content["__speaker_note__"] = (
                    await augment_speaker_note_with_ipa(
                        speaker_note,
                        destination=presentation.enriched_data,
                    )
                )

    new_assets: List[ImageAsset] = []
    if not skip_asset_refresh:
        new_assets = await process_old_and_new_slides_and_fetch_assets(
            image_generation_service,
            slide.content,
            edited_slide_content,
            template=slide.layout_group,
        )

    slide.id = uuid.uuid4()
    sql_session.add(slide)
    if not skip_narration_clear:
        _clear_slide_narration(slide, also_remove_file=True)
    slide.content = edited_slide_content
    slide.layout = slide_layout.id
    slide.speaker_note = (
        edited_slide_content.get("__speaker_note__", "")
        if isinstance(edited_slide_content, dict)
        else ""
    )
    if new_assets:
        sql_session.add_all(new_assets)
    if commit:
        await sql_session.commit()

    if not skip_mem0_store:
        await MEM0_PRESENTATION_MEMORY_SERVICE.store_slide_edit(
            presentation_id=presentation.id,
            slide_index=slide.index,
            edit_prompt=prompt or "[chat saveSlide]",
            edited_slide_content=edited_slide_content,
        )

    return SlideEditResult(
        slide=slide,
        new_assets=new_assets,
        layout_changed=layout_changed,
        memory_context_used=bool(memory_context),
    )


async def clear_slide_with_narration(
    slide: SlideModel,
    sql_session: AsyncSession,
    *,
    commit: bool = True,
) -> None:
    """Delete a slide row + its narration audio in one atomic operation.

    Used by the chat `deleteSlide` tool (Phase 9.3). Mirrors the cleanup that
    `delete_presentation` does on bulk delete (`shutil.rmtree(audio_dir/{id})`)
    but for a single slide.
    """
    _clear_slide_narration(slide, also_remove_file=True)
    await sql_session.delete(slide)
    if commit:
        await sql_session.commit()

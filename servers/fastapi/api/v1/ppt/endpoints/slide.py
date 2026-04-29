import copy
import json
import os
from typing import Annotated, Optional
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
import uuid

from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from api.v1.ppt.endpoints.narration import _clear_slide_narration
from services.database import get_async_session
from services.image_generation_service import ImageGenerationService
from services.mem0_presentation_memory_service import (
    MEM0_PRESENTATION_MEMORY_SERVICE,
)
from utils.asset_directory_utils import get_images_directory
from utils.llm_calls.edit_slide import get_edited_field_value, get_edited_slide_content
from utils.llm_calls.edit_slide_html import get_edited_slide_html
from utils.llm_calls.select_slide_type_on_edit import get_slide_layout_from_prompt
from utils.process_slides import process_old_and_new_slides_and_fetch_assets


SLIDE_ROUTER = APIRouter(prefix="/slide", tags=["Slide"])


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


@SLIDE_ROUTER.post("/edit")
async def edit_slide(
    id: Annotated[uuid.UUID, Body()],
    prompt: Annotated[str, Body()],
    sql_session: AsyncSession = Depends(get_async_session),
):
    slide = await sql_session.get(SlideModel, id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    presentation = await sql_session.get(PresentationModel, slide.presentation)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    memory_context = await MEM0_PRESENTATION_MEMORY_SERVICE.retrieve_context(
        presentation.id,
        prompt,
    )

    presentation_layout = presentation.get_layout()
    slide_layout = await get_slide_layout_from_prompt(
        prompt,
        presentation_layout,
        slide,
        memory_context,
    )

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

    image_generation_service = ImageGenerationService(get_images_directory())

    # This will mutate edited_slide_content
    new_assets = await process_old_and_new_slides_and_fetch_assets(
        image_generation_service,
        slide.content,
        edited_slide_content,
        template=slide.layout_group,
    )

    # Always assign a new unique id to the slide
    slide.id = uuid.uuid4()

    sql_session.add(slide)
    _clear_slide_narration(slide, also_remove_file=True)
    slide.content = edited_slide_content
    slide.layout = slide_layout.id
    slide.speaker_note = edited_slide_content.get("__speaker_note__", "")
    sql_session.add_all(new_assets)
    await sql_session.commit()

    await MEM0_PRESENTATION_MEMORY_SERVICE.store_slide_edit(
        presentation_id=presentation.id,
        slide_index=slide.index,
        edit_prompt=prompt,
        edited_slide_content=edited_slide_content,
    )

    return slide


@SLIDE_ROUTER.post("/edit-html", response_model=SlideModel)
async def edit_slide_html(
    id: Annotated[uuid.UUID, Body()],
    prompt: Annotated[str, Body()],
    html: Annotated[Optional[str], Body()] = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    slide = await sql_session.get(SlideModel, id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")

    presentation = await sql_session.get(PresentationModel, slide.presentation)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    html_to_edit = html or slide.html_content
    if not html_to_edit:
        raise HTTPException(status_code=400, detail="No HTML to edit")

    memory_context = await MEM0_PRESENTATION_MEMORY_SERVICE.retrieve_context(
        presentation.id,
        prompt,
    )

    edited_slide_html = await get_edited_slide_html(
        prompt,
        html_to_edit,
        memory_context,
    )

    # Always assign a new unique id to the slide
    # This is to ensure that the nextjs can track slide updates
    slide.id = uuid.uuid4()

    sql_session.add(slide)
    slide.html_content = edited_slide_html
    await sql_session.commit()

    await MEM0_PRESENTATION_MEMORY_SERVICE.store_slide_edit(
        presentation_id=presentation.id,
        slide_index=slide.index,
        edit_prompt=prompt,
        edited_slide_content=edited_slide_html,
    )

    return slide


def _get_value_at_path(data, path: str):
    current = data
    for part in path.split("."):
        if isinstance(current, list):
            current = current[int(part)]
        elif isinstance(current, dict):
            current = current[part]
        else:
            raise KeyError(part)
    return current


def _set_value_at_path(data, path: str, value):
    parts = path.split(".")
    current = data
    for part in parts[:-1]:
        if isinstance(current, list):
            current = current[int(part)]
        elif isinstance(current, dict):
            current = current[part]
        else:
            raise KeyError(part)
    last = parts[-1]
    if isinstance(current, list):
        current[int(last)] = value
    elif isinstance(current, dict):
        current[last] = value


def _coerce_type(new_value_str: str, original_value):
    if isinstance(original_value, bool):
        return new_value_str.lower().strip() in ("true", "yes", "1")
    if isinstance(original_value, int):
        try:
            cleaned = new_value_str.replace(",", "").replace("$", "").replace("€", "").replace("£", "").strip()
            return int(float(cleaned))
        except (ValueError, TypeError):
            return new_value_str
    if isinstance(original_value, float):
        try:
            cleaned = new_value_str.replace(",", "").replace("$", "").replace("€", "").replace("£", "").strip()
            return float(cleaned)
        except (ValueError, TypeError):
            return new_value_str
    if isinstance(original_value, (dict, list)):
        try:
            return json.loads(new_value_str)
        except (json.JSONDecodeError, ValueError):
            return new_value_str
    return new_value_str


@SLIDE_ROUTER.patch("/edit-field")
async def edit_slide_field(
    id: Annotated[uuid.UUID, Body()],
    field_path: Annotated[str, Body()],
    prompt: Annotated[str, Body()],
    sql_session: AsyncSession = Depends(get_async_session),
):
    slide = await sql_session.get(SlideModel, id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")

    presentation = await sql_session.get(PresentationModel, slide.presentation)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    content = copy.deepcopy(slide.content)

    try:
        current_value = _get_value_at_path(content, field_path)
    except (KeyError, IndexError, ValueError):
        raise HTTPException(
            status_code=400, detail=f"Invalid field path: {field_path}"
        )

    new_value_str = await get_edited_field_value(
        prompt=prompt,
        current_value=current_value,
        language=presentation.language or "English",
    )

    new_value = _coerce_type(new_value_str, current_value)
    _set_value_at_path(content, field_path, new_value)

    slide.id = uuid.uuid4()
    sql_session.add(slide)
    slide.content = content
    if field_path == "__speaker_note__":
        if isinstance(new_value, str):
            slide.speaker_note = new_value
        elif new_value is None:
            slide.speaker_note = None
        else:
            slide.speaker_note = str(new_value)
        _clear_slide_narration(slide, also_remove_file=True)
    await sql_session.commit()

    return slide

import copy
import json
from typing import Annotated, Optional
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from api.v1.ppt.endpoints.narration import _clear_slide_narration
from services.auto_ipa_service import augment_speaker_note_with_ipa
from services.database import get_async_session
from services.image_generation_service import ImageGenerationService
from services.mem0_presentation_memory_service import (
    MEM0_PRESENTATION_MEMORY_SERVICE,
)
from services.slide_edit_pipeline import apply_slide_edit_with_pipeline
from utils.asset_directory_utils import get_images_directory
from utils.llm_calls.edit_slide import get_edited_field_value
from utils.llm_calls.edit_slide_html import get_edited_slide_html


SLIDE_ROUTER = APIRouter(prefix="/slide", tags=["Slide"])


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

    image_generation_service = ImageGenerationService(get_images_directory())
    result = await apply_slide_edit_with_pipeline(
        sql_session=sql_session,
        slide=slide,
        presentation=presentation,
        image_generation_service=image_generation_service,
        prompt=prompt,
    )
    return result.slide


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
    if field_path == "__speaker_note__" and isinstance(new_value, str) and new_value.strip():
        new_value = await augment_speaker_note_with_ipa(
            new_value,
            destination=presentation.enriched_data,
        )
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

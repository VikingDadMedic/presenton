import asyncio
from datetime import datetime
from enum import Enum
import json
import os
import random
import shutil
import traceback
from typing import Annotated, Dict, List, Literal, Optional, Tuple, Union
import dirtyjson
from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Path
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from constants.presentation import DEFAULT_TEMPLATES, MAX_NUMBER_OF_SLIDES
from constants.narration import (
    TONE_DEFAULT_VOICE_IDS,
    get_default_tone_for_template,
    normalize_tone_preset,
)
from enums.webhook_event import WebhookEvent
from models.api_error_model import APIErrorModel
from models.generate_presentation_request import GeneratePresentationRequest
from models.presentation_and_path import PresentationPathAndEditPath
from models.presentation_from_template import EditPresentationRequest
from models.presentation_outline_model import (
    PresentationOutlineModel,
    SlideOutlineModel,
)
from enums.tone import Tone
from enums.verbosity import Verbosity
from models.pptx_models import PptxPresentationModel
from models.presentation_structure_model import PresentationStructureModel
from models.presentation_with_slides import (
    PresentationWithSlides,
)
from models.sql.template import TemplateModel
from services.documents_loader import DocumentsLoader
from services.webhook_service import WebhookService
from services.image_generation_service import ImageGenerationService
from services.mem0_presentation_memory_service import (
    MEM0_PRESENTATION_MEMORY_SERVICE,
)
from utils.dict_utils import deep_update
from utils.agent_profile_overlay import (
    apply_agent_profile_overlays,
    build_agent_profile_slide_instructions,
)
from utils.export_utils import export_presentation
from utils.llm_calls.generate_presentation_outlines import (
    generate_ppt_outline,
    get_messages as get_outline_messages,
)
from models.sql.slide import SlideModel
from models.sql.presentation_layout_code import PresentationLayoutCodeModel
from models.sse_response import SSECompleteResponse, SSEErrorResponse, SSEResponse
from api.v1.ppt.endpoints.narration import _clear_slide_narration

from services.database import get_async_session
from services.temp_file_service import TEMP_FILE_SERVICE
from services.concurrent_service import CONCURRENT_SERVICE
from models.sql.presentation import PresentationModel
from services.pptx_presentation_creator import PptxPresentationCreator
from models.sql.async_presentation_generation_status import (
    AsyncPresentationGenerationTaskModel,
)
from utils.asset_directory_utils import (
    get_audio_directory,
    get_exports_directory,
    get_images_directory,
)
from utils.llm_calls.generate_presentation_structure import (
    generate_presentation_structure,
)
from utils.llm_calls.generate_slide_content import (
    get_slide_content_from_type_and_outline,
)
from utils.call3_concurrency import (
    Call3SlideResult,
    OrderedSlideEmitter,
    parse_content_model_concurrency,
)
from utils.ppt_utils import (
    select_toc_or_list_slide_layout_index,
)
from utils.outline_utils import (
    get_images_for_slides_from_outline,
    get_no_of_outlines_to_generate_for_n_slides,
    get_no_of_toc_required_for_n_outlines,
    get_presentation_outline_model_with_toc,
    get_presentation_title_from_presentation_outline,
)
from utils.process_slides import (
    process_slide_add_placeholder_assets,
    process_slide_and_fetch_assets,
)
from utils.get_layout_by_name import get_layout_by_name
from utils.llm_utils import message_content_to_text
from models.presentation_layout import PresentationLayoutModel
from utils.user_config import get_agent_profile
import uuid


PRESENTATION_ROUTER = APIRouter(prefix="/presentation", tags=["Presentation"])


class PresentationVisibilityRequest(BaseModel):
    is_public: bool


class RecapMode(str, Enum):
    WELCOME_HOME = "welcome_home"
    ANNIVERSARY = "anniversary"
    NEXT_PLANNING_WINDOW = "next_planning_window"


class RecapPresentationRequest(BaseModel):
    mode: RecapMode = Field(..., description="Recap mode to generate")
    source_presentation_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Existing presentation id to derive recap context from",
    )
    source_presentation_ids: Optional[List[uuid.UUID]] = Field(
        default=None,
        description=(
            "Multiple existing presentation ids to derive recap context from. "
            "When set, the handler runs one recap per source serially and returns "
            "BulkRecapPresentationResponse instead of RecapPresentationResponse."
        ),
    )
    source_json: Optional[dict] = Field(
        default=None,
        description="Raw source context JSON exported from a prior presentation",
    )
    template: Optional[str] = Field(
        default=None,
        description="Optional template override for recap generation",
    )
    n_slides: Optional[int] = Field(
        default=None,
        description="Optional slide count override; otherwise auto-detected",
    )
    language: Optional[str] = Field(
        default=None,
        description="Optional language override for the recap deck",
    )
    tone: Optional[Tone] = Field(
        default=None,
        description="Optional text tone override for recap generation",
    )
    narration_tone: Optional[str] = Field(
        default=None,
        description="Optional narration tone preset override",
    )
    verbosity: Verbosity = Field(
        default=Verbosity.STANDARD,
        description="Verbosity preset for generated slide content",
    )
    instructions: Optional[str] = Field(
        default=None,
        description="Additional user instructions appended to recap instructions",
    )
    web_search: bool = Field(
        default=False,
        description="Whether to enable web grounding for recap generation",
    )
    include_table_of_contents: bool = Field(
        default=False, description="Include table of contents slide(s)"
    )
    include_title_slide: bool = Field(
        default=True, description="Include a title slide"
    )
    export_as: Literal["pptx", "pdf", "html", "video"] = Field(
        default="pptx", description="Export format"
    )
    origin: Optional[str] = Field(
        default=None, description="Departure city override for enrichment hints"
    )
    currency: Optional[str] = Field(
        default=None, description="Currency override for pricing formatting"
    )
    slide_duration: Optional[int] = Field(
        default=None, description="Seconds per slide for html/video export"
    )
    transition_style: Optional[str] = Field(
        default=None, description="Video transition style override"
    )
    transition_duration: Optional[float] = Field(
        default=None, description="Video transition duration override in seconds"
    )
    use_narration_as_soundtrack: Optional[bool] = Field(
        default=None,
        description="When exporting video, use per-slide narration as soundtrack",
    )
    export_options: Optional[dict] = Field(
        default=None, description="Additional export options passthrough"
    )

    @model_validator(mode="after")
    def validate_source_input(self):
        sources_provided = sum(
            1
            for value in (
                self.source_presentation_id,
                self.source_json,
                self.source_presentation_ids,
            )
            if value
        )
        if sources_provided == 0:
            raise ValueError(
                "One of source_presentation_id, source_json, or source_presentation_ids is required"
            )
        return self


class RecapPresentationResponse(PresentationPathAndEditPath):
    mode: RecapMode
    source_presentation_id: Optional[uuid.UUID] = None


class BulkRecapPresentationResponse(BaseModel):
    """
    Response shape returned when `source_presentation_ids` is provided on the
    recap request. The recaps run serially (Azure App Service B2 RAM
    constraint — no parallelism).
    """

    recaps: List[RecapPresentationResponse] = Field(default_factory=list)


_RECAP_MODE_DEFAULTS: Dict[RecapMode, Dict[str, object]] = {
    RecapMode.WELCOME_HOME: {
        "template": "travel-itinerary",
        "tone": Tone.INSPIRATIONAL,
        "narration_tone": "documentary",
        "instruction": (
            "Frame the narrative as a warm welcome-home memory reel. "
            "Focus on sensory highlights, moments of gratitude, and what made the trip "
            "personally meaningful."
        ),
    },
    RecapMode.ANNIVERSARY: {
        "template": "travel-itinerary",
        "tone": Tone.ADVENTUROUS,
        "narration_tone": "hype_reel",
        "instruction": (
            "Frame the narrative as a one-year anniversary lookback. "
            "Keep nostalgia high, pacing brisk, and celebrate standout moments from the trip."
        ),
    },
    RecapMode.NEXT_PLANNING_WINDOW: {
        "template": "travel-itinerary",
        "tone": Tone.PROFESSIONAL,
        "narration_tone": "travel_companion",
        "instruction": (
            "Frame the narrative as a bridge from past memories to the next planning window. "
            "Briefly recap what worked and end with practical next-trip inspiration."
        ),
    },
}


def _extract_custom_template_id(layout_name: Optional[str]) -> Optional[uuid.UUID]:
    if not layout_name or not layout_name.startswith("custom-"):
        return None
    try:
        return uuid.UUID(layout_name.replace("custom-", ""))
    except Exception:
        return None


def _normalize_outline_title(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    cleaned = raw.strip().strip("#").strip()
    return cleaned or None


def _extract_outline_title(outline: SlideOutlineModel, index: int) -> str:
    explicit = _normalize_outline_title(getattr(outline, "title", None))
    if explicit:
        return explicit
    content = (outline.content or "").strip()
    if not content:
        return f"Slide {index + 1}"

    first_line = content.splitlines()[0].strip()
    if first_line.startswith("-"):
        first_line = first_line.lstrip("- ").strip()
    if ":" in first_line and len(first_line.split(":", 1)[0]) < 16:
        first_line = first_line.split(":", 1)[1].strip() or first_line
    return _normalize_outline_title(first_line) or f"Slide {index + 1}"


def _extract_outline_synopsis(outline: SlideOutlineModel) -> str:
    explicit = _normalize_outline_title(getattr(outline, "synopsis", None))
    if explicit:
        return explicit
    content = " ".join((outline.content or "").split())
    if not content:
        return ""
    return content[:220]


def _build_presentation_synopsis(
    outlines: List[SlideOutlineModel], presentation_title: Optional[str]
) -> str:
    summary_parts = []
    if presentation_title:
        summary_parts.append(presentation_title.strip())
    for outline in outlines[:3]:
        synopsis = _extract_outline_synopsis(outline)
        if synopsis:
            summary_parts.append(synopsis)
    if not summary_parts:
        return "A presentation with sequential slides and connected narrative flow."
    merged = " | ".join(summary_parts)
    return merged[:500]


def _truncate_text(value: Optional[str], *, limit: int) -> str:
    compact = " ".join((value or "").split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 3]}..."


def _compact_json(value: object, *, limit: int = 900) -> str:
    try:
        serialized = json.dumps(value, ensure_ascii=True, default=str)
    except Exception:
        serialized = str(value)
    if len(serialized) <= limit:
        return serialized
    return f"{serialized[: limit - 3]}..."


def _extract_slide_title_for_recap(slide: SlideModel) -> str:
    if isinstance(slide.content, dict):
        for key in ("title", "heading", "destination", "name"):
            candidate = slide.content.get(key)
            if isinstance(candidate, str):
                normalized = _normalize_outline_title(candidate)
                if normalized:
                    return normalized
    return f"Slide {slide.index + 1}"


def _build_recap_source_from_presentation(
    presentation: PresentationModel, slides: List[SlideModel]
) -> dict:
    template_name = ""
    if isinstance(presentation.layout, dict):
        raw_name = presentation.layout.get("name")
        if isinstance(raw_name, str):
            template_name = raw_name

    return {
        "presentation_id": str(presentation.id),
        "title": presentation.title,
        "summary": _truncate_text(presentation.content, limit=500),
        "language": presentation.language,
        "template": template_name,
        "n_slides": presentation.n_slides,
        "origin": presentation.origin,
        "currency": presentation.currency,
        "enriched_data": presentation.enriched_data,
        "slides": [
            {
                "index": slide.index,
                "layout": slide.layout,
                "layout_group": slide.layout_group,
                "title": _extract_slide_title_for_recap(slide),
                "speaker_note": _truncate_text(slide.speaker_note, limit=400),
                "content_snapshot": _compact_json(slide.content),
            }
            for slide in slides
        ],
    }


async def _resolve_recap_source_context(
    request: RecapPresentationRequest,
    sql_session: AsyncSession,
) -> Tuple[dict, Optional[str], Optional[str], Optional[str]]:
    source_context: dict = {}
    source_language: Optional[str] = None
    source_origin: Optional[str] = None
    source_currency: Optional[str] = None

    if request.source_presentation_id:
        source_presentation = await sql_session.get(
            PresentationModel, request.source_presentation_id
        )
        if not source_presentation:
            raise HTTPException(status_code=404, detail="Source presentation not found")
        source_slides_result = await sql_session.scalars(
            select(SlideModel)
            .where(SlideModel.presentation == request.source_presentation_id)
            .order_by(SlideModel.index)
        )
        source_slides = list(source_slides_result)
        source_context["source_presentation"] = _build_recap_source_from_presentation(
            source_presentation, source_slides
        )
        source_language = source_presentation.language
        source_origin = source_presentation.origin
        source_currency = source_presentation.currency

    if request.source_json:
        source_context["source_json"] = request.source_json

    return source_context, source_language, source_origin, source_currency


def _resolve_recap_voice_id(narration_tone: str) -> Optional[str]:
    normalized = normalize_tone_preset(narration_tone)
    if normalized and normalized in TONE_DEFAULT_VOICE_IDS:
        return TONE_DEFAULT_VOICE_IDS[normalized]
    fallback_voice = os.getenv("ELEVENLABS_DEFAULT_VOICE_ID")
    return fallback_voice.strip() if fallback_voice and fallback_voice.strip() else None


def _build_recap_generation_request(
    request: RecapPresentationRequest,
    source_context: dict,
    source_language: Optional[str],
    source_origin: Optional[str],
    source_currency: Optional[str],
) -> GeneratePresentationRequest:
    mode_defaults = _RECAP_MODE_DEFAULTS[request.mode]
    mode_narration_tone = str(mode_defaults["narration_tone"])
    normalized_tone = normalize_tone_preset(request.narration_tone or mode_narration_tone)
    resolved_narration_tone = (
        normalized_tone.value if normalized_tone else mode_narration_tone
    )
    mode_instruction = str(mode_defaults["instruction"])
    source_blob = json.dumps(source_context, ensure_ascii=True, default=str)
    recap_content = (
        f"Generate a travel recap presentation in mode '{request.mode.value}'.\n"
        f"Use this source context as factual grounding:\n{source_blob}"
    )
    recap_instruction = (
        f"Recap mode: {request.mode.value}.\n"
        f"{mode_instruction}\n"
        "Write in retrospective voice grounded in the source trip details. "
        "Avoid generic planning language that ignores source specifics."
    )
    if request.instructions and request.instructions.strip():
        recap_instruction = f"{recap_instruction}\n\nAdditional instructions:\n{request.instructions.strip()}"

    return GeneratePresentationRequest(
        content=recap_content,
        instructions=recap_instruction,
        tone=request.tone or mode_defaults["tone"],
        narration_tone=resolved_narration_tone,
        verbosity=request.verbosity,
        web_search=request.web_search,
        n_slides=request.n_slides,
        language=request.language or source_language,
        template=request.template or str(mode_defaults["template"]),
        include_table_of_contents=request.include_table_of_contents,
        include_title_slide=request.include_title_slide,
        export_as=request.export_as,
        origin=request.origin if request.origin is not None else source_origin,
        currency=request.currency or source_currency or "USD",
        slide_duration=request.slide_duration,
        transition_style=request.transition_style,
        transition_duration=request.transition_duration,
        use_narration_as_soundtrack=request.use_narration_as_soundtrack,
        export_options=request.export_options,
    )


async def _resolve_presentation_fonts(
    presentation: PresentationModel,
    slides: List[SlideModel],
    sql_session: AsyncSession,
):
    candidate_template_ids: List[uuid.UUID] = []
    seen = set()

    layout_name = None
    if isinstance(presentation.layout, dict):
        layout_name = presentation.layout.get("name")
    layout_template_id = _extract_custom_template_id(layout_name)
    if layout_template_id and layout_template_id not in seen:
        candidate_template_ids.append(layout_template_id)
        seen.add(layout_template_id)

    for slide in slides:
        template_id = _extract_custom_template_id(slide.layout_group)
        if template_id and template_id not in seen:
            candidate_template_ids.append(template_id)
            seen.add(template_id)

    for template_id in candidate_template_ids:
        result = await sql_session.execute(
            select(PresentationLayoutCodeModel.fonts).where(
                PresentationLayoutCodeModel.presentation == template_id
            )
        )
        fonts_list = result.scalars().all()
        for fonts in fonts_list:
            if fonts is not None:
                return fonts

    return None


def _insert_toc_layouts(
    structure: PresentationStructureModel,
    n_toc_slides: int,
    include_title_slide: bool,
    toc_slide_layout_index: int,
):
    if n_toc_slides <= 0 or toc_slide_layout_index == -1:
        return

    insertion_index = 1 if include_title_slide else 0
    for i in range(n_toc_slides):
        structure.slides.insert(insertion_index + i, toc_slide_layout_index)


@PRESENTATION_ROUTER.get("/all", response_model=List[PresentationWithSlides])
async def get_all_presentations(sql_session: AsyncSession = Depends(get_async_session)):
    query = (
        select(PresentationModel, SlideModel)
        .join(
            SlideModel,
            (SlideModel.presentation == PresentationModel.id) & (SlideModel.index == 0),
        )
        .order_by(PresentationModel.created_at.desc())
    )

    results = await sql_session.execute(query)
    rows = results.all()
    presentations_with_slides = []
    for presentation, first_slide in rows:
        slides = [first_slide]
        fonts = await _resolve_presentation_fonts(presentation, slides, sql_session)
        presentations_with_slides.append(
            PresentationWithSlides(
                **presentation.model_dump(),
                slides=slides,
                fonts=fonts,
            )
        )
    return presentations_with_slides


@PRESENTATION_ROUTER.get("/{id}", response_model=PresentationWithSlides)
async def get_presentation(
    id: uuid.UUID, sql_session: AsyncSession = Depends(get_async_session)
):
    presentation = await sql_session.get(PresentationModel, id)
    if not presentation:
        raise HTTPException(404, "Presentation not found")
    slides_result = await sql_session.scalars(
        select(SlideModel)
        .where(SlideModel.presentation == id)
        .order_by(SlideModel.index)
    )
    slides = list(slides_result)
    fonts = await _resolve_presentation_fonts(presentation, slides, sql_session)
    return PresentationWithSlides(
        **presentation.model_dump(),
        slides=slides,
        fonts=fonts,
    )


@PRESENTATION_ROUTER.patch("/{id}/visibility")
async def update_presentation_visibility(
    id: uuid.UUID,
    body: PresentationVisibilityRequest,
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await sql_session.get(PresentationModel, id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    presentation.is_public = body.is_public
    sql_session.add(presentation)
    await sql_session.commit()

    return {"id": str(presentation.id), "is_public": presentation.is_public}


@PRESENTATION_ROUTER.delete("/{id}", status_code=204)
async def delete_presentation(
    id: uuid.UUID, sql_session: AsyncSession = Depends(get_async_session)
):
    presentation = await sql_session.get(PresentationModel, id)
    if not presentation:
        raise HTTPException(404, "Presentation not found")

    audio_dir = os.path.join(get_audio_directory(), str(id))
    if os.path.isdir(audio_dir):
        shutil.rmtree(audio_dir, ignore_errors=True)

    await sql_session.delete(presentation)
    await sql_session.commit()

    try:
        await MEM0_PRESENTATION_MEMORY_SERVICE.forget_presentation(id)
    except Exception:
        traceback.print_exc()


@PRESENTATION_ROUTER.post("/create", response_model=PresentationModel)
async def create_presentation(
    content: Annotated[str, Body()],
    n_slides: Annotated[Optional[int], Body()] = None,
    language: Annotated[Optional[str], Body()] = None,
    file_paths: Annotated[Optional[List[str]], Body()] = None,
    tone: Annotated[Tone, Body()] = Tone.DEFAULT,
    narration_tone: Annotated[Optional[str], Body()] = None,
    verbosity: Annotated[Verbosity, Body()] = Verbosity.STANDARD,
    instructions: Annotated[Optional[str], Body()] = None,
    include_table_of_contents: Annotated[bool, Body()] = False,
    include_title_slide: Annotated[bool, Body()] = True,
    web_search: Annotated[bool, Body()] = False,
    theme: Annotated[Optional[dict], Body()] = None,
    origin: Annotated[Optional[str], Body()] = None,
    currency: Annotated[str, Body()] = "USD",
    sql_session: AsyncSession = Depends(get_async_session),
):

    if n_slides is not None and n_slides < 1:
        raise HTTPException(
            status_code=400,
            detail="Number of slides must be greater than 0",
        )

    if n_slides is not None and n_slides > MAX_NUMBER_OF_SLIDES:
        raise HTTPException(
            status_code=400,
            detail=f"Number of slides cannot be greater than {MAX_NUMBER_OF_SLIDES}",
        )

    if include_table_of_contents and n_slides is not None and n_slides < 3:
        raise HTTPException(
            status_code=400,
            detail="Number of slides cannot be less than 3 if table of contents is included",
        )

    presentation_id = uuid.uuid4()
    language_to_store = (language or "").strip()
    # DB schema stores an int; 0 is used as internal marker for auto slide count.
    n_slides_to_store = n_slides if n_slides is not None else 0
    normalized_narration_tone = normalize_tone_preset(
        narration_tone or os.getenv("ELEVENLABS_DEFAULT_TONE")
    )

    presentation = PresentationModel(
        id=presentation_id,
        content=content,
        n_slides=n_slides_to_store,
        language=language_to_store,
        file_paths=file_paths,
        tone=tone.value,
        narration_tone=normalized_narration_tone.value if normalized_narration_tone else None,
        narration_voice_id=os.getenv("ELEVENLABS_DEFAULT_VOICE_ID"),
        narration_model_id=os.getenv("ELEVENLABS_DEFAULT_MODEL") or "eleven_v3",
        narration_pronunciation_dictionary_id=os.getenv(
            "ELEVENLABS_PRONUNCIATION_DICTIONARY_ID"
        ),
        verbosity=verbosity.value,
        instructions=instructions,
        include_table_of_contents=include_table_of_contents,
        include_title_slide=include_title_slide,
        web_search=web_search,
        theme=theme,
        origin=origin,
        currency=currency,
    )

    sql_session.add(presentation)
    await sql_session.commit()

    return presentation


@PRESENTATION_ROUTER.post("/prepare", response_model=PresentationModel)
async def prepare_presentation(
    presentation_id: Annotated[uuid.UUID, Body()],
    outlines: Annotated[List[SlideOutlineModel], Body()],
    layout: Annotated[PresentationLayoutModel, Body()],
    title: Annotated[Optional[str], Body()] = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    if not outlines:
        raise HTTPException(status_code=400, detail="Outlines are required")

    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    presentation_outline_model = PresentationOutlineModel(slides=outlines)

    total_slide_layouts = len(layout.slides)
    total_outlines = len(outlines)

    if layout.ordered:
        presentation_structure = layout.to_presentation_structure()
    else:
        presentation_structure: PresentationStructureModel = (
            await generate_presentation_structure(
                presentation_outline=presentation_outline_model,
                presentation_layout=layout,
                instructions=presentation.instructions,
            )
        )

    presentation_structure.slides = presentation_structure.slides[: len(outlines)]
    for index in range(total_outlines):
        random_slide_index = random.randint(0, total_slide_layouts - 1)
        if index >= total_outlines:
            presentation_structure.slides.append(random_slide_index)
            continue
        if presentation_structure.slides[index] >= total_slide_layouts:
            presentation_structure.slides[index] = random_slide_index

    if presentation.include_table_of_contents:
        n_toc_slides = get_no_of_toc_required_for_n_outlines(
            n_outlines=total_outlines,
            title_slide=presentation.include_title_slide,
            target_total_slides=(presentation.n_slides if presentation.n_slides > 0 else None),
        )
        toc_slide_layout_index = select_toc_or_list_slide_layout_index(layout)
        _insert_toc_layouts(
            presentation_structure,
            n_toc_slides,
            presentation.include_title_slide,
            toc_slide_layout_index,
        )
        if toc_slide_layout_index != -1 and n_toc_slides > 0:
            presentation_outline_model = get_presentation_outline_model_with_toc(
                outline=presentation_outline_model,
                n_toc_slides=n_toc_slides,
                title_slide=presentation.include_title_slide,
            )

    if layout.name.startswith("travel"):
        try:
            from enrichers.pipeline import run_enrichment_pipeline
            result = await run_enrichment_pipeline(
                content=presentation.content,
                language=presentation.language,
                currency=presentation.currency,
                origin=presentation.origin,
            )
            if result.markdown:
                presentation.enriched_context = result.markdown
            if result.raw_data:
                presentation.enriched_data = result.raw_data
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                f"Enrichment pipeline failed during prepare (graceful degradation): {e}"
            )

    sql_session.add(presentation)
    presentation.outlines = presentation_outline_model.model_dump(mode="json")
    presentation.title = title or presentation.title
    presentation.set_layout(layout)
    presentation.set_structure(presentation_structure)
    await sql_session.commit()

    await MEM0_PRESENTATION_MEMORY_SERVICE.store_generated_outlines(
        presentation.id,
        presentation.outlines,
    )

    return presentation


@PRESENTATION_ROUTER.get("/stream/{id}", response_model=PresentationWithSlides)
async def stream_presentation(
    id: uuid.UUID, sql_session: AsyncSession = Depends(get_async_session)
):
    presentation = await sql_session.get(PresentationModel, id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    if not presentation.structure:
        raise HTTPException(
            status_code=400,
            detail="Presentation not prepared for stream",
        )
    if not presentation.outlines:
        raise HTTPException(
            status_code=400,
            detail="Outlines can not be empty",
        )

    image_generation_service = ImageGenerationService(get_images_directory())

    async def inner():
        structure = presentation.get_structure()
        layout = presentation.get_layout()
        outline = presentation.get_presentation_outline()
        outline_titles = [
            _extract_outline_title(outline_slide, idx)
            for idx, outline_slide in enumerate(outline.slides)
        ]
        presentation_synopsis = _build_presentation_synopsis(
            outline.slides, presentation.title
        )
        resolved_narration_tone = (
            normalize_tone_preset(
                presentation.narration_tone or os.getenv("ELEVENLABS_DEFAULT_TONE")
            )
            or get_default_tone_for_template(layout.name)
        ).value
        image_urls_for_slides = get_images_for_slides_from_outline(outline.slides)

        yield SSEResponse(
            event="response",
            data=json.dumps({
                "type": "outlines",
                "outlines": [s.model_dump(mode="json") for s in outline.slides],
            }),
        ).to_string()

        layout_names = [layout.slides[idx].id for idx in structure.slides]
        yield SSEResponse(
            event="response",
            data=json.dumps({
                "type": "structure",
                "layouts": layout_names,
            }),
        ).to_string()

        # Issue E (RESOLVED): enriched_context flows through the USER prompt
        # for both Call 1 and Call 3. Instructions stays user-supplied only —
        # do not splice enriched_context into it. See main-workflow.md
        # Section 6, item E for the full migration note.
        base_instructions = presentation.instructions or ""
        try:
            agent_profile = get_agent_profile()
        except Exception:
            agent_profile = None

        async_assets_generation_tasks = []

        slides: List[SlideModel] = []
        yield SSEResponse(
            event="response",
            data=json.dumps({"type": "chunk", "chunk": '{ "slides": [ '}),
        ).to_string()

        # Phase C.2: bounded-concurrency parallel Call 3 with per-slide error
        # isolation and in-order SSE emission. The producer fires N tasks
        # gated by a semaphore; the consumer drains a result queue and feeds
        # an OrderedSlideEmitter so the SSE stream still emits slide-by-slide.
        # CONTENT_MODEL_CONCURRENCY env var (default 4, max 12) gates the
        # parallel-fan-out width.
        concurrency = parse_content_model_concurrency(
            os.getenv("CONTENT_MODEL_CONCURRENCY")
        )
        total_slides = len(structure.slides)
        emitter = OrderedSlideEmitter[dict](total=total_slides)
        result_queue: asyncio.Queue = asyncio.Queue()
        semaphore = asyncio.Semaphore(concurrency)

        async def _generate_one_slide(slide_index: int, layout_idx: int) -> None:
            # `async with semaphore` enforces the bounded-concurrency cap.
            async with semaphore:
                slide_layout = layout.slides[layout_idx]
                slide_instructions = build_agent_profile_slide_instructions(
                    base_instructions,
                    slide_layout.id,
                    agent_profile,
                )
                try:
                    slide_content = await get_slide_content_from_type_and_outline(
                        slide_layout,
                        outline.slides[slide_index],
                        presentation.language,
                        presentation.tone,
                        presentation.verbosity,
                        slide_instructions,
                        template=layout.name,
                        previous_slide_title=(
                            outline_titles[slide_index - 1]
                            if slide_index > 0
                            else None
                        ),
                        next_slide_title=(
                            outline_titles[slide_index + 1]
                            if slide_index + 1 < len(outline_titles)
                            else None
                        ),
                        presentation_synopsis=presentation_synopsis,
                        tone_preset=resolved_narration_tone,
                        destination_context=presentation.enriched_data,
                        enriched_context=presentation.enriched_context,
                    )
                    await result_queue.put(
                        Call3SlideResult(
                            index=slide_index,
                            status="ok",
                            payload=slide_content,
                        )
                    )
                except HTTPException as exc:
                    await result_queue.put(
                        Call3SlideResult(
                            index=slide_index,
                            status="error",
                            payload=str(exc.detail),
                        )
                    )
                except Exception as exc:
                    await result_queue.put(
                        Call3SlideResult(
                            index=slide_index,
                            status="error",
                            payload=str(exc),
                        )
                    )

        producer_tasks = [
            asyncio.create_task(_generate_one_slide(i, layout_idx))
            for i, layout_idx in enumerate(structure.slides)
        ]

        try:
            while not emitter.is_complete:
                result = await result_queue.get()
                for ready in emitter.add(result):
                    if ready.status == "error":
                        # Per-slide failure isolation: emit a structured SSE
                        # error event in the slide's slot and continue. The
                        # slot stays empty in the slides list so downstream
                        # code (slides[i] indexing) must NOT assume each
                        # index is populated; we maintain ordering via the
                        # emitter and only append successful slides.
                        yield SSEErrorResponse(
                            detail=(
                                f"Slide {ready.index} generation failed: "
                                f"{ready.payload}"
                            )
                        ).to_string()
                        continue

                    slide_index = ready.index
                    slide_content = ready.payload
                    slide_layout = layout.slides[structure.slides[slide_index]]

                    if presentation.enriched_data:
                        try:
                            from enrichers.overlay import apply_enricher_overlays
                            slide_content = apply_enricher_overlays(
                                slide_content,
                                slide_layout.id,
                                presentation.enriched_data,
                            )
                        except Exception as overlay_err:
                            import logging
                            logging.getLogger(__name__).warning(
                                f"Enricher overlay failed for slide "
                                f"{slide_index} (continuing without "
                                f"overlay): {overlay_err}"
                            )
                    slide_content = apply_agent_profile_overlays(
                        slide_content,
                        slide_layout.id,
                        agent_profile,
                    )

                    slide = SlideModel(
                        presentation=id,
                        layout_group=layout.name,
                        layout=slide_layout.id,
                        index=slide_index,
                        speaker_note=slide_content.get("__speaker_note__", ""),
                        narration_tone=resolved_narration_tone,
                        content=slide_content,
                    )
                    slides.append(slide)
                    process_slide_add_placeholder_assets(slide)
                    async_assets_generation_tasks.append(
                        asyncio.create_task(
                            process_slide_and_fetch_assets(
                                image_generation_service,
                                slide,
                                outline_image_urls=(
                                    image_urls_for_slides[slide_index]
                                    if slide_index < len(image_urls_for_slides)
                                    else None
                                ),
                            )
                        )
                    )

                    yield SSEResponse(
                        event="response",
                        data=json.dumps(
                            {"type": "chunk", "chunk": slide.model_dump_json()}
                        ),
                    ).to_string()
        finally:
            # If the consumer exits early (e.g. client disconnect) we still
            # need to drain the producer tasks to avoid orphaned coroutines.
            await asyncio.gather(*producer_tasks, return_exceptions=True)

        # The slides list is appended in completion order, but each slide
        # carries its true index. Sort to produce a deterministic order
        # for downstream DB writes (which historically expected ascending
        # index). Failed slides are absent from the list — the resulting
        # presentation has gaps at those indices, which is consistent with
        # how a sequential fail-fast loop used to truncate.
        slides.sort(key=lambda s: s.index)

        yield SSEResponse(
            event="response",
            data=json.dumps({"type": "chunk", "chunk": " ] }"}),
        ).to_string()

        generated_assets_lists = await asyncio.gather(*async_assets_generation_tasks)
        generated_assets = []
        for assets_list in generated_assets_lists:
            generated_assets.extend(assets_list)

        # Moved this here to make sure new slides are generated before deleting the old ones
        existing_slides = list(
            (
                await sql_session.scalars(
                    select(SlideModel).where(SlideModel.presentation == id)
                )
            ).all()
        )
        for existing_slide in existing_slides:
            _clear_slide_narration(existing_slide, also_remove_file=True)
        await sql_session.execute(
            delete(SlideModel).where(SlideModel.presentation == id)
        )
        await sql_session.commit()

        sql_session.add(presentation)
        sql_session.add_all(slides)
        sql_session.add_all(generated_assets)
        await sql_session.commit()

        response = PresentationWithSlides(
            **presentation.model_dump(),
            slides=slides,
            fonts=await _resolve_presentation_fonts(presentation, slides, sql_session),
        )

        yield SSECompleteResponse(
            key="presentation",
            value=response.model_dump(mode="json"),
        ).to_string()

    return StreamingResponse(inner(), media_type="text/event-stream")


@PRESENTATION_ROUTER.patch("/update", response_model=PresentationWithSlides)
async def update_presentation(
    id: Annotated[uuid.UUID, Body()],
    n_slides: Annotated[Optional[int], Body()] = None,
    title: Annotated[Optional[str], Body()] = None,
    theme: Annotated[Optional[dict], Body()] = None,
    narration_voice_id: Annotated[Optional[str], Body()] = None,
    narration_tone: Annotated[Optional[str], Body()] = None,
    narration_model_id: Annotated[Optional[str], Body()] = None,
    narration_pronunciation_dictionary_id: Annotated[Optional[str], Body()] = None,
    slides: Annotated[Optional[List[SlideModel]], Body()] = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await sql_session.get(PresentationModel, id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    presentation_update_dict = {}
    if n_slides is not None:
        presentation_update_dict["n_slides"] = n_slides
    if title:
        presentation_update_dict["title"] = title
    if theme or theme is None:
        presentation_update_dict["theme"] = theme
    if narration_voice_id is not None:
        presentation_update_dict["narration_voice_id"] = narration_voice_id
    if narration_tone is not None:
        normalized_tone = normalize_tone_preset(narration_tone)
        presentation_update_dict["narration_tone"] = (
            normalized_tone.value if normalized_tone else narration_tone
        )
    if narration_model_id is not None:
        presentation_update_dict["narration_model_id"] = narration_model_id
    if narration_pronunciation_dictionary_id is not None:
        presentation_update_dict["narration_pronunciation_dictionary_id"] = (
            narration_pronunciation_dictionary_id
        )

    if presentation_update_dict:
        presentation.sqlmodel_update(presentation_update_dict)
    if slides:
        # Just to make sure id is UUID
        for slide in slides:
            slide.presentation = uuid.UUID(slide.presentation)
            slide.id = uuid.UUID(slide.id)

        existing_slides = list(
            (
                await sql_session.scalars(
                    select(SlideModel).where(SlideModel.presentation == presentation.id)
                )
            ).all()
        )
        for existing_slide in existing_slides:
            _clear_slide_narration(existing_slide, also_remove_file=True)

        await sql_session.execute(
            delete(SlideModel).where(SlideModel.presentation == presentation.id)
        )
        sql_session.add_all(slides)

    await sql_session.commit()

    response_slides = slides or []
    fonts = await _resolve_presentation_fonts(
        presentation,
        response_slides,
        sql_session,
    )

    return PresentationWithSlides(
        **presentation.model_dump(),
        slides=response_slides,
        fonts=fonts,
    )


@PRESENTATION_ROUTER.get("/export/json/{id}")
async def export_presentation_as_json(
    id: str = Path(description="Presentation ID"),
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Export a presentation as structured JSON (all slides with content, layout, speaker notes)."""
    presentation = await sql_session.get(PresentationModel, id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    slides = (
        await sql_session.scalars(
            select(SlideModel)
            .where(SlideModel.presentation == id)
            .order_by(SlideModel.index)
        )
    ).all()

    fonts = await _resolve_presentation_fonts(presentation, list(slides), sql_session)

    from fastapi.responses import JSONResponse
    return JSONResponse(
        content=PresentationWithSlides(
            id=presentation.id,
            content=presentation.content,
            n_slides=presentation.n_slides,
            language=presentation.language,
            title=presentation.title,
            created_at=presentation.created_at,
            updated_at=presentation.updated_at,
            tone=presentation.tone,
            verbosity=presentation.verbosity,
            narration_voice_id=presentation.narration_voice_id,
            narration_tone=presentation.narration_tone,
            narration_model_id=presentation.narration_model_id,
            narration_pronunciation_dictionary_id=presentation.narration_pronunciation_dictionary_id,
            is_public=presentation.is_public,
            slides=list(slides),
            theme=presentation.theme,
            fonts=fonts,
        ).model_dump(mode="json"),
        headers={"Content-Disposition": f'attachment; filename="{presentation.title or id}.json"'},
    )


@PRESENTATION_ROUTER.post("/export/pptx", response_model=str)
async def export_presentation_as_pptx(
    pptx_model: Annotated[PptxPresentationModel, Body()],
):
    temp_dir = TEMP_FILE_SERVICE.create_temp_dir()

    pptx_creator = PptxPresentationCreator(pptx_model, temp_dir)
    await pptx_creator.create_ppt()

    export_directory = get_exports_directory()
    pptx_path = os.path.join(
        export_directory, f"{pptx_model.name or uuid.uuid4()}.pptx"
    )
    pptx_creator.save(pptx_path)

    return pptx_path


@PRESENTATION_ROUTER.post("/export", response_model=PresentationPathAndEditPath)
async def export_presentation_as_pptx_or_pdf(
    id: Annotated[uuid.UUID, Body(description="Presentation ID to export")],
    export_as: Annotated[
        Literal["pptx", "pdf", "html", "video"], Body(description="Format to export the presentation as")
    ] = "pptx",
    export_options: Annotated[Optional[dict], Body(description="Format-specific export options")] = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """
    Export a presentation as PPTX or PDF.
    This Api is used to export via the nextjs app i.e using the puppeteer to export the presentation.
    
    """
    presentation = await sql_session.get(PresentationModel, id)

    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    presentation_and_path = await export_presentation(
        id,
        presentation.title or str(uuid.uuid4()),
        export_as,
        export_options=export_options,
    )

    return PresentationPathAndEditPath(
        **presentation_and_path.model_dump(),
        edit_path=f"/presentation?id={id}",
    )


async def check_if_api_request_is_valid(
    request: GeneratePresentationRequest,
    sql_session: AsyncSession = Depends(get_async_session),
) -> Tuple[uuid.UUID,]:
    presentation_id = uuid.uuid4()
    print(f"Presentation ID: {presentation_id}")

    # Making sure either content, slides markdown or files is provided
    if not (request.content or request.slides_markdown or request.files):
        raise HTTPException(
            status_code=400,
            detail="Either content or slides markdown or files is required to generate presentation",
        )

    if request.n_slides is not None and request.n_slides <= 0:
        raise HTTPException(
            status_code=400,
            detail="Number of slides must be greater than 0",
        )

    if request.n_slides is not None and request.n_slides > MAX_NUMBER_OF_SLIDES:
        raise HTTPException(
            status_code=400,
            detail=f"Number of slides cannot be greater than {MAX_NUMBER_OF_SLIDES}",
        )

    if (
        request.include_table_of_contents
        and request.n_slides is not None
        and request.n_slides < 3
    ):
        raise HTTPException(
            status_code=400,
            detail="Number of slides cannot be less than 3 if table of contents is included",
        )

    # Checking if template is valid
    if request.template not in DEFAULT_TEMPLATES:
        request.template = request.template.lower()
        if not request.template.startswith("custom-"):
            raise HTTPException(
                status_code=400,
                detail="Template not found. Please use a valid template.",
            )
        template_id = request.template.replace("custom-", "")
        try:
            template = await sql_session.get(TemplateModel, uuid.UUID(template_id))
            if not template:
                raise Exception()
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Template not found. Please use a valid template.",
            )

    return (presentation_id,)


async def _generate_single_recap(
    request: RecapPresentationRequest,
    sql_session: AsyncSession,
) -> RecapPresentationResponse:
    """
    Generate a single recap. Used both by the single-source endpoint path AND
    by the bulk loop (one per source id, serial — Azure App Service B2 RAM
    constraint precludes parallel runs).
    """
    source_context, source_language, source_origin, source_currency = (
        await _resolve_recap_source_context(request, sql_session)
    )
    recap_generation_request = _build_recap_generation_request(
        request=request,
        source_context=source_context,
        source_language=source_language,
        source_origin=source_origin,
        source_currency=source_currency,
    )
    (presentation_id,) = await check_if_api_request_is_valid(
        recap_generation_request, sql_session
    )
    response = await generate_presentation_handler(
        recap_generation_request, presentation_id, None, sql_session
    )

    generated_presentation = await sql_session.get(
        PresentationModel, response.presentation_id
    )
    if generated_presentation:
        generated_presentation.narration_tone = recap_generation_request.narration_tone
        resolved_voice_id = _resolve_recap_voice_id(
            recap_generation_request.narration_tone or ""
        )
        if resolved_voice_id:
            generated_presentation.narration_voice_id = resolved_voice_id
        sql_session.add(generated_presentation)
        await sql_session.commit()

    return RecapPresentationResponse(
        **response.model_dump(),
        mode=request.mode,
        source_presentation_id=request.source_presentation_id,
    )


@PRESENTATION_ROUTER.post(
    "/recap",
    response_model=Union[RecapPresentationResponse, BulkRecapPresentationResponse],
)
async def generate_recap_presentation(
    request: RecapPresentationRequest,
    sql_session: AsyncSession = Depends(get_async_session),
):
    if request.source_presentation_ids:
        recaps: List[RecapPresentationResponse] = []
        for source_id in request.source_presentation_ids:
            per_source_payload = request.model_dump(exclude_unset=False)
            per_source_payload["source_presentation_id"] = source_id
            per_source_payload["source_presentation_ids"] = None
            per_source_request = RecapPresentationRequest(**per_source_payload)
            recap = await _generate_single_recap(per_source_request, sql_session)
            recaps.append(recap)
        return BulkRecapPresentationResponse(recaps=recaps)

    return await _generate_single_recap(request, sql_session)


def _build_export_options_from_request(
    request: GeneratePresentationRequest,
) -> Optional[dict]:
    export_options = dict(request.export_options or {})

    if request.slide_duration is not None and "slide_duration" not in export_options:
        export_options["slide_duration"] = request.slide_duration
    if request.transition_style and "transition_style" not in export_options:
        export_options["transition_style"] = request.transition_style
    if (
        request.transition_duration is not None
        and "transition_duration" not in export_options
    ):
        export_options["transition_duration"] = request.transition_duration
    if (
        request.use_narration_as_soundtrack is not None
        and "use_narration_as_soundtrack" not in export_options
    ):
        export_options["use_narration_as_soundtrack"] = (
            request.use_narration_as_soundtrack
        )

    return export_options or None


async def generate_presentation_handler(
    request: GeneratePresentationRequest,
    presentation_id: uuid.UUID,
    async_status: Optional[AsyncPresentationGenerationTaskModel],
    sql_session: AsyncSession = Depends(get_async_session),
):
    try:
        using_slides_markdown = False
        language_to_use = (request.language or "").strip() or None
        additional_context = ""

        if request.slides_markdown:
            using_slides_markdown = True
            request.n_slides = len(request.slides_markdown)

        if not using_slides_markdown:
            # Updating async status
            if async_status:
                async_status.message = "Generating presentation outlines"
                async_status.updated_at = datetime.now()
                sql_session.add(async_status)
                await sql_session.commit()

            if request.files:
                documents_loader = DocumentsLoader(
                    file_paths=request.files,
                    presentation_language=request.language,
                )
                await documents_loader.load_documents()
                documents = documents_loader.documents
                if documents:
                    additional_context = "\n\n".join(documents)

            if request.template.startswith("travel"):
                try:
                    from enrichers.pipeline import run_enrichment_pipeline
                    enrichment = await run_enrichment_pipeline(
                        content=request.content,
                        language=request.language,
                        currency=request.currency,
                        origin=request.origin,
                    )
                    if enrichment.markdown:
                        additional_context = (
                            f"{additional_context}\n\n{enrichment.markdown}"
                            if additional_context
                            else enrichment.markdown
                        )
                    enriched_data_for_model = enrichment.raw_data
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(
                        f"Enrichment pipeline failed (graceful degradation): {e}"
                    )
                    enriched_data_for_model = None
            else:
                enriched_data_for_model = None

            # Finding number of slides to generate by considering table of contents
            n_slides_to_generate = request.n_slides
            if request.include_table_of_contents and request.n_slides is not None:
                n_slides_to_generate = (
                    get_no_of_outlines_to_generate_for_n_slides(
                        n_slides=request.n_slides,
                        toc=True,
                        title_slide=request.include_title_slide,
                    )
                )

            outline_messages = get_outline_messages(
                request.content,
                n_slides_to_generate,
                language_to_use,
                additional_context,
                request.tone.value,
                request.verbosity.value,
                request.instructions,
                request.include_title_slide,
                request.include_table_of_contents,
            )
            await MEM0_PRESENTATION_MEMORY_SERVICE.store_generation_context(
                presentation_id=presentation_id,
                system_prompt=(
                    message_content_to_text(outline_messages[0].content)
                    if len(outline_messages) > 0
                    else None
                ),
                user_prompt=(
                    message_content_to_text(outline_messages[1].content)
                    if len(outline_messages) > 1
                    else None
                ),
                extracted_document_text=additional_context,
                source_content=request.content,
                instructions=request.instructions,
            )

            presentation_outlines_text = ""
            async for chunk in generate_ppt_outline(
                request.content,
                n_slides_to_generate,
                language_to_use,
                additional_context,
                request.tone.value,
                request.verbosity.value,
                request.instructions,
                request.include_title_slide,
                request.web_search,
                request.include_table_of_contents,
                template=request.template,
            ):

                if isinstance(chunk, HTTPException):
                    raise chunk

                presentation_outlines_text += chunk

            try:
                presentation_outlines_json = dict(
                    dirtyjson.loads(presentation_outlines_text)
                )
            except Exception:
                traceback.print_exc()
                raise HTTPException(
                    status_code=400,
                    detail="Failed to generate presentation outlines. Please try again.",
                )
            presentation_outlines = PresentationOutlineModel(
                **presentation_outlines_json
            )

            if (
                n_slides_to_generate is not None
                and len(presentation_outlines.slides) != n_slides_to_generate
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Failed to generate presentation outlines with requested "
                        "number of slides. Please try again."
                    ),
                )

            total_outlines = len(presentation_outlines.slides)

        else:
            # Setting outlines to slides markdown
            presentation_outlines = PresentationOutlineModel(
                slides=[
                    SlideOutlineModel(content=slide)
                    for slide in request.slides_markdown
                ]
            )
            total_outlines = len(request.slides_markdown)

            await MEM0_PRESENTATION_MEMORY_SERVICE.store_generation_context(
                presentation_id=presentation_id,
                system_prompt=None,
                user_prompt=None,
                extracted_document_text=None,
                source_content=request.content,
                instructions=request.instructions,
            )

        await MEM0_PRESENTATION_MEMORY_SERVICE.store_generated_outlines(
            presentation_id,
            presentation_outlines.model_dump(mode="json"),
        )

        # Updating async status
        if async_status:
            async_status.message = "Selecting layout for each slide"
            async_status.updated_at = datetime.now()
            sql_session.add(async_status)
            await sql_session.commit()

        print("-" * 40)
        print(f"Generated {total_outlines} outlines for the presentation")

        # Parse Layouts
        layout_model = await get_layout_by_name(request.template)
        total_slide_layouts = len(layout_model.slides)

        # Generate Structure
        if layout_model.ordered:
            presentation_structure = layout_model.to_presentation_structure()
        else:
            presentation_structure: PresentationStructureModel = (
                await generate_presentation_structure(
                    presentation_outlines,
                    layout_model,
                    request.instructions,
                    using_slides_markdown,
                )
            )

        presentation_structure.slides = presentation_structure.slides[:total_outlines]
        for index in range(total_outlines):
            random_slide_index = random.randint(0, total_slide_layouts - 1)
            if index >= total_outlines:
                presentation_structure.slides.append(random_slide_index)
                continue
            if presentation_structure.slides[index] >= total_slide_layouts:
                presentation_structure.slides[index] = random_slide_index

        should_include_toc = (
            request.include_table_of_contents and not using_slides_markdown
        )
        if should_include_toc:
            n_toc_slides = get_no_of_toc_required_for_n_outlines(
                n_outlines=total_outlines,
                title_slide=request.include_title_slide,
                target_total_slides=request.n_slides,
            )
            toc_slide_layout_index = select_toc_or_list_slide_layout_index(layout_model)
            _insert_toc_layouts(
                presentation_structure,
                n_toc_slides,
                request.include_title_slide,
                toc_slide_layout_index,
            )
            if toc_slide_layout_index != -1 and n_toc_slides > 0:
                presentation_outlines = get_presentation_outline_model_with_toc(
                    outline=presentation_outlines,
                    n_toc_slides=n_toc_slides,
                    title_slide=request.include_title_slide,
                )

        final_n_slides = request.n_slides
        if final_n_slides is None:
            final_n_slides = len(presentation_outlines.slides)

        resolved_narration_tone = (
            normalize_tone_preset(
                request.narration_tone or os.getenv("ELEVENLABS_DEFAULT_TONE")
            )
            or get_default_tone_for_template(request.template)
        ).value

        enriched_context_for_model = None
        if request.template.startswith("travel") and additional_context:
            enriched_context_for_model = additional_context

        presentation = PresentationModel(
            id=presentation_id,
            content=request.content,
            n_slides=final_n_slides,
            language=language_to_use or "",
            title=get_presentation_title_from_presentation_outline(
                presentation_outlines
            ),
            outlines=presentation_outlines.model_dump(),
            layout=layout_model.model_dump(),
            structure=presentation_structure.model_dump(),
            tone=request.tone.value,
            verbosity=request.verbosity.value,
            instructions=request.instructions,
            origin=request.origin,
            currency=request.currency,
            enriched_context=enriched_context_for_model,
            enriched_data=enriched_data_for_model,
            narration_tone=resolved_narration_tone,
            narration_voice_id=os.getenv("ELEVENLABS_DEFAULT_VOICE_ID"),
            narration_model_id=os.getenv("ELEVENLABS_DEFAULT_MODEL") or "eleven_v3",
            narration_pronunciation_dictionary_id=os.getenv(
                "ELEVENLABS_PRONUNCIATION_DICTIONARY_ID"
            ),
        )

        # Updating async status
        if async_status:
            async_status.message = "Generating slides"
            async_status.updated_at = datetime.now()
            sql_session.add(async_status)
            await sql_session.commit()

        image_generation_service = ImageGenerationService(get_images_directory())
        async_assets_generation_tasks = []

        # 7. Generate slide content concurrently (batched), then build slides and fetch assets
        slides: List[SlideModel] = []

        slide_layout_indices = presentation_structure.slides
        slide_layouts = [layout_model.slides[idx] for idx in slide_layout_indices]
        outline_titles = [
            _extract_outline_title(outline_slide, idx)
            for idx, outline_slide in enumerate(presentation_outlines.slides)
        ]
        presentation_synopsis = _build_presentation_synopsis(
            presentation_outlines.slides,
            presentation.title,
        )

        # Issue E (RESOLVED): enriched_context lives in the USER prompt.
        # Instructions stays user-supplied only and is not concatenated with
        # enriched_context. See main-workflow.md Section 6 item E.
        base_instructions = request.instructions or ""
        try:
            agent_profile = get_agent_profile()
        except Exception:
            agent_profile = None

        batch_size = 10
        for start in range(0, len(slide_layouts), batch_size):
            end = min(start + batch_size, len(slide_layouts))

            content_tasks = [
                get_slide_content_from_type_and_outline(
                    slide_layouts[i],
                    presentation_outlines.slides[i],
                    language_to_use,
                    request.tone.value,
                    request.verbosity.value,
                    build_agent_profile_slide_instructions(
                        base_instructions,
                        slide_layouts[i].id,
                        agent_profile,
                    ),
                    template=request.template,
                    previous_slide_title=outline_titles[i - 1] if i > 0 else None,
                    next_slide_title=(
                        outline_titles[i + 1] if i + 1 < len(outline_titles) else None
                    ),
                    presentation_synopsis=presentation_synopsis,
                    tone_preset=resolved_narration_tone,
                    destination_context=enriched_data_for_model,
                    enriched_context=enriched_context_for_model,
                )
                for i in range(start, end)
            ]
            batch_contents: List[dict] = await asyncio.gather(*content_tasks)

            # Build slides for this batch
            batch_slides: List[SlideModel] = []
            for offset, slide_content in enumerate(batch_contents):
                i = start + offset
                slide_layout = slide_layouts[i]
                if enriched_data_for_model:
                    try:
                        from enrichers.overlay import apply_enricher_overlays
                        slide_content = apply_enricher_overlays(slide_content, slide_layout.id, enriched_data_for_model)
                    except Exception as overlay_err:
                        import logging
                        logging.getLogger(__name__).warning(
                            f"Enricher overlay failed for slide {i} (continuing without overlay): {overlay_err}"
                        )
                slide_content = apply_agent_profile_overlays(
                    slide_content,
                    slide_layout.id,
                    agent_profile,
                )
                slide = SlideModel(
                    presentation=presentation_id,
                    layout_group=layout_model.name,
                    layout=slide_layout.id,
                    index=i,
                    speaker_note=slide_content.get("__speaker_note__"),
                    narration_tone=resolved_narration_tone,
                    content=slide_content,
                )
                slides.append(slide)
                batch_slides.append(slide)

            if using_slides_markdown:
                image_urls_for_batch = get_images_for_slides_from_outline(
                    presentation_outlines.slides[start:end]
                )
            else:
                image_urls_for_batch = [[] for _ in batch_slides]

            # Start asset fetch tasks immediately so they run in parallel with next batch's LLM calls
            asset_tasks = [
                asyncio.create_task(
                    process_slide_and_fetch_assets(
                        image_generation_service,
                        slide,
                        outline_image_urls=image_urls_for_batch[offset],
                    )
                )
                for offset, slide in enumerate(batch_slides)
            ]
            async_assets_generation_tasks.extend(asset_tasks)

        if async_status:
            async_status.message = "Fetching assets for slides"
            async_status.updated_at = datetime.now()
            sql_session.add(async_status)
            await sql_session.commit()

        # Run all asset tasks concurrently while batches may still be generating content
        generated_assets_list = await asyncio.gather(*async_assets_generation_tasks)
        generated_assets = []
        for assets_list in generated_assets_list:
            generated_assets.extend(assets_list)

        # 8. Save PresentationModel and Slides
        sql_session.add(presentation)
        sql_session.add_all(slides)
        sql_session.add_all(generated_assets)
        await sql_session.commit()

        if async_status:
            async_status.message = "Exporting presentation"
            async_status.updated_at = datetime.now()
            sql_session.add(async_status)

        # 9. Export
        export_options = _build_export_options_from_request(request)
        presentation_and_path = await export_presentation(
            presentation_id,
            presentation.title or str(uuid.uuid4()),
            request.export_as,
            export_options=export_options,
        )

        response = PresentationPathAndEditPath(
            **presentation_and_path.model_dump(),
            edit_path=f"/presentation?id={presentation_id}",
        )

        if async_status:
            async_status.message = "Presentation generation completed"
            async_status.status = "completed"
            async_status.data = response.model_dump(mode="json")
            async_status.updated_at = datetime.now()
            sql_session.add(async_status)
            await sql_session.commit()

        # Triggering webhook on success
        CONCURRENT_SERVICE.run_task(
            None,
            WebhookService.send_webhook,
            WebhookEvent.PRESENTATION_GENERATION_COMPLETED,
            response.model_dump(mode="json"),
        )

        return response

    except Exception as e:
        if not isinstance(e, HTTPException):
            traceback.print_exc()
            e = HTTPException(status_code=500, detail="Presentation generation failed")

        api_error_model = APIErrorModel.from_exception(e)

        # Triggering webhook on failure
        CONCURRENT_SERVICE.run_task(
            None,
            WebhookService.send_webhook,
            WebhookEvent.PRESENTATION_GENERATION_FAILED,
            api_error_model.model_dump(mode="json"),
        )

        if async_status:
            async_status.status = "error"
            async_status.message = "Presentation generation failed"
            async_status.updated_at = datetime.now()
            async_status.error = api_error_model.model_dump(mode="json")
            sql_session.add(async_status)
            await sql_session.commit()

        else:
            raise e


@PRESENTATION_ROUTER.post("/generate", response_model=PresentationPathAndEditPath)
async def generate_presentation_sync(
    request: GeneratePresentationRequest,
    sql_session: AsyncSession = Depends(get_async_session),
):
    try:
        (presentation_id,) = await check_if_api_request_is_valid(request, sql_session)
        return await generate_presentation_handler(
            request, presentation_id, None, sql_session
        )
    except HTTPException:
        raise
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Presentation generation failed")


@PRESENTATION_ROUTER.post(
    "/generate/async", response_model=AsyncPresentationGenerationTaskModel
)
async def generate_presentation_async(
    request: GeneratePresentationRequest,
    background_tasks: BackgroundTasks,
    sql_session: AsyncSession = Depends(get_async_session),
):
    try:
        (presentation_id,) = await check_if_api_request_is_valid(request, sql_session)

        async_status = AsyncPresentationGenerationTaskModel(
            status="pending",
            message="Queued for generation",
            data=None,
        )
        sql_session.add(async_status)
        await sql_session.commit()

        background_tasks.add_task(
            generate_presentation_handler,
            request,
            presentation_id,
            async_status=async_status,
            sql_session=sql_session,
        )
        return async_status

    except Exception as e:
        if not isinstance(e, HTTPException):
            print(e)
            e = HTTPException(status_code=500, detail="Presentation generation failed")

        raise e


@PRESENTATION_ROUTER.get(
    "/status/{id}", response_model=AsyncPresentationGenerationTaskModel
)
async def check_async_presentation_generation_status(
    id: str = Path(description="ID of the presentation generation task"),
    sql_session: AsyncSession = Depends(get_async_session),
):
    status = await sql_session.get(AsyncPresentationGenerationTaskModel, id)
    if not status:
        raise HTTPException(
            status_code=404, detail="No presentation generation task found"
        )
    return status


@PRESENTATION_ROUTER.post("/edit", response_model=PresentationPathAndEditPath)
async def edit_presentation_with_new_content(
    data: Annotated[EditPresentationRequest, Body()],
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await sql_session.get(PresentationModel, data.presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    slides = await sql_session.scalars(
        select(SlideModel).where(SlideModel.presentation == data.presentation_id)
    )

    new_slides = []
    slides_to_delete = []
    for each_slide in slides:
        updated_content = None
        new_slide_data = list(
            filter(lambda x: x.index == each_slide.index, data.slides)
        )
        if new_slide_data:
            updated_content = deep_update(each_slide.content, new_slide_data[0].content)
            new_slides.append(
                each_slide.get_new_slide(presentation.id, updated_content)
            )
            slides_to_delete.append(each_slide.id)

    await sql_session.execute(
        delete(SlideModel).where(SlideModel.id.in_(slides_to_delete))
    )

    sql_session.add_all(new_slides)
    await sql_session.commit()

    presentation_and_path = await export_presentation(
        presentation.id, presentation.title or str(uuid.uuid4()), data.export_as
    )

    return PresentationPathAndEditPath(
        **presentation_and_path.model_dump(),
        edit_path=f"/presentation?id={presentation.id}",
    )


@PRESENTATION_ROUTER.post("/derive", response_model=PresentationPathAndEditPath)
async def derive_presentation_from_existing_one(
    data: Annotated[EditPresentationRequest, Body()],
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await sql_session.get(PresentationModel, data.presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    slides = await sql_session.scalars(
        select(SlideModel).where(SlideModel.presentation == data.presentation_id)
    )

    new_presentation = presentation.get_new_presentation()
    new_slides = []
    for each_slide in slides:
        updated_content = None
        new_slide_data = list(
            filter(lambda x: x.index == each_slide.index, data.slides)
        )
        if new_slide_data:
            updated_content = deep_update(each_slide.content, new_slide_data[0].content)
        new_slides.append(
            each_slide.get_new_slide(new_presentation.id, updated_content)
        )

    sql_session.add(new_presentation)
    sql_session.add_all(new_slides)
    await sql_session.commit()

    presentation_and_path = await export_presentation(
        new_presentation.id, new_presentation.title or str(uuid.uuid4()), data.export_as
    )

    return PresentationPathAndEditPath(
        **presentation_and_path.model_dump(),
        edit_path=f"/presentation?id={new_presentation.id}",
    )

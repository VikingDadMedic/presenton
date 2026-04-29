import asyncio
import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Dict, List, Optional, Tuple
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from constants.elevenlabs_voices import CURATED_ELEVENLABS_VOICES
from constants.narration import (
    TonePreset,
    TONE_DEFAULT_VOICE_IDS,
    get_default_tone_for_template,
    normalize_tone_preset,
)
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.database import get_async_session
from services.elevenlabs_service import ElevenLabsService
from services.pronunciation_dictionary_service import upload_user_dictionary
from utils.asset_directory_utils import get_audio_directory
from utils.get_env import (
    get_elevenlabs_api_key_env,
    get_elevenlabs_default_model_env,
    get_elevenlabs_default_voice_id_env,
)


NARRATION_ROUTER = APIRouter(prefix="/narration", tags=["Narration"])
_VOICE_CACHE_TTL = timedelta(hours=1)
_VOICE_CACHE: Dict[str, Tuple[datetime, List[dict]]] = {}
_DEFAULT_BULK_NARRATION_CONCURRENCY = 3
_MAX_BULK_NARRATION_CONCURRENCY = 12


class NarrationReadinessResponse(BaseModel):
    ready: bool
    reason: Optional[str] = None


class NarrationGenerateRequest(BaseModel):
    voice_id: Optional[str] = None
    tone: Optional[str] = None
    model_id: Optional[str] = None
    force_regenerate: bool = False


class NarrationSlideResponse(BaseModel):
    slide_id: uuid.UUID
    audio_url: Optional[str]
    text_hash: Optional[str]
    generated_at: Optional[datetime]
    voice_id: Optional[str]
    tone: Optional[str]
    model_id: Optional[str]
    character_count: Optional[int] = None
    cached: bool = False


class NarrationBulkResponse(BaseModel):
    presentation_id: uuid.UUID
    total_slides: int
    generated_slides: int
    total_character_count: int
    slides: List[NarrationSlideResponse]


class NarrationEstimateSlide(BaseModel):
    slide_id: uuid.UUID
    index: int
    title: Optional[str] = None
    has_speaker_note: bool
    character_count: int


class NarrationEstimateResponse(BaseModel):
    presentation_id: uuid.UUID
    total_slides: int
    synthesizeable_slides: int
    total_character_count: int
    max_character_limit: Optional[int] = None
    slides: List[NarrationEstimateSlide]


class NarrationPresentationStatusResponse(BaseModel):
    presentation_id: uuid.UUID
    slides: List[NarrationSlideResponse]


class UploadPronunciationDictionaryRequest(BaseModel):
    rules: List[Dict[str, str]]
    name: Optional[str] = "Presenton Pronunciation Dictionary"


def _clean_optional_string(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _normalize_request_tone_or_raise(request_tone: Optional[str]) -> Optional[str]:
    cleaned_tone = _clean_optional_string(request_tone)
    if not cleaned_tone:
        return None

    normalized_tone = normalize_tone_preset(cleaned_tone)
    if normalized_tone:
        return normalized_tone.value

    allowed_values = ", ".join(preset.value for preset in TonePreset)
    raise HTTPException(
        status_code=400,
        detail=f"Invalid narration tone '{cleaned_tone}'. Allowed values: {allowed_values}",
    )


def _normalize_generate_request_or_raise(
    request: NarrationGenerateRequest,
) -> NarrationGenerateRequest:
    return NarrationGenerateRequest(
        voice_id=_clean_optional_string(request.voice_id),
        tone=_normalize_request_tone_or_raise(request.tone),
        model_id=_clean_optional_string(request.model_id),
        force_regenerate=request.force_regenerate,
    )


def _read_positive_int_env(
    env_name: str,
    default_value: int,
    *,
    minimum: int = 1,
    maximum: Optional[int] = None,
) -> int:
    raw_value = os.getenv(env_name)
    if not raw_value:
        return default_value
    try:
        parsed = int(raw_value)
    except Exception:
        return default_value
    if parsed < minimum:
        return default_value
    if maximum is not None and parsed > maximum:
        return maximum
    return parsed


def _read_optional_positive_int_env(env_name: str) -> Optional[int]:
    raw_value = os.getenv(env_name)
    if not raw_value:
        return None
    try:
        parsed = int(raw_value)
    except Exception:
        return None
    if parsed <= 0:
        return None
    return parsed


def _extract_slide_title(slide: SlideModel) -> Optional[str]:
    if isinstance(slide.content, dict):
        title = slide.content.get("title")
        if isinstance(title, str):
            cleaned = title.strip()
            if cleaned:
                return cleaned
    return None


def _build_narration_estimate_rows(
    slides: List[SlideModel],
) -> tuple[List[NarrationEstimateSlide], int, int]:
    rows: List[NarrationEstimateSlide] = []
    total_character_count = 0
    synthesizeable_slides = 0
    for slide in slides:
        note_text = _resolve_speaker_note_text(slide)
        character_count = len(note_text)
        has_speaker_note = bool(note_text)
        if has_speaker_note:
            synthesizeable_slides += 1
            total_character_count += character_count
        rows.append(
            NarrationEstimateSlide(
                slide_id=slide.id,
                index=slide.index,
                title=_extract_slide_title(slide),
                has_speaker_note=has_speaker_note,
                character_count=character_count,
            )
        )

    return rows, total_character_count, synthesizeable_slides


def _get_elevenlabs_api_key() -> Optional[str]:
    key = get_elevenlabs_api_key_env()
    if not key:
        return None
    cleaned = key.strip()
    return cleaned or None


def _resolve_template_name(presentation: PresentationModel) -> str:
    if isinstance(presentation.layout, dict):
        name = presentation.layout.get("name")
        if isinstance(name, str):
            return name
    return ""


def _resolve_tone(presentation: PresentationModel, request_tone: Optional[str], slide: SlideModel) -> str:
    normalized = normalize_tone_preset(request_tone)
    if normalized:
        return normalized.value

    normalized = normalize_tone_preset(slide.narration_tone)
    if normalized:
        return normalized.value

    normalized = normalize_tone_preset(presentation.narration_tone)
    if normalized:
        return normalized.value

    return get_default_tone_for_template(_resolve_template_name(presentation)).value


def _resolve_voice_id(
    presentation: PresentationModel,
    slide: SlideModel,
    request_voice_id: Optional[str],
    tone: str,
) -> Optional[str]:
    if request_voice_id:
        return request_voice_id
    if slide.narration_voice_id:
        return slide.narration_voice_id
    if presentation.narration_voice_id:
        return presentation.narration_voice_id

    normalized_tone = normalize_tone_preset(tone)
    if normalized_tone and normalized_tone in TONE_DEFAULT_VOICE_IDS:
        return TONE_DEFAULT_VOICE_IDS[normalized_tone]
    env_voice = get_elevenlabs_default_voice_id_env()
    return env_voice.strip() if isinstance(env_voice, str) and env_voice.strip() else None


def _resolve_model_id(
    presentation: PresentationModel,
    slide: SlideModel,
    request_model_id: Optional[str],
) -> str:
    if request_model_id:
        return request_model_id
    if slide.narration_model_id:
        return slide.narration_model_id
    if presentation.narration_model_id:
        return presentation.narration_model_id
    env_model = get_elevenlabs_default_model_env()
    if isinstance(env_model, str) and env_model.strip():
        return env_model.strip()
    return "eleven_v3"


def _resolve_speaker_note_text(slide: SlideModel) -> str:
    note = (slide.speaker_note or "").strip()
    if note:
        return note
    if isinstance(slide.content, dict):
        generated = slide.content.get("__speaker_note__")
        if isinstance(generated, str) and generated.strip():
            return generated.strip()
    return ""


def _compute_narration_hash(
    text: str,
    voice_id: str,
    tone: str,
    model_id: str,
    dictionary_id: Optional[str],
) -> str:
    joined = "||".join(
        [
            text.strip(),
            (voice_id or "").strip(),
            (tone or "").strip(),
            (model_id or "").strip(),
            (dictionary_id or "").strip(),
        ]
    )
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def _audio_file_exists(audio_url: Optional[str]) -> bool:
    if not audio_url:
        return False
    if not audio_url.startswith("/app_data/audio/"):
        return False

    relative_path = audio_url[len("/app_data/audio/") :].lstrip("/")
    full_path = os.path.join(get_audio_directory(), relative_path)
    return os.path.isfile(full_path)


def _resolve_audio_paths(
    presentation_id: uuid.UUID, slide_index: int
) -> Tuple[str, str]:
    # Use 1-based index in filename for readability in exports.
    relative_path = os.path.join(str(presentation_id), f"slide_{slide_index + 1}.mp3")
    absolute_path = os.path.join(get_audio_directory(), relative_path)
    os.makedirs(os.path.dirname(absolute_path), exist_ok=True)
    app_url = f"/app_data/audio/{relative_path.replace(os.sep, '/')}"
    return absolute_path, app_url


async def _generate_slide_audio(
    slide: SlideModel,
    presentation: PresentationModel,
    request: NarrationGenerateRequest,
) -> Tuple[NarrationSlideResponse, int]:
    text = _resolve_speaker_note_text(slide)
    if not text:
        raise HTTPException(
            status_code=400,
            detail=f"Slide {slide.id} has no speaker note to synthesize",
        )

    tone = _resolve_tone(presentation, request.tone, slide)
    voice_id = _resolve_voice_id(presentation, slide, request.voice_id, tone)
    if not voice_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "No narration voice is configured. Set ELEVENLABS_DEFAULT_VOICE_ID "
                "or choose a voice in narration settings."
            ),
        )
    model_id = _resolve_model_id(presentation, slide, request.model_id)
    dictionary_id = (
        presentation.narration_pronunciation_dictionary_id
        or os.getenv("ELEVENLABS_PRONUNCIATION_DICTIONARY_ID")
    )
    next_hash = _compute_narration_hash(text, voice_id, tone, model_id, dictionary_id)

    if (
        not request.force_regenerate
        and slide.narration_text_hash == next_hash
        and _audio_file_exists(slide.narration_audio_url)
    ):
        return (
            NarrationSlideResponse(
                slide_id=slide.id,
                audio_url=slide.narration_audio_url,
                text_hash=slide.narration_text_hash,
                generated_at=slide.narration_generated_at,
                voice_id=slide.narration_voice_id,
                tone=slide.narration_tone,
                model_id=slide.narration_model_id,
                character_count=None,
                cached=True,
            ),
            0,
        )

    api_key = _get_elevenlabs_api_key()
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="ElevenLabs API key is missing. Add ELEVENLABS_API_KEY in Settings.",
        )

    service = ElevenLabsService(api_key=api_key)
    locators: Optional[List[dict]] = None
    if dictionary_id:
        locators = [{"pronunciation_dictionary_id": dictionary_id}]

    audio_bytes, headers = await service.synthesize(
        text=text,
        voice_id=voice_id,
        model_id=model_id,
        pronunciation_dictionary_locators=locators,
    )

    output_path, app_url = _resolve_audio_paths(presentation.id, slide.index)
    with open(output_path, "wb") as f:
        f.write(audio_bytes)

    character_count = 0
    raw_character_count = headers.get("x-character-count")
    if raw_character_count:
        try:
            character_count = int(raw_character_count)
        except Exception:
            character_count = 0

    now = datetime.now(timezone.utc)
    slide.narration_voice_id = voice_id
    slide.narration_tone = tone
    slide.narration_model_id = model_id
    slide.narration_audio_url = app_url
    slide.narration_text_hash = next_hash
    slide.narration_generated_at = now

    return (
        NarrationSlideResponse(
            slide_id=slide.id,
            audio_url=app_url,
            text_hash=next_hash,
            generated_at=now,
            voice_id=voice_id,
            tone=tone,
            model_id=model_id,
            character_count=character_count or None,
            cached=False,
        ),
        character_count,
    )


@NARRATION_ROUTER.get("/readiness", response_model=NarrationReadinessResponse)
async def narration_readiness() -> NarrationReadinessResponse:
    if _get_elevenlabs_api_key():
        return NarrationReadinessResponse(ready=True)
    return NarrationReadinessResponse(
        ready=False,
        reason="ElevenLabs API key is missing. Configure ELEVENLABS_API_KEY in Settings.",
    )


@NARRATION_ROUTER.get("/voices")
async def list_narration_voices(
    search: Annotated[Optional[str], Query()] = None,
):
    cache_key = (search or "").strip().lower()
    cached = _VOICE_CACHE.get(cache_key)
    now = datetime.now(timezone.utc)
    if cached and cached[0] > now:
        return {"voices": cached[1], "cached": True}

    api_key = _get_elevenlabs_api_key()
    if not api_key:
        voices = CURATED_ELEVENLABS_VOICES
        if search:
            lowered = search.lower()
            voices = [voice for voice in voices if lowered in voice["name"].lower()]
        _VOICE_CACHE[cache_key] = (now + _VOICE_CACHE_TTL, voices)
        return {"voices": voices, "cached": False, "source": "curated"}

    service = ElevenLabsService(api_key=api_key)
    voice_models = await service.list_voices(search=search)
    voices = [
        {
            "voice_id": voice.voice_id,
            "name": voice.name,
            "category": voice.category,
            "language": voice.language,
            "description": voice.description,
            "preview_url": voice.preview_url,
        }
        for voice in voice_models
    ]
    _VOICE_CACHE[cache_key] = (now + _VOICE_CACHE_TTL, voices)
    return {"voices": voices, "cached": False, "source": "api"}


@NARRATION_ROUTER.post("/slide/{slide_id}", response_model=NarrationSlideResponse)
async def generate_narration_for_slide(
    slide_id: uuid.UUID,
    request: NarrationGenerateRequest = Body(default=NarrationGenerateRequest()),
    response: Response = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    normalized_request = _normalize_generate_request_or_raise(request)
    slide = await sql_session.get(SlideModel, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    presentation = await sql_session.get(PresentationModel, slide.presentation)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    generated, character_count = await _generate_slide_audio(
        slide=slide,
        presentation=presentation,
        request=normalized_request,
    )
    sql_session.add(slide)
    await sql_session.commit()

    if response and character_count > 0:
        response.headers["x-character-count"] = str(character_count)
    return generated


@NARRATION_ROUTER.get(
    "/presentation/{presentation_id}/estimate",
    response_model=NarrationEstimateResponse,
)
async def estimate_narration_for_presentation(
    presentation_id: uuid.UUID,
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    slides = list(
        (
            await sql_session.scalars(
                select(SlideModel)
                .where(SlideModel.presentation == presentation_id)
                .order_by(SlideModel.index)
            )
        ).all()
    )
    if not slides:
        raise HTTPException(status_code=400, detail="Presentation has no slides")

    rows, total_character_count, synthesizeable_slides = _build_narration_estimate_rows(
        slides
    )
    max_character_limit = _read_optional_positive_int_env(
        "ELEVENLABS_BULK_MAX_CHARACTERS"
    )

    return NarrationEstimateResponse(
        presentation_id=presentation_id,
        total_slides=len(slides),
        synthesizeable_slides=synthesizeable_slides,
        total_character_count=total_character_count,
        max_character_limit=max_character_limit,
        slides=rows,
    )


@NARRATION_ROUTER.post(
    "/presentation/{presentation_id}/bulk", response_model=NarrationBulkResponse
)
async def bulk_generate_narration_for_presentation(
    presentation_id: uuid.UUID,
    request: NarrationGenerateRequest = Body(default=NarrationGenerateRequest()),
    response: Response = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    normalized_request = _normalize_generate_request_or_raise(request)
    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    slides = list(
        (
            await sql_session.scalars(
                select(SlideModel)
                .where(SlideModel.presentation == presentation_id)
                .order_by(SlideModel.index)
            )
        ).all()
    )
    if not slides:
        raise HTTPException(status_code=400, detail="Presentation has no slides")

    if normalized_request.voice_id is not None:
        presentation.narration_voice_id = normalized_request.voice_id
    if normalized_request.model_id is not None:
        presentation.narration_model_id = normalized_request.model_id
    if normalized_request.tone is not None:
        presentation.narration_tone = normalized_request.tone

    _, estimated_total_characters, synthesizeable_slides = _build_narration_estimate_rows(
        slides
    )
    if synthesizeable_slides <= 0:
        raise HTTPException(
            status_code=400,
            detail="No slides have speaker notes to synthesize.",
        )

    max_character_limit = _read_optional_positive_int_env(
        "ELEVENLABS_BULK_MAX_CHARACTERS"
    )
    if (
        max_character_limit is not None
        and estimated_total_characters > max_character_limit
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Bulk narration exceeds configured character limit. "
                f"Estimated characters: {estimated_total_characters}, "
                f"limit: {max_character_limit}."
            ),
        )

    bulk_concurrency = _read_positive_int_env(
        "ELEVENLABS_BULK_CONCURRENCY",
        _DEFAULT_BULK_NARRATION_CONCURRENCY,
        minimum=1,
        maximum=_MAX_BULK_NARRATION_CONCURRENCY,
    )

    semaphore = asyncio.Semaphore(bulk_concurrency)

    async def _process_slide(
        slide_position: int, slide_model: SlideModel
    ) -> tuple[int, NarrationSlideResponse, int]:
        async with semaphore:
            generated, character_count = await _generate_slide_audio(
                slide=slide_model,
                presentation=presentation,
                request=normalized_request,
            )
        return slide_position, generated, character_count

    processing_tasks = [
        asyncio.create_task(_process_slide(index, slide))
        for index, slide in enumerate(slides)
    ]
    try:
        processed_results = await asyncio.gather(*processing_tasks)
    except Exception:
        for task in processing_tasks:
            if not task.done():
                task.cancel()
        raise

    generated_results: List[Optional[NarrationSlideResponse]] = [None] * len(slides)
    total_character_count = 0
    generated_slides = 0
    for slide_position, generated, character_count in processed_results:
        generated_results[slide_position] = generated
        total_character_count += character_count
        if not generated.cached:
            generated_slides += 1
        sql_session.add(slides[slide_position])

    sql_session.add(presentation)
    await sql_session.commit()

    if response:
        response.headers["x-character-count"] = str(total_character_count)

    return NarrationBulkResponse(
        presentation_id=presentation_id,
        total_slides=len(slides),
        generated_slides=generated_slides,
        total_character_count=total_character_count,
        slides=[result for result in generated_results if result is not None],
    )


@NARRATION_ROUTER.get(
    "/presentation/{presentation_id}", response_model=NarrationPresentationStatusResponse
)
async def get_narration_status_for_presentation(
    presentation_id: uuid.UUID,
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    slides = list(
        (
            await sql_session.scalars(
                select(SlideModel)
                .where(SlideModel.presentation == presentation_id)
                .order_by(SlideModel.index)
            )
        ).all()
    )

    return NarrationPresentationStatusResponse(
        presentation_id=presentation_id,
        slides=[
            NarrationSlideResponse(
                slide_id=slide.id,
                audio_url=slide.narration_audio_url,
                text_hash=slide.narration_text_hash,
                generated_at=slide.narration_generated_at,
                voice_id=slide.narration_voice_id,
                tone=slide.narration_tone,
                model_id=slide.narration_model_id,
                character_count=None,
                cached=bool(slide.narration_audio_url and _audio_file_exists(slide.narration_audio_url)),
            )
            for slide in slides
        ],
    )


@NARRATION_ROUTER.delete("/slide/{slide_id}")
async def delete_narration_for_slide(
    slide_id: uuid.UUID, sql_session: AsyncSession = Depends(get_async_session)
):
    slide = await sql_session.get(SlideModel, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")

    if slide.narration_audio_url and slide.narration_audio_url.startswith("/app_data/audio/"):
        relative_path = slide.narration_audio_url[len("/app_data/audio/") :].lstrip("/")
        absolute_path = os.path.join(get_audio_directory(), relative_path)
        if os.path.isfile(absolute_path):
            os.remove(absolute_path)

    slide.narration_audio_url = None
    slide.narration_text_hash = None
    slide.narration_generated_at = None
    sql_session.add(slide)
    await sql_session.commit()
    return {"deleted": True, "slide_id": str(slide_id)}


@NARRATION_ROUTER.post("/pronunciation-dictionary")
async def create_pronunciation_dictionary(
    request: UploadPronunciationDictionaryRequest,
):
    dictionary_id = await upload_user_dictionary(
        rules=request.rules,
        name=request.name or "Presenton Pronunciation Dictionary",
    )
    return {"dictionary_id": dictionary_id}

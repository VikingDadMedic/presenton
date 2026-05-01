import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse
from llmai import get_client
from llmai.shared import SystemMessage, UserMessage
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from api.v1.ppt.endpoints.presentation import _resolve_presentation_fonts
from models.presentation_with_slides import PresentationWithSlides
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from models.sse_response import (
    SSECompleteResponse,
    SSEErrorResponse,
    SSEResponse,
    SSEStatusResponse,
)
from services.database import get_async_session
from services.mem0_presentation_memory_service import MEM0_PRESENTATION_MEMORY_SERVICE
from utils.llm_config import get_content_model_config
from utils.llm_utils import extract_text, get_generate_kwargs
from utils.showcase_qa import (
    ConversationTurn,
    EMPTY_CONTEXT_MESSAGE,
    MAX_HISTORY_TURNS_IN_REQUEST,
    MAX_OUTPUT_TOKENS,
    MAX_QUESTION_CHARS,
    build_grounded_context,
    build_system_prompt,
)
from utils.showcase_rate_limit import enforce_showcase_ask_rate_limit


PUBLIC_SHOWCASE_ROUTER = APIRouter(tags=["Public Showcase"])

LOGGER = logging.getLogger(__name__)


class AskRequest(BaseModel):
    presentation_id: uuid.UUID
    slide_id: uuid.UUID
    question: str = Field(min_length=2, max_length=MAX_QUESTION_CHARS)
    topic: str | None = Field(default=None, max_length=120)
    history: list[ConversationTurn] | None = Field(
        default=None,
        max_length=MAX_HISTORY_TURNS_IN_REQUEST,
    )


def _ensure_public(presentation: PresentationModel) -> None:
    if not presentation.is_public:
        raise HTTPException(status_code=403, detail="This presentation is not public")


@PUBLIC_SHOWCASE_ROUTER.get("/presentation/{id}", response_model=PresentationWithSlides)
async def get_public_presentation(
    id: uuid.UUID,
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await sql_session.get(PresentationModel, id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    _ensure_public(presentation)

    slides_result = await sql_session.scalars(
        select(SlideModel).where(SlideModel.presentation == id).order_by(SlideModel.index)
    )
    slides = list(slides_result)
    fonts = await _resolve_presentation_fonts(presentation, slides, sql_session)
    return PresentationWithSlides(
        **presentation.model_dump(),
        slides=slides,
        fonts=fonts,
    )


@PUBLIC_SHOWCASE_ROUTER.get("/showcase/ready/{presentation_id}")
async def showcase_ready(
    presentation_id: uuid.UUID,
    sql_session: AsyncSession = Depends(get_async_session),
) -> dict:
    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    _ensure_public(presentation)

    has_enriched = bool(
        getattr(presentation, "enriched_context", None)
        or getattr(presentation, "enriched_data", None)
    )
    slide_count = (
        await sql_session.scalar(
            select(SlideModel.id).where(SlideModel.presentation == presentation_id).limit(1)
        )
    ) is not None

    return {
        "ready": bool(has_enriched and slide_count),
        "has_enriched_data": has_enriched,
        "has_slides": slide_count,
    }


@PUBLIC_SHOWCASE_ROUTER.post("/showcase/ask")
async def showcase_ask(
    body: AskRequest = Body(...),
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await sql_session.get(PresentationModel, body.presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    _ensure_public(presentation)

    slide = await sql_session.get(SlideModel, body.slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    if slide.presentation != body.presentation_id:
        raise HTTPException(
            status_code=400,
            detail="Slide does not belong to this presentation",
        )

    enforce_showcase_ask_rate_limit(body.presentation_id)

    memory_query = body.question.strip()
    if body.topic:
        memory_query = f"{body.topic.strip()} {memory_query}".strip()
    memory_context = await MEM0_PRESENTATION_MEMORY_SERVICE.retrieve_context(
        body.presentation_id,
        memory_query,
    )
    context = build_grounded_context(
        presentation,
        slide,
        memory_context=memory_context,
        history=body.history,
    )

    if not context:
        async def empty_stream():
            message = EMPTY_CONTEXT_MESSAGE
            yield SSEStatusResponse(status="No grounding data available").to_string()
            yield SSEResponse(
                event="response",
                data=json.dumps({"type": "chunk", "text": message}),
            ).to_string()
            yield SSECompleteResponse(key="answer", value=message).to_string()

        return StreamingResponse(empty_stream(), media_type="text/event-stream")

    system_prompt = build_system_prompt(context=context, topic=body.topic)
    user_prompt = body.question.strip()

    async def stream_answer():
        try:
            yield SSEStatusResponse(status="Thinking...").to_string()

            config, model, extra_body = get_content_model_config()
            client = get_client(config=config)

            messages = [
                SystemMessage(content=system_prompt),
                UserMessage(content=user_prompt),
            ]
            kwargs = get_generate_kwargs(
                model=model,
                messages=messages,
                max_tokens=MAX_OUTPUT_TOKENS,
            )
            if extra_body:
                kwargs["extra_body"] = extra_body

            response = await asyncio.to_thread(client.generate, **kwargs)
            answer = (extract_text(response.content) or "").strip()
            if not answer:
                yield SSEErrorResponse(detail="LLM returned an empty answer").to_string()
                return

            words = answer.split(" ")
            for i, word in enumerate(words):
                yield SSEResponse(
                    event="response",
                    data=json.dumps(
                        {
                            "type": "chunk",
                            "text": word + (" " if i < len(words) - 1 else ""),
                        }
                    ),
                ).to_string()
                await asyncio.sleep(0.028)

            yield SSECompleteResponse(key="answer", value=answer).to_string()

        except HTTPException:
            raise
        except Exception as exc:
            LOGGER.exception("Public showcase ask failed: %s", exc)
            yield SSEErrorResponse(detail=str(exc)).to_string()

    return StreamingResponse(stream_answer(), media_type="text/event-stream")

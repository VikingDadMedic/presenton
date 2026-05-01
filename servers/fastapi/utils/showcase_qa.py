import json
from collections.abc import Sequence
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel


MAX_OUTPUT_TOKENS = 500
MAX_QUESTION_CHARS = 600
MAX_ENRICHED_CONTEXT_CHARS = 4000
MAX_SLIDE_CONTENT_CHARS = 1500
MAX_MEMORY_CONTEXT_CHARS = 2500
MAX_HISTORY_TURN_CHARS = 400
MAX_HISTORY_TURNS_IN_REQUEST = 20
MAX_RECENT_HISTORY_TURNS = 5
MAX_RECENT_HISTORY_CHARS = 1400

EMPTY_CONTEXT_MESSAGE = (
    "I don't have any data about this slide yet, so I can't answer reliably. "
    "Try generating the deck again with destination details, or ask the agent directly."
)

SYSTEM_PROMPT_TEMPLATE = """You are answering a viewer's follow-up question about a travel proposal that is being displayed to them right now.

Rules:
1. Use ONLY the verified facts in the context block below. If the context does not contain enough information to answer, say so plainly: "I don't have that data in this proposal."
2. Do not invent hotels, prices, schedules, visa rules, or weather. If something is not in the context, do not guess.
3. Keep answers short — at most 4 sentences. Plain prose, no markdown headings, no bullets unless the viewer asks for a list.
4. Address the viewer directly ("you"). Don't refer to "the deck" or "the slide" by name; speak as if you are part of the experience.
5. Be warm and confident, not promotional. The agent has already done the selling; your job is to inform.
{focus_hint}
# Context
{context}
"""


class ConversationTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_HISTORY_TURN_CHARS)

    @field_validator("content")
    @classmethod
    def normalize_content(cls, value: str) -> str:
        compact = " ".join(value.split())
        if not compact:
            raise ValueError("content must not be empty")
        return compact


def truncate_text(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n[truncated]"


def truncate_inline_text(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return f"{text[:limit]} [truncated]"


def format_recent_conversation(history: Sequence[ConversationTurn] | None) -> str:
    if not history:
        return ""

    recent_turns = history[-MAX_RECENT_HISTORY_TURNS:]
    lines: list[str] = []
    for turn in recent_turns:
        speaker = "User" if turn.role == "user" else "Assistant"
        lines.append(
            f"{speaker}: {truncate_inline_text(turn.content, MAX_HISTORY_TURN_CHARS)}"
        )

    return truncate_text("\n".join(lines), MAX_RECENT_HISTORY_CHARS)


def build_grounded_context(
    presentation: PresentationModel,
    slide: SlideModel,
    memory_context: str | None = None,
    history: Sequence[ConversationTurn] | None = None,
) -> str:
    parts: list[str] = []

    if presentation.title:
        parts.append(f"## Deck title\n{presentation.title}")

    origin_destination = []
    if getattr(presentation, "origin", None):
        origin_destination.append(f"Origin: {presentation.origin}")
    if getattr(presentation, "content", None):
        origin_destination.append(
            f"Brief: {truncate_text(str(presentation.content), 400)}"
        )
    if origin_destination:
        parts.append("## Trip context\n" + "\n".join(origin_destination))

    if memory_context:
        parts.append(
            "## Relevant prior context from this proposal\n"
            + truncate_text(memory_context, MAX_MEMORY_CONTEXT_CHARS)
        )

    recent_conversation = format_recent_conversation(history)
    if recent_conversation:
        parts.append(
            f"## Recent conversation (last {MAX_RECENT_HISTORY_TURNS} turns)\n"
            + recent_conversation
        )

    enriched_context = getattr(presentation, "enriched_context", None) or ""
    if enriched_context:
        parts.append(
            "## Verified destination data (real supply API output)\n"
            + truncate_text(enriched_context, MAX_ENRICHED_CONTEXT_CHARS)
        )

    enriched_data = getattr(presentation, "enriched_data", None)
    if enriched_data and not enriched_context:
        try:
            enriched_json = json.dumps(enriched_data, ensure_ascii=False)
        except (TypeError, ValueError):
            enriched_json = str(enriched_data)
        parts.append(
            "## Verified destination data (raw JSON)\n"
            + truncate_text(enriched_json, MAX_ENRICHED_CONTEXT_CHARS)
        )

    if slide.content:
        try:
            slide_json = json.dumps(slide.content, ensure_ascii=False)
        except (TypeError, ValueError):
            slide_json = str(slide.content)
        parts.append(
            f"## Currently displayed slide ({slide.layout})\n"
            + truncate_text(slide_json, MAX_SLIDE_CONTENT_CHARS)
        )

    return "\n\n".join(parts) if parts else ""


def build_system_prompt(context: str, topic: str | None = None) -> str:
    normalized_topic = (topic or "").strip()
    focus_hint = ""
    if normalized_topic:
        focus_hint = (
            f'6. Viewer focus hint: they are asking about "{normalized_topic}". '
            "Prioritize the most relevant facts in that area.\n"
        )

    return SYSTEM_PROMPT_TEMPLATE.format(
        context=context,
        focus_hint=focus_hint,
    )

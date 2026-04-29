import asyncio
from datetime import datetime
from typing import Any, Optional
from fastapi import HTTPException
from llmai import get_client
from llmai.shared import JSONSchemaResponse, Message, SystemMessage, UserMessage
from constants.narration import TONE_PROMPT_ADDENDA, normalize_tone_preset
from models.presentation_layout import SlideLayoutModel
from models.sql.slide import SlideModel
from services.auto_ipa_service import augment_speaker_note_with_ipa
from utils.llm_config import get_content_model_config, has_content_model_override
from utils.llm_client_error_handler import handle_llm_client_exceptions
from utils.llm_utils import extract_structured_content, get_generate_kwargs
from utils.schema_utils import (
    add_field_in_schema,
    remove_fields_from_schema,
    strip_length_constraints,
    validate_length_constraints,
)


SPEAKER_NOTE_GENERATION_RULES = """
    # Speaker Note Generation
    - Write `__speaker_note__` as performable narration, not presenter instructions.
    - Voice: world-weary travel-companion narrator. Present tense, sensory, intimate.
    - Include one concrete sensory anchor (smell, sound, texture, taste, or movement).
    - Never write instructions like "Highlight...", "Mention...", "Emphasize...", or "Tell the audience...".
    - Use inline ElevenLabs-style tags in square brackets only where they shape pacing (1 to 3 tags): `[pause]`, `[sigh]`, `[whispering]`, `[reflective]`, `[chuckles softly]`, `[warmly]`.
    - Use em dashes for quick cuts and ellipses for trailing thoughts where natural.
    - Spell out standalone numbers unless they are part of a proper noun.
    - Normalize currency to natural speech.
    - For non-English proper nouns with pronunciation risk, wrap with SSML phoneme:
      `<phoneme alphabet="ipa" ph="ˈtʃiŋkwe ˈtɛrre">Cinque Terre</phoneme>`.
    - Maintain narrative continuity using previous and next slide cues plus presentation synopsis.

    ## GOOD calibration example
    `[warmly] The market wakes in layers—metal shutters, spice in the air, and scooters cutting through alley light. [pause] What looked distant on the map is suddenly close enough to smell, close enough to hear in your chest. [reflective] This is where planning gives way to pulse, and the city starts introducing itself on its own terms.`

    ## BAD calibration example
    `This slide explains the destination highlights. Mention key points and emphasize the benefits to the audience.`
"""


def _resolve_prompt_language(language: Optional[str]) -> str:
    if language is None:
        return "auto-detect"
    s = str(language).strip()
    if not s:
        return "auto-detect"
    if s.lower() in {"auto", "auto-detect"}:
        return "auto-detect"
    return s


def _normalize_context_value(value: Optional[str], fallback: str) -> str:
    if not value:
        return fallback
    cleaned = value.strip()
    return cleaned or fallback


def get_system_prompt(
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    memory_context: Optional[str] = None,
    template: str = "",
    tone_preset: Optional[str] = None,
):
    memory_block = (
        "\n    # Retrieved Presentation Memory Context\n"
        f"    {memory_context}\n"
        "    - Use this context only if it is relevant to the user prompt.\n"
        "    - Prefer this context over assumptions when resolving ambiguity.\n"
        if memory_context
        else ""
    )
    normalized_tone_preset = normalize_tone_preset(tone_preset)
    tone_preset_block = ""
    if normalized_tone_preset:
        tone_preset_block = (
            "\n    # Narration Tone Preset\n"
            f"    Use `{normalized_tone_preset.value}` when rewriting speaker notes.\n"
            f"    {TONE_PROMPT_ADDENDA[normalized_tone_preset]}\n"
        )

    return f"""
    Edit Slide data and speaker note based on provided prompt, follow mentioned steps and notes and provide structured output.

    {"# User Instruction:" if instructions else ""}
    {instructions or ""}

    {"# Tone:" if tone else ""}
    {tone or ""}

    {"# Verbosity:" if verbosity else ""}
    {verbosity or ""}

    # Notes
    - Provide output in language mentioned in **Input**.
    - The goal is to change Slide data based on the provided prompt.
    - Do not change **Image prompts** and **Icon queries** if not asked for in prompt.
    - Generate **Image prompts** and **Icon queries** if asked to generate or change in prompt.
    - Make sure to follow language guidelines.
    - Speaker note should be plain text, not markdown.
    {SPEAKER_NOTE_GENERATION_RULES}
    {"- When editing travel slides, maintain consistent pricing format, date format, and destination naming." if template and template.startswith("travel") else ""}
    {"- Preserve travel-specific data accuracy (flight times, distances, ratings) unless explicitly asked to change." if template and template.startswith("travel") else ""}
    {tone_preset_block}
    {memory_block}

    **Go through all notes and steps and make sure they are followed, including mentioned constraints**
    """


def get_user_prompt(
    prompt: str,
    slide_data: dict,
    language: str,
    previous_slide_title: Optional[str] = None,
    next_slide_title: Optional[str] = None,
    presentation_synopsis: Optional[str] = None,
):
    display_language = _resolve_prompt_language(language)
    return f"""
        ## Icon Query And Image Prompt Language
        English

        ## Current Date and Time
        {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

        ## Slide Content Language
        {display_language}

        ## Narrative Continuity Context
        Previous Slide Title: {_normalize_context_value(previous_slide_title, "N/A")}
        Next Slide Title: {_normalize_context_value(next_slide_title, "N/A")}
        Presentation Synopsis: {_normalize_context_value(presentation_synopsis, "No synopsis provided.")}

        ## Prompt
        {prompt}

        ## Slide data
        {slide_data}
    """


def get_messages(
    prompt: str,
    slide_data: dict,
    language: Optional[str],
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    memory_context: Optional[str] = None,
    template: str = "",
    previous_slide_title: Optional[str] = None,
    next_slide_title: Optional[str] = None,
    presentation_synopsis: Optional[str] = None,
    tone_preset: Optional[str] = None,
) -> list[Message]:
    return [
        SystemMessage(
            content=get_system_prompt(
                tone,
                verbosity,
                instructions,
                memory_context,
                template,
                tone_preset,
            ),
        ),
        UserMessage(
            content=get_user_prompt(
                prompt,
                slide_data,
                language,
                previous_slide_title,
                next_slide_title,
                presentation_synopsis,
            ),
        ),
    ]


async def get_edited_slide_content(
    prompt: str,
    slide: SlideModel,
    language: Optional[str],
    slide_layout: SlideLayoutModel,
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    memory_context: Optional[str] = None,
    template: str = "",
    previous_slide_title: Optional[str] = None,
    next_slide_title: Optional[str] = None,
    presentation_synopsis: Optional[str] = None,
    tone_preset: Optional[str] = None,
    destination_context: Optional[dict] = None,
):
    config, model, extra_body = get_content_model_config()
    client = get_client(config=config)
    use_override = has_content_model_override()

    response_schema = remove_fields_from_schema(
        slide_layout.json_schema, ["__image_url__", "__icon_url__"]
    )
    response_schema = add_field_in_schema(
        response_schema,
        {
            "__speaker_note__": {
                "type": "string",
                "minLength": 250,
                "maxLength": 1000,
                "description": (
                    "Narration text for the slide with optional inline audio tags "
                    "and IPA phoneme hints where needed"
                ),
            }
        },
        True,
    )

    original_schema = response_schema
    if use_override:
        llm_schema = strip_length_constraints(response_schema)
        strict = True
    else:
        llm_schema = response_schema
        strict = False

    try:
        response_format = JSONSchemaResponse(
            name="response",
            json_schema=llm_schema,
            strict=strict,
        )
        messages = get_messages(
            prompt,
            slide.content,
            language,
            tone,
            verbosity,
            instructions,
            memory_context,
            template,
            previous_slide_title,
            next_slide_title,
            presentation_synopsis,
            tone_preset,
        )

        for attempt in range(3):
            kwargs = get_generate_kwargs(
                model=model,
                messages=messages,
                response_format=response_format,
            )
            if extra_body:
                kwargs["extra_body"] = extra_body

            response = await asyncio.to_thread(client.generate, **kwargs)
            content = extract_structured_content(response.content)
            if content is not None:
                speaker_note = content.get("__speaker_note__")
                if isinstance(speaker_note, str) and speaker_note.strip():
                    content["__speaker_note__"] = await augment_speaker_note_with_ipa(
                        speaker_note,
                        destination=destination_context,
                    )

                violations = validate_length_constraints(content, original_schema)
                if violations and attempt < 2:
                    continue
                if violations:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Generated content violated schema constraints: {violations}",
                    )
                return content

            if attempt < 2:
                await asyncio.sleep(0.5 * (attempt + 1))

        raise HTTPException(status_code=400, detail="LLM did not return any content")

    except Exception as e:
        raise handle_llm_client_exceptions(e)


async def get_edited_field_value(
    prompt: str,
    current_value: Any,
    language: str = "English",
) -> str:
    config, model, extra_body = get_content_model_config()
    type_name = type(current_value).__name__

    messages: list[Message] = [
        SystemMessage(
            content=(
                "You are a precise data editor. Edit the given field value based on "
                "the user's instruction. Return ONLY the new value as plain text. "
                "Do not add any explanation, formatting, quotes, or markdown. "
                "If the value is a number, return only the number. "
                "If it's text, return only the text."
            ),
        ),
        UserMessage(
            content=(
                f"Current value: {current_value}\n"
                f"Type: {type_name}\n"
                f"Language: {language}\n"
                f"Instruction: {prompt}"
            ),
        ),
    ]

    client = get_client(config=config)
    try:
        response = await asyncio.to_thread(
            client.generate,
            **get_generate_kwargs(
                model=model,
                messages=messages,
            ),
        )
        text = response.content
        if isinstance(text, list):
            text = "".join(
                block.text for block in text if hasattr(block, "text")
            )
        return str(text).strip()
    except Exception as e:
        raise handle_llm_client_exceptions(e)

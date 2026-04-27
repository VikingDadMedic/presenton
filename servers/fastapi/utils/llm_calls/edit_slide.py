import asyncio
from datetime import datetime
from typing import Any, Optional
from fastapi import HTTPException
from llmai import get_client
from llmai.shared import JSONSchemaResponse, Message, SystemMessage, UserMessage
from models.presentation_layout import SlideLayoutModel
from models.sql.slide import SlideModel
from utils.llm_config import get_content_model_config, has_content_model_override
from utils.llm_client_error_handler import handle_llm_client_exceptions
from utils.llm_utils import extract_structured_content, get_generate_kwargs
from utils.schema_utils import (
    add_field_in_schema,
    remove_fields_from_schema,
    strip_length_constraints,
    validate_length_constraints,
)


def _resolve_prompt_language(language: Optional[str]) -> str:
    if language is None:
        return "auto-detect"
    s = str(language).strip()
    if not s:
        return "auto-detect"
    if s.lower() in {"auto", "auto-detect"}:
        return "auto-detect"
    return s


def get_system_prompt(
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    memory_context: Optional[str] = None,
    template: str = "",
):
    memory_block = (
        "\n    # Retrieved Presentation Memory Context\n"
        f"    {memory_context}\n"
        "    - Use this context only if it is relevant to the user prompt.\n"
        "    - Prefer this context over assumptions when resolving ambiguity.\n"
        if memory_context
        else ""
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
    - Speaker note should be normal text, not markdown.
    - Speaker note should be simple, clear, concise and to the point.
    {"- When editing travel slides, maintain consistent pricing format, date format, and destination naming." if template and template.startswith("travel") else ""}
    {"- Preserve travel-specific data accuracy (flight times, distances, ratings) unless explicitly asked to change." if template and template.startswith("travel") else ""}
    {memory_block}

    **Go through all notes and steps and make sure they are followed, including mentioned constraints**
    """


def get_user_prompt(prompt: str, slide_data: dict, language: str):
    display_language = _resolve_prompt_language(language)
    return f"""
        ## Icon Query And Image Prompt Language
        English

        ## Current Date and Time
        {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

        ## Slide Content Language
        {display_language}

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
) -> list[Message]:
    return [
        SystemMessage(
            content=get_system_prompt(tone, verbosity, instructions, memory_context, template),
        ),
        UserMessage(
            content=get_user_prompt(prompt, slide_data, language),
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
                "minLength": 100,
                "maxLength": 250,
                "description": "Speaker note for the slide",
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
                if use_override:
                    violations = validate_length_constraints(content, original_schema)
                    if violations and attempt < 2:
                        continue
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

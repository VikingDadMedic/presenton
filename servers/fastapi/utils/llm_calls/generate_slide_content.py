import asyncio
from datetime import datetime
import json
from typing import Optional
from fastapi import HTTPException
from llmai import get_client
from llmai.shared import JSONSchemaResponse, Message, SystemMessage, UserMessage
from llmai.shared.configs import AnthropicClientConfig
from constants.narration import TONE_PROMPT_ADDENDA, normalize_tone_preset
from models.presentation_layout import SlideLayoutModel
from models.presentation_outline_model import SlideOutlineModel
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
- Normalize currency to natural speech (e.g., "two thousand four hundred ninety-nine dollars per person").
- For non-English proper nouns with pronunciation risk, wrap with SSML phoneme:
  `<phoneme alphabet="ipa" ph="ˈtʃiŋkwe ˈtɛrre">Cinque Terre</phoneme>`.
- Maintain narrative continuity using the previous and next slide cues plus presentation synopsis.

## GOOD calibration example
`[warmly] The harbor is still half-asleep, gulls stitching the air above chipped blue boats, and the smell of espresso drifting out of a doorway no wider than a suitcase. [pause] By the time the first ferry horn rolls across the water, you're already in motion—stones underfoot, salt on your lips, the old quarter opening like a hand-drawn map. [reflective] This is the hinge between arrival and immersion, where the trip stops being an itinerary and starts feeling personal.`

## BAD calibration example
`This slide introduces the destination. Mention the highlights and explain why the audience should care. Emphasize key numbers and conclude with a transition to the next section.`
"""


SLIDE_CONTENT_SYSTEM_PROMPT = """
You will be given slide content and response schema.
You need to generate structured content json based on the schema.

# Steps
1. Analyze the content.
2. Analyze the response schema.
3. Generate structured content json based on the schema.
4. Generate speaker note if required.
5. Provide structured content json as output.

# General Rules
- Make sure to follow language guidelines.
- Speaker note should be normal text, not markdown.
- Never ever go over the max character limit.
- Do not add emoji in the content.
- Don't provide $schema field in content json.
{markdown_emphasis_rules}
{speaker_note_generation_rules}

{user_instructions}

{tone_instructions}

{tone_preset_instructions}

{verbosity_instructions}

{output_fields_instructions}
"""


SLIDE_CONTENT_USER_PROMPT = """
# Current Date and Time:
{current_date_time}

# Icon Query And Image Prompt Language:
English

# Slide Language:
{language}

# Narrative Continuity Context:
- Previous Slide Title: {previous_slide_title}
- Next Slide Title: {next_slide_title}
- Presentation Synopsis: {presentation_synopsis}
{enriched_context_block}
# SLIDE CONTENT: START
{content}
# SLIDE CONTENT: END
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


def _get_schema_markdown(response_schema: Optional[dict]) -> str:
    if not response_schema:
        return "- Follow the provided response schema strictly."
    try:
        schema_text = json.dumps(response_schema, ensure_ascii=False)
    except Exception:
        return "- Follow the provided response schema strictly."
    return f"- Follow this response schema exactly: {schema_text}"


def _normalize_context_value(value: Optional[str], fallback: str) -> str:
    if not value:
        return fallback
    cleaned = value.strip()
    return cleaned or fallback


def _build_system_prompt_stable_prefix(
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    template: str = "",
    tone_preset: Optional[str] = None,
) -> str:
    """The portion of the Call 3 system prompt that does NOT vary per slide.

    Anthropic prompt caching (`cache_control: ephemeral`) hashes the request
    body up to the cache marker; everything *before* the marker is reused
    across calls within the same presentation. We split here so the schema
    (which IS per-slide, since each layout has a different shape) lands in
    the variable suffix and the cacheable prefix stays stable for the entire
    Call 3 fan-out of one presentation.
    """
    markdown_emphasis_rules = (
        "- Strictly use markdown to emphasize important points, by bolding or "
        "italicizing the part of text."
    )

    user_instructions = f"# User Instructions:\n{instructions}" if instructions else ""
    tone_instructions = (
        f"# Tone Instructions:\nMake slide as {tone} as possible." if tone else ""
    )
    normalized_tone_preset = normalize_tone_preset(tone_preset)
    tone_preset_instructions = ""
    if normalized_tone_preset:
        tone_preset_instructions = (
            "# Narration Tone Preset:\n"
            f"Use `{normalized_tone_preset.value}` for speaker-note performance.\n"
            f"{TONE_PROMPT_ADDENDA[normalized_tone_preset]}"
        )

    verbosity_instructions = ""
    if verbosity:
        verbosity_instructions = "# Verbosity Instructions:\n"
        if verbosity == "concise":
            verbosity_instructions += "Make slide as concise as possible."
        elif verbosity == "standard":
            verbosity_instructions += "Make slide as standard as possible."
        elif verbosity == "text-heavy":
            verbosity_instructions += "Make slide as text-heavy as possible."

    travel_rules = ""
    if template and template.startswith("travel"):
        travel_rules = (
            "\n# Travel-Specific Rules\n"
            "- Metrics should be in abbreviated form with least possible characters.\n"
            "- Star ratings must be numeric (1-5).\n"
            "- Prices must include currency code or symbol (e.g., \"$2,499 pp\" or \"EUR 1,899\").\n"
            "- Activity times in 24h or contextual format (e.g., \"Morning\", \"09:00\").\n"
            "- Image prompts should describe scenic travel photography, NOT generic stock images.\n"
            "- Weather temperatures should include units (C or F).\n"
            "- Duration formats: \"3 nights / 4 days\", \"2h 30m flight\".\n"
        )

    # Render the stable section by passing an empty output_fields placeholder.
    # The variable suffix renders the schema separately and we concat the two
    # for non-Anthropic providers (preserving the exact pre-caching prompt).
    return SLIDE_CONTENT_SYSTEM_PROMPT.format(
        markdown_emphasis_rules=markdown_emphasis_rules,
        speaker_note_generation_rules=SPEAKER_NOTE_GENERATION_RULES,
        user_instructions=user_instructions + travel_rules,
        tone_instructions=tone_instructions,
        tone_preset_instructions=tone_preset_instructions,
        verbosity_instructions=verbosity_instructions,
        output_fields_instructions="",
    ).rstrip()


def _build_system_prompt_variable_suffix(
    response_schema: Optional[dict],
) -> str:
    """The per-slide tail of the system prompt — the JSON schema markdown.

    Excluded from the Anthropic cache prefix so each slide's schema flows
    through normally without forcing a cache miss on the rest of the prompt.
    """
    schema_markdown = _get_schema_markdown(response_schema)
    return f"\n\n# Output Fields:\n{schema_markdown}"


def get_system_prompt(
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    response_schema: Optional[dict] = None,
    template: str = "",
    tone_preset: Optional[str] = None,
):
    """Combined system prompt — used for the SystemMessage payload that
    non-Anthropic providers actually send. For the Anthropic path, the
    prompt is reassembled from the same two halves into a structured
    `system` array via `build_anthropic_cache_extra_body`."""
    stable_prefix = _build_system_prompt_stable_prefix(
        tone, verbosity, instructions, template, tone_preset
    )
    variable_suffix = _build_system_prompt_variable_suffix(response_schema)
    return stable_prefix + variable_suffix


def build_anthropic_cache_extra_body(
    stable_prefix: str,
    variable_suffix: str,
    base_extra_body: Optional[dict] = None,
) -> dict:
    """Return an `extra_body` payload that overrides the Anthropic request's
    string `system` field with a structured list of two TextBlockParam-like
    dicts: a cache-marked stable prefix, then a variable per-slide suffix.

    The Anthropic Python SDK merges `extra_body` into the request body via
    `_merge_mappings` (later keys win), so this overrides the explicit
    `system="..."` string llmai would otherwise send. Result: ~90% prefix
    re-use savings on Call 3 within a single presentation, since every
    slide shares the same stable prefix and only the schema-bearing suffix
    is reprocessed.
    """
    merged: dict = dict(base_extra_body or {})
    merged["system"] = [
        {
            "type": "text",
            "text": stable_prefix,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": variable_suffix,
        },
    ]
    return merged


def get_user_prompt(
    outline: str,
    language: Optional[str],
    previous_slide_title: Optional[str] = None,
    next_slide_title: Optional[str] = None,
    presentation_synopsis: Optional[str] = None,
    enriched_context: Optional[str] = None,
):
    enriched_block = ""
    cleaned_enriched = (enriched_context or "").strip()
    if cleaned_enriched:
        # Mirrors Call 1's "Context:" pattern: enriched_context lives in the
        # USER prompt so the system prompt remains a stable cache prefix and
        # both calls treat enricher data with the same authority level.
        enriched_block = (
            "\n# Verified Context (from enrichment pipeline):\n"
            f"{cleaned_enriched}\n"
        )

    return SLIDE_CONTENT_USER_PROMPT.format(
        current_date_time=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        language=_resolve_prompt_language(language),
        previous_slide_title=_normalize_context_value(previous_slide_title, "N/A"),
        next_slide_title=_normalize_context_value(next_slide_title, "N/A"),
        presentation_synopsis=_normalize_context_value(
            presentation_synopsis, "No synopsis provided."
        ),
        enriched_context_block=enriched_block,
        content=outline,
    )


def get_messages(
    outline: str,
    language: Optional[str],
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    response_schema: Optional[dict] = None,
    template: str = "",
    previous_slide_title: Optional[str] = None,
    next_slide_title: Optional[str] = None,
    presentation_synopsis: Optional[str] = None,
    tone_preset: Optional[str] = None,
    enriched_context: Optional[str] = None,
) -> list[Message]:

    return [
        SystemMessage(
            content=get_system_prompt(
                tone,
                verbosity,
                instructions,
                response_schema,
                template,
                tone_preset,
            ),
        ),
        UserMessage(
            content=get_user_prompt(
                outline,
                language,
                previous_slide_title=previous_slide_title,
                next_slide_title=next_slide_title,
                presentation_synopsis=presentation_synopsis,
                enriched_context=enriched_context,
            ),
        ),
    ]


async def get_slide_content_from_type_and_outline(
    slide_layout: SlideLayoutModel,
    outline: SlideOutlineModel,
    language: Optional[str],
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    template: str = "",
    previous_slide_title: Optional[str] = None,
    next_slide_title: Optional[str] = None,
    presentation_synopsis: Optional[str] = None,
    tone_preset: Optional[str] = None,
    destination_context: Optional[dict] = None,
    enriched_context: Optional[str] = None,
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
            outline.content,
            language,
            tone,
            verbosity,
            instructions,
            response_schema,
            template,
            previous_slide_title,
            next_slide_title,
            presentation_synopsis,
            tone_preset,
            enriched_context=enriched_context,
        )

        # When the resolved provider is Anthropic, replace the string `system`
        # field on the wire with a structured list that bears a cache_control
        # marker on the stable prefix. ~90% prefix reuse for the Call 3 fan-out
        # of one presentation. No-op for OpenAI / Google / Mercury / Bedrock /
        # custom-OpenAI-compatible paths.
        effective_extra_body = extra_body
        if isinstance(config, AnthropicClientConfig):
            stable_prefix = _build_system_prompt_stable_prefix(
                tone, verbosity, instructions, template, tone_preset
            )
            variable_suffix = _build_system_prompt_variable_suffix(response_schema)
            effective_extra_body = build_anthropic_cache_extra_body(
                stable_prefix=stable_prefix,
                variable_suffix=variable_suffix,
                base_extra_body=extra_body,
            )

        for attempt in range(3):
            kwargs = get_generate_kwargs(
                model=model,
                messages=messages,
                response_format=response_format,
            )
            if effective_extra_body:
                kwargs["extra_body"] = effective_extra_body

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

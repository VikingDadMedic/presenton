"""Phase C.1 + Phase 11.3 test guard: Anthropic prompt caching for Calls 3 & 4.

These tests verify the caching contract produced by the shared helper at
`utils/llm_calls/anthropic_caching.py` plus the per-call-site stable
prefix / variable suffix builders in `generate_slide_content.py` (Call 3)
and `edit_slide.py` (Call 4):

- The system prompt splits cleanly into a stable prefix + variable suffix.
- `build_anthropic_cache_extra_body` produces a structured `system` payload
  with cache_control: ephemeral on the prefix block.
- The base extra_body (e.g. `reasoning_effort` for Mercury) is preserved.
- The combined `get_system_prompt` is byte-identical to prefix + suffix
  so non-Anthropic providers are unchanged.
- The cacheable prefix does NOT depend on per-call variable content
  (per-slide schema for Call 3, per-edit memory_context for Call 4).
"""

from utils.llm_calls.anthropic_caching import build_anthropic_cache_extra_body
from utils.llm_calls.generate_slide_content import (
    _build_system_prompt_stable_prefix,
    _build_system_prompt_variable_suffix,
    get_system_prompt,
)


def test_combined_system_prompt_equals_prefix_plus_suffix():
    """Non-Anthropic providers see the SystemMessage as the full string. The
    string must be byte-identical to prefix + suffix so refactor doesn't
    change wire-level behavior for OpenAI / Google / Mercury / etc."""
    schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    full = get_system_prompt(
        tone="luxury",
        verbosity="standard",
        instructions="Stay concise.",
        response_schema=schema,
        template="travel-itinerary",
        tone_preset="travel_companion",
    )
    prefix = _build_system_prompt_stable_prefix(
        tone="luxury",
        verbosity="standard",
        instructions="Stay concise.",
        template="travel-itinerary",
        tone_preset="travel_companion",
    )
    suffix = _build_system_prompt_variable_suffix(schema)
    assert full == prefix + suffix


def test_stable_prefix_is_independent_of_schema():
    """Two slides in the same presentation will have different schemas. The
    cacheable prefix must NOT vary across them — that's the caching contract."""
    prefix_args = dict(
        tone="adventurous",
        verbosity="standard",
        instructions="Use vivid imagery.",
        template="travel-reveal",
        tone_preset="hype_reel",
    )
    prefix_a = _build_system_prompt_stable_prefix(**prefix_args)
    prefix_b = _build_system_prompt_stable_prefix(**prefix_args)
    assert prefix_a == prefix_b

    # Sanity: different schemas produce different suffixes.
    suffix_a = _build_system_prompt_variable_suffix(
        {"type": "object", "properties": {"title": {"type": "string"}}}
    )
    suffix_b = _build_system_prompt_variable_suffix(
        {"type": "object", "properties": {"caption": {"type": "string"}}}
    )
    assert suffix_a != suffix_b


def test_build_anthropic_cache_extra_body_marks_prefix_with_cache_control():
    extra = build_anthropic_cache_extra_body(
        stable_prefix="STABLE",
        variable_suffix="VARIABLE",
        base_extra_body=None,
    )
    assert isinstance(extra, dict)
    assert "system" in extra
    system = extra["system"]
    assert isinstance(system, list)
    assert len(system) == 2

    prefix_block, suffix_block = system
    assert prefix_block["type"] == "text"
    assert prefix_block["text"] == "STABLE"
    assert prefix_block["cache_control"] == {"type": "ephemeral"}

    assert suffix_block["type"] == "text"
    assert suffix_block["text"] == "VARIABLE"
    # Suffix must NOT carry a cache marker — that would defeat the prefix
    # cache by forcing a separate cache key per schema.
    assert "cache_control" not in suffix_block


def test_build_anthropic_cache_extra_body_preserves_existing_keys():
    """Mercury 2 path passes `reasoning_effort` via extra_body. When Anthropic
    prompt caching adds `system`, the existing entries must survive."""
    base = {"reasoning_effort": "low"}
    extra = build_anthropic_cache_extra_body(
        stable_prefix="P",
        variable_suffix="V",
        base_extra_body=base,
    )
    assert extra["reasoning_effort"] == "low"
    assert "system" in extra
    # And the input dict must not be mutated.
    assert base == {"reasoning_effort": "low"}


def test_build_anthropic_cache_extra_body_does_not_mutate_base():
    base = {"some_existing_key": "preserved"}
    build_anthropic_cache_extra_body(
        stable_prefix="P",
        variable_suffix="V",
        base_extra_body=base,
    )
    assert base == {"some_existing_key": "preserved"}


def test_build_anthropic_cache_extra_body_overrides_system_key():
    """If a base extra_body already carries `system` (unusual but possible),
    the caching builder must replace it with the cache-marked structured
    form, not duplicate or merge."""
    base = {"system": "old plain string"}
    extra = build_anthropic_cache_extra_body(
        stable_prefix="P",
        variable_suffix="V",
        base_extra_body=base,
    )
    assert isinstance(extra["system"], list)
    assert extra["system"][0]["text"] == "P"


def test_stable_prefix_excludes_schema_text():
    """The schema markdown must not leak into the cacheable prefix."""
    prefix = _build_system_prompt_stable_prefix(
        tone="professional",
        verbosity="standard",
        instructions="Test instructions.",
        template="travel-itinerary",
        tone_preset="documentary",
    )
    assert "# Output Fields" not in prefix
    assert "json_schema" not in prefix.lower()


def test_variable_suffix_carries_schema():
    schema = {
        "type": "object",
        "properties": {"caption": {"type": "string", "minLength": 5}},
    }
    suffix = _build_system_prompt_variable_suffix(schema)
    assert "# Output Fields:" in suffix
    assert "caption" in suffix


# ---------------------------------------------------------------------------
# Phase 11.3 — Call 4 (edit_slide) cache-marker tests
# ---------------------------------------------------------------------------
#
# Mirror of the Call 3 contract above, applied to `edit_slide.py`. The
# Call 4 prefix/suffix builders share the helper module
# (`utils.llm_calls.anthropic_caching.build_anthropic_cache_extra_body`)
# but use their own per-call-site prefix/suffix functions because Call 4's
# variable-vs-stable split is keyed on `memory_context` (per-edit mem0
# retrieval) instead of `response_schema` (per-slide).

import asyncio  # noqa: E402  (intentional: split between Call 3 and Call 4 imports)
from unittest.mock import MagicMock, patch  # noqa: E402

from llmai.shared.configs import (  # noqa: E402
    AnthropicClientConfig,
    OpenAIClientConfig,
)

from utils.llm_calls.edit_slide import (  # noqa: E402
    _build_system_prompt_stable_prefix as _build_call4_prefix,
    _build_system_prompt_variable_suffix as _build_call4_suffix,
    get_edited_slide_content,
    get_system_prompt as get_call4_system_prompt,
)


def test_call_4_combined_prompt_equals_prefix_plus_suffix():
    """Byte-equality: the refactor must NOT change wire-level behavior for
    non-Anthropic providers. Combined `get_system_prompt` must be byte-
    identical to `prefix + suffix` across the realistic input matrix."""
    cases = [
        dict(
            memory_context=None,
            tone=None,
            verbosity=None,
            instructions=None,
            template="",
            tone_preset=None,
        ),
        dict(
            memory_context="Prior context line 1\nPrior context line 2",
            tone="professional",
            verbosity="standard",
            instructions="Keep it concise.",
            template="travel-itinerary",
            tone_preset="travel_companion",
        ),
        dict(
            memory_context="",
            tone="luxury",
            verbosity="text-heavy",
            instructions=None,
            template="general",
            tone_preset=None,
        ),
        dict(
            memory_context=None,
            tone=None,
            verbosity=None,
            instructions="Match agent voice.",
            template="travel-recap",
            tone_preset="hype_reel",
        ),
    ]
    for case in cases:
        full = get_call4_system_prompt(**case)
        prefix = _build_call4_prefix(
            tone=case["tone"],
            verbosity=case["verbosity"],
            instructions=case["instructions"],
            template=case["template"],
            tone_preset=case["tone_preset"],
        )
        suffix = _build_call4_suffix(case["memory_context"])
        assert full == prefix + suffix, (
            f"Combined prompt drifted from prefix+suffix for inputs={case}"
        )


def test_call_4_prefix_is_stable_across_edits():
    """Two edits within the same presentation will have different
    memory_context (mem0 retrieval is keyed on the edit prompt) but the
    same presentation-level config. The cacheable prefix must NOT vary
    across them — that's the caching contract."""
    presentation_args = dict(
        tone="professional",
        verbosity="standard",
        instructions="Match the agent's voice and stay factual.",
        template="travel-itinerary",
        tone_preset="travel_companion",
    )
    prefix_a = _build_call4_prefix(**presentation_args)
    prefix_b = _build_call4_prefix(**presentation_args)
    assert prefix_a == prefix_b, (
        "Stable prefix must be byte-identical across edits with the same "
        "presentation-level config — otherwise the Anthropic prompt cache "
        "won't hit and we lose the ~90% prefix-reuse savings."
    )

    # Sanity: different memory_context produces different suffixes.
    suffix_empty = _build_call4_suffix(None)
    suffix_with_mem = _build_call4_suffix("Earlier the user picked Paris over Rome.")
    assert suffix_empty != suffix_with_mem


def test_call_4_prefix_excludes_memory_context():
    """The mem0-retrieved memory block must not leak into the cacheable
    prefix; otherwise every distinct retrieval invalidates the cache."""
    prefix = _build_call4_prefix(
        tone="casual",
        verbosity="concise",
        instructions="Test instructions.",
        template="travel-itinerary",
        tone_preset="documentary",
    )
    assert "# Retrieved Presentation Memory Context" not in prefix
    assert "Use this context only if it is relevant" not in prefix


# ---------------------------------------------------------------------------
# End-to-end wiring: Call 4 must apply the cache marker iff provider is
# Anthropic. Mocks the entire LLM machinery (config / client / structured-
# content extraction) so we can capture the kwargs that flow into
# `client.generate(...)` and assert on the `extra_body.system` shape.
# ---------------------------------------------------------------------------


def _build_test_slide():
    """Minimal SlideModel-like stub. Only `slide.content` is read by
    get_edited_slide_content; everything else is irrelevant."""
    slide = MagicMock()
    slide.content = {"title": "Test slide"}
    return slide


def _build_test_layout():
    """Minimal SlideLayoutModel-like stub with a tiny json_schema."""
    layout = MagicMock()
    layout.json_schema = {
        "type": "object",
        "properties": {"title": {"type": "string"}},
        "required": ["title"],
        "additionalProperties": False,
    }
    return layout


def _capture_generate_kwargs():
    """Returns (mock_client, captured_kwargs_list). The mock client's
    .generate(...) records all kwargs it was called with, returns a stub
    response that downstream extract_structured_content will turn into a
    valid dict."""
    captured: list[dict] = []

    def fake_generate(**kwargs):
        captured.append(kwargs)
        response = MagicMock()
        response.content = "stub"
        return response

    mock_client = MagicMock()
    mock_client.generate = fake_generate
    return mock_client, captured


async def _async_identity(text, **_):
    """Tiny coroutine that returns its input — used to stub
    `augment_speaker_note_with_ipa` without pulling in services/auto_ipa."""
    return text


def _stub_get_generate_kwargs(model, messages, response_format=None, **_):
    """Drop-in replacement for utils.llm_utils.get_generate_kwargs that does
    NOT read the LLM_PROVIDER env var (which isn't set in tests). Returns
    the same shape `get_edited_slide_content` will then override with the
    Anthropic cache markers (when applicable)."""
    return {
        "model": model,
        "messages": list(messages),
        "stream": False,
        "response_format": response_format,
    }


def _run_edit_slide_with_config(config, *, memory_context=None):
    """Drives `get_edited_slide_content` with a fully-mocked LLM stack.
    Returns the captured kwargs list from the (single) generate call."""
    mock_client, captured = _capture_generate_kwargs()
    valid_content = {"title": "Edited", "__speaker_note__": "Stub note."}

    with patch(
        "utils.llm_calls.edit_slide.get_content_model_config",
        return_value=(config, "claude-3-5-sonnet", None),
    ), patch(
        "utils.llm_calls.edit_slide.has_content_model_override",
        return_value=False,
    ), patch(
        "utils.llm_calls.edit_slide.get_client",
        return_value=mock_client,
    ), patch(
        "utils.llm_calls.edit_slide.extract_structured_content",
        return_value=valid_content,
    ), patch(
        "utils.llm_calls.edit_slide.validate_length_constraints",
        return_value=[],
    ), patch(
        "utils.llm_calls.edit_slide.augment_speaker_note_with_ipa",
        new=_async_identity,
    ), patch(
        "utils.llm_calls.edit_slide.get_generate_kwargs",
        new=_stub_get_generate_kwargs,
    ):
        result = asyncio.run(
            get_edited_slide_content(
                prompt="Make it shorter.",
                slide=_build_test_slide(),
                language="English",
                slide_layout=_build_test_layout(),
                tone="professional",
                verbosity="standard",
                instructions="Match the agent's voice.",
                memory_context=memory_context,
                template="travel-itinerary",
                tone_preset="travel_companion",
            )
        )

    assert isinstance(result, dict), (
        "get_edited_slide_content should return the structured content dict"
    )
    return captured


def test_call_4_includes_cache_marker_when_provider_is_anthropic():
    """When the resolved Call 4 provider is Anthropic, `client.generate`
    must be called with `extra_body.system` as a 2-block structured list,
    cache_control: ephemeral on the prefix block."""
    config = AnthropicClientConfig(api_key="test-key")
    captured = _run_edit_slide_with_config(
        config, memory_context="Earlier user said: prefer warmer tone."
    )
    assert len(captured) == 1, "exactly one generate() call expected"
    kwargs = captured[0]
    assert "extra_body" in kwargs, "Anthropic path must inject extra_body"

    extra_body = kwargs["extra_body"]
    assert isinstance(extra_body, dict)
    assert "system" in extra_body, (
        "Anthropic extra_body must override the string `system` field with "
        "a structured list bearing cache_control on the prefix block"
    )
    system = extra_body["system"]
    assert isinstance(system, list)
    assert len(system) == 2, "structured system must split into prefix + suffix"

    prefix_block, suffix_block = system
    assert prefix_block["type"] == "text"
    assert prefix_block["cache_control"] == {"type": "ephemeral"}
    assert "Edit Slide data" in prefix_block["text"], (
        "prefix block must carry the edit-slide system prompt boilerplate"
    )

    # The variable suffix carries memory_context (per-edit) and must NOT
    # be cache-marked — otherwise different memory contexts would
    # invalidate the prefix cache.
    assert suffix_block["type"] == "text"
    assert "cache_control" not in suffix_block
    assert "prefer warmer tone" in suffix_block["text"], (
        "variable suffix must carry the per-edit memory_context"
    )


def test_call_4_no_cache_marker_when_provider_is_not_anthropic():
    """For non-Anthropic providers (Mercury 2 runs through the OpenAI
    client path), `client.generate` must NOT receive a structured
    `system` array — the plain `SystemMessage` content flows through llmai
    as-is. extra_body should either be absent or NOT carry a `system` key."""
    # Mercury 2 surfaces as OpenAI-compatible; so does any custom OAI base.
    config = OpenAIClientConfig(api_key="test-key", base_url="https://m2.example/v1")
    captured = _run_edit_slide_with_config(config, memory_context="Test memory.")
    assert len(captured) == 1
    kwargs = captured[0]

    extra_body = kwargs.get("extra_body")
    if extra_body is None:
        # The base extra_body was None; that's the "no override" path.
        return
    assert isinstance(extra_body, dict)
    assert "system" not in extra_body, (
        "non-Anthropic providers must NOT receive a structured `system` "
        "override — that would break llmai's regular SystemMessage handling"
    )

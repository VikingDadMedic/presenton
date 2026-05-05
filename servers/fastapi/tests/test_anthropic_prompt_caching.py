"""Phase C.1 test guard: Anthropic prompt caching for Call 3.

These tests verify the caching contract produced by
`utils/llm_calls/generate_slide_content.py`:

- The system prompt splits cleanly into a stable prefix + variable suffix.
- `build_anthropic_cache_extra_body` produces a structured `system` payload
  with cache_control: ephemeral on the prefix block.
- The base extra_body (e.g. `reasoning_effort` for Mercury) is preserved.
- The combined `get_system_prompt` is byte-identical to prefix + suffix
  so non-Anthropic providers are unchanged.
- The cacheable prefix does NOT depend on per-slide schema content.
"""

from utils.llm_calls.generate_slide_content import (
    _build_system_prompt_stable_prefix,
    _build_system_prompt_variable_suffix,
    build_anthropic_cache_extra_body,
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

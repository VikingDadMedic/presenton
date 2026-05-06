"""Phase C.3 test guards: schema-aware Call 2 (layout assignment).

Phase C.3 wires the JSON schema for each layout into the Call 2 system
prompt so the LLM can match outline shapes to layouts that have the right
field shape (e.g. don't pick a 4-image grid layout when the outline only
references one visual asset). These tests guard:

  - `_summarize_schema_fields` — pure helper, produces the compact
    field-summary line that lands in the prompt.
  - `PresentationLayoutModel.to_string(include_schemas=...)` — adds the
    `Fields:` line per layout when requested; defaults preserve the
    pre-Phase-C.3 rendering for any caller that wants name + description
    only.
  - `get_messages` — the default outline-driven Call 2 path now produces
    a user message that includes each layout's `Fields:` summary, so the
    LLM is shape-aware on every Call 2 request.
"""

from templates.presentation_layout import (
    PresentationLayoutModel,
    SlideLayoutModel,
    _summarize_schema_fields,
)
from utils.llm_calls.generate_presentation_structure import get_messages


# ----- _summarize_schema_fields -----


def test_summarize_renders_required_marker_and_basic_types():
    schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "subtitle": {"type": "string"},
            "image": {"type": "object"},
        },
        "required": ["title"],
    }
    summary = _summarize_schema_fields(schema)
    assert "title*: string" in summary
    assert "subtitle: string" in summary
    assert "image: object" in summary
    assert "title*" in summary  # required marker present


def test_summarize_array_of_objects_includes_length_hint():
    schema = {
        "type": "object",
        "properties": {
            "destinations": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 3,
                "maxItems": 6,
            },
        },
        "required": ["destinations"],
    }
    summary = _summarize_schema_fields(schema)
    assert "destinations*" in summary
    assert "of string" in summary
    assert "len 3-6" in summary


def test_summarize_array_with_only_min_items_open_ended():
    schema = {
        "properties": {
            "highlights": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 2,
            },
        },
    }
    summary = _summarize_schema_fields(schema)
    assert "highlights" in summary
    assert "len 2-*" in summary


def test_summarize_caps_at_max_fields_with_overflow_marker():
    properties = {f"field_{i}": {"type": "string"} for i in range(20)}
    summary = _summarize_schema_fields(
        {"properties": properties}, max_fields=5
    )
    assert "field_0" in summary
    assert "field_4" in summary
    assert "field_5" not in summary
    assert "+15 more fields" in summary


def test_summarize_handles_missing_or_invalid_input():
    assert _summarize_schema_fields(None) == ""  # type: ignore[arg-type]
    assert _summarize_schema_fields({}) == ""
    assert _summarize_schema_fields({"properties": "not-a-dict"}) == ""


def test_summarize_walks_anyof_for_primitive_type():
    schema = {
        "properties": {
            "hint": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        },
    }
    summary = _summarize_schema_fields(schema)
    assert "hint: string" in summary


# ----- PresentationLayoutModel.to_string -----


def _build_layout() -> PresentationLayoutModel:
    return PresentationLayoutModel(
        name="travel-series",
        ordered=True,
        slides=[
            SlideLayoutModel(
                id="travel-series-cover",
                name="Series Cover",
                description="Multi-destination series opener.",
                json_schema={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "subtitle": {"type": "string"},
                        "destinations": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 3,
                            "maxItems": 6,
                        },
                    },
                    "required": ["title", "destinations"],
                },
            ),
            SlideLayoutModel(
                id="travel-pricing-comparison",
                name="Pricing Comparison",
                description="Side-by-side budget vs comfort vs luxury.",
                json_schema={
                    "type": "object",
                    "properties": {
                        "tiers": {
                            "type": "array",
                            "items": {"type": "object"},
                            "minItems": 2,
                            "maxItems": 3,
                        },
                    },
                    "required": ["tiers"],
                },
            ),
        ],
    )


def test_to_string_default_omits_fields_section():
    layout = _build_layout()
    rendered = layout.to_string()
    assert "Series Cover" in rendered
    assert "Multi-destination series opener" in rendered
    assert "Fields:" not in rendered, (
        "default `to_string()` must remain backwards-compat — "
        "no Fields: line"
    )


def test_to_string_include_schemas_renders_field_summary_per_layout():
    layout = _build_layout()
    rendered = layout.to_string(include_schemas=True)
    assert "Fields:" in rendered
    # Cover layout schema fingerprint:
    assert "title*: string" in rendered
    assert "destinations*" in rendered
    assert "len 3-6" in rendered
    # Pricing layout schema fingerprint:
    assert "tiers*" in rendered
    assert "len 2-3" in rendered


def test_to_string_include_schemas_keeps_legacy_fields_intact():
    """The Fields: line is additive — name + description must remain
    present so the LLM still gets the high-level theme of each layout."""
    layout = _build_layout()
    rendered = layout.to_string(include_schemas=True)
    assert "Series Cover" in rendered
    assert "Pricing Comparison" in rendered
    assert "Multi-destination series opener" in rendered
    assert "Side-by-side budget vs comfort vs luxury" in rendered


# ----- get_messages (Call 2 prompt assembly) -----


def test_call2_get_messages_includes_schema_summaries_in_user_message():
    layout = _build_layout()
    messages = get_messages(
        presentation_layout=layout,
        n_slides=2,
        data="Slide 1: Series opener\nSlide 2: Pricing compare",
        instructions=None,
    )
    assert len(messages) == 2
    user_message = messages[1]
    user_text = getattr(user_message, "content", "") or ""
    # The default outline-driven Call 2 path now ships schema summaries
    # to the LLM (Phase C.3). This guard fires if a future commit
    # regresses to to_string() without include_schemas=True.
    assert "Fields:" in user_text
    assert "title*: string" in user_text
    assert "tiers*" in user_text


def test_call2_system_prompt_instructs_shape_aware_selection():
    """The Call 2 system prompt must steer the LLM toward shape-fit
    selection (not just thematic match). Guards the prompt copy update
    so a doc refresh doesn't accidentally regress the steering."""
    layout = _build_layout()
    messages = get_messages(
        presentation_layout=layout,
        n_slides=2,
        data="payload",
        instructions=None,
    )
    system_text = getattr(messages[0], "content", "") or ""
    assert "Schema-shape compatibility" in system_text
    assert "required fields" in system_text


# ----- No-fit fallback (semantic, prompt-level) -----


def test_get_messages_handles_layout_with_no_field_shape():
    """If a layout has an empty schema (e.g. legacy custom template),
    the prompt should still render — it just omits the Fields: line for
    that layout, falling back to name + description matching."""
    layout = PresentationLayoutModel(
        name="legacy",
        slides=[
            SlideLayoutModel(
                id="legacy-bare",
                name="Bare Layout",
                description="No structured schema.",
                json_schema={},
            ),
            SlideLayoutModel(
                id="legacy-typed",
                name="Typed Layout",
                description="Has fields.",
                json_schema={
                    "type": "object",
                    "properties": {"title": {"type": "string"}},
                },
            ),
        ],
    )
    messages = get_messages(
        presentation_layout=layout,
        n_slides=2,
        data="x",
        instructions=None,
    )
    user_text = getattr(messages[1], "content", "") or ""
    # Typed layout still gets a Fields: line.
    assert "title: string" in user_text
    # Bare layout gracefully omits Fields: (no schema → no summary line).
    # Sanity: the layout name still renders.
    assert "Bare Layout" in user_text

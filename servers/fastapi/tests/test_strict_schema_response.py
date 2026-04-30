"""Regression tests for make_strict_json_schema_response.

Background: during the v1d narration smoke we hit:

    Invalid schema for response_format 'response': In context=(),
    'required' is required to be supplied and to be an array including
    every key in properties. Missing 'title'.

GPT-5.5 strict mode requires every property to appear in `required` and
every object schema to set `additionalProperties: false`. Pydantic's default
`model_json_schema()` output places `Optional[str] = None` fields outside of
`required`, which trips the validator. The four direct
`JSONSchemaResponse(strict=True, ...)` callsites in the codebase
(generate_presentation_outlines, generate_presentation_structure,
select_slide_type_on_edit, auto_ipa_service) bypass the automatic
preprocessing in `services/llm_client.py`.

These tests guard the helper that closes that gap.
"""

from typing import List, Optional

import pytest
from pydantic import BaseModel

from utils.schema_utils import (
    ensure_strict_json_schema,
    make_strict_json_schema_response,
)


class _SlideOutlineLike(BaseModel):
    """Same shape as models.presentation_outline_model.SlideOutlineModel."""

    content: str
    title: Optional[str] = None
    synopsis: Optional[str] = None


class _PresentationOutlineLike(BaseModel):
    slides: List[_SlideOutlineLike]


def _collect_required_paths(schema: dict, _prefix: str = "") -> list[str]:
    """Walk a flattened schema and collect property names that are NOT in required."""
    missing = []
    properties = schema.get("properties")
    if isinstance(properties, dict):
        required = set(schema.get("required") or [])
        for key in properties:
            if key not in required:
                missing.append(f"{_prefix}{key}")
            inner = properties[key]
            if isinstance(inner, dict):
                missing.extend(
                    _collect_required_paths(inner, _prefix=f"{_prefix}{key}.")
                )
    items = schema.get("items")
    if isinstance(items, dict):
        missing.extend(_collect_required_paths(items, _prefix=f"{_prefix}[].")
        )
    for variant_key in ("anyOf", "allOf", "oneOf"):
        variants = schema.get(variant_key)
        if isinstance(variants, list):
            for variant in variants:
                if isinstance(variant, dict):
                    missing.extend(
                        _collect_required_paths(variant, _prefix=_prefix)
                    )
    defs = schema.get("$defs") or schema.get("definitions") or {}
    if isinstance(defs, dict):
        for def_name, def_schema in defs.items():
            if isinstance(def_schema, dict):
                missing.extend(
                    _collect_required_paths(def_schema, _prefix=f"$defs.{def_name}.")
                )
    return missing


def test_pydantic_optional_fields_default_breaks_strict_mode():
    """Sanity check: confirm raw pydantic schema has the failure we are fixing."""
    raw = _SlideOutlineLike.model_json_schema()
    missing = _collect_required_paths(raw)
    # title and synopsis are Optional[str] = None and pydantic excludes them
    # from `required`, which is exactly the OpenAI strict-mode failure.
    assert "title" in missing
    assert "synopsis" in missing


def test_make_strict_response_pydantic_model_includes_all_properties_in_required():
    response = make_strict_json_schema_response(_SlideOutlineLike)
    schema = response.json_schema
    required = set(schema.get("required") or [])
    # Every property is required (with nullable types where the original was Optional).
    assert {"content", "title", "synopsis"}.issubset(required)
    assert schema.get("additionalProperties") is False


def test_make_strict_response_recurses_into_nested_models():
    response = make_strict_json_schema_response(_PresentationOutlineLike)
    schema = response.json_schema
    # Top-level
    assert set(schema.get("required") or []) == {"slides"}
    assert schema.get("additionalProperties") is False
    # No properties anywhere should be missing from required after preprocessing.
    missing = _collect_required_paths(schema)
    assert missing == [], f"unexpected props missing from required: {missing}"


def test_make_strict_response_accepts_dict_schema():
    raw = {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "term": {"type": "string"},
                        "ipa": {"type": "string"},
                    },
                    "required": ["term", "ipa"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["items"],
        "additionalProperties": False,
    }
    response = make_strict_json_schema_response(raw, name="ipa_map")
    schema = response.json_schema
    assert response.name == "ipa_map"
    assert response.strict is True
    # Idempotent on already-strict schemas.
    assert schema["required"] == ["items"]
    assert schema["additionalProperties"] is False


def test_make_strict_response_rejects_unsupported_input():
    with pytest.raises(TypeError):
        make_strict_json_schema_response("not a model or dict")  # type: ignore[arg-type]


def test_strict_response_marker_set_to_true():
    response = make_strict_json_schema_response(_SlideOutlineLike)
    assert response.strict is True

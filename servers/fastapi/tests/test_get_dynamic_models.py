"""Regression tests for `get_dynamic_models.get_presentation_outline_model_with_n_slides`
and `get_presentation_structure_model_with_n_slides`.

Phase 10.3 of the Phase 10 final consolidation plan: these helpers were
silently broken under Pydantic v2 because `Field(min_items=...,
max_items=...)` was the v1 API. In v2 the equivalent kwargs are
`min_length` / `max_length`. Pydantic v2 does NOT raise on the unknown
`min_items`/`max_items` kwargs (it accepts them and stores them in
`json_schema_extra`), so the constraint silently never applied — a
4-slide outline could be returned when the caller asked for 8 and the
schema would still validate. These tests guard against regression.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from utils.get_dynamic_models import (
    get_presentation_outline_model_with_n_slides,
    get_presentation_structure_model_with_n_slides,
)


def _valid_slide_content() -> str:
    # min_length=100 / max_length=1200 on the SlideOutlineModelWithNSlides
    # `content` field; pad with a fixed deterministic filler.
    return "A" * 200


def test_outline_model_accepts_exactly_n_slides() -> None:
    OutlineModel = get_presentation_outline_model_with_n_slides(3)
    payload = {"slides": [{"content": _valid_slide_content()} for _ in range(3)]}
    model = OutlineModel.model_validate(payload)
    assert len(model.slides) == 3


def test_outline_model_rejects_too_few_slides() -> None:
    OutlineModel = get_presentation_outline_model_with_n_slides(5)
    payload = {"slides": [{"content": _valid_slide_content()} for _ in range(3)]}
    with pytest.raises(ValidationError):
        OutlineModel.model_validate(payload)


def test_outline_model_rejects_too_many_slides() -> None:
    OutlineModel = get_presentation_outline_model_with_n_slides(2)
    payload = {"slides": [{"content": _valid_slide_content()} for _ in range(5)]}
    with pytest.raises(ValidationError):
        OutlineModel.model_validate(payload)


def test_structure_model_accepts_exactly_n_slides() -> None:
    StructureModel = get_presentation_structure_model_with_n_slides(4)
    payload = {"slides": [0, 1, 2, 3]}
    model = StructureModel.model_validate(payload)
    assert len(model.slides) == 4


def test_structure_model_rejects_too_few_slides() -> None:
    StructureModel = get_presentation_structure_model_with_n_slides(4)
    payload = {"slides": [0, 1]}
    with pytest.raises(ValidationError):
        StructureModel.model_validate(payload)


def test_structure_model_rejects_too_many_slides() -> None:
    StructureModel = get_presentation_structure_model_with_n_slides(2)
    payload = {"slides": [0, 1, 2, 3]}
    with pytest.raises(ValidationError):
        StructureModel.model_validate(payload)


def test_outline_model_json_schema_emits_min_max_length() -> None:
    """Sanity check: json_schema (used by LLM strict mode) must carry
    minItems/maxItems for the slides array under Pydantic v2.
    """
    OutlineModel = get_presentation_outline_model_with_n_slides(7)
    schema = OutlineModel.model_json_schema()
    slides_schema = schema["properties"]["slides"]
    # Pydantic v2 emits these keys for List Field(min_length=, max_length=).
    assert slides_schema["minItems"] == 7
    assert slides_schema["maxItems"] == 7


def test_structure_model_json_schema_emits_min_max_length() -> None:
    StructureModel = get_presentation_structure_model_with_n_slides(6)
    schema = StructureModel.model_json_schema()
    slides_schema = schema["properties"]["slides"]
    assert slides_schema["minItems"] == 6
    assert slides_schema["maxItems"] == 6

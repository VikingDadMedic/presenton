import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from constants.narration import TonePreset, get_default_tone_for_template
from api.v1.ppt.endpoints.narration import (
    _build_narration_estimate_rows,
    _compute_narration_hash,
    _normalize_request_tone_or_raise,
)


def _slide(
    *,
    speaker_note: str | None,
    generated_note: str | None = None,
    title: str | None = None,
    index: int = 0,
):
    content: dict = {}
    if title is not None:
        content["title"] = title
    if generated_note is not None:
        content["__speaker_note__"] = generated_note
    return SimpleNamespace(
        id=uuid.uuid4(),
        index=index,
        speaker_note=speaker_note,
        content=content,
    )


def test_normalize_request_tone_accepts_valid_values():
    assert _normalize_request_tone_or_raise(" documentary ") == "documentary"
    assert _normalize_request_tone_or_raise("travel_companion") == "travel_companion"
    assert _normalize_request_tone_or_raise("   ") is None


def test_normalize_request_tone_rejects_invalid_value():
    with pytest.raises(HTTPException) as exc:
        _normalize_request_tone_or_raise("roadtrip_mystery")
    assert exc.value.status_code == 400
    assert "Invalid narration tone" in str(exc.value.detail)


def test_narration_hash_changes_when_inputs_change():
    base_hash = _compute_narration_hash(
        text="Narration body",
        voice_id="voice_a",
        tone="documentary",
        model_id="eleven_v3",
        dictionary_id="dict_1",
    )
    same_hash = _compute_narration_hash(
        text="Narration body",
        voice_id="voice_a",
        tone="documentary",
        model_id="eleven_v3",
        dictionary_id="dict_1",
    )
    changed_hash = _compute_narration_hash(
        text="Narration body",
        voice_id="voice_b",
        tone="documentary",
        model_id="eleven_v3",
        dictionary_id="dict_1",
    )

    assert base_hash == same_hash
    assert base_hash != changed_hash


def test_narration_estimate_rows_include_only_synthesizeable_chars():
    slides = [
        _slide(speaker_note="abc", title="Slide One", index=0),
        _slide(speaker_note=None, generated_note="hello", title="Slide Two", index=1),
        _slide(speaker_note=None, generated_note=None, title="Slide Three", index=2),
    ]

    rows, total_character_count, synthesizeable_slides = _build_narration_estimate_rows(
        slides
    )

    assert total_character_count == len("abc") + len("hello")
    assert synthesizeable_slides == 2
    assert len(rows) == 3
    assert rows[0].title == "Slide One"
    assert rows[2].has_speaker_note is False
    assert rows[2].character_count == 0


def test_template_default_tones_cover_new_travel_arcs():
    assert get_default_tone_for_template("travel-recap") == TonePreset.DOCUMENTARY
    assert get_default_tone_for_template("travel-deal-flash") == TonePreset.HYPE_REEL
    assert get_default_tone_for_template("travel-series") == TonePreset.TRAVEL_COMPANION
    assert (
        get_default_tone_for_template("travel-partner-spotlight")
        == TonePreset.TRAVEL_COMPANION
    )

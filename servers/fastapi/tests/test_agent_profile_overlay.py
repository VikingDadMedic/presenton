from models.user_config import AgentProfile
from utils.agent_profile_overlay import (
    _clean_profile_value,
    apply_agent_profile_overlays,
    build_agent_profile_slide_instructions,
)


def _sample_profile() -> AgentProfile:
    return AgentProfile(
        agent_name="Jamie Rivers",
        agency_name="Summit & Sea Travel",
        email="jamie@example.com",
        phone="+1 555 000 1234",
        booking_url="https://tripstory.example.com/book",
        tagline="Curated escapes, concierge execution.",
    )


def test_apply_overlay_is_noop_for_non_booking_layout():
    content = {"agent_name": "LLM Name"}
    result = apply_agent_profile_overlays(content, "travel-destination-hero", _sample_profile())
    assert result == content


def test_apply_overlay_prefills_booking_cta_fields():
    result = apply_agent_profile_overlays(
        {},
        "travel-booking-cta",
        _sample_profile(),
    )
    assert result["agent_name"] == "Jamie Rivers"
    assert result["agency_name"] == "Summit & Sea Travel"
    assert result["email"] == "jamie@example.com"
    assert result["phone"] == "+1 555 000 1234"
    assert result["booking_url"] == "https://tripstory.example.com/book"
    assert result["tagline"] == "Curated escapes, concierge execution."


def test_apply_overlay_profile_values_override_llm_values():
    result = apply_agent_profile_overlays(
        {
            "agent_name": "Sarah Mitchell",
            "agency_name": "Placeholder Agency",
            "booking_url": "https://placeholder.example.com",
        },
        "travel-booking-cta",
        _sample_profile(),
    )
    assert result["agent_name"] == "Jamie Rivers"
    assert result["agency_name"] == "Summit & Sea Travel"
    assert result["booking_url"] == "https://tripstory.example.com/book"


def test_apply_overlay_is_noop_when_profile_is_none():
    content = {"agent_name": "LLM Name"}
    result = apply_agent_profile_overlays(content, "travel-booking-cta", None)
    assert result == content


def test_clean_profile_value_trims_and_handles_empty_values():
    assert _clean_profile_value("  hello  ") == "hello"
    assert _clean_profile_value("   ") is None
    assert _clean_profile_value(None) is None


def test_build_slide_instructions_appends_overlay_guidance_to_existing_text():
    result = build_agent_profile_slide_instructions(
        "Keep copy concise.",
        "travel-booking-cta",
        _sample_profile(),
    )
    assert result is not None
    assert result.startswith("Keep copy concise.")
    assert "Agent Profile Defaults (Booking CTA)" in result
    assert "- agent_name: Jamie Rivers" in result


def test_build_slide_instructions_returns_guidance_block_when_base_missing():
    result = build_agent_profile_slide_instructions(
        None,
        "travel-booking-cta",
        _sample_profile(),
    )
    assert result is not None
    assert result.startswith("# Agent Profile Defaults (Booking CTA)")
    assert "Use these exact values for contact and booking fields on this slide." in result

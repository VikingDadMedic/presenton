from typing import Optional

from models.user_config import AgentProfile


_BOOKING_CTA_LAYOUT_IDS = {"travel-booking-cta"}
_PROFILE_TO_SLIDE_FIELD = (
    ("agent_name", "agent_name"),
    ("agency_name", "agency_name"),
    ("email", "email"),
    ("phone", "phone"),
    ("booking_url", "booking_url"),
    ("tagline", "tagline"),
)


def _clean_profile_value(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _build_booking_cta_overlay(agent_profile: Optional[AgentProfile]) -> dict:
    if not agent_profile:
        return {}

    overlay: dict = {}
    for profile_field, slide_field in _PROFILE_TO_SLIDE_FIELD:
        value = _clean_profile_value(getattr(agent_profile, profile_field, None))
        if value:
            overlay[slide_field] = value
    return overlay


def apply_agent_profile_overlays(
    slide_content: dict,
    layout_id: str,
    agent_profile: Optional[AgentProfile],
) -> dict:
    """Apply agent profile defaults to known CTA fields on Booking CTA slides."""
    if layout_id not in _BOOKING_CTA_LAYOUT_IDS:
        return slide_content

    overlay = _build_booking_cta_overlay(agent_profile)
    if not overlay:
        return slide_content

    merged = dict(slide_content or {})
    merged.update(overlay)
    return merged


def build_agent_profile_slide_instructions(
    base_instructions: Optional[str],
    layout_id: str,
    agent_profile: Optional[AgentProfile],
) -> Optional[str]:
    """Inject agent profile defaults into LLM instructions before slide generation."""
    if layout_id not in _BOOKING_CTA_LAYOUT_IDS:
        return base_instructions

    overlay = _build_booking_cta_overlay(agent_profile)
    if not overlay:
        return base_instructions

    guidance_lines = [
        "# Agent Profile Defaults (Booking CTA)",
        "Use these exact values for contact and booking fields on this slide.",
    ]
    for field, value in overlay.items():
        guidance_lines.append(f"- {field}: {value}")

    guidance_block = "\n".join(guidance_lines)
    if base_instructions and base_instructions.strip():
        return f"{base_instructions}\n\n{guidance_block}"
    return guidance_block

from enum import Enum
from typing import Dict, Optional


class TonePreset(str, Enum):
    TRAVEL_COMPANION = "travel_companion"
    DOCUMENTARY = "documentary"
    HYPE_REEL = "hype_reel"
    FRIENDLY_TUTORIAL = "friendly_tutorial"


TONE_PROMPT_ADDENDA: Dict[TonePreset, str] = {
    TonePreset.TRAVEL_COMPANION: (
        "Travel Companion preset: warm and intimate, like a seasoned guide at your side. "
        "Keep momentum and emotional texture without over-dramatizing."
    ),
    TonePreset.DOCUMENTARY: (
        "Documentary preset: observant, precise, and cinematic. "
        "Focus on concrete detail and grounded voice, avoiding hype."
    ),
    TonePreset.HYPE_REEL: (
        "Hype Reel preset: punchy, kinetic, and high-energy. "
        "Use brisk pacing, quick cuts, and assertive transitions."
    ),
    TonePreset.FRIENDLY_TUTORIAL: (
        "Friendly Tutorial preset: clear, supportive, and practical. "
        "Guide the listener through information with calm confidence."
    ),
}


TONE_DEFAULT_VOICE_IDS: Dict[TonePreset, str] = {
    TonePreset.TRAVEL_COMPANION: "ErXwobaYiN019PkySvjV",  # Antoni
    TonePreset.DOCUMENTARY: "pNInz6obpgDQGcFmaJgB",  # Adam
    TonePreset.HYPE_REEL: "TxGEqnHWrfWFTfGW9XjX",  # Josh
    TonePreset.FRIENDLY_TUTORIAL: "21m00Tcm4TlvDq8ikWAM",  # Rachel
}


TONE_TEMPLATE_DEFAULTS: Dict[str, TonePreset] = {
    "travel": TonePreset.TRAVEL_COMPANION,
    "travel-itinerary": TonePreset.TRAVEL_COMPANION,
    "travel-series": TonePreset.TRAVEL_COMPANION,
    "travel-partner-spotlight": TonePreset.TRAVEL_COMPANION,
    "travel-recap": TonePreset.DOCUMENTARY,
    "travel-deal-flash": TonePreset.HYPE_REEL,
    "modern": TonePreset.DOCUMENTARY,
    "education": TonePreset.FRIENDLY_TUTORIAL,
}


def normalize_tone_preset(tone: Optional[str]) -> Optional[TonePreset]:
    if not tone:
        return None
    try:
        return TonePreset(tone)
    except Exception:
        return None


def get_default_tone_for_template(template: Optional[str]) -> TonePreset:
    if not template:
        return TonePreset.DOCUMENTARY
    lowered = template.lower()
    if lowered in TONE_TEMPLATE_DEFAULTS:
        return TONE_TEMPLATE_DEFAULTS[lowered]
    if lowered.startswith("travel"):
        return TonePreset.TRAVEL_COMPANION
    return TonePreset.DOCUMENTARY

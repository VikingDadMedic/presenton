from typing import Dict, List

from constants.narration import TonePreset


CURATED_ELEVENLABS_VOICES: List[Dict[str, str]] = [
    {
        "voice_id": "21m00Tcm4TlvDq8ikWAM",
        "name": "Rachel",
        "category": "premade",
        "language": "en",
        "description": "Balanced, clear, and conversational.",
    },
    {
        "voice_id": "AZnzlk1XvdvUeBnXmlld",
        "name": "Domi",
        "category": "premade",
        "language": "en",
        "description": "Energetic and expressive delivery.",
    },
    {
        "voice_id": "EXAVITQu4vr4xnSDxMaL",
        "name": "Bella",
        "category": "premade",
        "language": "en",
        "description": "Warm narration with polished articulation.",
    },
    {
        "voice_id": "ErXwobaYiN019PkySvjV",
        "name": "Antoni",
        "category": "premade",
        "language": "en",
        "description": "Grounded, companion-like storytelling.",
    },
    {
        "voice_id": "MF3mGyEYCl7XYWbV9V6O",
        "name": "Elli",
        "category": "premade",
        "language": "en",
        "description": "Light and approachable explanatory tone.",
    },
    {
        "voice_id": "TxGEqnHWrfWFTfGW9XjX",
        "name": "Josh",
        "category": "premade",
        "language": "en",
        "description": "Strong, energetic presenter voice.",
    },
    {
        "voice_id": "VR6AewLTigWG4xSOukaG",
        "name": "Arnold",
        "category": "premade",
        "language": "en",
        "description": "Confident voice for impactful reveals.",
    },
    {
        "voice_id": "pNInz6obpgDQGcFmaJgB",
        "name": "Adam",
        "category": "premade",
        "language": "en",
        "description": "Documentary-style calm narration.",
    },
    {
        "voice_id": "yoZ06aMxZJJ28mfd3POQ",
        "name": "Sam",
        "category": "premade",
        "language": "en",
        "description": "Friendly modern explainer style.",
    },
    {
        "voice_id": "flq6f7yk4E4fJM5XTYuZ",
        "name": "Michael",
        "category": "premade",
        "language": "en",
        "description": "Crisp informational narration.",
    },
]


TONE_CURATED_VOICE_IDS: Dict[TonePreset, List[str]] = {
    TonePreset.TRAVEL_COMPANION: [
        "ErXwobaYiN019PkySvjV",
        "21m00Tcm4TlvDq8ikWAM",
        "yoZ06aMxZJJ28mfd3POQ",
    ],
    TonePreset.DOCUMENTARY: [
        "pNInz6obpgDQGcFmaJgB",
        "flq6f7yk4E4fJM5XTYuZ",
        "TxGEqnHWrfWFTfGW9XjX",
    ],
    TonePreset.HYPE_REEL: [
        "TxGEqnHWrfWFTfGW9XjX",
        "VR6AewLTigWG4xSOukaG",
        "AZnzlk1XvdvUeBnXmlld",
    ],
    TonePreset.FRIENDLY_TUTORIAL: [
        "21m00Tcm4TlvDq8ikWAM",
        "MF3mGyEYCl7XYWbV9V6O",
        "yoZ06aMxZJJ28mfd3POQ",
    ],
}

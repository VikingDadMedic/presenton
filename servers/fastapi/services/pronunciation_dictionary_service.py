from typing import Dict, List

from fastapi import HTTPException

from services.elevenlabs_service import ElevenLabsService
from utils.get_env import get_elevenlabs_api_key_env


def _parse_pronunciation_rules(raw_rules: List[Dict[str, str]]) -> List[Dict[str, str]]:
    parsed: List[Dict[str, str]] = []
    for rule in raw_rules:
        grapheme = (rule.get("grapheme") or rule.get("term") or "").strip()
        phoneme = (rule.get("phoneme") or rule.get("ipa") or "").strip()
        alphabet = (rule.get("alphabet") or "ipa").strip() or "ipa"
        if not grapheme or not phoneme:
            continue
        parsed.append(
            {
                "string_to_replace": grapheme,
                "type": "phoneme",
                "alphabet": alphabet,
                "phoneme": phoneme,
            }
        )
    return parsed


async def upload_user_dictionary(rules: List[Dict[str, str]], name: str = "Presenton Pronunciation Dictionary") -> str:
    api_key = get_elevenlabs_api_key_env()
    if not api_key:
        raise HTTPException(status_code=400, detail="ElevenLabs API key is not configured")

    normalized_rules = _parse_pronunciation_rules(rules)
    if not normalized_rules:
        raise HTTPException(
            status_code=400,
            detail="No valid pronunciation rules found. Use term=IPA format.",
        )

    service = ElevenLabsService(api_key=api_key)
    return await service.upload_pronunciation_dictionary(name=name, rules=normalized_rules)

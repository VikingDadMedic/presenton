from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import HTTPException


ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"


@dataclass
class VoiceMeta:
    voice_id: str
    name: str
    category: Optional[str] = None
    language: Optional[str] = None
    description: Optional[str] = None
    preview_url: Optional[str] = None


class ElevenLabsService:
    def __init__(self, api_key: str, base_url: str = ELEVENLABS_BASE_URL):
        if not api_key:
            raise HTTPException(status_code=400, detail="ElevenLabs API key is missing")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    @property
    def _headers(self) -> Dict[str, str]:
        return {
            "xi-api-key": self.api_key,
            "Accept": "application/json",
        }

    async def list_voices(self, search: Optional[str] = None) -> List[VoiceMeta]:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{self.base_url}/voices",
                headers=self._headers,
            )
        if response.status_code >= 400:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to list ElevenLabs voices: {response.text}",
            )

        payload = response.json()
        voices: List[VoiceMeta] = []
        for raw in payload.get("voices", []):
            labels = raw.get("labels") or {}
            voice = VoiceMeta(
                voice_id=raw.get("voice_id", ""),
                name=raw.get("name", ""),
                category=raw.get("category"),
                language=labels.get("language"),
                description=raw.get("description"),
                preview_url=raw.get("preview_url"),
            )
            if not voice.voice_id or not voice.name:
                continue
            if search and search.lower() not in voice.name.lower():
                continue
            voices.append(voice)
        return voices

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        model_id: str = "eleven_v3",
        pronunciation_dictionary_locators: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[bytes, Dict[str, str]]:
        if not text.strip():
            raise HTTPException(status_code=400, detail="Narration text cannot be empty")
        if not voice_id:
            raise HTTPException(status_code=400, detail="voice_id is required")

        payload: Dict[str, Any] = {
            "text": text,
            "model_id": model_id or "eleven_v3",
            "output_format": "mp3_44100_128",
        }
        if pronunciation_dictionary_locators:
            payload["pronunciation_dictionary_locators"] = pronunciation_dictionary_locators

        headers = dict(self._headers)
        headers["Accept"] = "audio/mpeg"
        headers["Content-Type"] = "application/json"

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self.base_url}/text-to-speech/{voice_id}",
                headers=headers,
                json=payload,
            )
        if response.status_code >= 400:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to synthesize narration: {response.text}",
            )

        character_count = response.headers.get("x-character-count", "")
        request_id = response.headers.get("request-id", "")
        return response.content, {
            "x-character-count": character_count,
            "request-id": request_id,
        }

    async def upload_pronunciation_dictionary(
        self, name: str, rules: List[Dict[str, Any]]
    ) -> str:
        if not name:
            raise HTTPException(status_code=400, detail="Dictionary name is required")
        if not rules:
            raise HTTPException(status_code=400, detail="At least one pronunciation rule is required")

        payload = {
            "name": name,
            "description": "Uploaded from Presenton narration settings",
            "rules": rules,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self.base_url}/pronunciation-dictionaries/add-from-rules",
                headers=self._headers,
                json=payload,
            )
        if response.status_code >= 400:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to upload pronunciation dictionary: {response.text}",
            )

        data = response.json()
        dictionary_id = data.get("id") or data.get("pronunciation_dictionary_id")
        if not dictionary_id:
            raise HTTPException(
                status_code=500,
                detail="ElevenLabs did not return a dictionary id",
            )
        return dictionary_id

    async def delete_pronunciation_dictionary(self, dictionary_id: str) -> None:
        dictionary_id = (dictionary_id or "").strip()
        if not dictionary_id:
            return

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.delete(
                f"{self.base_url}/pronunciation-dictionaries/{dictionary_id}",
                headers=self._headers,
            )
        if response.status_code >= 400:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to delete pronunciation dictionary: {response.text}",
            )

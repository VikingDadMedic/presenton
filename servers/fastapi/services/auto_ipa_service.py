import asyncio
import re
from typing import Any, Iterable, Optional

from llmai import get_client
from llmai.shared import JSONSchemaResponse, Message, SystemMessage, UserMessage

from constants.ipa_dictionary import CURATED_IPA_DICTIONARY
from utils.llm_config import get_content_model_config
from utils.llm_utils import extract_structured_content, get_generate_kwargs

_PHONEME_TAG_PATTERN = re.compile(r"(<phoneme\b[^>]*>.*?</phoneme>)", flags=re.IGNORECASE | re.DOTALL)
_PROPER_NOUN_PATTERN = re.compile(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b")
_COMMON_CAPITALIZED_WORDS = {
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
    "The",
    "This",
    "That",
    "These",
    "Those",
    "You",
    "Your",
    "We",
    "Our",
    "At",
    "In",
    "On",
    "For",
    "With",
    "Walk",
}
_MAX_LLM_FALLBACK_TERMS = 8


def _split_non_phoneme_segments(text: str) -> list[str]:
    if not text:
        return [text]
    return _PHONEME_TAG_PATTERN.split(text)


def _extract_destination_terms(destination: Optional[Any]) -> set[str]:
    if destination is None:
        return set()

    candidates: set[str] = set()
    if isinstance(destination, str):
        stripped = destination.strip()
        if stripped:
            candidates.add(stripped)
        return candidates

    if isinstance(destination, dict):
        for key, value in destination.items():
            key_lower = str(key).lower()
            if isinstance(value, str):
                stripped = value.strip()
                if not stripped:
                    continue
                if any(token in key_lower for token in ("destination", "city", "country", "region", "name", "title")):
                    candidates.add(stripped)
            elif isinstance(value, dict):
                candidates |= _extract_destination_terms(value)
            elif isinstance(value, list):
                for item in value:
                    candidates |= _extract_destination_terms(item)
        return candidates

    if isinstance(destination, list):
        for item in destination:
            candidates |= _extract_destination_terms(item)
    return candidates


def _find_unknown_proper_nouns(text: str, known_terms: Iterable[str]) -> list[str]:
    known_map = {term.lower(): term for term in known_terms if term}
    unknown: list[str] = []
    seen: set[str] = set()
    for match in _PROPER_NOUN_PATTERN.findall(text):
        normalized = match.strip()
        lowered = normalized.lower()
        if len(normalized) <= 3:
            continue
        if lowered in known_map:
            continue
        if normalized in _COMMON_CAPITALIZED_WORDS:
            continue
        if lowered in seen:
            continue
        seen.add(lowered)
        unknown.append(normalized)
    return unknown


def _wrap_term_with_phoneme(segment: str, term: str, ipa: str) -> str:
    pattern = re.compile(rf"(?<![\w])({re.escape(term)})(?![\w])", flags=re.IGNORECASE)
    replacement = f'<phoneme alphabet="ipa" ph="{ipa}">\\1</phoneme>'
    return pattern.sub(replacement, segment)


async def _llm_ipa_fallback(terms: list[str]) -> dict[str, str]:
    if not terms:
        return {}

    try:
        config, model, extra_body = get_content_model_config()
        client = get_client(config=config)
        schema = {
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
        response_format = JSONSchemaResponse(
            name="ipa_map",
            json_schema=schema,
            strict=True,
        )
        messages: list[Message] = [
            SystemMessage(
                content=(
                    "Return IPA pronunciations for travel proper nouns. "
                    "Only include terms you are confident about. "
                    "Use modern, spoken-form IPA and avoid slashes."
                )
            ),
            UserMessage(
                content=(
                    "Provide IPA for these terms:\n"
                    + "\n".join(f"- {term}" for term in terms)
                )
            ),
        ]
        kwargs = get_generate_kwargs(
            model=model,
            messages=messages,
            response_format=response_format,
        )
        if extra_body:
            kwargs["extra_body"] = extra_body

        response = await asyncio.to_thread(client.generate, **kwargs)
        content = extract_structured_content(response.content)
        if not isinstance(content, dict):
            return {}

        ipa_map: dict[str, str] = {}
        for item in content.get("items", []):
            if not isinstance(item, dict):
                continue
            term = str(item.get("term", "")).strip()
            ipa = str(item.get("ipa", "")).strip()
            if term and ipa:
                ipa_map[term] = ipa
        return ipa_map
    except Exception:
        return {}


async def augment_speaker_note_with_ipa(
    text: str,
    *,
    destination: Optional[Any] = None,
) -> str:
    if not text or not text.strip():
        return text

    segments = _split_non_phoneme_segments(text)
    raw_destination_terms = _extract_destination_terms(destination)
    known_ipa_map = dict(CURATED_IPA_DICTIONARY)

    unknown_terms = _find_unknown_proper_nouns(
        text,
        list(known_ipa_map.keys()) + list(raw_destination_terms),
    )
    llm_terms = unknown_terms[:_MAX_LLM_FALLBACK_TERMS]
    llm_ipa_map = await _llm_ipa_fallback(llm_terms)
    known_ipa_map.update(llm_ipa_map)

    for term in raw_destination_terms:
        if term in known_ipa_map:
            continue
        for llm_term, ipa in llm_ipa_map.items():
            if llm_term.lower() == term.lower():
                known_ipa_map[term] = ipa
                break

    if not known_ipa_map:
        return text

    replacements = sorted(known_ipa_map.items(), key=lambda item: len(item[0]), reverse=True)
    transformed_segments: list[str] = []
    for segment in segments:
        if segment.lower().startswith("<phoneme"):
            transformed_segments.append(segment)
            continue

        updated = segment
        for term, ipa in replacements:
            if not term or not ipa:
                continue
            updated = _wrap_term_with_phoneme(updated, term, ipa)
        transformed_segments.append(updated)

    return "".join(transformed_segments)

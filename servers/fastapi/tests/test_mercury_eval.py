"""
Mercury 2 Retest -- 6-Tier Structured Output Evaluation

Isolates variables systematically to determine Mercury 2's actual
structured output capabilities for TripStory's Call 3 pipeline.

The original test used strict:false and schemas with minLength/maxLength,
which likely prevented Mercury's constrained-decoding engine from activating.

Usage:
    cd servers/fastapi
    INCEPTION_API_KEY=sk_... OPENAI_API_KEY=sk-... .venv/bin/python tests/test_mercury_eval.py
"""

import asyncio
import json
import os
import sys
import time
import copy
import requests as http_requests
from datetime import datetime
from typing import Any, Optional

from openai import OpenAI

MERCURY_BASE_URL = "https://api.inceptionlabs.ai/v1"
MERCURY_MODEL = "mercury-2"
BASELINE_MODEL = "gpt-4.1"

SYSTEM_PROMPT = """You will be given slide content and response schema.
Generate structured content JSON based on the schema.

# Rules
- Follow the schema exactly. Return ONLY valid JSON matching the schema.
- Speaker note should be normal text, not markdown.
- Do not add emoji.
- Prices must include currency symbols.
- Image prompts should describe scenic travel photography."""

USER_PROMPT_TEMPLATE = """# Slide Language: English

# SLIDE CONTENT:
{content}"""

# ---------------------------------------------------------------------------
# Schemas at different constraint levels
# ---------------------------------------------------------------------------

SCHEMA_INCEPTION_DOC_EXAMPLE = {
    "type": "object",
    "properties": {
        "sentiment": {"type": "string", "enum": ["positive", "negative", "neutral"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "key_phrases": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["sentiment", "confidence", "key_phrases"],
}

SCHEMA_HERO_STRIPPED = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Destination headline"},
        "tagline": {"type": "string", "description": "Inspirational tagline"},
        "country": {"type": "string", "description": "Country name"},
        "image": {"type": "object", "properties": {
            "__image_prompt__": {"type": "string", "description": "Image generation prompt"},
        }},
        "__speaker_note__": {"type": "string", "description": "Speaker note for the slide"},
    },
    "required": ["title", "tagline", "country", "image", "__speaker_note__"],
    "additionalProperties": False,
}

SCHEMA_HERO_WITH_LENGTHS = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "minLength": 3, "maxLength": 40, "description": "Destination headline"},
        "tagline": {"type": "string", "minLength": 5, "maxLength": 80, "description": "Inspirational tagline"},
        "country": {"type": "string", "minLength": 2, "maxLength": 30, "description": "Country name"},
        "image": {"type": "object", "properties": {
            "__image_prompt__": {"type": "string", "minLength": 10, "maxLength": 50},
        }},
        "__speaker_note__": {"type": "string", "minLength": 100, "maxLength": 250, "description": "Speaker note"},
    },
    "required": ["title", "tagline", "country", "image", "__speaker_note__"],
    "additionalProperties": False,
}

SCHEMA_CUISINE_STRIPPED = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Heading for cuisine slide"},
        "description": {"type": "string", "description": "Intro to local food"},
        "dishes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Dish name in English"},
                    "local_name": {"type": "string", "description": "Dish name in local language"},
                    "description": {"type": "string", "description": "Brief dish description"},
                    "price_range": {"type": "string", "description": "Price range like $5-12"},
                    "spice_level": {"type": "number", "minimum": 0, "maximum": 5, "description": "0=mild, 5=extreme"},
                    "image": {"type": "object", "properties": {
                        "__image_prompt__": {"type": "string", "description": "Image prompt"},
                    }},
                },
                "required": ["name", "local_name", "description", "price_range", "spice_level", "image"],
            },
        },
        "__speaker_note__": {"type": "string", "description": "Speaker note"},
    },
    "required": ["title", "description", "dishes", "__speaker_note__"],
    "additionalProperties": False,
}

SCHEMA_CUISINE_FULL = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "minLength": 3, "maxLength": 50, "description": "Heading"},
        "description": {"type": "string", "minLength": 10, "maxLength": 120, "description": "Intro"},
        "dishes": {
            "type": "array", "minItems": 3, "maxItems": 6,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "minLength": 2, "maxLength": 30},
                    "local_name": {"type": "string", "minLength": 2, "maxLength": 30},
                    "description": {"type": "string", "minLength": 10, "maxLength": 80},
                    "price_range": {"type": "string", "minLength": 1, "maxLength": 15},
                    "spice_level": {"type": "number", "minimum": 0, "maximum": 5},
                    "image": {"type": "object", "properties": {
                        "__image_prompt__": {"type": "string", "minLength": 10, "maxLength": 50},
                    }},
                },
                "required": ["name", "local_name", "description", "price_range", "spice_level", "image"],
            },
        },
        "__speaker_note__": {"type": "string", "minLength": 100, "maxLength": 250},
    },
    "required": ["title", "description", "dishes", "__speaker_note__"],
    "additionalProperties": False,
}

OUTLINE_HERO = "## Discover Bali\nBali is a tropical paradise in Indonesia known for lush rice terraces, ancient temples, and world-class beaches. From Ubud to Uluwatu, it blends adventure, relaxation, and spiritual discovery."

OUTLINE_CUISINE = "## Taste of Bali\nBalinese cuisine features bold spices. Must-try: Nasi Goreng ($2-4), Babi Guling ($5-10), Sate Lilit ($3-5), Lawar ($2-4), Bebek Betutu ($8-15). Street warungs offer the most authentic experience."

ITINERARY_SCHEMAS_STRIPPED = [
    ("DestinationHero", SCHEMA_HERO_STRIPPED, OUTLINE_HERO),
    ("CuisineDiscovery", SCHEMA_CUISINE_STRIPPED, OUTLINE_CUISINE),
    ("Accommodation", {
        "type": "object",
        "properties": {
            "title": {"type": "string"}, "hotel_name": {"type": "string"},
            "star_rating": {"type": "number", "minimum": 1, "maximum": 5},
            "location": {"type": "string"}, "price_per_night": {"type": "string"},
            "description": {"type": "string"},
            "amenities": {"type": "array", "items": {"type": "string"}},
            "image": {"type": "object", "properties": {"__image_prompt__": {"type": "string"}}},
            "__speaker_note__": {"type": "string"},
        },
        "required": ["title", "hotel_name", "star_rating", "location", "price_per_night", "description", "amenities", "image", "__speaker_note__"],
        "additionalProperties": False,
    }, "## Stay at AYANA Resort\nAYANA Resort Jimbaran, 5-star beachfront, $350/night. Infinity pool, Rock Bar, spa, private beach. Rated 4.8/5."),
    ("FlightInfo", {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "flights": {"type": "array", "items": {"type": "object", "properties": {
                "departure": {"type": "string"}, "arrival": {"type": "string"},
                "airline": {"type": "string"}, "duration": {"type": "string"},
                "departure_time": {"type": "string"},
            }, "required": ["departure", "arrival", "airline", "duration", "departure_time"]}},
            "__speaker_note__": {"type": "string"},
        },
        "required": ["title", "flights", "__speaker_note__"],
        "additionalProperties": False,
    }, "## Getting There\nDirect flights: Sydney to Bali, Jetstar 6h15m dep 08:45, Qantas 6h30m dep 10:20. Best prices March-May."),
    ("Pricing", {
        "type": "object",
        "properties": {
            "title": {"type": "string"}, "description": {"type": "string"},
            "tiers": {"type": "array", "items": {"type": "object", "properties": {
                "name": {"type": "string"}, "price": {"type": "string"},
                "currency": {"type": "string"}, "duration": {"type": "string"},
                "inclusions": {"type": "array", "items": {"type": "string"}},
            }, "required": ["name", "price", "currency", "duration", "inclusions"]}},
            "__speaker_note__": {"type": "string"},
        },
        "required": ["title", "description", "tiers", "__speaker_note__"],
        "additionalProperties": False,
    }, "## Package Pricing\nEconomy $1,899pp 7N 3-star, Premium $2,899pp 7N 4-star private transfers, Luxury $4,499pp 7N 5-star villa butler."),
    ("Highlights", {
        "type": "object",
        "properties": {
            "title": {"type": "string"}, "description": {"type": "string"},
            "highlights": {"type": "array", "items": {"type": "object", "properties": {
                "title": {"type": "string"}, "description": {"type": "string"},
                "image": {"type": "object", "properties": {"__image_prompt__": {"type": "string"}}},
            }, "required": ["title", "description", "image"]}},
            "__speaker_note__": {"type": "string"},
        },
        "required": ["title", "description", "highlights", "__speaker_note__"],
        "additionalProperties": False,
    }, "## Bali Highlights\nTegallalang Rice Terraces, Uluwatu Temple sunset, Nusa Penida snorkeling, Ubud Monkey Forest, Balinese cooking class, Seminyak Beach clubs."),
    ("BookingCTA", {
        "type": "object",
        "properties": {
            "agency_name": {"type": "string"}, "tagline": {"type": "string"},
            "agent_name": {"type": "string"}, "phone": {"type": "string"},
            "email": {"type": "string"}, "booking_url": {"type": "string"},
            "image": {"type": "object", "properties": {"__image_prompt__": {"type": "string"}}},
            "__speaker_note__": {"type": "string"},
        },
        "required": ["agency_name", "tagline", "agent_name", "phone", "email", "booking_url", "image", "__speaker_note__"],
        "additionalProperties": False,
    }, "## Book Your Bali Escape\nTripStory Travel. Contact Sarah Mitchell. Phone: +1(555)234-5678. Email: sarah@tripstory.travel. Web: tripstory.travel/bali"),
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def validate(text: str, schema: dict) -> dict:
    report = {"valid_json": False, "fields_ok": False, "content": None, "error": None}
    if not text or text.startswith("ERROR:"):
        report["error"] = text
        return report
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        try:
            import dirtyjson
            data = dict(dirtyjson.loads(text))
        except Exception:
            report["error"] = f"JSON parse failed. First 200 chars: {text[:200]}"
            return report
    report["valid_json"] = True
    report["content"] = data
    required = schema.get("required", [])
    present = [f for f in required if f in data]
    report["fields_ok"] = len(present) == len(required)
    report["fields_detail"] = f"{len(present)}/{len(required)}"
    return report


def call_sdk(client: OpenAI, model: str, system: str, user: str,
             schema: dict, strict: bool, max_tokens: int = 1000,
             extra_body: Optional[dict] = None) -> tuple[str, float, int]:
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    kwargs: dict[str, Any] = {
        "model": model, "messages": messages, "max_tokens": max_tokens,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "response", "strict": strict, "schema": schema},
        },
    }
    if extra_body:
        kwargs["extra_body"] = extra_body
    start = time.perf_counter()
    try:
        resp = client.chat.completions.create(**kwargs)
    except Exception as e:
        return f"ERROR: {e}", time.perf_counter() - start, 0
    elapsed = time.perf_counter() - start
    text = resp.choices[0].message.content or ""
    tokens = getattr(resp.usage, "completion_tokens", 0) if resp.usage else 0
    return text, elapsed, tokens


def call_raw(api_key: str, base_url: str, model: str, system: str, user: str,
             schema: dict, strict: bool, max_tokens: int = 1000,
             extra_body: Optional[dict] = None) -> tuple[str, float, int]:
    payload: dict[str, Any] = {
        "model": model, "max_tokens": max_tokens, "stream": False,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "response", "strict": strict, "schema": schema},
        },
    }
    if extra_body:
        payload.update(extra_body)
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    start = time.perf_counter()
    try:
        r = http_requests.post(f"{base_url}/chat/completions", headers=headers, json=payload, timeout=60)
        data = r.json()
    except Exception as e:
        return f"ERROR: {e}", time.perf_counter() - start, 0
    elapsed = time.perf_counter() - start
    if "error" in data:
        return f"ERROR: {data['error']}", elapsed, 0
    try:
        text = data["choices"][0]["message"]["content"] or ""
        tokens = data.get("usage", {}).get("completion_tokens", 0)
    except (KeyError, IndexError):
        return f"ERROR: unexpected response: {json.dumps(data)[:300]}", elapsed, 0
    return text, elapsed, tokens


async def call_sdk_async(client, model, system, user, schema, strict, max_tokens=1000, extra_body=None):
    return await asyncio.to_thread(call_sdk, client, model, system, user, schema, strict, max_tokens, extra_body)


def pr(label: str, text: str, elapsed: float, tokens: int, report: dict):
    status = "PASS" if report["valid_json"] and report["fields_ok"] else "FAIL"
    tps = tokens / elapsed if elapsed > 0 and tokens > 0 else 0
    print(f"  [{status}] {label}: {elapsed:.2f}s, {tokens} tok, {tps:.1f} tok/s, fields={report.get('fields_detail','?')}")
    if report.get("error"):
        print(f"         Error: {report['error'][:200]}")
    elif report["content"]:
        print(f"         Preview: {json.dumps(report['content'], ensure_ascii=False)[:200]}...")


def header(title: str):
    print(f"\n{'='*72}\n  {title}\n{'='*72}")


# ---------------------------------------------------------------------------
# Tiers
# ---------------------------------------------------------------------------

def tier1(mercury_key: str):
    header("TIER 1: Inception doc-exact reproduction (strict:true)")
    schema = SCHEMA_INCEPTION_DOC_EXAMPLE
    content = "Analyze: 'I absolutely love this feature! It works perfectly and saves me so much time.'"

    print("\n  [raw requests.post]")
    text, elapsed, tokens = call_raw(mercury_key, MERCURY_BASE_URL, MERCURY_MODEL,
                                     "Analyze the sentiment of the given text.", content,
                                     schema, strict=True, max_tokens=200)
    report = validate(text, schema)
    pr("Mercury raw strict:true", text, elapsed, tokens, report)

    mercury = OpenAI(base_url=MERCURY_BASE_URL, api_key=mercury_key)
    print("\n  [OpenAI SDK]")
    text2, elapsed2, tokens2 = call_sdk(mercury, MERCURY_MODEL,
                                        "Analyze the sentiment of the given text.", content,
                                        schema, strict=True, max_tokens=200)
    report2 = validate(text2, schema)
    pr("Mercury SDK strict:true", text2, elapsed2, tokens2, report2)

    return report["valid_json"] or report2["valid_json"]


def tier2(mercury: OpenAI, baseline: OpenAI):
    header("TIER 2: DestinationHero STRIPPED (no minLength/maxLength), strict:true vs strict:false")
    schema = SCHEMA_HERO_STRIPPED
    system = SYSTEM_PROMPT
    user = USER_PROMPT_TEMPLATE.format(content=OUTLINE_HERO)

    results = {}
    for strict_val in [True, False]:
        label = f"strict:{strict_val}"
        print(f"\n  --- Mercury {label} ---")
        text, elapsed, tokens = call_sdk(mercury, MERCURY_MODEL, system, user, schema, strict=strict_val)
        report = validate(text, schema)
        pr(f"Mercury {label}", text, elapsed, tokens, report)
        results[f"mercury_{label}"] = report

    print(f"\n  --- GPT-4.1 baseline (strict:false) ---")
    text, elapsed, tokens = call_sdk(baseline, BASELINE_MODEL, system, user, schema, strict=False)
    report = validate(text, schema)
    pr("GPT-4.1", text, elapsed, tokens, report)

    return results.get("mercury_strict:True", {}).get("valid_json", False)


def tier3(mercury: OpenAI, baseline: OpenAI):
    header("TIER 3: DestinationHero WITH minLength/maxLength, strict:true vs strict:false")
    schema = SCHEMA_HERO_WITH_LENGTHS
    system = SYSTEM_PROMPT
    user = USER_PROMPT_TEMPLATE.format(content=OUTLINE_HERO)

    results = {}
    for strict_val in [True, False]:
        label = f"strict:{strict_val}"
        print(f"\n  --- Mercury {label} ---")
        text, elapsed, tokens = call_sdk(mercury, MERCURY_MODEL, system, user, schema, strict=strict_val)
        report = validate(text, schema)
        pr(f"Mercury {label}", text, elapsed, tokens, report)
        results[f"mercury_{label}"] = report

    print(f"\n  --- GPT-4.1 baseline ---")
    text, elapsed, tokens = call_sdk(baseline, BASELINE_MODEL, system, user, schema, strict=False)
    report = validate(text, schema)
    pr("GPT-4.1", text, elapsed, tokens, report)

    return results


def tier4(mercury: OpenAI, baseline: OpenAI):
    header("TIER 4: CuisineDiscovery STRIPPED (nested arrays, no length constraints), strict:true")
    schema = SCHEMA_CUISINE_STRIPPED
    system = SYSTEM_PROMPT
    user = USER_PROMPT_TEMPLATE.format(content=OUTLINE_CUISINE)

    print("\n  --- Mercury strict:true ---")
    text, elapsed, tokens = call_sdk(mercury, MERCURY_MODEL, system, user, schema, strict=True)
    report = validate(text, schema)
    pr("Mercury strict:true", text, elapsed, tokens, report)

    print(f"\n  --- GPT-4.1 baseline ---")
    text, elapsed, tokens = call_sdk(baseline, BASELINE_MODEL, system, user, schema, strict=False)
    report_b = validate(text, schema)
    pr("GPT-4.1", text, elapsed, tokens, report_b)

    return report["valid_json"]


def tier5(mercury: OpenAI, baseline: OpenAI):
    header("TIER 5: CuisineDiscovery FULL (all constraints), strict:true vs strict:false")
    schema = SCHEMA_CUISINE_FULL
    system = SYSTEM_PROMPT
    user = USER_PROMPT_TEMPLATE.format(content=OUTLINE_CUISINE)

    results = {}
    for strict_val in [True, False]:
        label = f"strict:{strict_val}"
        print(f"\n  --- Mercury {label} ---")
        text, elapsed, tokens = call_sdk(mercury, MERCURY_MODEL, system, user, schema, strict=strict_val)
        report = validate(text, schema)
        pr(f"Mercury {label}", text, elapsed, tokens, report)
        results[label] = report

    print(f"\n  --- GPT-4.1 baseline ---")
    text, elapsed, tokens = call_sdk(baseline, BASELINE_MODEL, system, user, schema, strict=False)
    report_b = validate(text, schema)
    pr("GPT-4.1", text, elapsed, tokens, report_b)

    return results


def tier6(mercury: OpenAI, baseline: OpenAI, use_strict: bool):
    header(f"TIER 6: 7-slide PARALLEL batch (strict:{use_strict})")

    async def run_batch(label, client, model, strict_val):
        print(f"\n  --- {label} (7 slides parallel, strict:{strict_val}) ---")
        tasks = []
        for name, schema, outline in ITINERARY_SCHEMAS_STRIPPED:
            system = SYSTEM_PROMPT
            user = USER_PROMPT_TEMPLATE.format(content=outline)
            tasks.append(call_sdk_async(client, model, system, user, schema, strict=strict_val))

        start = time.perf_counter()
        results = await asyncio.gather(*tasks)
        wall = time.perf_counter() - start

        passes = 0
        total_tokens = 0
        for i, (text, elapsed, tokens) in enumerate(results):
            name = ITINERARY_SCHEMAS_STRIPPED[i][0]
            schema = ITINERARY_SCHEMAS_STRIPPED[i][1]
            report = validate(text, schema)
            status = "OK" if report["valid_json"] and report["fields_ok"] else "FAIL"
            print(f"    {name}: {elapsed:.2f}s, {tokens} tok [{status}]")
            total_tokens += tokens
            if report["valid_json"] and report["fields_ok"]:
                passes += 1

        print(f"    WALL: {wall:.2f}s, {total_tokens} tok, {passes}/7 valid")
        return wall, passes

    m_wall, m_passes = asyncio.run(run_batch("Mercury 2", mercury, MERCURY_MODEL, use_strict))
    b_wall, b_passes = asyncio.run(run_batch("GPT-4.1", baseline, BASELINE_MODEL, False))

    if m_wall > 0 and b_wall > 0:
        ratio = b_wall / m_wall
        faster = "faster" if ratio > 1 else "slower"
        print(f"\n  Mercury vs GPT-4.1: {ratio:.1f}x {faster} ({m_passes}/7 vs {b_passes}/7 valid)")


def tier_reasoning(mercury: OpenAI):
    header("BONUS: reasoning_effort variants on DestinationHero (strict:true)")
    schema = SCHEMA_HERO_STRIPPED
    system = SYSTEM_PROMPT
    user = USER_PROMPT_TEMPLATE.format(content=OUTLINE_HERO)

    for effort in ["instant", "low", "medium", "high"]:
        print(f"\n  --- reasoning_effort={effort} ---")
        text, elapsed, tokens = call_sdk(mercury, MERCURY_MODEL, system, user, schema,
                                         strict=True, extra_body={"reasoning_effort": effort})
        report = validate(text, schema)
        pr(f"Mercury {effort}", text, elapsed, tokens, report)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    inception_key = os.getenv("INCEPTION_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not inception_key:
        print("ERROR: INCEPTION_API_KEY not set")
        sys.exit(1)
    if not openai_key:
        print("ERROR: OPENAI_API_KEY not set")
        sys.exit(1)

    mercury = OpenAI(base_url=MERCURY_BASE_URL, api_key=inception_key)
    baseline = OpenAI(api_key=openai_key)

    print("\n" + "=" * 72)
    print("  MERCURY 2 RETEST -- 6-Tier Structured Output Evaluation")
    print(f"  Mercury: {MERCURY_MODEL} | Baseline: {BASELINE_MODEL}")
    print(f"  Timestamp: {datetime.now().isoformat()}")
    print("=" * 72)

    t1_ok = tier1(inception_key)
    print(f"\n  >> Tier 1 result: {'PASS' if t1_ok else 'FAIL'}")
    if not t1_ok:
        print("  >> STOPPING: Mercury API not working at all. Check key/network.")
        return

    t2_ok = tier2(mercury, baseline)
    print(f"\n  >> Tier 2 result (stripped, strict:true): {'PASS' if t2_ok else 'FAIL'}")

    t3_results = tier3(mercury, baseline)
    t3_strict = t3_results.get("mercury_strict:True", {}).get("valid_json", False)
    t3_loose = t3_results.get("mercury_strict:False", {}).get("valid_json", False)
    print(f"\n  >> Tier 3 result: strict:true={'PASS' if t3_strict else 'FAIL'}, strict:false={'PASS' if t3_loose else 'FAIL'}")

    t4_ok = tier4(mercury, baseline)
    print(f"\n  >> Tier 4 result (nested stripped, strict:true): {'PASS' if t4_ok else 'FAIL'}")

    t5_results = tier5(mercury, baseline)
    t5_strict = t5_results.get("strict:True", {}).get("valid_json", False)
    t5_loose = t5_results.get("strict:False", {}).get("valid_json", False)
    print(f"\n  >> Tier 5 result: strict:true={'PASS' if t5_strict else 'FAIL'}, strict:false={'PASS' if t5_loose else 'FAIL'}")

    best_strict = t2_ok or t4_ok
    tier6(mercury, baseline, use_strict=best_strict)

    tier_reasoning(mercury)

    header("SUMMARY")
    print(f"  Tier 1 (doc example):              {'PASS' if t1_ok else 'FAIL'}")
    print(f"  Tier 2 (flat stripped strict:true): {'PASS' if t2_ok else 'FAIL'}")
    print(f"  Tier 3 (flat + lengths strict:true):{'PASS' if t3_strict else 'FAIL'}")
    print(f"  Tier 3 (flat + lengths strict:false):{'PASS' if t3_loose else 'FAIL'}")
    print(f"  Tier 4 (nested stripped strict:true):{'PASS' if t4_ok else 'FAIL'}")
    print(f"  Tier 5 (nested full strict:true):   {'PASS' if t5_strict else 'FAIL'}")
    print(f"  Tier 5 (nested full strict:false):  {'PASS' if t5_loose else 'FAIL'}")

    print("\n" + "=" * 72)
    print("  EVALUATION COMPLETE")
    print("=" * 72)


if __name__ == "__main__":
    main()

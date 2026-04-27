"""
Mercury 2 (Inception Labs) Evaluation for Call 3 Schema Filling

Standalone test harness comparing Mercury 2 diffusion LLM against GPT-4.1
for the slide content generation step (Call 3). Tests JSON schema compliance,
speed, quality, instant mode, and cascade viability.

Usage:
    cd servers/fastapi
    INCEPTION_API_KEY=sk_... python tests/test_mercury_eval.py

Requires: INCEPTION_API_KEY and OPENAI_API_KEY in environment.
"""

import asyncio
import json
import os
import sys
import time
from copy import deepcopy
from datetime import datetime
from typing import Any, Optional

from openai import OpenAI

MERCURY_BASE_URL = "https://api.inceptionlabs.ai/v1"
MERCURY_MODEL = "mercury-2"
BASELINE_MODEL = "gpt-4.1"

SLIDE_CONTENT_SYSTEM_PROMPT = """
You will be given slide content and response schema.
You need to generate structured content json based on the schema.

# Steps
1. Analyze the content.
2. Analyze the response schema.
3. Generate structured content json based on the schema.
4. Generate speaker note if required.
5. Provide structured content json as output.

# General Rules
- Make sure to follow language guidelines.
- Speaker note should be normal text, not markdown.
- Never ever go over the max character limit.
- Do not add emoji in the content.
- Don't provide $schema field in content json.
- Strictly use markdown to emphasize important points, by bolding or italicizing the part of text.

{user_instructions}

{tone_instructions}

# Verbosity Instructions:
Make slide as standard as possible.

# Output Fields:
- Follow this response schema exactly: {schema_text}
"""

SLIDE_CONTENT_USER_PROMPT = """
# Current Date and Time:
{current_date_time}

# Icon Query And Image Prompt Language:
English

# Slide Language:
English

# SLIDE CONTENT: START
{content}
# SLIDE CONTENT: END
"""

TRAVEL_RULES = (
    "\n# Travel-Specific Rules\n"
    "- Metrics should be in abbreviated form with least possible characters.\n"
    '- Star ratings must be numeric (1-5).\n'
    '- Prices must include currency code or symbol (e.g., "$2,499 pp" or "EUR 1,899").\n'
    '- Activity times in 24h or contextual format (e.g., "Morning", "09:00").\n'
    "- Image prompts should describe scenic travel photography, NOT generic stock images.\n"
    "- Weather temperatures should include units (C or F).\n"
    '- Duration formats: "3 nights / 4 days", "2h 30m flight".\n'
)

# ---------------------------------------------------------------------------
# Test schemas (matching production Zod->JSONSchema output after transformation)
# ---------------------------------------------------------------------------

SCHEMA_DESTINATION_HERO = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "minLength": 3, "maxLength": 40,
                  "description": "Destination name or headline displayed prominently over the hero image"},
        "tagline": {"type": "string", "minLength": 5, "maxLength": 80,
                    "description": "Short inspirational tagline beneath the title"},
        "country": {"type": "string", "minLength": 2, "maxLength": 30,
                    "description": "Country or region badge displayed at the bottom of the slide"},
        "image": {"type": "object", "properties": {
            "__image_prompt__": {"type": "string", "minLength": 10, "maxLength": 50,
                                "description": "Prompt used to generate the image"}
        }},
        "__speaker_note__": {"type": "string", "minLength": 100, "maxLength": 250,
                             "description": "Speaker note for the slide"},
    },
    "required": ["title", "tagline", "country", "image", "__speaker_note__"],
}

SCHEMA_CUISINE_DISCOVERY = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "minLength": 3, "maxLength": 50,
                  "description": "Main heading for the cuisine discovery slide"},
        "description": {"type": "string", "minLength": 10, "maxLength": 120,
                        "description": "Brief intro to the local food scene"},
        "dishes": {
            "type": "array", "minItems": 3, "maxItems": 6,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "minLength": 2, "maxLength": 30,
                             "description": "Dish name in English"},
                    "local_name": {"type": "string", "minLength": 2, "maxLength": 30,
                                   "description": "Dish name in the local language"},
                    "description": {"type": "string", "minLength": 10, "maxLength": 80,
                                    "description": "Brief description of the dish"},
                    "price_range": {"type": "string", "minLength": 1, "maxLength": 15,
                                    "description": "Typical price range such as $5-12"},
                    "spice_level": {"type": "number", "minimum": 0, "maximum": 5,
                                    "description": "Spice level from 0 (mild) to 5 (extreme)"},
                    "image": {"type": "object", "properties": {
                        "__image_prompt__": {"type": "string", "minLength": 10, "maxLength": 50,
                                            "description": "Prompt used to generate the image"}
                    }},
                },
            },
        },
        "__speaker_note__": {"type": "string", "minLength": 100, "maxLength": 250,
                             "description": "Speaker note for the slide"},
    },
    "required": ["title", "description", "dishes", "__speaker_note__"],
}

SCHEMA_ACCOMMODATION = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "minLength": 3, "maxLength": 40},
        "hotel_name": {"type": "string", "minLength": 3, "maxLength": 40},
        "star_rating": {"type": "number", "minimum": 1, "maximum": 5},
        "location": {"type": "string", "minLength": 3, "maxLength": 40},
        "price_per_night": {"type": "string", "minLength": 1, "maxLength": 15},
        "description": {"type": "string", "minLength": 10, "maxLength": 150},
        "amenities": {"type": "array", "minItems": 3, "maxItems": 6,
                      "items": {"type": "string", "minLength": 2, "maxLength": 25}},
        "image": {"type": "object", "properties": {
            "__image_prompt__": {"type": "string", "minLength": 10, "maxLength": 50}
        }},
        "__speaker_note__": {"type": "string", "minLength": 100, "maxLength": 250},
    },
    "required": ["title", "hotel_name", "star_rating", "location", "price_per_night",
                  "description", "amenities", "image", "__speaker_note__"],
}

SCHEMA_FLIGHT_INFO = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "minLength": 3, "maxLength": 40},
        "flights": {
            "type": "array", "minItems": 1, "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "departure": {"type": "string", "minLength": 3, "maxLength": 30},
                    "arrival": {"type": "string", "minLength": 3, "maxLength": 30},
                    "airline": {"type": "string", "minLength": 2, "maxLength": 25},
                    "duration": {"type": "string", "minLength": 2, "maxLength": 15},
                    "departure_time": {"type": "string", "minLength": 3, "maxLength": 10},
                    "icon": {"type": "object", "properties": {
                        "__icon_query__": {"type": "string", "minLength": 5, "maxLength": 20}
                    }},
                },
            },
        },
        "__speaker_note__": {"type": "string", "minLength": 100, "maxLength": 250},
    },
    "required": ["title", "flights", "__speaker_note__"],
}

SCHEMA_PRICING = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "minLength": 3, "maxLength": 50},
        "description": {"type": "string", "minLength": 5, "maxLength": 100},
        "tiers": {
            "type": "array", "minItems": 2, "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "minLength": 2, "maxLength": 20},
                    "price": {"type": "string", "minLength": 1, "maxLength": 15},
                    "currency": {"type": "string", "minLength": 1, "maxLength": 5},
                    "duration": {"type": "string", "minLength": 2, "maxLength": 20},
                    "inclusions": {"type": "array", "minItems": 2, "maxItems": 5,
                                   "items": {"type": "string"}},
                    "badge": {"type": "string", "maxLength": 15},
                },
            },
        },
        "__speaker_note__": {"type": "string", "minLength": 100, "maxLength": 250},
    },
    "required": ["title", "description", "tiers", "__speaker_note__"],
}

SCHEMA_HIGHLIGHTS = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "minLength": 3, "maxLength": 50},
        "description": {"type": "string", "minLength": 5, "maxLength": 120},
        "highlights": {
            "type": "array", "minItems": 3, "maxItems": 6,
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "minLength": 2, "maxLength": 30},
                    "description": {"type": "string", "minLength": 5, "maxLength": 80},
                    "image": {"type": "object", "properties": {
                        "__image_prompt__": {"type": "string", "minLength": 10, "maxLength": 50}
                    }},
                },
            },
        },
        "__speaker_note__": {"type": "string", "minLength": 100, "maxLength": 250},
    },
    "required": ["title", "description", "highlights", "__speaker_note__"],
}

SCHEMA_BOOKING_CTA = {
    "type": "object",
    "properties": {
        "agency_name": {"type": "string", "minLength": 3, "maxLength": 40},
        "tagline": {"type": "string", "minLength": 5, "maxLength": 80},
        "agent_name": {"type": "string", "minLength": 2, "maxLength": 40},
        "phone": {"type": "string", "minLength": 5, "maxLength": 20},
        "email": {"type": "string", "minLength": 5, "maxLength": 40},
        "booking_url": {"type": "string", "minLength": 5, "maxLength": 60},
        "image": {"type": "object", "properties": {
            "__image_prompt__": {"type": "string", "minLength": 10, "maxLength": 50}
        }},
        "__speaker_note__": {"type": "string", "minLength": 100, "maxLength": 250},
    },
    "required": ["agency_name", "tagline", "agent_name", "phone", "email",
                  "booking_url", "image", "__speaker_note__"],
}

ITINERARY_SCHEMAS = [
    ("DestinationHero", SCHEMA_DESTINATION_HERO),
    ("DestinationHighlights", SCHEMA_HIGHLIGHTS),
    ("CuisineDiscovery", SCHEMA_CUISINE_DISCOVERY),
    ("AccommodationCard", SCHEMA_ACCOMMODATION),
    ("FlightInfo", SCHEMA_FLIGHT_INFO),
    ("PricingComparison", SCHEMA_PRICING),
    ("BookingCTA", SCHEMA_BOOKING_CTA),
]

SAMPLE_OUTLINES = [
    "## Discover Bali\nBali is a tropical paradise in Indonesia known for its lush rice terraces, ancient temples, and world-class beaches. From the cultural heart of Ubud to the surf breaks of Uluwatu, this island offers a blend of adventure, relaxation, and spiritual discovery. Perfect for honeymooners seeking luxury and culture.",
    "## Bali Highlights\nTop experiences include visiting Tegallalang Rice Terraces, exploring Uluwatu Temple at sunset, snorkeling at Nusa Penida, wandering Ubud Monkey Forest, experiencing a traditional Balinese cooking class, and relaxing at Seminyak Beach clubs.",
    "## Taste of Bali\nBalinese cuisine features bold flavors with fresh spices. Must-try dishes include Nasi Goreng (fried rice, $2-4), Babi Guling (suckling pig, $5-10), Sate Lilit (minced seafood satay, $3-5), Lawar (spiced vegetable salad, $2-4), and Bebek Betutu (slow-cooked duck, $8-15). Street food stalls and warungs offer the most authentic experience.",
    "## Stay at AYANA Resort\nThe AYANA Resort and Spa in Jimbaran is a 5-star beachfront property with stunning ocean views. Rooms from $350/night. Amenities include infinity pool, Rock Bar, spa, private beach, multiple restaurants, and complimentary shuttle to Seminyak. Consistently rated 4.8/5 by travelers.",
    "## Getting There\nDirect flights available from Sydney (SYD) to Bali (DPS) with Jetstar (6h 15m, departing 08:45) and Qantas (6h 30m, departing 10:20). Connecting options via Singapore Airlines through Changi. Best prices found March-May.",
    "## Package Pricing\nThree tiers available: Economy ($1,899 pp, 7 nights, 3-star hotel, shared transfers), Premium ($2,899 pp, 7 nights, 4-star resort, private transfers, 2 tours), and Luxury ($4,499 pp, 7 nights, 5-star villa, private butler, all tours included, spa credits).",
    "## Book Your Bali Escape\nTripStory Travel Agency. Your dream vacation is one click away. Contact Sarah Mitchell, Senior Travel Advisor. Phone: +1 (555) 234-5678. Email: sarah@tripstory.travel. Website: tripstory.travel/bali-packages.",
]


def build_system_prompt(schema: dict) -> str:
    schema_text = json.dumps(schema, ensure_ascii=False)
    return SLIDE_CONTENT_SYSTEM_PROMPT.format(
        user_instructions=TRAVEL_RULES,
        tone_instructions="# Tone Instructions:\nMake slide as luxury as possible.",
        schema_text=schema_text,
    )


def build_user_prompt(outline: str) -> str:
    return SLIDE_CONTENT_USER_PROMPT.format(
        current_date_time=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        content=outline,
    )


def validate_json_response(text: str, schema: dict) -> dict:
    """Parse response and validate against schema. Returns a report dict."""
    report = {"valid_json": False, "fields_present": False, "length_compliance": 0, "total_fields": 0, "content": None}

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        try:
            import dirtyjson
            data = dict(dirtyjson.loads(text))
        except Exception:
            return report

    report["valid_json"] = True
    report["content"] = data

    required = schema.get("required", [])
    present = sum(1 for f in required if f in data)
    report["fields_present"] = present == len(required)
    report["fields_present_count"] = f"{present}/{len(required)}"

    compliant = 0
    total = 0
    props = schema.get("properties", {})
    for field_name, field_schema in props.items():
        if field_name not in data:
            continue
        val = data[field_name]
        if field_schema.get("type") == "string" and isinstance(val, str):
            total += 1
            mn = field_schema.get("minLength", 0)
            mx = field_schema.get("maxLength", 999999)
            if mn <= len(val) <= mx:
                compliant += 1
        elif field_schema.get("type") == "array" and isinstance(val, list):
            total += 1
            mn = field_schema.get("minItems", 0)
            mx = field_schema.get("maxItems", 999)
            if mn <= len(val) <= mx:
                compliant += 1

    report["length_compliance"] = compliant
    report["total_fields"] = total
    return report


def call_model(client: OpenAI, model: str, system: str, user: str,
               schema: Optional[dict] = None, extra_body: Optional[dict] = None) -> tuple[str, float, int]:
    """Call a model and return (response_text, latency_seconds, token_count)."""
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    kwargs: dict[str, Any] = {"model": model, "messages": messages}
    if schema:
        kwargs["response_format"] = {"type": "json_schema", "json_schema": {"name": "response", "schema": schema, "strict": False}}
    else:
        kwargs["response_format"] = {"type": "json_object"}

    if extra_body:
        kwargs["extra_body"] = extra_body

    start = time.perf_counter()
    try:
        response = client.chat.completions.create(**kwargs)
    except Exception as e:
        elapsed = time.perf_counter() - start
        return f"ERROR: {e}", elapsed, 0
    elapsed = time.perf_counter() - start

    text = response.choices[0].message.content or ""
    tokens = getattr(response.usage, "completion_tokens", 0) if response.usage else 0
    return text, elapsed, tokens


async def call_model_async(client: OpenAI, model: str, system: str, user: str,
                           schema: Optional[dict] = None, extra_body: Optional[dict] = None) -> tuple[str, float, int]:
    """Async wrapper around the sync call."""
    return await asyncio.to_thread(call_model, client, model, system, user, schema, extra_body)


def print_header(title: str):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")


def print_result(label: str, text: str, elapsed: float, tokens: int, report: dict):
    status = "PASS" if report["valid_json"] and report["fields_present"] else "FAIL"
    compliance = f"{report['length_compliance']}/{report['total_fields']}" if report["total_fields"] else "N/A"
    print(f"\n  [{status}] {label}")
    print(f"    Latency:      {elapsed:.2f}s")
    print(f"    Tokens:       {tokens}")
    tps = tokens / elapsed if elapsed > 0 and tokens > 0 else 0
    print(f"    Tokens/sec:   {tps:.1f}")
    print(f"    Valid JSON:   {report['valid_json']}")
    print(f"    Fields:       {report.get('fields_present_count', 'N/A')}")
    print(f"    Length OK:    {compliance}")
    if report["content"]:
        preview = json.dumps(report["content"], ensure_ascii=False)[:200]
        print(f"    Preview:      {preview}...")


def run_test_schema_compliance(mercury: OpenAI, baseline: OpenAI):
    """Test 1+2: Schema compliance for simple and complex schemas."""

    tests = [
        ("Test 1: DestinationHero (simple)", SCHEMA_DESTINATION_HERO, SAMPLE_OUTLINES[0]),
        ("Test 2: CuisineDiscovery (complex)", SCHEMA_CUISINE_DISCOVERY, SAMPLE_OUTLINES[2]),
    ]

    for test_name, schema, outline in tests:
        print_header(test_name)
        system = build_system_prompt(schema)
        user = build_user_prompt(outline)

        print("  Running Mercury 2...")
        m_text, m_time, m_tokens = call_model(mercury, MERCURY_MODEL, system, user, schema)
        m_report = validate_json_response(m_text, schema)
        print_result("Mercury 2", m_text, m_time, m_tokens, m_report)

        print("\n  Running GPT-4.1 (baseline)...")
        b_text, b_time, b_tokens = call_model(baseline, BASELINE_MODEL, system, user, schema)
        b_report = validate_json_response(b_text, schema)
        print_result("GPT-4.1", b_text, b_time, b_tokens, b_report)

        speedup = b_time / m_time if m_time > 0 else 0
        print(f"\n  Speedup: {speedup:.1f}x faster" if speedup > 1 else f"\n  Speedup: {1/speedup:.1f}x slower" if speedup > 0 else "")


def run_test_speed_sequential(mercury: OpenAI, baseline: OpenAI):
    """Test 3: Sequential 7-slide benchmark."""
    print_header("Test 3: Sequential 7-Slide Speed Benchmark")

    for label, client, model in [("Mercury 2", mercury, MERCURY_MODEL), ("GPT-4.1", baseline, BASELINE_MODEL)]:
        print(f"\n  --- {label} (7 slides sequential) ---")
        total_time = 0
        total_tokens = 0
        passes = 0

        for i, (name, schema) in enumerate(ITINERARY_SCHEMAS):
            system = build_system_prompt(schema)
            user = build_user_prompt(SAMPLE_OUTLINES[i])
            text, elapsed, tokens = call_model(client, model, system, user, schema)
            report = validate_json_response(text, schema)
            status = "OK" if report["valid_json"] and report["fields_present"] else "FAIL"
            print(f"    Slide {i+1} ({name}): {elapsed:.2f}s, {tokens} tok [{status}]")
            total_time += elapsed
            total_tokens += tokens
            if report["valid_json"]:
                passes += 1

        print(f"    TOTAL: {total_time:.2f}s, {total_tokens} tokens, {passes}/7 valid")


def run_test_speed_parallel(mercury: OpenAI, baseline: OpenAI):
    """Test 4: Parallel 7-slide benchmark."""
    print_header("Test 4: Parallel 7-Slide Speed Benchmark")

    async def run_parallel(label: str, client: OpenAI, model: str):
        print(f"\n  --- {label} (7 slides parallel) ---")
        tasks = []
        for i, (name, schema) in enumerate(ITINERARY_SCHEMAS):
            system = build_system_prompt(schema)
            user = build_user_prompt(SAMPLE_OUTLINES[i])
            tasks.append(call_model_async(client, model, system, user, schema))

        start = time.perf_counter()
        results = await asyncio.gather(*tasks)
        wall_clock = time.perf_counter() - start

        passes = 0
        total_tokens = 0
        for i, (text, elapsed, tokens) in enumerate(results):
            report = validate_json_response(text, ITINERARY_SCHEMAS[i][1])
            status = "OK" if report["valid_json"] and report["fields_present"] else "FAIL"
            print(f"    Slide {i+1} ({ITINERARY_SCHEMAS[i][0]}): {elapsed:.2f}s, {tokens} tok [{status}]")
            total_tokens += tokens
            if report["valid_json"]:
                passes += 1

        print(f"    WALL CLOCK: {wall_clock:.2f}s, {total_tokens} total tokens, {passes}/7 valid")
        return wall_clock

    m_wall = asyncio.run(run_parallel("Mercury 2", mercury, MERCURY_MODEL))
    b_wall = asyncio.run(run_parallel("GPT-4.1", baseline, BASELINE_MODEL))

    speedup = b_wall / m_wall if m_wall > 0 else 0
    print(f"\n  Parallel speedup: Mercury is {speedup:.1f}x {'faster' if speedup > 1 else 'slower'}")


def run_test_instant_mode(mercury: OpenAI):
    """Test 5: Mercury instant mode (reasoning_effort=instant)."""
    print_header("Test 5: Mercury Instant Mode")

    tests = [
        ("DestinationHero", SCHEMA_DESTINATION_HERO, SAMPLE_OUTLINES[0]),
        ("CuisineDiscovery", SCHEMA_CUISINE_DISCOVERY, SAMPLE_OUTLINES[2]),
    ]

    for name, schema, outline in tests:
        system = build_system_prompt(schema)
        user = build_user_prompt(outline)

        print(f"\n  {name} -- Default mode:")
        text_d, time_d, tok_d = call_model(mercury, MERCURY_MODEL, system, user, schema)
        rep_d = validate_json_response(text_d, schema)
        print_result("Default", text_d, time_d, tok_d, rep_d)

        print(f"\n  {name} -- Instant mode:")
        text_i, time_i, tok_i = call_model(mercury, MERCURY_MODEL, system, user, schema,
                                            extra_body={"reasoning_effort": "instant"})
        rep_i = validate_json_response(text_i, schema)
        print_result("Instant", text_i, time_i, tok_i, rep_i)

        if time_d > 0:
            print(f"\n  Instant vs Default: {time_d/time_i:.1f}x speed gain" if time_i > 0 else "")


def run_test_cascade(mercury: OpenAI, baseline: OpenAI):
    """Test 6: Full cascade -- baseline outline, Mercury fill vs baseline fill."""
    print_header("Test 6: Cascade Quality (same outlines, different fillers)")

    test_idx = 2
    name, schema = ITINERARY_SCHEMAS[test_idx]
    outline = SAMPLE_OUTLINES[test_idx]
    system = build_system_prompt(schema)
    user = build_user_prompt(outline)

    print(f"\n  Schema: {name}")
    print(f"  Outline: {outline[:80]}...")

    print("\n  Mercury 2 fill:")
    m_text, m_time, m_tok = call_model(mercury, MERCURY_MODEL, system, user, schema)
    m_rep = validate_json_response(m_text, schema)
    print_result("Mercury 2", m_text, m_time, m_tok, m_rep)

    print("\n  GPT-4.1 fill (reference):")
    b_text, b_time, b_tok = call_model(baseline, BASELINE_MODEL, system, user, schema)
    b_rep = validate_json_response(b_text, schema)
    print_result("GPT-4.1", b_text, b_time, b_tok, b_rep)

    print("\n  --- Full Content Comparison ---")
    if m_rep["content"]:
        print(f"\n  Mercury output:\n{json.dumps(m_rep['content'], indent=2, ensure_ascii=False)[:800]}")
    if b_rep["content"]:
        print(f"\n  Baseline output:\n{json.dumps(b_rep['content'], indent=2, ensure_ascii=False)[:800]}")


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

    print("\n" + "=" * 70)
    print("  MERCURY 2 vs GPT-4.1 — Call 3 Evaluation")
    print(f"  Mercury model: {MERCURY_MODEL}")
    print(f"  Baseline model: {BASELINE_MODEL}")
    print(f"  Timestamp: {datetime.now().isoformat()}")
    print("=" * 70)

    run_test_schema_compliance(mercury, baseline)
    run_test_speed_sequential(mercury, baseline)
    run_test_speed_parallel(mercury, baseline)
    run_test_instant_mode(mercury)
    run_test_cascade(mercury, baseline)

    print("\n" + "=" * 70)
    print("  EVALUATION COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()

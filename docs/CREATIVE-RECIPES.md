# CREATIVE-RECIPES.md

Practical one-shot recipes for turning one travel brief into multiple business-development creatives.

All examples use the existing generation endpoint and exported formats already documented in [EXPORTS.md](../EXPORTS.md). These recipes are copy-paste starting points you can adapt per destination, audience, and trip style.

## Common setup

```bash
BASE_URL="http://localhost:5000"
USER="admin"
PASS="yourpassword"
```

## Recipe 1: Reel-style destination hook (travel-reveal + MP4)

Best for top-of-funnel social hooks.

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Create a high-energy destination hook for Kyoto that makes viewers want to book now.",
    "template": "travel-reveal",
    "tone": "adventurous",
    "narration_tone": "hype_reel",
    "n_slides": 5,
    "export_as": "video",
    "slide_duration": 3,
    "transition_style": "scale-zoom"
  }'
```

## Recipe 2: IG-carousel-ready HTML story (travel-contrast + HTML)

Best for side-by-side contrast narratives (everyday life vs destination life).

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Build a contrast story: your normal week vs one week in Lisbon.",
    "template": "travel-contrast",
    "tone": "inspirational",
    "narration_tone": "documentary",
    "n_slides": 6,
    "export_as": "html",
    "slide_duration": 5
  }'
```

## Recipe 3: Audience-track pitch (travel-audience + MP4)

Best for one destination shown in three tracks (solo, couple, family).

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Same Bali trip, but show options for solo travelers, couples, and families.",
    "template": "travel-audience",
    "tone": "professional",
    "narration_tone": "travel_companion",
    "n_slides": 7,
    "export_as": "video",
    "slide_duration": 4,
    "transition_style": "clip-reveal"
  }'
```

## Recipe 4: 48-hour micro-share (travel-micro + MP4)

Best for short-form teaser campaigns.

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Create a 48-hour weekend micro-adventure in Reykjavik for busy professionals.",
    "template": "travel-micro",
    "tone": "adventurous",
    "narration_tone": "hype_reel",
    "n_slides": 4,
    "export_as": "video",
    "slide_duration": 3
  }'
```

## Recipe 5: Local-perspective authority piece (travel-local + HTML)

Best for trust-building and SEO-style embed pages.

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Tell Tokyo through a local host perspective with insider food, etiquette, and neighborhood picks.",
    "template": "travel-local",
    "tone": "casual",
    "narration_tone": "documentary",
    "n_slides": 6,
    "export_as": "html",
    "slide_duration": 6
  }'
```

## Recipe 6: Showcase-ready interactive quote deck (travel-itinerary + embed)

Best for conversion: send a public link that auto-plays and lets prospects interact.

Step 1: generate a travel deck.

```bash
GEN_RESPONSE=$(curl -s -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "7-day Santorini honeymoon with comfort pricing and premium add-ons.",
    "template": "travel-itinerary",
    "tone": "luxury",
    "n_slides": 8,
    "export_as": "pptx"
  }')

PRESENTATION_ID=$(echo "$GEN_RESPONSE" | python -c "import sys, json; print(json.load(sys.stdin)['presentation_id'])")
echo "$PRESENTATION_ID"
```

Step 2: enable public showcase mode.

```bash
curl -u "$USER:$PASS" \
  -X PATCH "$BASE_URL/api/v1/ppt/presentation/$PRESENTATION_ID/visibility" \
  -H "Content-Type: application/json" \
  -d '{"is_public": true}'
```

Step 3: share the showcase URL.

```text
/embed/{presentation_id}?mode=showcase
```

## Recipe 7: Public AI Q&A test for showcase

Best for validating that prospects can ask grounded questions without logging in.

```bash
SLIDE_ID="<one-slide-id-from-the-presentation>"

curl -N \
  -X POST "$BASE_URL/api/v1/public/showcase/ask" \
  -H "Content-Type: application/json" \
  -d "{
    \"presentation_id\": \"$PRESENTATION_ID\",
    \"slide_id\": \"$SLIDE_ID\",
    \"question\": \"What is the best month for this trip and why?\",
    \"topic\": \"Santorini honeymoon\"
  }"
```

## Recipe 8: Visa + safety explainer (travel + PDF)

Best for practical objection-handling in sales follow-ups.

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Create a practical entry guide for Japan: visa rules, health/safety, and connectivity tips for US travelers.",
    "template": "travel",
    "tone": "professional",
    "n_slides": 6,
    "export_as": "pdf"
  }'
```

## Recipe 9: High-conversion package comparison (travel + PDF)

Best for side-by-side budget/comfort/luxury decision support.

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Compare budget vs comfort vs luxury Croatia packages for a couple traveling from NYC in June.",
    "template": "travel",
    "tone": "professional",
    "origin": "New York",
    "currency": "USD",
    "n_slides": 7,
    "export_as": "pdf"
  }'
```

## Recipe 10: JSON package for CRM enrichment

Best for feeding generated travel proposals into downstream CRM automation.

```bash
curl -u "$USER:$PASS" \
  "$BASE_URL/api/v1/ppt/presentation/export/json/$PRESENTATION_ID" \
  -o "tripstory-$PRESENTATION_ID.json"
```

## Recipe 11: Multi-destination compare (travel-series + HTML)

Best for "which island/city is right for you?" discovery decks the agent sends before a consult call. Renders 7 ordered slides: series cover, three destination heroes, a side-by-side compare slide, a pricing comparison slide, and a booking CTA. Pair with `narration_tone=travel_companion` so the voiceover sounds advisory rather than promotional.

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Compare Barbados, St. Lucia, and Aruba for a couple deciding their first Caribbean trip. Cover vibe, food scene, beach access, and best months.",
    "template": "travel-series",
    "tone": "professional",
    "narration_tone": "travel_companion",
    "n_slides": 7,
    "origin": "New York",
    "currency": "USD",
    "export_as": "html",
    "slide_duration": 6
  }'
```

## Recipe 12: Post-trip recap follow-up (travel-recap + recap endpoint)

Best for nurture and re-marketing: turn a delivered trip into a memory reel that asks for the next booking. Recap mode is a distinct endpoint (`/api/v1/ppt/presentation/recap`) and accepts either an existing `source_presentation_id` (preferred) or a raw `source_json` blob from a CRM export. Three modes are wired with different tone defaults:

- `welcome_home` (right after the trip, `documentary` narration)
- `anniversary` (~12 months later, `hype_reel` narration)
- `next_planning_window` (~6-9 months later, `travel_companion` narration)

The arc renders 5 ordered slides: hero, day highlight, cuisine moment, traveler memory quote, and a next-trip CTA. `narration_tone` and `template` default to mode-specific values, so you usually only need to send `mode` plus the source.

Step 1: pick the source presentation from a recent client trip.

```bash
SOURCE_PRESENTATION_ID="<existing-trip-presentation-id>"
```

Step 2 (welcome-home variant, sent within ~1 week of return):

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/recap" \
  -H "Content-Type: application/json" \
  -d "{
    \"mode\": \"welcome_home\",
    \"source_presentation_id\": \"$SOURCE_PRESENTATION_ID\",
    \"template\": \"travel-recap\",
    \"n_slides\": 5,
    \"export_as\": \"html\"
  }"
```

Step 3 (anniversary variant, ~12 months later, override narration tone for higher energy):

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/recap" \
  -H "Content-Type: application/json" \
  -d "{
    \"mode\": \"anniversary\",
    \"source_presentation_id\": \"$SOURCE_PRESENTATION_ID\",
    \"template\": \"travel-recap\",
    \"narration_tone\": \"hype_reel\",
    \"n_slides\": 5,
    \"export_as\": \"video\",
    \"slide_duration\": 4,
    \"transition_style\": \"clip-reveal\"
  }"
```

Step 4 (next-planning-window variant, ~6-9 months later, ends with discovery CTA):

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/recap" \
  -H "Content-Type: application/json" \
  -d "{
    \"mode\": \"next_planning_window\",
    \"source_presentation_id\": \"$SOURCE_PRESENTATION_ID\",
    \"template\": \"travel-recap\",
    \"narration_tone\": \"travel_companion\",
    \"n_slides\": 5,
    \"export_as\": \"pdf\"
  }"
```

For bulk recap fan-out across many past trips, swap `source_presentation_id` for `source_presentation_ids: ["<id1>","<id2>",...]` and the response shape becomes `{recaps: [...]}`.

## Recipe 13: Urgency / countdown promo (travel-deal-flash + MP4)

Best for time-boxed flash offers in email and social ads where conversion needs the urgency of a real expiration date. The arc is 4 ordered slides: destination hook, deal countdown with crossed-out original price, package inclusions, and a booking CTA. Keep narration on `hype_reel` so the voiceover pacing matches the deal-energy framing.

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Bali Paradise Escape: 7-night beachfront all-inclusive at 48% off. Original $2,499, sale $1,299. Book by Dec 31, 2025. Include daily spa, guided tours, airport transfers.",
    "template": "travel-deal-flash",
    "tone": "adventurous",
    "narration_tone": "hype_reel",
    "n_slides": 4,
    "currency": "USD",
    "export_as": "video",
    "slide_duration": 3,
    "transition_style": "scale-zoom",
    "use_narration_as_soundtrack": true
  }'
```

## Recipe 14: Co-marketing partner spotlight (travel-partner-spotlight + PDF)

Best for partner-funded collateral (DMOs, hotel groups, airlines) where the agent is co-branding with a supplier. The arc is 5 ordered slides: branded partner hero, accommodation card, flight info, partner-curated experiences, and a booking CTA. Use `documentary` narration to keep the voiceover trust-building rather than promotional.

```bash
curl -u "$USER:$PASS" \
  -X POST "$BASE_URL/api/v1/ppt/presentation/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Spotlight Azure Bay Resort Collection in St. Lucia: preferred-partner rates, complimentary breakfast and airport transfers, priority upgrades. Pair with nonstop JetBlue from JFK, plus 3 partner-curated experiences (catamaran sunset, rainforest hike, chocolate tasting).",
    "template": "travel-partner-spotlight",
    "tone": "professional",
    "narration_tone": "documentary",
    "n_slides": 5,
    "origin": "New York",
    "currency": "USD",
    "export_as": "pdf"
  }'
```

For HTML-embed partner pages (so the partner brand can iframe the deck on their own site), swap `export_as: "html"` and follow Recipe 6 step 2 to enable showcase mode.

## Notes

- For public sharing, only showcase links (`/embed/{id}?mode=showcase`) with `is_public=true` are accessible without login.
- Keep `n_slides` low (4-7) for social and newsletter creative throughput.
- Use `travel-micro`, `travel-reveal`, `travel-contrast`, and `travel-deal-flash` for top-of-funnel assets; use `travel-itinerary`, `travel-series`, and `travel-partner-spotlight` for conversion or co-marketing proposals; use `travel-recap` for nurture / repeat-booking flows.
- Re-run the same destination prompt with different templates to create a mini-campaign from one brief.
- All `travel-*` arcs are `ordered: true` — match `n_slides` to the arc length (series 7, recap 5, deal-flash 4, partner-spotlight 5) so the positional layout mapping in [main-workflow.md](../main-workflow.md) Section 3 fires cleanly.

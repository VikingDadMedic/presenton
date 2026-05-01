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

## Notes

- For public sharing, only showcase links (`/embed/{id}?mode=showcase`) with `is_public=true` are accessible without login.
- Keep `n_slides` low (4-7) for social and newsletter creative throughput.
- Use `travel-micro`, `travel-reveal`, and `travel-contrast` for top-of-funnel assets; use `travel-itinerary` for conversion proposals.
- Re-run the same destination prompt with different templates to create a mini-campaign from one brief.

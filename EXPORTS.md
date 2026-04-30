# TripStory Export API Reference

> Complete guide to exporting presentations in all supported formats.
> For the generation pipeline, see [`main-workflow.md`](main-workflow.md). For architecture, see [`CODEBASE_DESIGNS.md`](CODEBASE_DESIGNS.md).

---

## Export Formats at a Glance

| Format | Endpoint | Method | Output | Use Case |
|---|---|---|---|---|
| **PPTX** | `/api/v1/ppt/presentation/export` | POST | `.pptx` file | Edit in PowerPoint/Google Slides |
| **PDF** | `/api/v1/ppt/presentation/export` | POST | `.pdf` file | Print-ready proposals |
| **HTML** | `/api/v1/ppt/presentation/export` | POST | `.zip` bundle (`index.html` + optional `audio/*.mp3`) | Email to clients, browser sharing with optional narration |
| **Video** | `/api/v1/ppt/presentation/export` | POST | `.mp4` with GSAP transitions | Social media, WhatsApp, video proposals |
| **JSON** | `/api/v1/ppt/presentation/export/json/{id}` | GET | Structured slide data | CRM integration, API consumers |
| **Embed** | `/api/export-as-embed` | POST | Embed URL + iframe code | Website embedding, interactive sharing |

---

## 1. Generate + Export (One-Shot)

Generate a presentation and export in a single API call.

**Endpoint:** `POST /api/v1/ppt/presentation/generate`

```bash
curl -X POST https://your-host/api/v1/ppt/presentation/generate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "7-day luxury Bali honeymoon for 2, departing from LA",
    "template": "travel",
    "n_slides": 8,
    "tone": "luxury",
    "export_as": "video",
    "origin": "Los Angeles",
    "currency": "USD",
    "slide_duration": 6,
    "transition_style": "scale-zoom"
  }'
```

**Response:**

```json
{
  "presentation_id": "d3000f96-096c-4768-b67b-e99aed029b57",
  "path": "/app_data/exports/Luxury_Bali_Honeymoon.mp4",
  "edit_path": "/presentation?id=d3000f96-096c-4768-b67b-e99aed029b57"
}
```

### Full Parameter Reference

| Parameter | Type | Default | Description |
|---|---|---|---|
| `content` | string | *required* | Prompt or content for the presentation |
| `template` | string | `"general"` | Template group: `general`, `travel`, `travel-itinerary`, `code`, `education`, `product-overview`, `report`, etc. |
| `n_slides` | integer | auto | Number of slides (auto-detected if omitted) |
| `tone` | string | `"default"` | `default`, `casual`, `professional`, `funny`, `educational`, `sales_pitch`, `inspirational`, `adventurous`, `luxury` |
| `narration_tone` | string | `"travel_companion"` | Narration tone preset used for speaker-note generation and narration defaults (`travel_companion`, `documentary`, `hype_reel`, `friendly_tutorial`) |
| `verbosity` | string | `"standard"` | `concise`, `standard`, `text-heavy` |
| `language` | string | auto | Presentation language |
| `export_as` | string | `"pptx"` | `pptx`, `pdf`, `html`, `video` |
| `web_search` | boolean | `false` | Enable web search grounding |
| `include_table_of_contents` | boolean | `false` | Add a TOC slide |
| `include_title_slide` | boolean | `true` | Add a title slide |
| `origin` | string | null | Departure city (for travel flight searches) |
| `currency` | string | `"USD"` | Currency for price formatting |
| `instructions` | string | null | Custom instructions for the AI |
| `slides_markdown` | string[] | null | Provide custom slide outlines |
| `files` | string[] | null | File paths from prior upload |
| `slide_duration` | integer | `5` | Seconds per slide (video/HTML export) |
| `transition_style` | string | `"cycle"` | Video transition style (see below) |
| `trigger_webhook` | boolean | `false` | Trigger subscribed webhooks on completion |

---

## 2. Export an Existing Presentation

Export a previously generated presentation in a different format.

**Endpoint:** `POST /api/v1/ppt/presentation/export`

```bash
curl -X POST https://your-host/api/v1/ppt/presentation/export \
  -H "Content-Type: application/json" \
  -d '{
    "id": "d3000f96-096c-4768-b67b-e99aed029b57",
    "export_as": "html",
    "export_options": {
      "slide_duration": 4,
      "transition_style": "clip-reveal",
      "auto_play_interval": 4000
    }
  }'
```

### Export Options

The optional `export_options` object controls format-specific rendering:

| Option | Applies To | Default | Description |
|---|---|---|---|
| `slide_duration` | video, html | `5` | Seconds per slide |
| `transition_style` | video | `"cycle"` | Transition animation style |
| `transition_duration` | video | `0.8` | Seconds for each transition |
| `audio_url` | video | null | Background audio URL for the video |
| `use_narration_as_soundtrack` | video | `false` | Uses per-slide narration MP3 as the primary soundtrack and extends slide timing to fit narration length |
| `auto_play_interval` | html | `5000` | Auto-play interval in ms for HTML slideshow |

### Narration Behavior in Exports

- HTML export creates a ZIP bundle with `index.html`.
- When narration exists, the ZIP also includes `audio/slide_{n}.mp3` and `narration_manifest.json`.
- PDF export does **not** embed narration audio; clients should use HTML export when audio delivery is required.

---

## 3. Video Export -- Transition Styles

The video export renders an MP4 at 1280x720 using Hyperframes with GSAP animations. Each slide gets a 4-layer animation stack:

1. **Entrance** -- how the slide appears
2. **Title fly-in** -- headings slide up from below with stagger
3. **Card stagger** -- cards/items/metrics reveal in sequence
4. **Exit** -- how the slide disappears

### Available Transition Styles

| Style | Entrance | Exit | Feel |
|---|---|---|---|
| `scale-zoom` | Scale from 95% to 100% | Blur + scale up 102% | Cinematic, premium |
| `slide-right` | Slide in from right | Slide out to left | Classic, clean |
| `clip-reveal` | Wipe reveal from left | Fade out | Editorial, dramatic |
| `cycle` | Rotates through all 3 | Matching exits | Variety (default) |
| `random` | Random per slide | Random exits | Dynamic |

### Easing

All animations use luxury-grade GSAP easing:

- Entrances: `expo.out` (fast start, very slow deceleration)
- Title fly-in: `power3.out` (snappy but smooth)
- Card stagger: `power2.out` (gentle cascade)
- Exits: `power2.in` (natural acceleration)

### Example: Generate a Video with Specific Transitions

```bash
curl -X POST https://your-host/api/v1/ppt/presentation/generate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Mediterranean cruise for family of 4, 10 days",
    "template": "travel",
    "export_as": "video",
    "slide_duration": 7,
    "transition_style": "scale-zoom",
    "tone": "adventurous"
  }'
```

### Async Video Export with Status Polling

The Next.js video export route supports both sync and async modes. Async mode is required when narration soundtrack is enabled because the render typically exceeds the upstream HTTP timeout on App Service.

```bash
# Kick off (async defaults to true under useNarrationAsSoundtrack=true)
curl -sS -b cookies.txt -X POST https://your-host/api/export-as-video \
  -H "Content-Type: application/json" \
  -d '{
    "id": "d3000f96-...",
    "title": "Mediterranean Cruise",
    "useNarrationAsSoundtrack": true
  }'
# => { "success": true, "jobId": "f2200194-...", "statusUrl": "/api/export-as-video/status?jobId=f2200194-...", "status": "queued" }

# Poll status (Cache-Control: no-store)
curl -sS -b cookies.txt "https://your-host/api/export-as-video/status?jobId=f2200194-..."
# => { "status": "running", "progressPct": 35, "currentFrame": 1748, "totalFrames": 4994, "message": "...", ... }
# => terminal shapes: { "status": "completed", "resultPath": "/app_data/exports/Title.mp4" } or { "status": "failed", "error": "..." }
```

Force the async path even without soundtrack mode by passing `"async": true`. Force the sync path under soundtrack mode with `"async": false` (not recommended on App Service due to the Chromium screenshot-mode constraint documented in [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)).

Job records persist at `${APP_DATA_DIRECTORY}/video-jobs/{jobId}.json` and are reaped automatically after 24 h.

---

## 4. JSON Export

Get the raw structured data for a presentation.

**Endpoint:** `GET /api/v1/ppt/presentation/export/json/{id}`

```bash
curl https://your-host/api/v1/ppt/presentation/export/json/d3000f96-... \
  -o presentation.json
```

Returns `Content-Disposition: attachment` with the full `PresentationWithSlides` model:

```json
{
  "id": "d3000f96-...",
  "title": "Luxury Bali Honeymoon",
  "content": "7-day luxury Bali honeymoon...",
  "n_slides": 8,
  "language": "English",
  "tone": "luxury",
  "slides": [
    {
      "id": "slide-uuid",
      "layout": "travel:destination-hero",
      "layout_group": "travel",
      "index": 0,
      "content": { "title": "Bali", "subtitle": "...", ... },
      "speaker_note": "Welcome your clients..."
    }
  ],
  "theme": { "data": { "colors": {...}, "fonts": {...} } }
}
```

Each slide's `content` field contains the structured data matching that layout's Zod schema -- real hotel names, prices, weather data, etc.

---

## 5. Interactive Embed

Get a shareable URL for a live interactive presentation player.

**Endpoint:** `POST /api/export-as-embed`

```bash
curl -X POST https://your-host/api/export-as-embed \
  -H "Content-Type: application/json" \
  -d '{ "id": "d3000f96-..." }'
```

**Response:**

```json
{
  "success": true,
  "embed_url": "https://your-host/embed/d3000f96-...",
  "iframe_code": "<iframe src=\"https://your-host/embed/d3000f96-...\" width=\"1280\" height=\"720\" frameborder=\"0\" allowfullscreen></iframe>",
  "presentation_id": "d3000f96-..."
}
```

### Embed URL Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `autoPlay` | boolean | `false` | Start auto-advancing immediately |
| `interval` | integer (ms) | `5000` | Auto-play interval |
| `start` | integer | `0` | Starting slide index |

Example: `/embed/d3000f96-...?autoPlay=true&interval=4000&start=2`

### Embed Player Features

- Arrow key navigation (left/right/up/down)
- Space bar toggles auto-play
- Touch swipe support (mobile)
- Dot navigation for direct slide access
- Progress bar
- Theme-aware (applies presentation's color scheme)
- Responsive scaling to fit viewport

---

## 6. Async Generation

For long-running presentations, use the async endpoint to avoid timeout.

**Endpoint:** `POST /api/v1/ppt/presentation/generate/async`

Same body as `/generate`. Returns immediately with a task ID:

```json
{
  "id": "task-uuid",
  "status": "pending",
  "message": "Queued for generation",
  "data": null
}
```

Poll for completion:

```bash
curl https://your-host/api/v1/ppt/presentation/status/{task-id}
```

---

## 7. MCP Integration

TripStory exposes an MCP server at `/mcp/` for AI agent integration. The following tools are available:

| Tool | Maps To | Description |
|---|---|---|
| `generate_presentation` | `POST /generate` | Generate and export a presentation |
| `get_presentation` | `GET /{id}` | Fetch presentation with all slides (JSON export) |
| `export_presentation` | `POST /export` | Export in PPTX/PDF/HTML/video |
| `edit_slide_field` | `PATCH /slide/edit-field` | Edit a single field on a slide |
| `get_enricher_status` | `GET /enrichers/status` | Check which enricher APIs are configured |
| `list_presentations` | `GET /all` | List all presentations |
| `templates_list` | `GET /template-management/summary` | List available templates |
| `get_narration_voices` | `GET /narration/voices` | List available ElevenLabs voices |
| `narration_estimate` | `GET /narration/presentation/{id}/estimate` | Estimate characters before synthesis |
| `bulk_generate_narration` | `POST /narration/presentation/{id}/bulk` | Generate narration audio for all eligible slides |
| `get_narration_status` | `GET /narration/presentation/{id}` | Inspect per-slide narration audio status |
| `get_embed_url` | `POST /api/export-as-embed` | Get embed URL for a presentation |
| `export_json` | `GET /export/json/{id}` | Download structured JSON |
| `generate_async` | `POST /generate/async` | Start async generation |

### MCP Example (Claude Desktop / Cursor)

An AI agent can generate a travel presentation and get the embed URL:

```
1. Call generate_presentation with content="Bali honeymoon", template="travel", export_as="video"
2. Get back presentation_id and video file path
3. Call get_embed_url with id=presentation_id
4. Return the embed_url to the user for interactive viewing
```

---

## 8. Enricher Status

Check which travel data enrichers have API keys configured.

**Endpoint:** `GET /api/v1/ppt/enrichers/status`

```json
{
  "available": ["activities", "connectivity", "cuisine", "deals", "destination_intel", "dining", "events", "flights", "hotels", "images", "language", "maps", "pricing", "reviews", "transport", "videos", "visa_health", "weather"],
  "unavailable": []
}
```

Each available enricher pulls real-world data during travel presentation generation:

| Enricher | Data Source | What It Provides |
|---|---|---|
| `destination_intel` | Tavily | Destination facts, tips, highlights |
| `weather` | Visual Crossing | Forecast for travel dates |
| `hotels` | SerpAPI | Real hotel names, prices, ratings |
| `flights` | SerpAPI | Flight routes, prices, airlines |
| `activities` | Viator | Bookable tours, excursions, experiences with pricing and availability |
| `dining` | SerpAPI | Restaurant recommendations |
| `events` | SerpAPI | Local events during travel dates |
| `reviews` | SerpAPI | Traveler reviews and ratings |
| `images` | Unsplash/Pexels | Destination photography |
| `maps` | Google Maps | Location maps and distances |
| `videos` | SerpAPI | Destination video content |
| `visa_health` | Tavily | Visa requirements, vaccinations, travel advisories |
| `transport` | Tavily | Local transit options, airport transfers, ride-hailing |
| `connectivity` | Tavily | SIM/eSIM, power outlets, public Wi-Fi |
| `language` | Tavily | Key phrases, etiquette, tipping customs |
| `cuisine` | SerpAPI | Signature dishes, street food, food culture |
| `pricing` | Internal | Budget/comfort/luxury tier pricing (derived) |
| `deals` | Tavily/Firecrawl | Current travel deals and offers |

---

## Architecture

```
FastAPI (Python)                    Next.js (Node.js)
   |                                    |
   POST /generate ----+                 |
   POST /export ------+                 |
   POST /narration/* -+                 |
                      |                 |
              export_utils.py           |
                      |                 |
        +-------------+--------+--------+---------+
        |             |        |        |         |
     PPTX          PDF      HTML      Video     Embed
        |             |        |        |         |
   python-pptx   bundled   Puppeteer  Hyperframes  React
                 export    HTML       GSAP+FFmpeg   player
                 runtime   capture    composition   /embed/{id}
                               |          |
                               +----+-----+
                                    |
                         /app_data/audio + narration_usage_logs
```

All exports start from the same slide data (structured JSON rendered by React at 1280x720). The format determines which rendering pipeline processes the HTML output.

# REFACTOR-PIVOT.MD -- Travel Presentation Builder

## Status: Phase 0-10 Implemented

This document is the source of truth for the TripStory travel pivot. It describes what was built, what architecture decisions were made, and what remains for future phases.

---

## Vision

TripStory has been pivoted from a generic AI presentation builder into a **travel-specialized AI presentation platform** targeting travel agents, BDMs, destination marketing organizations, and tour operators. The platform creates polished destination showcases, itineraries, deal packages, and travel proposals using AI.

## Architecture Principle

> **Note:** The Electron desktop app has been extracted to the `electron-desktop` branch. This repo is web-only.

The existing pipeline is domain-agnostic by design: Zod schemas define what goes on a slide, LLMs fill in the schemas, React renders them, Puppeteer exports them. **We specialized the content layer (templates, prompts, UI), not the platform layer (LLM client, export, editing, streaming, database).**

### What Was NOT Changed (Core Platform)
- LLM Client (6 providers: OpenAI, Google, Anthropic, Ollama, Custom, Codex)
- 3-Call Generation Pipeline (Outline -> Structure -> Content)
- Image/Icon Services infrastructure
- PPTX Export (python-pptx via Puppeteer DOM walk)
- PDF Export (Puppeteer page.pdf())
- Inline Editor (Tiptap text, image upload/AI, icon search)
- Undo/Redo (30-state history)
- SSE Streaming
- Database (SQLite/PostgreSQL/MySQL)
- Docker + Nginx deployment

### What Was Changed (Travel Specialization Layer)
- 15 new travel slide layouts + registration
- Ordered itinerary template mode (7 fixed-sequence layouts)
- 4 LLM prompt files specialized for travel content
- 5 travel preset themes
- Travel-specific input form with structured fields
- Dashboard navigation with travel entry points
- Image prompt enhancement for travel photography
- Travel tone values (inspirational, adventurous, luxury)
- Field-level AI editing endpoint

---

## Completed Phases

### Phase 0 -- Foundation
- Fixed React 19 `RefObject<T | null>` type compatibility across all `.tsx` files
- Node.js 20 -> 22, React 18 -> 19, Next.js 14 -> 16, Tailwind v3 -> v4, Electron 36 -> 41, Python 3.11 -> 3.12
- Replaced unmaintained `html2canvas` with `html-to-image`
- Removed deprecated `@types/puppeteer`

### Phase 1 -- Travel Template Group
**15 layouts** in `servers/nextjs/app/presentation-templates/travel/`:

| Layout | File | Purpose |
|--------|------|---------|
| Destination Hero | `DestinationHeroLayout.tsx` | Full-bleed destination opener with overlay text |
| Destination Highlights | `DestinationHighlightsLayout.tsx` | 3-6 card grid of highlights with images |
| Itinerary Day | `ItineraryDayLayout.tsx` | Single day with activities timeline |
| Itinerary Timeline | `ItineraryTimelineLayout.tsx` | Multi-day horizontal timeline |
| Pricing Comparison | `PricingComparisonLayout.tsx` | 2-3 tier deal comparison cards |
| Accommodation Card | `AccommodationCardLayout.tsx` | Hotel/resort showcase with amenities |
| Flight Info | `FlightInfoLayout.tsx` | Flight route cards with departure/arrival |
| Travel Map | `TravelMapLayout.tsx` | Route map with numbered stops |
| Testimonial | `TestimonialLayout.tsx` | Traveler review/quote with rating |
| Weather Climate | `WeatherClimateLayout.tsx` | Seasonal weather overview cards |
| Cultural Tips | `CulturalTipsLayout.tsx` | Local customs, dos and don'ts |
| Deal Countdown | `DealCountdownLayout.tsx` | Urgency deal with crossed-out pricing |
| Compare Destinations | `CompareDestinationsLayout.tsx` | Side-by-side destination cards |
| Package Inclusions | `PackageInclusionsLayout.tsx` | Included/excluded checklist |
| Booking CTA | `BookingCTALayout.tsx` | Closing call-to-action with contact info |

**Itinerary mode** (`travel-itinerary` template, `ordered: true`):
Fixed sequence: Hero -> Highlights -> Day Card (repeated) -> Accommodation -> Flights -> Pricing -> CTA

Registered in:
- `servers/nextjs/app/presentation-templates/index.tsx`
- `servers/fastapi/constants/presentation.py`
- Mirrored to `electron/` variants

### Phase 2 -- Travel LLM Prompts
Files modified:
- `servers/fastapi/utils/llm_calls/generate_presentation_outlines.py` -- Travel-expert persona, destination/logistics/booking flow guidance
- `servers/fastapi/utils/llm_calls/generate_presentation_structure.py` -- Travel-specific layout selection guidelines
- `servers/fastapi/utils/llm_calls/generate_slide_content.py` -- Travel formatting rules (prices, ratings, times, temperatures)
- `servers/fastapi/utils/llm_calls/edit_slide.py` -- Travel data consistency preservation

### Phase 3 -- Travel Themes
5 new preset themes in `ThemePanel/constants.ts`:
- **Tropical Paradise** -- Coral + warm white, Nunito font
- **Luxury Escape** -- Gold + dark navy, Playfair Display font
- **Adventure Trail** -- Forest green + parchment, Barlow font
- **Ocean Breeze** -- Ocean blue + ice blue, DM Sans font
- **Cultural Journey** -- Terracotta + warm cream, Lora font

### Phase 4 -- Travel Input Form
- Extended `PresentationConfig` with: destination, travelDates, budget, tripType, travelers, interests
- Created `TravelUploadPage.tsx` with structured travel inputs
- Routed via `?type=travel` query parameter on `/upload`
- Added 3 travel tones: inspirational, adventurous, luxury
- Auto-computes slide count from trip duration

### Phase 5 -- Branding & Navigation
- "Travel Presentation" button on dashboard (with Plane icon)
- "Travel" link in sidebar navigation
- Auto-selects travel template when `?template=travel` is passed to outline page

### Phase 6 -- Travel Image Sourcing
- `ImagePrompt` model extended with `template` field
- Image prompts enhanced for travel: "Professional travel photography, scenic destination shot: ..." for AI generators, "travel destination ..." for stock photo searches
- Only activates when `layout_group == "travel"`

### Phase 7 -- Itinerary Mode
- `travel-itinerary` template group with `ordered: true`
- 7 layouts in fixed narrative sequence
- Backend skips LLM Call 2 (structure generation) and uses declared order

### Phase 8 -- Quality Polish
- **Field-level AI editing**: `PATCH /api/v1/ppt/slide/edit-field` endpoint
  - Accepts `field_path` (dot-notation, e.g., "tiers.0.price") and `prompt`
  - Calls LLM with focused context for just that field
  - Type-coerces the result to match the original value type
  - Frontend API: `PresentationGenerationApi.editSlideField()`

### Phase 9 -- Chart Data Editing
- **ChartDataEditor** component: dialog-based editable table for chart data arrays
  - Supports simple (`{name, value}`), scatter (`{x, y}`), and series-based (`{categories, series}`) chart formats
  - Add/delete rows, string and number validation
- Wired into `EditableLayoutWrapper`: detects Recharts SVG elements, matches to content data paths, opens editor on click
- `updateSlideContent` Redux action widened to accept any value type (not just strings)

### Phase 10 -- Progressive Streaming
- **SlideSkeleton** component: 16:9 shimmer placeholder with optional outline text and layout name label
- **Backend SSE**: two new event types in the streaming endpoint:
  - `outlines` -- emitted after LLM Call 1 with the full outlines array
  - `structure` -- emitted after LLM Call 2 with layout assignments
- **Frontend streaming hook**: handles `outlines` (creates skeleton placeholders), `structure` (updates layout names), `chunk` (replaces skeletons with real slides)
- Redux: `skeletonSlides` state with `setSkeletonSlides`, `updateSkeletonLayouts`, `markSkeletonReady` reducers

### Stabilization Pass (Post-P8)
- Fixed travel template auto-select (TravelUploadPage now navigates with `?template=travel`)
- Copied dashboard/sidebar/nav travel links to Electron variants
- Fixed sidebar Travel link active state highlight
- Fixed 5 layout schema issues (missing `.meta()`, hardcoded colors, unused imports)
- Removed dead `travelDates` type field

---

## Enrichment Pipeline (Implemented -- See FEAT-EXPANSION.md)

The enricher pipeline (Phases A-D, 13 enrichers) now provides real-world data from external APIs (Tavily, SerpAPI, Visual Crossing, Unsplash, Pexels, Google Maps) injected into the LLM generation pipeline. This partially supersedes the original Phases 11-13 for data enrichment. The remaining work below focuses on areas the enricher pipeline doesn't cover.

## Remaining Work (Future Phases)

### Phase 11 -- Direct Booking-Grade APIs (Not Yet Implemented)
The enricher pipeline uses SerpAPI to scrape Google Hotels/Flights for data. For production booking, direct API integrations would provide real-time availability and pricing:
- Amadeus/Skyscanner flight booking API (real-time inventory)
- Booking.com/Expedia hotel availability API (live rates)

### Phase 12 -- Interactive Map Embeds (Not Yet Implemented)
The enricher pipeline generates static map images via Google Maps Static API. For interactive maps:
- Mapbox or Google Maps JavaScript embed in TravelMapLayout
- Render route polylines between stops
- Click-to-navigate markers

### Phase 13 -- Booking Integration (Not Yet Implemented)
- Deep links to booking platforms with UTM tracking
- QR codes on exported PPTX/PDF
- Affiliate link management

---

## File Change Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| P0 | 0 | ~10 (dependency upgrades, type fixes) |
| P1 | 17 (15 layouts + 2 settings.json) | 6 (index.tsx x2, constants.py x2) |
| P2 | 0 | 4 (prompt files) |
| P3 | 0 | 2 (theme constants x2) |
| P4 | 2 (TravelUploadPage x2) | 6 (type.ts x2, tone.py x2, page.tsx x2) |
| P5 | 0 | 8 (dashboard, nav, sidebar, template selection x2) |
| P6 | 0 | 8 (image_prompt.py, image_service.py, process_slides.py, slide.py x2) |
| P7 | 2 (settings.json x2) | 4 (index.tsx x2, constants.py x2) |
| P8 | 0 | 6 (edit_slide.py, slide.py, presentation-generation.ts x2) |
| P9 | 2 (ChartDataEditor.tsx x2) | 4 (EditableLayoutWrapper.tsx x2, presentationGeneration.ts x2) |
| P10 | 2 (SlideSkeleton.tsx x2) | 4 (presentation.py x2, streaming hook x2, Redux store x2) |
| Stabilization | 0 | ~12 (template auto-select, Electron nav parity, sidebar active state, 5 layout schema fixes, dead type removal) |
| Hardening | 0 | ~8 (uv.lock x2, package.json, next.config.mjs, README, NOTICE, AGENTS.md, CONTRIBUTING.md) |

**Total: ~25 new files, ~78 modifications. Zero changes to the LLM client, export engine, database layer, or Docker/deployment infrastructure. Streaming was extended (not replaced) with progressive events.**

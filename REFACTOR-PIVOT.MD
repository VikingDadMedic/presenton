# REFACTOR-PIVOT.MD -- Travel Presentation Builder

## Status: Phase 0-12 Implemented (Apr 2026)

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
**26 initial layouts** in `servers/nextjs/app/presentation-templates/travel/` (later extended to 30 in [FEATURE-BUILDING.md](FEATURE-BUILDING.md) Phase 5 with `MemoryQuoteLayout`, `SeriesCoverLayout`, `PartnerSpotlightHeroLayout`, and `PricingConfiguratorLayout`):

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
| Golden Hour Mood Board | `GoldenHourMoodBoardLayout.tsx` | Photo mosaic of destination at golden hour |
| Day vs Night Split | `DayNightSplitLayout.tsx` | Split-screen comparing daytime and nightlife |
| Before/After Arrival | `BeforeAfterArrivalLayout.tsx` | Expectations vs reality/experience comparison |
| Cuisine Discovery | `CuisineDiscoveryLayout.tsx` | Signature dishes and food culture showcase |
| Ambient Sounds | `AmbientSoundsLayout.tsx` | Sensory immersion — sounds of the destination |
| Visa Entry | `VisaEntryLayout.tsx` | Visa requirements, entry documents checklist |
| Transportation Info | `TransportationInfoLayout.tsx` | Getting around: transit, taxis, rental options |
| Health Safety | `HealthSafetyLayout.tsx` | Vaccinations, safety tips, travel advisories |
| Language Survival | `LanguageSurvivalLayout.tsx` | Essential phrases and local etiquette |
| Connectivity Card | `ConnectivityCardLayout.tsx` | SIM/eSIM, power outlets, Wi-Fi availability |
| Experience Cards | `ExperienceCardsLayout.tsx` | Bookable Viator experience cards with pricing/availability |

**Ordered narrative arcs** (6 initial template groups, each `ordered: true`; later extended to 10 — see [AGENTS.md](AGENTS.md)):
- `travel-itinerary`: Hero -> Highlights -> Day Card (repeated) -> Accommodation -> Flights -> Pricing -> CTA
- `travel-reveal`: Emotional discovery arc (mood board -> day/night -> highlights -> itinerary -> booking)
- `travel-contrast`: Before/after and comparison-driven narrative
- `travel-audience`: Client-focused with CRM personalization hooks
- `travel-micro`: Condensed 4-5 slide micro-pitch format
- `travel-local`: Deep-dive into culture, cuisine, language, and practical info

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

### Phase 11 -- Travel Slide Expansion + Mini CRM + Per-Call Model Routing
- **10 new travel layouts**: Golden Hour Mood Board, Day vs Night Split, Before/After Arrival, Cuisine Discovery, Ambient Sounds, Visa Entry, Transportation Info, Health Safety, Language Survival, Connectivity Card
- **5 new narrative arcs**: `travel-reveal`, `travel-contrast`, `travel-audience`, `travel-micro`, `travel-local` (each `ordered: true`)
- **ExperienceCardsLayout**: Bookable Viator experience cards with pricing, availability flags, and booking URLs
- **5 new enrichers**: visa_health, transport, connectivity, language, cuisine (see FEAT-EXPANSION.md Phase E)
- **Viator Partner API** replaces SerpAPI for activities (`services/viator_client.py` + `viator_destination_resolver.py` with 7-day cache + freetext fallback)
- **Trip Plan popover** (`TripPlanPopover.tsx`): Map icon on upload toolbar for travel context (destination, origin, duration, budget tier, trip type)
- **Client CRM sheet** (`ClientCRMSheet.tsx` + `useClientProfiles.ts`): Users icon on upload toolbar for adding client profiles; persists to localStorage as `tripstory_clients`
- **Per-call model routing** (`utils/llm_config.py`): different models for outline generation vs layout assignment vs content filling. Default production: Call 1 GPT-5.5, Calls 2-3 Mercury 2 (Inception Labs diffusion LLM)
- **Schema utils** (`utils/schema_utils.py`): `strip_length_constraints()` + `validate_length_constraints()` for Mercury 2 compatibility (strips `minLength`/`maxLength`/`minItems`/`maxItems`, validates client-side)
- **Motion UX layer**: `motion-icons-react` (CSS-animated Lucide wrapper) + AnimBits (`buttons-lift`, `text-shimmer`) for interaction feedback on sidebar, trip type selectors, toast icons, export dropdown, CTA buttons, template cards, embed copy
- **Travel integration fixes**: `ordered` flag wired correctly, `template.startswith("travel")` gating, template name threaded into LLM calls, conditional travel editing hints

### Phase 12 -- Export Pipeline Expansion
- **JSON export**: `GET /api/v1/ppt/presentation/export/json/{id}` returns structured `PresentationWithSlides` model
- **HTML bundle export**: self-contained `.html` slideshow with embedded CSS + JS, generated via Puppeteer HTML capture
- **Video/MP4 export**: Hyperframes HTML compositions with GSAP timeline (crossfade transitions, expo easing), rendered by `npx hyperframes render`. Falls back to Puppeteer screenshot + FFmpeg frame stitching. Configurable `transitionStyle` (scale-zoom, slide-right, clip-reveal, cycle, random), `transitionDuration`, `slideDuration`, `audioUrl`
- **Interactive embed**: `/embed/{id}` route with React player, embeddable via iframe. `EmbedShareDialog.tsx` provides embed URL + iframe code with copy-to-clipboard. Supports `autoPlay`, `interval`, `start` query params
- All 6 formats (PPTX, PDF, HTML, Video, JSON, Embed) wired to UI export dropdown

---

## Enrichment Pipeline (Implemented -- See FEAT-EXPANSION.md)

The enricher pipeline (Phases A-E, 17 enrichers + 1 derived) provides real-world data from external APIs (Viator, Tavily, SerpAPI, Visual Crossing, Unsplash, Pexels, Google Maps) injected into the LLM generation pipeline. See FEAT-EXPANSION.md for the full enricher reference.

## Remaining Work (Future Phases)

### Direct Booking-Grade APIs (Not Yet Implemented)
For production booking beyond Viator experiences, direct API integrations would provide real-time availability and pricing:
- Amadeus/Skyscanner flight booking API (real-time inventory)
- Booking.com/Expedia hotel availability API (live rates)

### Interactive Map Embeds (Not Yet Implemented)
The enricher pipeline generates static map images via Google Maps Static API. For interactive maps:
- Mapbox or Google Maps JavaScript embed in TravelMapLayout
- Render route polylines between stops
- Click-to-navigate markers

### Booking Integration (Not Yet Implemented)
- Deep links to booking platforms with UTM tracking
- QR codes on exported PPTX/PDF
- Affiliate link management

### Performance & Cost Optimization (Not Yet Implemented)
- Anthropic prompt caching for Call 3 (~90% savings on repeated prefixes across 7+ slides)
- Sequential Call 3 streaming parallelization (producer-consumer pattern, 4-8x speedup potential)
- Call 2 schema-aware layout assignment (include JSON schema fields in prompt, not just names/descriptions)

### UI & Design Backlog
- Dark mode Phase 2: ~68 files with `bg-white`, ~59 files with hardcoded gray hex, 12 pill-shaped buttons blocking `defaultTheme` switch from `"light"` to `"dark"`
- Eggshell Bright Tech theme system (multi-theme registry with palette swapper)
- Logo image assets in `/public/` still need TripStory visual replacements
- Raw `<button>` -> shadcn `<Button>` migration (~150 instances)

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
| P11 | ~22 (10 layouts, 5 settings.json, 5 enrichers, viator_client, viator_resolver) | ~18 (index.tsx, constants.py, llm_config.py, schema_utils.py, activities.py, TripPlanPopover, ClientCRMSheet, multiple prompt/template files) |
| P12 | ~6 (export endpoints, embed player, composition generator) | ~8 (PresentationHeader, export_utils, FastAPI routes, Dockerfile) |
| Stabilization | 0 | ~12 (template auto-select, Electron nav parity, sidebar active state, 5 layout schema fixes, dead type removal) |
| Hardening | 0 | ~8 (uv.lock x2, package.json, next.config.mjs, README, NOTICE, AGENTS.md, CONTRIBUTING.md) |

**Total: ~53 new files, ~104 modifications across Phases 0-12. The LLM client abstraction layer (`llmai`) was untouched; per-call model routing was added as a configuration layer above it.**

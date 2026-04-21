# FEAT-EXPANSION.md -- Enrichment Pipeline

## Status: Phases A-D Complete (All 13 Enrichers Implemented)

---

## 1. Vision & Guiding Principle

### The Shift

The current pipeline generates presentations by having an LLM **invent** all content -- destinations, prices, itineraries, reviews, weather. Everything is plausible-sounding but not grounded in reality.

The enrichment pipeline flips this: **real data first, LLM second.** External APIs fetch actual hotel prices, real flight schedules, genuine traveler reviews, accurate weather forecasts, and authentic destination photography. The LLM's job shifts from "invent everything" to "synthesize and write compelling narrative around verified facts."

### Graceful Degradation Rule

> **Every enricher is independent, testable, and optional. If an API key is missing, that enricher returns empty data and the LLM falls back to its existing behavior. No enricher breaks the pipeline; they only make it better.**

This rule governs all development:
- No enricher may throw if its API key is absent
- No enricher may be a hard dependency for slide generation
- The pipeline must produce valid presentations with zero enrichers enabled
- Enrichers that fail at runtime (API timeout, rate limit, bad response) return empty data and log the error
- The LLM prompt already works without enriched data -- enrichers only add `additional_context`

---

## 2. Architecture

### TravelContext

Every enricher consumes a shared context object produced by the travel form:

```python
@dataclass
class TravelContext:
    destination: str              # "Santorini, Greece" (required)
    origin: str | None = None     # "New York, NY" (for flights)
    dates: DateRange | None = None  # { start: "2026-06-15", end: "2026-06-22" }
    budget: str | None = None     # "budget" | "mid-range" | "luxury"
    trip_type: str | None = None  # "beach" | "adventure" | "cultural" | "city" | "cruise" | "safari"
    travelers: int = 2
    interests: list[str] = field(default_factory=list)  # ["food", "history", "nature"]
    language: str = "English"
    currency: str = "USD"
```

### BaseEnricher

```python
class BaseEnricher(ABC):
    name: str                          # "hotels"
    required_context: list[str]        # ["destination", "dates"]
    optional_context: list[str]        # ["budget", "travelers"]
    required_api_keys: list[str]       # ["SERPAPI_API_KEY"]

    async def enrich(self, context: TravelContext) -> dict:
        """Fetch data from external APIs. Returns empty dict on any failure."""

    def to_markdown(self, data: dict) -> str:
        """Convert structured data to markdown for LLM prompt injection."""

    def to_slide_data(self, data: dict, layout_id: str) -> dict | None:
        """Optional: directly fill slide schema fields for factual data (prices, ratings, times).
        Returns None if this enricher doesn't directly map to the given layout."""
```

### Pipeline Flow

```
TravelUploadPage
    |
    v
TravelContext object (structured form data)
    |
    v
EnricherRegistry.run_available(context)
    |  - Checks which enrichers have their API keys configured
    |  - Runs all available enrichers in parallel (asyncio.gather)
    |  - Each returns structured data or empty dict
    |
    v
EnrichedContext (merged enricher outputs)
    |  - to_markdown() called on each enricher's output
    |  - Results concatenated into a single markdown block
    |
    v
Existing LLM Pipeline
    |  - additional_context = enriched_markdown
    |  - LLM Call 1: Outlines (grounded in real data)
    |  - LLM Call 2: Structure
    |  - LLM Call 3: Content (references real hotels, prices, activities)
    |
    v
Post-processing: to_slide_data() (optional)
    |  - For factual fields (prices, ratings, flight times), enricher data
    |    can directly override LLM output to ensure accuracy
    |
    v
Asset Fetching
    |  - Images enricher provides real Unsplash/Pexels URLs
    |  - Maps enricher provides real Google Maps static images
    |  - Falls back to existing AI image generation if enricher unavailable
    |
    v
Final Presentation (real data + AI narrative)
```

### Integration Point

The hook already exists. In `generate_presentation_outlines.py`, the user prompt includes:

```python
- Additional Information: {additional_context or ""}
```

Currently `additional_context` comes from uploaded documents. With enrichers, it becomes a structured markdown block of real data that the LLM writes around.

---

## 3. The 13 Enricher Modules

### Tier 1 -- Core (always run if keys available)

#### 1. Destination Intel

| Field | Value |
|-------|-------|
| File | `enrichers/destination_intel.py` |
| APIs | Tavily (web search), SERPER (Google Travel Explore) |
| API Keys | `TAVILY_API_KEY`, `SERPAPI_API_KEY` |
| Required Context | `destination` |
| Optional Context | `language` |
| Output Schema | `{ overview, highlights[], best_time_to_visit, visa_info, safety_rating, currency, local_language, timezone, plug_type }` |
| Feeds Layouts | DestinationHero, DestinationHighlights, CulturalTips |

**Example Output:**
```json
{
  "overview": "Santorini is a volcanic island in the Cyclades group of the Greek islands...",
  "highlights": ["Oia sunset", "Akrotiri archaeological site", "Red Beach", "Caldera views"],
  "best_time_to_visit": "June to September",
  "visa_info": "EU citizens: no visa. US citizens: 90-day visa-free Schengen.",
  "safety_rating": "Very Safe",
  "currency": "EUR",
  "local_language": "Greek",
  "timezone": "EEST (UTC+3)",
  "plug_type": "Type C/F (European)"
}
```

#### 2. Weather

| Field | Value |
|-------|-------|
| File | `enrichers/weather.py` |
| APIs | Visual Crossing |
| API Keys | `VISUAL_CROSSING_API_KEY` |
| Required Context | `destination` |
| Optional Context | `dates` |
| Output Schema | `{ monthly_averages[]{month, avg_temp_c, avg_temp_f, rainfall_mm, condition}, forecast[]{date, high, low, condition} }` |
| Feeds Layouts | WeatherClimate |

**Example Output:**
```json
{
  "monthly_averages": [
    { "month": "June", "avg_temp_c": 27, "avg_temp_f": 81, "rainfall_mm": 1, "condition": "Sunny" },
    { "month": "July", "avg_temp_c": 29, "avg_temp_f": 84, "rainfall_mm": 0, "condition": "Sunny" }
  ],
  "forecast": [
    { "date": "2026-06-15", "high": 28, "low": 22, "condition": "Clear" }
  ]
}
```

#### 3. Hotels

| Field | Value |
|-------|-------|
| File | `enrichers/hotels.py` |
| APIs | SERPER (Google Hotels), SERPER (Tripadvisor Place + Reviews) |
| API Keys | `SERPAPI_API_KEY` |
| Required Context | `destination`, `dates` |
| Optional Context | `budget`, `travelers` |
| Output Schema | `{ hotels[]{name, star_rating, price_per_night, currency, amenities[], review_score, review_count, image_url, booking_url} }` |
| Feeds Layouts | AccommodationCard |

**Example Output:**
```json
{
  "hotels": [
    {
      "name": "Andronis Luxury Suites",
      "star_rating": 5,
      "price_per_night": 450,
      "currency": "USD",
      "amenities": ["Infinity Pool", "Sea View", "Spa", "Restaurant"],
      "review_score": 9.2,
      "review_count": 1847,
      "image_url": "https://...",
      "booking_url": "https://..."
    }
  ]
}
```

#### 4. Flights

| Field | Value |
|-------|-------|
| File | `enrichers/flights.py` |
| APIs | SERPER (Google Flights) |
| API Keys | `SERPAPI_API_KEY` |
| Required Context | `destination`, `origin`, `dates` |
| Optional Context | `travelers` |
| Output Schema | `{ flights[]{airline, departure_city, arrival_city, departure_time, arrival_time, duration, stops, price, currency, booking_url} }` |
| Feeds Layouts | FlightInfo |

**Example Output:**
```json
{
  "flights": [
    {
      "airline": "Delta",
      "departure_city": "New York (JFK)",
      "arrival_city": "Santorini (JTR)",
      "departure_time": "18:30",
      "arrival_time": "14:00+1",
      "duration": "14h 30m",
      "stops": 1,
      "price": 890,
      "currency": "USD",
      "booking_url": "https://..."
    }
  ]
}
```

#### 5. Destination Images

| Field | Value |
|-------|-------|
| File | `enrichers/images.py` |
| APIs | Unsplash, Pexels |
| API Keys | `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY` |
| Required Context | `destination` |
| Optional Context | `interests`, `trip_type` |
| Output Schema | `{ hero_image, highlight_images[], activity_images[], general_images[] }` |
| Feeds Layouts | Every layout with ImageSchema fields |

This enricher is unique: instead of injecting into `additional_context`, it provides URLs that replace `__image_url__` values in the final slide content, overriding AI-generated images with real photography.

---

### Tier 2 -- Activity & Experience

#### 6. Activities

| Field | Value |
|-------|-------|
| File | `enrichers/activities.py` |
| APIs | SERPER (Tripadvisor Search, Google Local, Yelp) |
| API Keys | `SERPAPI_API_KEY` |
| Required Context | `destination` |
| Optional Context | `interests`, `trip_type`, `budget` |
| Output Schema | `{ activities[]{name, category, description, duration, price_range, rating, review_count, image_url} }` |
| Feeds Layouts | ItineraryDay, DestinationHighlights |

#### 7. Dining

| Field | Value |
|-------|-------|
| File | `enrichers/dining.py` |
| APIs | SERPER (Yelp Search, OpenTable Reviews, Google Local) |
| API Keys | `SERPAPI_API_KEY` |
| Required Context | `destination` |
| Optional Context | `interests`, `budget` |
| Output Schema | `{ restaurants[]{name, cuisine, price_range, rating, signature_dish, image_url, booking_url} }` |
| Feeds Layouts | ItineraryDay (meal activities), CulturalTips |

#### 8. Events

| Field | Value |
|-------|-------|
| File | `enrichers/events.py` |
| APIs | SERPER (Google Events) |
| API Keys | `SERPAPI_API_KEY` |
| Required Context | `destination` |
| Optional Context | `dates` |
| Output Schema | `{ events[]{name, date, description, venue, ticket_price, url} }` |
| Feeds Layouts | ItineraryDay, DestinationHighlights |

---

### Tier 3 -- Social Proof & Media

#### 9. Reviews

| Field | Value |
|-------|-------|
| File | `enrichers/reviews.py` |
| APIs | SERPER (Tripadvisor Reviews, Google Maps Reviews) |
| API Keys | `SERPAPI_API_KEY` |
| Required Context | `destination` |
| Optional Context | -- |
| Output Schema | `{ reviews[]{quote, author, rating, date, source, trip_type} }` |
| Feeds Layouts | Testimonial |

#### 10. Videos

| Field | Value |
|-------|-------|
| File | `enrichers/videos.py` |
| APIs | SERPER (YouTube Search) |
| API Keys | `SERPAPI_API_KEY` |
| Required Context | `destination` |
| Optional Context | `trip_type` |
| Output Schema | `{ videos[]{title, channel, url, thumbnail_url, duration, views} }` |
| Feeds Layouts | Potential QR code / link callout on slides |

#### 11. Static Maps

| Field | Value |
|-------|-------|
| File | `enrichers/maps.py` |
| APIs | Google Maps Static API, Geocoding API |
| API Keys | `GOOGLE_MAPS_API_KEY` |
| Required Context | `destination` |
| Optional Context | stops from Activities enricher |
| Output Schema | `{ map_image_url, stops_with_coordinates[]{name, lat, lng} }` |
| Feeds Layouts | TravelMap |

This enricher generates a real static map image URL with markers, replacing the AI-generated map placeholder in TravelMapLayout.

---

### Tier 4 -- Pricing & Deals

#### 12. Package Pricing

| Field | Value |
|-------|-------|
| File | `enrichers/pricing.py` |
| APIs | None (derived from Hotels + Flights + Activities enricher outputs) |
| API Keys | -- |
| Required Context | -- (consumes other enricher outputs) |
| Optional Context | `budget`, `travelers` |
| Output Schema | `{ packages[]{name, flight_cost, hotel_cost, activity_cost, total_per_person, currency, duration} }` |
| Feeds Layouts | PricingComparison, PackageInclusions |

This is a **derived enricher** -- it doesn't call external APIs. It takes the outputs of the Hotels, Flights, and Activities enrichers and computes package totals. If those enrichers returned empty data, this one does too.

#### 13. Travel Deals

| Field | Value |
|-------|-------|
| File | `enrichers/deals.py` |
| APIs | Tavily (search), Firecrawl (scrape) |
| API Keys | `TAVILY_API_KEY`, `FIRECRAWL_API_KEY` |
| Required Context | `destination` |
| Optional Context | `dates` |
| Output Schema | `{ deals[]{title, original_price, sale_price, savings_pct, valid_until, url, provider} }` |
| Feeds Layouts | DealCountdown |

---

## 4. TravelContext Extension

The travel form (`TravelUploadPage.tsx`) needs 2 new fields:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `origin` | text input | -- | Departure city for flight searches |
| `currency` | select dropdown | `"USD"` | Price formatting for all enrichers |

These flow through to `GeneratePresentationRequest` on the backend and into the `TravelContext` that enrichers consume.

---

## 5. Implementation Phases

### Phase A -- Foundation (the plumbing)

**Status: COMPLETE**

Create the enricher framework and wire it into the existing pipeline.

| Task | File(s) | Description |
|------|---------|-------------|
| A.1 | `servers/fastapi/enrichers/__init__.py` | Package init |
| A.2 | `servers/fastapi/enrichers/base.py` | `BaseEnricher` ABC with `enrich()`, `to_markdown()`, `to_slide_data()` |
| A.3 | `servers/fastapi/enrichers/context.py` | `TravelContext` dataclass, `DateRange` type |
| A.4 | `servers/fastapi/enrichers/runner.py` | `EnricherRunner` -- discovers enrichers, checks API keys, runs available ones in parallel, merges results |
| A.5 | `servers/fastapi/enrichers/registry.py` | Auto-registers all enricher subclasses, provides `get_available_enrichers()` |
| A.6 | `servers/fastapi/api/v1/ppt/endpoints/enrichers.py` | `GET /enrichers/status` endpoint -- reports which enrichers are available based on configured API keys |
| A.7 | Pipeline integration | Wire `EnricherRunner` into the presentation generation handler: after `createPresentation`, before outline generation. Pass merged markdown as `additional_context`. |
| A.8 | Frontend: TravelUploadPage | Add `origin` (text input) and `currency` (select) fields. Pass to backend. |
| A.9 | Backend: GeneratePresentationRequest | Add `origin` and `currency` optional fields. Pass to enricher runner. |

### Phase B -- Tier 1 Enrichers (highest impact)

**Status: COMPLETE**

| Task | File | APIs Used |
|------|------|-----------|
| B.1 | `enrichers/destination_intel.py` | Tavily, SERPER (Google Travel Explore) |
| B.2 | `enrichers/weather.py` | Visual Crossing |
| B.3 | `enrichers/hotels.py` | SERPER (Google Hotels, Tripadvisor) |
| B.4 | `enrichers/flights.py` | SERPER (Google Flights) |
| B.5 | `enrichers/images.py` | Unsplash, Pexels |

Each enricher implements `enrich()` and `to_markdown()`. The images enricher also implements a URL-injection hook for replacing `__image_url__` values.

### Phase C -- Tier 2 + 3 Enrichers (depth)

**Status: COMPLETE**

| Task | File | APIs Used |
|------|------|-----------|
| C.1 | `enrichers/activities.py` | SerpAPI (Tripadvisor Things to Do) |
| C.2 | `enrichers/dining.py` | SerpAPI (Tripadvisor Restaurants) |
| C.3 | `enrichers/events.py` | SerpAPI (Google Events) |
| C.4 | `enrichers/reviews.py` | SerpAPI (Tripadvisor Reviews) |
| C.5 | `enrichers/videos.py` | SerpAPI (YouTube Search) |
| C.6 | `enrichers/maps.py` | Google Maps Geocoding + Static API |

**Additional fixes applied during Phase C:**
- Fixed enricher pipeline never running in web UI (wired into `/prepare` step)
- Added `origin`, `currency`, `enriched_context` columns to PresentationModel
- Added `origin`/`currency` params to `/create` endpoint
- Created prompt parser for extracting budget/trip_type/travelers/interests
- Enriched context injected into slide content generation via `instructions`
- Fixed weather.py best-time temperature display bug

### Phase D -- Tier 4 Enrichers + Direct Schema Fill (polish)

**Status: COMPLETE**

Additional infrastructure added:
- `BaseEnricher.is_derived` flag and `enrich_derived()` method for enrichers that consume other enrichers' outputs
- Runner executes derived enrichers in a second pass after primary enrichers complete
- Pricing enricher computes package totals from hotels + flights + activities data
- Deals enricher searches Tavily for active travel deals

D.3-D.5 implemented:
- `to_slide_data()` overrides on hotels (accommodation card fields), flights (flight info fields), weather (climate data), and images (hero image URLs)
- `enrichers/overlay.py` -- `apply_enricher_overlays()` deep-merges enricher data onto LLM-generated slide content in both streaming and one-shot paths
- `enriched_data` JSON column on PresentationModel stores raw enricher results for overlay use during streaming
- `enrichers/itinerary_scheduler.py` -- distributes activities across trip days with category diversity (morning/midday/afternoon/evening slots, max 4 per day), output appended to enriched context markdown
- Prompt parser extended with `trip_days` extraction

Bug fixes applied during Phase D:
- Fixed `/generate` one-shot path not passing enriched instructions to slide content generation
- Fixed `/generate` not persisting `origin`, `currency`, `enriched_context` on PresentationModel
- Added `ALTER TABLE` migration for new columns in existing databases
- Added `prompt_parser` to `_SKIP_MODULES` to prevent unnecessary import
- Improved prompt parser with origin extraction, flexible trip type matching, non-greedy destination

| Task | File | Description |
|------|------|-------------|
| D.1 | `enrichers/pricing.py` | Derived enricher: computes packages from Hotels + Flights + Activities |
| D.2 | `enrichers/deals.py` | Tavily + Firecrawl for active travel deals |
| D.3 | All enrichers | Implement `to_slide_data()` for factual fields (prices, ratings, flight times bypass LLM) |
| D.4 | Pipeline post-processing | After LLM generates slide content, overlay `to_slide_data()` results onto factual fields |
| D.5 | Auto-itinerary algorithm | Schedule activities optimally across trip days (proximity, category diversity, opening hours) |

---

## 6. API Key Configuration

### Environment Variables

| Variable | Used By | Source |
|----------|---------|--------|
| `TAVILY_API_KEY` | Destination Intel, Deals | `.env` / Docker env |
| `SERPAPI_API_KEY` | Hotels, Flights, Activities, Dining, Events, Reviews, Videos | `.env` / Docker env |
| `VISUAL_CROSSING_API_KEY` | Weather | `.env` / Docker env |
| `UNSPLASH_ACCESS_KEY` | Images | `.env` / Docker env |
| `PEXELS_API_KEY` | Images (existing, already supported) | `.env` / Docker env |
| `GOOGLE_MAPS_API_KEY` | Maps | `.env` / Docker env |
| `FIRECRAWL_API_KEY` | Deals | `.env` / Docker env |

### Discovery Pattern

```python
class EnricherRegistry:
    def get_available_enrichers(self) -> list[BaseEnricher]:
        """Returns only enrichers whose required API keys are all present in os.environ."""
        return [
            enricher for enricher in self.all_enrichers
            if all(os.getenv(key) for key in enricher.required_api_keys)
        ]
```

### Status Endpoint

`GET /api/v1/ppt/enrichers/status` returns:

```json
{
  "available": ["destination_intel", "weather", "hotels", "flights", "images"],
  "unavailable": [
    { "name": "maps", "missing_keys": ["GOOGLE_MAPS_API_KEY"] },
    { "name": "deals", "missing_keys": ["FIRECRAWL_API_KEY"] }
  ]
}
```

---

## 7. Context Requirements Matrix

| Enricher | destination | origin | dates | budget | trip_type | travelers | interests | currency |
|----------|:-----------:|:------:|:-----:|:------:|:---------:|:---------:|:---------:|:--------:|
| Destination Intel | REQ | -- | -- | -- | -- | -- | -- | -- |
| Weather | REQ | -- | OPT | -- | -- | -- | -- | -- |
| Hotels | REQ | -- | REQ | OPT | -- | OPT | -- | OPT |
| Flights | REQ | REQ | REQ | -- | -- | OPT | -- | OPT |
| Images | REQ | -- | -- | -- | OPT | -- | OPT | -- |
| Activities | REQ | -- | -- | OPT | OPT | -- | OPT | -- |
| Dining | REQ | -- | -- | OPT | -- | -- | OPT | -- |
| Events | REQ | -- | OPT | -- | -- | -- | -- | -- |
| Reviews | REQ | -- | -- | -- | -- | -- | -- | -- |
| Videos | REQ | -- | -- | -- | OPT | -- | -- | -- |
| Maps | REQ | -- | -- | -- | -- | -- | -- | -- |
| Pricing | -- | -- | -- | OPT | -- | OPT | -- | OPT |
| Deals | REQ | -- | OPT | -- | -- | -- | -- | -- |

REQ = required, OPT = optional, -- = not used

Note: `destination` is required for every external enricher. Pricing is derived (no external API). Flights is the only enricher that requires `origin`.

---

## 8. Slide Layout to Enricher Mapping

| Slide Layout | Primary Enricher | Secondary Enrichers |
|-------------|-----------------|-------------------|
| DestinationHero | Destination Intel | Images |
| DestinationHighlights | Destination Intel | Activities, Events, Images |
| ItineraryDay | Activities | Dining, Events, Images |
| ItineraryTimeline | Activities | -- |
| PricingComparison | Pricing | Hotels, Flights |
| AccommodationCard | Hotels | Images |
| FlightInfo | Flights | -- |
| TravelMap | Maps | Activities |
| Testimonial | Reviews | -- |
| WeatherClimate | Weather | -- |
| CulturalTips | Destination Intel | -- |
| DealCountdown | Deals | -- |
| CompareDestinations | Destination Intel | Hotels, Images |
| PackageInclusions | Pricing | -- |
| BookingCTA | -- (user-provided agency info) | -- |

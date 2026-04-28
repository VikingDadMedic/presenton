# TripStory

**AI-powered travel presentation builder for travel agents and BDMs** -- craft visual destination stories that sell trips.

<p>
  <a href="https://github.com/presenton/presenton/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue?style=flat" alt="Apache 2.0" /></a>
  <img src="https://img.shields.io/badge/Platform-Docker-lightgrey?style=flat" alt="Docker" />
  <img src="https://img.shields.io/badge/Fork_of-presenton%2Fpresenton-orange?style=flat" alt="Fork" />
</p>

> TripStory is a travel-specialized fork of the open-source [Presenton](https://github.com/presenton/presenton) AI presentation engine.

---

## What TripStory Does

TripStory generates polished destination showcases, itineraries, deal packages, and travel proposals using AI -- grounded in real data from travel supply APIs, not hallucinated content.

- **26 travel slide layouts** in 3 categories: emotional/sensory hooks, logistics/practical, and conversion
- **6 narrative arcs** as ordered template sequences (itinerary, reveal, contrast, audience, micro, local)
- **17 enrichers + 1 derived** pull real hotels, flights, activities, weather, reviews, maps, dining, events, deals, visa info, transportation, cuisine, language, and connectivity data from external APIs
- **6 export formats**: PPTX, PDF, HTML slideshow, Video/MP4 (GSAP transitions), JSON, interactive embed
- **Per-call model routing**: different LLM models for outline generation, layout assignment, and content filling
- **Built-in MCP server** at `/mcp/` for AI agent integration (10 tools)
- **Single-admin auth** with HTTP Basic on all `/api/v1/*` routes

### How Real Data Flows In

The enrichment pipeline runs before LLM generation. External APIs (Viator, Tavily, Visual Crossing, Unsplash, Pexels, Google Maps, SerpAPI) fetch real hotel prices, flight schedules, Viator bookable experiences, weather forecasts, destination photography, and more. The LLM writes narrative around verified facts. Missing API keys degrade gracefully -- enrichers return empty data, the pipeline continues, and the LLM falls back to its existing behavior.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python 3.12) |
| Frontend | Next.js 16, React 19, Tailwind v4 (CSS-first `@theme`) |
| Runtime | Node 22 |
| Reverse Proxy | Nginx |
| LLM Abstraction | `llmai` library (OpenAI, Anthropic, Google GenAI, Bedrock SDKs) |
| Export | Puppeteer (PPTX/PDF), Hyperframes + GSAP (Video), python-pptx |
| Database | SQLite (default) or PostgreSQL/MySQL via `DATABASE_URL` |
| Deployment | Docker (single container) or Azure App Service |

### LLM Providers (6)

OpenAI, Google Gemini, Anthropic Claude, Ollama (local), custom OpenAI-compatible endpoint, ChatGPT Codex (OAuth).

Default production routing: Call 1 (outlines) uses GPT-5.5, Calls 2-3 (structure + content) use Mercury 2 (Inception Labs diffusion LLM, 2.9-14.6x faster than GPT-4.1 for structured output).

### Image Providers (7)

DALL-E 3, GPT Image 1.5, Gemini Flash, Pexels, Pixabay, ComfyUI, Open WebUI. Travel presentations default to Pexels/Pixabay for real destination photography.

---

## Running TripStory

### Option 1: Docker (Build from Source)

> **Apple Silicon note**: The published `ghcr.io/presenton/presenton` images are x86-only. On ARM64 Macs, build from source.

```bash
docker build -t tripstory:latest -f Dockerfile .
docker run -it --name tripstory -p 5000:80 \
  -e LLM="openai" -e OPENAI_API_KEY="sk-..." \
  -e IMAGE_PROVIDER="pexels" -e PEXELS_API_KEY="..." \
  -v "./app_data:/app_data" tripstory:latest
```

Open [http://localhost:5000](http://localhost:5000).

### Option 2: Local Development (No Docker)

```bash
# Backend
cd servers/fastapi
uv sync
USER_CONFIG_PATH=/path/to/userConfig.json CONTAINER_DB_PATH=/path/to/tripstory.db \
  uv run uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend (separate terminal)
cd servers/nextjs
npm install --legacy-peer-deps
USER_CONFIG_PATH=/path/to/userConfig.json npm run dev
```

Next.js dev server proxies `/api/v1/*` to `http://localhost:8000` via `next.config.ts` rewrites.

### Option 3: Azure App Service

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the full Azure deployment reference (ACR build, App Service config, env vars, troubleshooting).

---

## Authentication

TripStory uses a **single admin account** per instance. Credentials are stored hashed in `app_data/userConfig.json`.

| Variable | Purpose |
|---|---|
| `AUTH_USERNAME` / `AUTH_PASSWORD` | Preseed admin login on first boot (min 6 chars) |
| `AUTH_OVERRIDE_FROM_ENV` | If `true`, replace stored credentials from env on every startup |
| `RESET_AUTH` | If `true`, clear stored credentials (use once to recover access) |

All `/api/v1/*` routes (except `/api/v1/auth/*`) require HTTP Basic auth. Use `-u username:password` with curl.

---

## Generate Presentation via API

**Endpoint:** `POST /api/v1/ppt/presentation/generate`

```bash
curl -u admin:yourpassword \
  -X POST http://localhost:5000/api/v1/ppt/presentation/generate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "7-day luxury Bali honeymoon for 2, departing from LA",
    "template": "travel",
    "n_slides": 8,
    "tone": "luxury",
    "origin": "Los Angeles",
    "currency": "USD",
    "export_as": "pptx"
  }'
```

**Response:**

```json
{
  "presentation_id": "d3000f96-096c-4768-b67b-e99aed029b57",
  "path": "/app_data/exports/Luxury_Bali_Honeymoon.pptx",
  "edit_path": "/presentation?id=d3000f96-096c-4768-b67b-e99aed029b57"
}
```

See [`EXPORTS.md`](EXPORTS.md) for the full 6-format export reference, transition styles, MCP tool mapping, and async generation.

---

## Configuration

### LLM and API Keys

| Variable | Description |
|---|---|
| `LLM` | Provider: `openai` / `google` / `anthropic` / `ollama` / `custom` / `codex` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | OpenAI (default model: `gpt-4.1`) |
| `GOOGLE_API_KEY` / `GOOGLE_MODEL` | Google Gemini (default: `models/gemini-2.0-flash`) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Anthropic Claude |
| `OLLAMA_URL` / `OLLAMA_MODEL` | Ollama local models |
| `CUSTOM_LLM_URL` / `CUSTOM_LLM_API_KEY` / `CUSTOM_MODEL` | OpenAI-compatible endpoint |
| `CAN_CHANGE_KEYS` | If `false`, API keys are hidden and unmodifiable in the UI |
| `WEB_GROUNDING` | If `true`, enables web search tool during outline generation |

### Image Generation

| Variable | Description |
|---|---|
| `IMAGE_PROVIDER` | `pexels` / `pixabay` / `dall-e-3` / `gpt-image-1.5` / `gemini_flash` / `comfyui` / `open_webui` |
| `PEXELS_API_KEY` | Pexels stock images |
| `PIXABAY_API_KEY` | Pixabay stock images |
| `DISABLE_IMAGE_GENERATION` | If `true`, skip slide image generation |

### Travel Enricher API Keys

These enable the real-data enrichment pipeline for travel presentations:

| Variable | Used By |
|---|---|
| `TAVILY_API_KEY` | Destination intel, deals, visa/health, transport, connectivity, language |
| `VIATOR_API_KEY` | Activities/experiences (bookable with pricing) |
| `SERPAPI_API_KEY` | Hotels, flights, dining, events, reviews, videos, cuisine |
| `VISUAL_CROSSING_API_KEY` | Weather forecasts |
| `UNSPLASH_ACCESS_KEY` | Destination photography |
| `PEXELS_API_KEY` | Destination photography (shared with image provider) |
| `GOOGLE_MAPS_API_KEY` | Static maps with markers |
| `FIRECRAWL_API_KEY` | Deal scraping |

All enricher keys are optional. Missing keys mean that enricher returns empty data; the pipeline continues.

### Database

| Variable | Description |
|---|---|
| `DATABASE_URL` | SQLAlchemy URL (default: SQLite under `app_data/`) |
| `MIGRATE_DATABASE_ON_STARTUP` | If `true`, auto-create/migrate tables on boot |

### Presentation Memory (Mem0 OSS)

| Variable | Default | Purpose |
|---|---|---|
| `MEM0_ENABLED` | `true` | Enable per-presentation memory |
| `MEM0_DIR` | `/app_data/mem0` | Root directory |
| `MEM0_EMBEDDER_PROVIDER` | `fastembed` | Embedder backend |
| `MEM0_EMBEDDER_MODEL` | `BAAI/bge-small-en-v1.5` | Model |
| `MEM0_EMBEDDING_DIMS` | `384` | Vector size |

### Document Parsing (LiteParse)

| Variable | Default | Purpose |
|---|---|---|
| `LITEPARSE_DPI` | `120` | OCR render DPI |
| `LITEPARSE_NUM_WORKERS` | `1` | Worker count |

### Telemetry

| Variable | Description |
|---|---|
| `DISABLE_ANONYMOUS_TRACKING` | If `true`, disable Mixpanel telemetry |

---

## Documentation

| Document | What It Covers |
|---|---|
| [`main-workflow.md`](main-workflow.md) | Generation pipeline (4-step API, 3 LLM calls, enrichment, assets) |
| [`CODEBASE_DESIGNS.md`](CODEBASE_DESIGNS.md) | Frontend styling, CSS, UI components, theme architecture |
| [`EXPORTS.md`](EXPORTS.md) | All 6 export formats, API reference, MCP tools, enricher table |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Azure App Service deployment, resource topology, troubleshooting |
| [`REFACTOR-PIVOT.MD`](REFACTOR-PIVOT.MD) | Travel pivot implementation history (Phases 0-12) |
| [`FEAT-EXPANSION.md`](FEAT-EXPANSION.md) | Enrichment pipeline reference (18 enricher modules, API keys, schemas) |
| [`VISION.md`](VISION.md) | Project vision and guiding principles |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to contribute, development setup |
| [`AGENTS.md`](AGENTS.md) | Workspace facts and preferences for AI agents |

---

## License

Apache 2.0. See [LICENSE](LICENSE).

TripStory is a travel-specialized fork of [Presenton](https://github.com/presenton/presenton). Original project copyright retained per license terms.

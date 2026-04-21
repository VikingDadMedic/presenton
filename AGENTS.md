## Learned User Preferences

- Uses master plan documents (e.g., REFACTOR-PIVOT.MD, FEAT-EXPANSION.md) as the source of truth for phased implementation — never edit the plan file during execution; keep it updated between phases.
- Expects todos marked in_progress as work begins; no duplicate todo creation.
- Prefers thorough exploration using subagents and tools before planning — "take your time, break it apart."
- Wants all work items completed before stopping — "don't stop until all todos done."
- Plans before implementing — step back to understand holistically, then plan cleverly.
- Uses TaskMaster AI MCP to decompose plan documents into phased task trees.
- Runs Docker on Apple Silicon (ARM64); must build from source since published images are x86-only.
- npm installs require `--legacy-peer-deps` due to peer dependency conflicts in the dependency tree.
- Wants key architectural principles crystallized as persistent rules or guiding documents, not just inline comments.
- After completing a plan phase, wants a "step back in a meta way" audit — systematic gap analysis for missed items, overstated status claims, and forward-looking next steps before proceeding.

## Learned Workspace Facts

- Presenton: open-source AI presentation generator (Apache 2.0) pivoting to a travel-specialized platform for travel agents and BDMs. Travel pivot in REFACTOR-PIVOT.MD (Phases 0-10 done); enricher expansion in FEAT-EXPANSION.md.
- Dual-server architecture: FastAPI (Python, port 8000) + Next.js (port 3000) behind Nginx reverse proxy.
- Schema-driven pipeline: Zod schemas define slide data contracts, 3-call LLM pipeline (Outlines -> Structure -> Content), React renders slides, Puppeteer exports to PPTX/PDF.
- Electron desktop app extracted to separate `electron-desktop` branch. This repo is web-only (Docker/cloud). All Electron references fully cleaned.
- Travel template group: 15 layouts + ordered itinerary mode registered in `presentation-templates/index.tsx` (frontend) and `constants/presentation.py` (backend).
- Current stack after recent upgrades: Node 22, React 19, Next.js 16, Tailwind v4, Python 3.12.
- Template registration pattern: React component + Zod schema + `settings.json` per group; use `createTemplateEntry()` in `index.tsx` and add group name to `DEFAULT_TEMPLATES` in Python.
- Six LLM providers supported: OpenAI, Google Gemini, Anthropic Claude, Ollama, custom OpenAI-compatible, ChatGPT Codex (OAuth). Image providers: DALL-E 3, GPT Image 1.5, Gemini Flash, Pexels, Pixabay, ComfyUI, Open WebUI; travel defaults to Pexels/Pixabay.
- Enricher pipeline: 22 files in `servers/fastapi/enrichers/` (8 infrastructure, 1 utility, 13 enrichers). Phases A-D complete. Runner uses two-pass execution: primary enrichers in parallel, then derived enrichers sequentially. Post-processing overlay (`overlay.py`) deep-merges factual enricher data onto LLM slide content. Itinerary scheduler distributes activities across trip days with category diversity. External APIs: Tavily, Visual Crossing, SerpAPI, Unsplash, Pexels, Google Maps.
- Enrichment flow: Both `/prepare` and `/generate` call `run_enrichment_pipeline()` from `enrichers/pipeline.py`, which parses the prompt, builds TravelContext, runs enrichers, and schedules itinerary. Results stored as `enriched_context` (markdown) and `enriched_data` (JSON) on PresentationModel. `/stream` reads stored context and merges into instructions. Graceful degradation: missing API keys → empty data, no pipeline breakage. No enricher may throw on missing keys. Overlay failures are caught per-slide and logged without killing the SSE stream.
- Enricher auto-discovery in `enrichers/__init__.py` uses `_SKIP_MODULES` set: `{__init__, base, context, registry, runner, prompt_parser, overlay, itinerary_scheduler, pipeline}`. Non-enricher Python files must be added there.
- DB schema migrations in `services/database.py` support both SQLite (`PRAGMA table_info`) and PostgreSQL/MySQL (`information_schema.columns`). New columns use JSONB for PostgreSQL, JSON for SQLite.
- PresentationModel has `origin`, `currency`, `enriched_context`, and `enriched_data` (JSON) columns. `prompt_parser.py` extracts budget, trip_type, trip_days, travelers, interests, origin, and destination from natural language prompts using multi-pattern regex.
- FastAPI exposes a `/health` endpoint (returns `{"status": "ok"}`), proxied through Nginx at `/health` for external load balancer checks. Docker HEALTHCHECK hits it directly at port 8000.
- Travel layouts share a `TravelFonts.tsx` memoized component for Google Fonts loading instead of per-layout inline `<link>` tags. All 15 layouts import from this shared component.
- Test suite: `tests/test_enrichers.py` (47 tests covering base, registry, runner, prompt parser, overlay, itinerary scheduler, pricing) + `tests/test_presentation_generation_api.py` (4 validation tests). CI runs via `pytest` in `.github/workflows/test-all.yml`.
- Local dev without Docker/Nginx: `next.config.ts` has rewrites proxying `/api/v1/*` to `http://localhost:8000`. `start.js` (Docker entrypoint) bootstraps `userConfig.json` and dirs; running services directly requires `USER_CONFIG_PATH` (for both Next.js and FastAPI) and `CONTAINER_DB_PATH` (overrides the Docker-only `/app/container.db` default). Direct service run is faster than Docker build on Apple Silicon.
- `main-workflow.md` at repo root documents the full generation pipeline (4-step API sequence: `/create` -> `/outlines/stream` -> `/prepare` -> `/stream`, 3 LLM calls, enrichment timing, asset pipeline, template-schema-LLM constraint chain) and 6 known refactoring issues (travel-hardcoded prompts, sequential Call 3 bottleneck, Call 2 lacks schema awareness, broken `ordered` flag, inconsistent enriched context injection, Pydantic repr in outline strings).
- Azure App Service deployment requires B2+ plan (2+ vCPU, 3.5+ GB RAM). Docker image is ~3 GB (Chromium, LibreOffice, docling/PyTorch); first ACR pull takes ~20 min. Must set `WEBSITES_PORT=80` and use full ACR registry prefix in image name. Build for AMD64 via `az acr build` when developing on Apple Silicon.
- `usePresentationStreaming.ts` has three SSE resilience layers: try/finally cleanup on complete/closing events, 2-minute fallback timeout that fetches from DB, and onerror recovery via `fetchUserSlides()` instead of dead-end error screen.

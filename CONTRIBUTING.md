# Contributing to TripStory

Welcome!
Thanks for helping improve **TripStory -- the open-source AI travel presentation builder.**

> TripStory is a travel-specialized fork of the upstream [Presenton](https://github.com/presenton/presenton) project (Apache 2.0).

---

# Architecture

TripStory is a **web-only** application (the Electron desktop app lives on the separate `electron-desktop` branch). The two servers:

- **FastAPI backend** (`servers/fastapi/`) -- Python 3.12, LLM pipeline, enrichers, export engine
- **Next.js frontend** (`servers/nextjs/`) -- Node 22, React 19, Next.js 16, Tailwind v4

Behind Nginx in Docker; local dev runs them directly.

---

# How to Contribute

### Bugs
Open an issue and include:

- Steps to reproduce
- Expected vs actual behavior
- Logs or screenshots

### Features
Start a **GitHub Issue** or **Discussion** explaining:

- The problem
- Proposed solution

### Code Contributions

1. Fork the repository
2. Create a branch
3. Implement your changes
4. Open a Pull Request

Example branch names:

```
feature/add-template-support
fix/export-pptx-error
docs/update-readme
```

---

# Development Setup

### Prerequisites

- Node.js 22 (LTS)
- npm
- Python 3.12
- [`uv`](https://docs.astral.sh/uv/) (Python package manager)

### Backend (FastAPI)

```bash
cd servers/fastapi
uv sync
```

### Frontend (Next.js)

```bash
cd servers/nextjs
npm install --legacy-peer-deps
```

### Running Locally

Start both servers in separate terminals:

```bash
# Terminal 1 -- Backend
cd servers/fastapi
uv run uvicorn main:app --host 0.0.0.0 --port 8000

# Terminal 2 -- Frontend
cd servers/nextjs
npm run dev
```

The Next.js dev server proxies `/api/v1/*` to `http://localhost:8000` via `next.config.ts` rewrites. Set `USER_CONFIG_PATH` and `CONTAINER_DB_PATH` environment variables for both services (see README.md).

If you are working on narration features, also set `ELEVENLABS_API_KEY` (and optionally `ELEVENLABS_DEFAULT_VOICE_ID`) before starting the backend so `/api/v1/ppt/narration/*` endpoints are available for local testing.

### Running Tests

Backend (FastAPI / Pytest):

```bash
cd servers/fastapi
uv run pytest tests/ -v
```

The backend test suite includes 47 enricher tests, 4 API validation tests, and the narration suite (hardening, usage, auto-IPA, strict-schema response).

Frontend (Next.js / Node native test runner):

```bash
cd servers/nextjs
npm test
```

Runs `node --test __tests__/*.test.mjs` against esbuild-compiled TS imports — no jest/vitest dependency. Current coverage: video composition + GSAP timeline parse, video export job lifecycle.

Production smoke (works locally and against deployed environments):

```bash
BASE_URL="http://localhost:5000" \
  PRESENTATION_ID="<existing-uuid>" \
  ADMIN_USER="admin" ADMIN_PASS="..." \
  ./scripts/smoke-narration.sh
```

---

# Before Opening a PR

Please ensure:

- Code runs locally in both dev and build environments
- PRs are **small and focused**
- You explain **what and why**
- For UI changes, include screenshots

---

# AI-Assisted Contributions

PRs created with **AI tools (ChatGPT, Claude, Codex, etc.) are welcome.**

Please mention:

- that the PR is **AI-assisted**
- the level of testing performed
- confirmation that you reviewed the generated code

---

# Good First Issues

Look for issues labeled `good first issue` or `help wanted`.

---

# Code of Conduct

Please follow the community guidelines in `CODE_OF_CONDUCT.md`.

---

# Slide Layouts: the `viewMode` Convention (Showcase Mode)

TripStory ships two viewer experiences for the same `slides[]` array:

- **Deck view** (default) — linear, agent-driven, used by the editor and every export pipeline (PPTX, PDF, MP4, HTML, JSON, embed).
- **Showcase view** — looped, self-led, kiosk-style autoplay. URL preset: `/embed/{id}?mode=showcase`.

Most layouts render identically in both modes. Some layouts are **interactive widgets** that take advantage of showcase mode by accepting viewer input (sliders, toggles, AI hotspots) while still rendering a stable static snapshot for export. This is the "interactive widget" pattern.

### The contract

A widget-aware layout accepts a `viewMode` prop and branches on it. Both branches must render the same physical slot in the slide so layout shifts don't leak between modes.

```tsx
interface Props {
  data?: Partial<MyLayoutData>
  viewMode?: "deck" | "showcase"  // optional; default "deck"
}

const MyLayout: React.FC<Props> = ({ data, viewMode = "deck" }) => {
  if (viewMode === "showcase") return <Interactive data={data} />
  return <Static data={data} />
}
```

### The rules

1. **Static branch is mandatory and stable.** It must render at the same default state on every render so Puppeteer captures a consistent image for PPTX/PDF/MP4 export. No `useState`-dependent visuals at default.
2. **Interactive branch is local-only.** Widget state (slider position, chat messages, toggle on/off) must never escape the slide. No Redux, no DB writes from viewer-side widgets, no URL mutation.
3. **Showcase-only network calls use the showcase endpoint pair.** Public viewers hit `/api/v1/public/showcase/*` and authenticated previews can fall back to `/api/v1/ppt/showcase/*`. Both surfaces are read-only and token-capped.
4. **Default-prop pattern.** `viewMode = "deck"` default means existing layouts ignore the prop and render exactly as before. The convention is purely additive.
5. **Opt-in only.** Only layouts that have a meaningful interactive variant should branch. Don't add a `viewMode` branch to a layout that renders identically in both modes.

### The canonical example

[`PricingConfiguratorLayout.tsx`](servers/nextjs/app/presentation-templates/travel/PricingConfiguratorLayout.tsx) is the reference implementation:

- Schema is identical for both branches (same Zod shape).
- Static branch renders three tier cards with "Starting at $X" using the deck-default duration and party size.
- Interactive branch renders sliders for duration and party, tier toggles, and a live total.
- The enricher overlay in [`servers/fastapi/enrichers/pricing.py`](servers/fastapi/enrichers/pricing.py) populates the schema fields directly from real supply data via `to_slide_data()` — no LLM hallucination on the numbers.

### AI primitives in widgets

Showcase widgets can also call back to the LLM for grounded responses. The per-layout pattern is [`AskHotspotPill`](servers/nextjs/app/embed/[id]/AskHotspotPill.tsx) + [`AskPanel`](servers/nextjs/app/embed/[id]/AskPanel.tsx), backed by [`/api/v1/ppt/showcase/ask`](servers/fastapi/api/v1/ppt/endpoints/showcase.py) and [`/api/v1/public/showcase/ask`](servers/fastapi/api/v1/public/showcase.py). Conventions:

- The endpoint reads `enriched_data` + slide `content` for grounding; the system prompt forbids fabrication.
- Output is hard-capped at 500 tokens.
- Streaming is server-side typewriter (chunked from a single `client.generate` call) so it works across all 6 LLM providers without per-provider streaming code.
- Optional `topic` hints can be supplied by the layout to focus answers on the currently visible context.
- Showcase readiness should be checked via `GET /showcase/ready/{id}` (public-first with authenticated fallback); widgets should hide on decks with no enriched data.

### What this convention is NOT

- Not a graph-navigation system. Slides remain a linear array.
- Not a new content type or generation pipeline. Showcase is purely a viewing concern.
- Not a full ACL system. Public visibility is a single `is_public` flag intended for link sharing, not role-based permissions.

For the strategic context behind this pattern, see [`stakeholder.md`](stakeholder.md) Section 6 and the `showcase-mode-interactive-widgets` plan in `.cursor/plans/`.

---

# Agent Brand Defaults (Profile + Magic Keys)

TripStory now supports a singleton **Agent Profile** in `userConfig.json` (served by `GET/PATCH /api/v1/ppt/profile`) and uses it across rendering + export flows.

## Where to edit

- UI: Settings -> **Agent profile** (`/settings`)
- API: `GET /api/v1/ppt/profile` and `PATCH /api/v1/ppt/profile`

## Magic key precedence

In `V1ContentRender`, profile-backed keys are injected for layouts:

- `__agentName__`
- `__agencyName__`
- `__agentEmail__`
- `__agentPhone__`
- `__bookingUrl__`
- `__agencyTagline__`

For shared brand keys, **profile values take precedence** and theme values remain fallback:

- `_logo_url__`
- `__companyName__`

## Export behavior

Brand stamping + UTM tagging are applied in export routes (`video`, `html`, `pdf`, `pptx`) using profile defaults (`default_utm_source`, `default_utm_medium`, `default_utm_campaign`) unless overridden via `export_options`.

---

Thanks for helping make **TripStory better for everyone.**

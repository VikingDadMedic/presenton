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

```bash
cd servers/fastapi
uv run pytest tests/ -v
```

The test suite includes 47 enricher tests and 4 API validation tests.

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

Thanks for helping make **TripStory better for everyone.**

# Contributing to Presenton

Welcome! 🚀  
Thanks for helping improve **Presenton — the open-source AI presentation generator.**

## Quick Links

- **GitHub:** https://github.com/presenton/presenton
- **Docs:** https://docs.presenton.ai
- **Website:** https://presenton.ai
- **Discord:** https://discord.gg/9ZsKKxudNE
- **X:** https://x.com/presentonai

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

- Python 3.12
- Node.js 22 (LTS)
- [`uv`](https://docs.astral.sh/uv/) (Python package manager)
- Docker (optional, for production builds)

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

---

# Running Locally

**Option A — Run services individually**

Start the FastAPI backend:

```bash
cd servers/fastapi
uvicorn server:app --host 0.0.0.0 --port 8000
```

Start the Next.js frontend (in a separate terminal):

```bash
cd servers/nextjs
npm run dev
```

**Option B — Docker Compose**

```bash
docker compose up development
```

---

# Running Tests

### Backend (FastAPI)

```bash
cd servers/fastapi
uv run python -m pytest tests/ -v --tb=short
```

Or without `uv`:

```bash
cd servers/fastapi
export PYTHONPATH=$(pwd)
export APP_DATA_DIRECTORY=/tmp/app_data
export TEMP_DIRECTORY=/tmp/presenton
export DATABASE_URL=sqlite+aiosqlite:///./test.db
export DISABLE_ANONYMOUS_TRACKING=true
export DISABLE_IMAGE_GENERATION=true
python -m pytest tests/ -v --tb=short
```

### Frontend (Next.js)

```bash
cd servers/nextjs
npm run lint
npm run build
```

### Full Local Test Suite

Run everything at once (mimics the CI workflow):

```bash
./test-local.sh
```

> **Note:** Frontend `npm install` requires `--legacy-peer-deps` due to peer dependency conflicts.

---

# Before Opening a PR

Please ensure:

- **Tests pass** — run the backend tests and frontend lint/build (see above)
- Code runs locally in development and in a Docker build
- PRs are **small and focused**
- You explain **what and why**

For UI changes, include screenshots.

---

# AI-Assisted Contributions

PRs created with **AI tools (ChatGPT, Claude, Codex, etc.) are welcome.**

Please mention:

- that the PR is **AI-assisted**
- the level of testing performed
- confirmation that you reviewed the generated code

---

# Good First Issues

Look for issues labeled:

```

good first issue
help wanted

```

---

# Community

Questions or discussions:

💬 Discord  
https://discord.gg/9ZsKKxudNE

---

# Code of Conduct

Please follow our community guidelines:

```

CODE_OF_CONDUCT.md

```

---

Thanks for helping make **Presenton better for everyone.**

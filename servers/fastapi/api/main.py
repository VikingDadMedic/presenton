import logging
import os

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.responses import FileResponse

from api.lifespan import app_lifespan
from api.middlewares import SessionAuthMiddleware, UserConfigEnvUpdateMiddleware
from api.v1.auth.router import API_V1_AUTH_ROUTER
from api.v1.mock.router import API_V1_MOCK_ROUTER
from api.v1.ppt.router import API_V1_PPT_ROUTER
from api.v1.public.router import API_V1_PUBLIC_ROUTER
from api.v1.webhook.router import API_V1_WEBHOOK_ROUTER
from utils.get_env import (
    get_app_data_directory_env,
    get_sentry_dsn_env,
    get_sentry_send_default_pii_env,
    get_sentry_traces_sample_rate_env,
)
from utils.path_helpers import get_resource_path

LOGGER = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Sentry initialization (Phase 11.0c.1)
# ---------------------------------------------------------------------------
# Production travel/showcase deployment runs without backend observability
# until SENTRY_DSN is wired through Azure App Service. Until that happens,
# `sentry_sdk.init` is a no-op (the DSN guard short-circuits) and TripStory
# behaves identically to the pre-Phase-11 build. Once SENTRY_DSN lands, the
# 16-round chat tool loop, Anthropic prompt-caching efficacy, mem0 OSS
# growth, and alembic drift all gain first-class error + perf telemetry.
#
# Defaults consciously diverge from upstream Presenton's Sentry pattern:
#   - SENTRY_TRACES_SAMPLE_RATE defaults to 0.1 (NOT 1.0 — would blow our
#     Sentry quota on a B2 App Service plan and conflate signal with noise
#     for a 5-9 RPS travel SaaS).
#   - SENTRY_SEND_DEFAULT_PII defaults to false (travel agent + named-
#     client privacy posture — Sentry would otherwise capture cookies and
#     query strings that may contain client names / booking IDs).


def _get_sentry_traces_sample_rate(default: float = 0.1) -> float:
    raw = get_sentry_traces_sample_rate_env()
    if raw is None or raw == "":
        return default
    try:
        parsed = float(raw)
    except (TypeError, ValueError):
        LOGGER.warning(
            "SENTRY_TRACES_SAMPLE_RATE=%r is not a float; using default %s",
            raw,
            default,
        )
        return default
    if parsed < 0.0 or parsed > 1.0:
        LOGGER.warning(
            "SENTRY_TRACES_SAMPLE_RATE=%s out of [0.0, 1.0]; using default %s",
            parsed,
            default,
        )
        return default
    return parsed


def _get_sentry_send_default_pii(default: bool = False) -> bool:
    raw = get_sentry_send_default_pii_env()
    if raw is None or raw == "":
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _maybe_init_sentry() -> bool:
    """Initialize Sentry when SENTRY_DSN is set; otherwise no-op.

    Returns True iff `sentry_sdk.init` was actually called (test hook for
    `tests/test_sentry_init.py`).
    """
    dsn = get_sentry_dsn_env()
    if not dsn:
        return False
    sentry_sdk.init(
        dsn=dsn,
        traces_sample_rate=_get_sentry_traces_sample_rate(),
        send_default_pii=_get_sentry_send_default_pii(),
    )
    return True


_maybe_init_sentry()


# ---------------------------------------------------------------------------
# /health version pinning (Phase 11.0c.2)
# ---------------------------------------------------------------------------
# Detected once at module load time so the /health handler stays cheap (no
# disk I/O, no DB query). Both values are stable for the lifetime of the
# process: IMAGE_SHA is baked into the runtime image at `az acr build` time,
# alembic_head is read from the migration files shipped in the same image.
#
# scripts/redeploy-azure.sh asserts the returned image_sha matches the
# just-built commit, closing the cached-container false positive
# (TROUBLESHOOTING.md "Health check returns 200 too quickly after redeploy").


def _detect_alembic_head() -> str:
    """Read the head revision from alembic/versions/ at module load.

    Returns "unknown" on any error (missing alembic.ini, malformed migration
    file, alembic import failure) so /health stays operational even if the
    migration directory is corrupt — that's a separate alarm; the health
    check itself should not 500 on a stale/missing migration tree.
    """
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        alembic_ini = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "alembic.ini",
        )
        if not os.path.isfile(alembic_ini):
            return "unknown"
        cfg = Config(alembic_ini)
        script_dir = ScriptDirectory.from_config(cfg)
        head = script_dir.get_current_head()
        return head or "unknown"
    except Exception:
        LOGGER.exception("Failed to detect alembic head; reporting 'unknown'")
        return "unknown"


_HEALTH_IMAGE_SHA = os.getenv("IMAGE_SHA", "unknown")
_HEALTH_ALEMBIC_HEAD = _detect_alembic_head()


app = FastAPI(lifespan=app_lifespan)



@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "image_sha": _HEALTH_IMAGE_SHA,
        "alembic_head": _HEALTH_ALEMBIC_HEAD,
    }



# Routers
app.include_router(API_V1_PPT_ROUTER)
app.include_router(API_V1_PUBLIC_ROUTER)
app.include_router(API_V1_WEBHOOK_ROUTER)
app.include_router(API_V1_MOCK_ROUTER)
app.include_router(API_V1_AUTH_ROUTER)

# Mount app_data and static assets (direct FastAPI access; nginx also serves /static in Docker).
app_data_dir = get_app_data_directory_env()
if app_data_dir:
    os.makedirs(app_data_dir, exist_ok=True)
    app.mount("/app_data", StaticFiles(directory=app_data_dir), name="app_data")

static_dir = get_resource_path("static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Middlewares
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(UserConfigEnvUpdateMiddleware)
app.add_middleware(SessionAuthMiddleware)


@app.middleware("http")
async def static_icon_fallback_middleware(request: Request, call_next):
    """Serve a generic placeholder SVG when /static/icons/<path> 404s.

    Phase 10.3 graft from upstream commit 9de61d18. Phosphor icon set
    occasionally renames/relocates SVGs, leaving slide-rendering paths
    pointing at non-existent files. Returning the placeholder keeps the
    deck visually intact instead of breaking the slide.
    """
    response = await call_next(request)
    if response.status_code != 404:
        return response
    path = request.url.path
    if not path.startswith("/static/icons/"):
        return response
    placeholder = get_resource_path("static/icons/placeholder.svg")
    if not os.path.isfile(placeholder):
        return response
    return FileResponse(placeholder, media_type="image/svg+xml")

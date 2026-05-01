# Troubleshooting Runbook

Symptoms, root causes, and recovery steps for failure modes encountered while running and deploying presenton, especially during the narration v1d ship.

This is the runbook to consult **first** when something breaks. Architecture and steady-state setup live in [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Quick map

| Symptom | Most likely cause | Fix |
|---------|-------------------|-----|
| `502 Bad Gateway` from app | Container restarting or warming up | Wait 60-180 s, then re-check `/health` |
| `503 Application Error` | Container crash loop or image-pull failure | See [Container fails to start](#container-fails-to-start) |
| `exec /usr/bin/node: exec format error` in docker logs | arm64 image pushed to amd64 host | See [Image manifest architecture mismatch](#image-manifest-architecture-mismatch) |
| `ImagePullUnauthorizedFailure` for `@sha256:...` digest | Missing registry credentials | See [ACR digest auth](#acr-digest-auth) |
| `Container did not start within ... 180 s` | Slow cold pull or crash on startup | See [Slow cold start](#slow-cold-start) |
| `toomanyrequests ... You have reached your unauthenticated pull rate limit` | Docker Hub anonymous pull rate limit during ACR build | See [Docker Hub rate limit during ACR build](#docker-hub-rate-limit-during-acr-build) |
| `Hyperframes render failed ... narration soundtrack mode` | Chromium screenshot-mode capture too slow for App Service nginx ceiling | See [Hyperframes render timeout on App Service](#hyperframes-render-timeout-on-app-service) |
| `Waiting for selector [data-speaker-note] failed` in HTML or video export | Puppeteer hitting `pdf-maker` route without auth cookie | See [Puppeteer auth on export routes](#puppeteer-auth-on-export-routes) |
| `Site is blocked due to multiple, consecutive cold start failures` | App Service backoff after repeated startup failures | See [Site is in Blocked state](#site-is-in-blocked-state) |
| Bulk narration response shows `total_character_count: 0` | ElevenLabs response missing `x-character-count` header | See [Narration usage reports zero characters](#narration-usage-reports-zero-characters) |

---

## Image manifest architecture mismatch

**Symptom**

```
exec /usr/bin/node: exec format error
```

repeated in `LogFiles/<date>_<host>_default_docker.log`. The container is created and immediately exits 255.

**Root cause**

App Service runs `linux/amd64`. A local `docker build` on Apple Silicon produces a `linux/arm64` image. If that image is tagged with the same name and pushed to ACR, App Service pulls it and the container fails on the first `exec`.

**Fix**

1. Always build for App Service on the server side:
   ```bash
   az acr build --registry presentonacr --image presenton:latest --file Dockerfile .
   ```
   ACR build agents run amd64 natively.

2. If you must build locally, force the platform:
   ```bash
   docker buildx build --platform linux/amd64 --provenance=false -t presentonacr.azurecr.io/presenton:latest -f Dockerfile .
   ```

3. The repository's `scripts/redeploy-azure.sh` includes a guardrail that refuses to proceed if a local arm64 image is tagged at the deploy reference. Use that script.

**Recovery from a bad arm64 push**

Re-run an `az acr build` (which always produces amd64) to overwrite the bad tag, then `az webapp restart`. If the site is in `Blocked` state, see below.

---

## ACR digest auth

**Symptom**

```
ImagePullUnauthorizedFailure: Failed to pull image:
presentonacr.azurecr.io/presenton@sha256:....
Image pull failed with forbidden or unauthorized.
```

after using `az webapp config container set` with a digest reference (`@sha256:...`).

**Root cause**

App Service can pull tag-only references (e.g. `presenton:latest`) using a managed-identity-derived token in some configurations, but digest references **require** explicit registry credentials in the app settings.

**Fix (one-time)**

```bash
ACR_USER=$(az acr credential show --name presentonacr --query username -o tsv)
ACR_PASS=$(az acr credential show --name presentonacr --query 'passwords[0].value' -o tsv)
az webapp config appsettings set \
  --name presenton-app --resource-group presenton-rg \
  --settings DOCKER_REGISTRY_SERVER_USERNAME="$ACR_USER" \
             DOCKER_REGISTRY_SERVER_PASSWORD="$ACR_PASS"
```

These are documented in [DEPLOYMENT.md](DEPLOYMENT.md). Once set, future deploys (digest or tag) work without inline creds. `scripts/redeploy-azure.sh` also passes them inline as belt-and-suspenders.

---

## Docker Hub rate limit during ACR build

**Symptom**

```
toomanyrequests: You have reached your unauthenticated pull rate limit.
https://www.docker.com/increase-rate-limit
2026/MM/DD HH:MM:SS Container failed during run: build. No retries remaining.
```

late in `az acr build` output (typically at the `FROM node:20-bookworm-slim AS nextjs-builder` step or similar Docker Hub fetch).

**Root cause**

ACR build agents pull Docker Hub base images anonymously. Anonymous pulls are throttled per source IP (~100 pulls / 6 h). When the agent's IP gets capped, the build aborts.

**Fix**

1. Re-run after a few minutes; the agent's IP rotates and rate windows reset.
2. `scripts/redeploy-azure.sh` retries `az acr build` automatically with a 120 s delay (`MAX_BUILD_RETRIES=3` by default).
3. Long-term: import the base images into ACR once and update the Dockerfile to `FROM presentonacr.azurecr.io/library/python:...` etc., e.g.
   ```bash
   az acr import --name presentonacr --source docker.io/library/python:3.11-slim-trixie --image library/python:3.11-slim-trixie
   ```
   Then ACR builds pull through the registry mirror instead of Docker Hub directly.

---

## Slow cold start

**Symptom**

```
ContainerTimeout: Container did not start within expected time limit of 180 s.
```

Followed by `Site startup probe failed`.

**Root cause**

The presenton image is ~3 GB (Chromium, LibreOffice, docling/PyTorch). On a cold pull (no cached layers on the App Service host), pull + extract can take 8-20 min, which exceeds the default 180 s container start timeout.

**Fix**

Increase the start time limit:
```bash
az webapp config appsettings set \
  --name presenton-app --resource-group presenton-rg \
  --settings WEBSITES_CONTAINER_START_TIME_LIMIT=600
```

Then `az webapp restart`. Subsequent restarts reuse the cached image layers and warm up in 30-90 s.

---

## Site is in Blocked state

**Symptom**

```
State: Blocked, Action: None, ...
Site is blocked due to multiple, consecutive cold start failures.
Site scheduled to be unblocked at <timestamp>.
```

`/health` returns 503 (not 502).

**Root cause**

App Service's safety mechanism: after 3-5 consecutive cold-start failures, it stops attempting to start the container until the backoff expires (typically 1-2 min, then 5 min, then 15 min).

**Fix**

1. Check the docker logs to confirm the underlying failure is fixed (architecture, env vars, port, etc.). See [Image manifest architecture mismatch](#image-manifest-architecture-mismatch) and [ACR digest auth](#acr-digest-auth).
2. Wait for the unblock timestamp shown in the log line.
3. After unblock, `az webapp restart` to trigger a fresh start. If the underlying fix held, the container should warm up cleanly.

If it's urgent: `az webapp stop` followed by `az webapp start` clears the backoff state.

---

## Hyperframes render timeout on App Service

**Symptom**

```
[export-as-video] Hyperframes render failed while narration soundtrack
mode is enabled. Retry after fixing renderer availability or disable
soundtrack mode.
```

Logs show `[BrowserManager] HeadlessExperimental.beginFrame unavailable in this Chromium build; falling back to screenshot mode.` and `[Render] Measured slow frame capture during auto-worker calibration. {"multiplier":1.4,"p95Ms":~800}`.

**Root cause**

App Service's bundled Chromium does not expose `HeadlessExperimental.beginFrame`. Hyperframes falls back to screenshot-mode capture which measures ~800 ms per frame at p95. A typical 5-slide deck with narration durations runs to ~5,000 frames, well beyond:
- the 600 s `npx hyperframes render` timeout in `app/api/export-as-video/route.ts`
- the 230 s nginx ceiling on App Service for sync HTTP responses

This is documented in [DEPLOYMENT.md](DEPLOYMENT.md) under "Video soundtrack rendering on App Service".

**Workarounds today**

- Run soundtrack-mode video export on a local Docker host or any environment with `beginFrame`-capable Chromium.
- Use the HTML zip export, which already bundles `audio/slide_*.mp3` and `narration_manifest.json`, then mux post-hoc with ffmpeg.
- For short trailers (<= ~30 s of narrated video) the sync render does fit within the App Service envelope.

**Long-term fix (in flight)**

Move the render to an async/queued job pattern with a status-poll endpoint. Tracked in `narration_v1d_production_unlock_bc548273` plan, Phase 3.

### Vertical / square export gotchas

If exports are now using `export_options.aspect_ratio`:

- `landscape` uses `1280x720` (baseline).
- `vertical` uses `720x1280` (similar pixel count to landscape).
- `square` uses `1080x1080` (higher pixel count than landscape).

Operational implications:

- Vertical usually behaves similarly to landscape for render cost.
- Square can take noticeably longer (more pixels/frame), especially in Hyperframes screenshot-mode on App Service.
- When square soundtrack jobs fail or exceed expected windows, force async video export and poll `/api/export-as-video/status`, or run long soundtrack exports off-App-Service (local Docker / beginFrame-capable host).

---

## Puppeteer auth on export routes

**Symptom**

```
Waiting for selector `[data-speaker-note]` failed: Waiting failed: 60000 ms exceeded
```

from `/api/export-as-html` or `/api/export-as-video` after authentication is enabled.

**Root cause**

The export routes spawn a Puppeteer browser pointed at the in-container `pdf-maker` route to extract slide DOM. When admin auth is on, `pdf-maker` requires the `presenton_session` cookie. Without it, the page never renders, the selector never appears, and Puppeteer times out.

**Fix**

The route handler must propagate the inbound `presenton_session` cookie into the Puppeteer page context. Both `app/api/export-as-html/route.ts` and `app/api/export-as-video/route.ts` already do this (commit `778a092e`):

```ts
const sessionCookie = req.cookies.get("presenton_session")?.value;
// ...after page = await browser.newPage()...
if (sessionCookie) {
  await page.setCookie({
    name: "presenton_session",
    value: sessionCookie,
    url: "http://localhost",
  });
}
```

If the failure recurs, verify the inbound request actually carries the cookie (the smoke script logs in via `/api/v1/auth/login` and writes a cookie jar that gets passed on subsequent requests).

---

## Narration usage reports zero characters

**Symptom**

`POST /api/v1/ppt/narration/presentation/{id}/bulk` returns `total_character_count: 0` and `/api/v1/ppt/narration/usage/summary` shows `{rows: 0, total_character_count: 0}` even though MP3 files were generated and stored.

**Root cause**

ElevenLabs occasionally omits or zeros the `x-character-count` response header (observed intermittently on `eleven_v3`). Without a fallback, `_generate_slide_audio` sets `character_count = 0` and `_record_narration_usage` skips the insert (because of the `if character_count <= 0: return` guard).

**Fix**

`_resolve_character_count` in `servers/fastapi/api/v1/ppt/endpoints/narration.py` falls back to `len(text)` whenever the header is missing, zero, or non-numeric. This is exercised by the regression tests in `servers/fastapi/tests/test_narration_usage.py::test_resolve_character_count_*`.

If usage logs ever drop to zero again, first verify the response actually has the header by enabling verbose logging at the synthesizer call site, then check whether the helper is short-circuiting.

---

## Useful one-liners

```bash
# Tail live container logs
az webapp log tail --name presenton-app --resource-group presenton-rg

# Download all logs as a zip for offline inspection
az webapp log download --name presenton-app --resource-group presenton-rg --log-file /tmp/presenton_logs.zip
unzip -l /tmp/presenton_logs.zip
unzip -o /tmp/presenton_logs.zip "LogFiles/<YYYY>_<MM>_<DD>_*_default_docker.log" -d /tmp/presenton_logs

# Confirm what image App Service is running
az webapp config show --name presenton-app --resource-group presenton-rg --query 'linuxFxVersion'

# What digest is :latest right now in ACR?
az acr repository show --name presentonacr --image presenton:latest --query 'imageDigest'

# Smoke validate post-deploy
BASE_URL="https://presenton-app.azurewebsites.net" \
  PRESENTATION_ID="<existing-uuid>" \
  ADMIN_USER="admin" ADMIN_PASS="..." \
  ./scripts/smoke-narration.sh

# Force a clean restart
az webapp stop --name presenton-app --resource-group presenton-rg
sleep 5
az webapp start --name presenton-app --resource-group presenton-rg
```

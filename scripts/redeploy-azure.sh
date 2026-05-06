#!/usr/bin/env bash
#
# scripts/redeploy-azure.sh
#
# Single-command deploy for the presenton App Service. Codifies the workflow
# we used during the narration v1d ship:
#   1. Refuse to push a local arm64 image (App Service runs amd64).
#   2. Build the image on Azure Container Registry with retry on transient
#      Docker Hub anonymous pull-rate limits.
#   3. Set the container image on App Service with explicit ACR credentials
#      so digest-pinned references stay authenticated.
#   4. Restart the web app.
#   5. Poll /health until it returns 200, with a configurable budget.
#
# Usage:
#   scripts/redeploy-azure.sh
#
# Environment overrides (optional):
#   ACR_NAME                  default: presentonacr
#   IMAGE_NAME                default: presenton
#   TAG                       default: latest
#   WEBAPP                    default: presenton-app
#   RESOURCE_GROUP            default: presenton-rg
#   HEALTH_URL                default: https://presenton-app.azurewebsites.net/health
#   MAX_HEALTH_WAIT_SECONDS   default: 600
#   MAX_BUILD_RETRIES         default: 3
#   BUILD_RETRY_DELAY         default: 120 (seconds)
#   SKIP_BUILD                default: false   (true skips az acr build)
#   SKIP_HEALTH               default: false   (true skips the health poll)
#   SKIP_SMOKE                default: false   (true skips post-deploy
#                                              smoke-post-deploy.sh; useful
#                                              when smoke env vars
#                                              PRESENTATION_ID/ADMIN_*
#                                              aren't available locally)
#
# If SKIP_SMOKE is unset and PRESENTATION_ID/ADMIN_USER/ADMIN_PASS are
# defined, scripts/smoke-post-deploy.sh runs after the /health 200 check
# and any failure fails the whole deploy.
#

set -euo pipefail

ACR_NAME="${ACR_NAME:-presentonacr}"
IMAGE_NAME="${IMAGE_NAME:-presenton}"
TAG="${TAG:-latest}"
WEBAPP="${WEBAPP:-presenton-app}"
RESOURCE_GROUP="${RESOURCE_GROUP:-presenton-rg}"
HEALTH_URL="${HEALTH_URL:-https://presenton-app.azurewebsites.net/health}"
MAX_HEALTH_WAIT_SECONDS="${MAX_HEALTH_WAIT_SECONDS:-600}"
MAX_BUILD_RETRIES="${MAX_BUILD_RETRIES:-3}"
BUILD_RETRY_DELAY="${BUILD_RETRY_DELAY:-120}"
SKIP_BUILD="${SKIP_BUILD:-false}"
SKIP_HEALTH="${SKIP_HEALTH:-false}"
SKIP_SMOKE="${SKIP_SMOKE:-false}"

REGISTRY_HOST="${ACR_NAME}.azurecr.io"
LOCAL_IMAGE_REF="${REGISTRY_HOST}/${IMAGE_NAME}:${TAG}"
REMOTE_IMAGE_REF="${REGISTRY_HOST}/${IMAGE_NAME}:${TAG}"

if [[ -t 1 ]]; then
  RED=$'\033[0;31m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[1;33m'
  BLUE=$'\033[0;34m'
  NC=$'\033[0m'
else
  RED=""
  GREEN=""
  YELLOW=""
  BLUE=""
  NC=""
fi

log_info()    { echo "${BLUE}[INFO]${NC} $*"; }
log_warn()    { echo "${YELLOW}[WARN]${NC} $*"; }
log_error()   { echo "${RED}[ERROR]${NC} $*" >&2; }
log_success() { echo "${GREEN}[OK]${NC} $*"; }

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Missing required command: $1"
    exit 1
  fi
}

require_command az
require_command curl

# Step 0: Manifest architecture guardrail.
# If a local Docker image already exists at our target tag and is arm64,
# refuse to continue. This catches the "exec /usr/bin/node: exec format error"
# fail mode where an arm64 image gets pushed and the App Service container
# loops on pull.
if command -v docker >/dev/null 2>&1; then
  if docker image inspect "$LOCAL_IMAGE_REF" >/dev/null 2>&1; then
    LOCAL_ARCH=$(docker image inspect "$LOCAL_IMAGE_REF" --format '{{.Architecture}}' 2>/dev/null || echo "unknown")
    if [[ "$LOCAL_ARCH" == "arm64" ]]; then
      log_error "Local image ${LOCAL_IMAGE_REF} is arm64; App Service runs amd64."
      log_error "Pushing this image will cause 'exec format error' on container start."
      log_error "Fix: remove the local image or rebuild for amd64."
      log_error "  docker rmi ${LOCAL_IMAGE_REF}"
      log_error "  # then re-run this script (it builds via az acr build, which always produces amd64)"
      exit 1
    fi
  fi
fi

# Step 1: Build via ACR (server-side build, always amd64).
# Resolve the source-commit SHA so the runtime image's IMAGE_SHA env var matches
# the deployed code. Step 4 asserts the /health-returned image_sha equals this
# value, closing the cached-container false-positive gotcha. Falls back to
# "unknown" only if we're not inside a git repo (e.g., a tarball deploy).
if command -v git >/dev/null 2>&1 && git rev-parse HEAD >/dev/null 2>&1; then
  EXPECTED_IMAGE_SHA="$(git rev-parse HEAD)"
else
  EXPECTED_IMAGE_SHA="unknown"
fi

if [[ "$SKIP_BUILD" != "true" ]]; then
  log_info "Step 1/4: Building ${REMOTE_IMAGE_REF} via az acr build (registry=${ACR_NAME}, IMAGE_SHA=${EXPECTED_IMAGE_SHA:0:8})"

  attempt=1
  while true; do
    if az acr build \
        --registry "$ACR_NAME" \
        --image "${IMAGE_NAME}:${TAG}" \
        --file Dockerfile \
        --build-arg "IMAGE_SHA=${EXPECTED_IMAGE_SHA}" \
        .; then
      break
    fi

    BUILD_EXIT=$?
    if [[ "$attempt" -ge "$MAX_BUILD_RETRIES" ]]; then
      log_error "ACR build failed after ${MAX_BUILD_RETRIES} attempt(s) (last exit ${BUILD_EXIT})."
      log_error "Common causes: Docker Hub anonymous pull-rate limits, ACR build agent capacity."
      exit "$BUILD_EXIT"
    fi

    log_warn "ACR build attempt ${attempt}/${MAX_BUILD_RETRIES} failed (exit ${BUILD_EXIT})."
    log_warn "Sleeping ${BUILD_RETRY_DELAY}s before retry."
    sleep "$BUILD_RETRY_DELAY"
    attempt=$((attempt + 1))
  done

  log_success "ACR build complete: ${REMOTE_IMAGE_REF}"
else
  log_warn "Skipping build (SKIP_BUILD=true); reusing whatever is currently at ${REMOTE_IMAGE_REF}"
  log_warn "Cached image's baked-in IMAGE_SHA may not match git HEAD; the post-deploy assertion may fail accordingly."
fi

# Step 2: Set container image with explicit ACR creds.
log_info "Step 2/4: Configuring App Service container image on ${WEBAPP}"

ACR_USER=$(az acr credential show --name "$ACR_NAME" --query username -o tsv)
ACR_PASS=$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)
if [[ -z "$ACR_USER" || -z "$ACR_PASS" ]]; then
  log_error "Failed to retrieve ACR credentials. Is the admin user enabled on ${ACR_NAME}?"
  log_error "  az acr update --name ${ACR_NAME} --admin-enabled true"
  exit 1
fi

az webapp config container set \
  --name "$WEBAPP" \
  --resource-group "$RESOURCE_GROUP" \
  --container-image-name "$REMOTE_IMAGE_REF" \
  --container-registry-url "https://${REGISTRY_HOST}" \
  --container-registry-user "$ACR_USER" \
  --container-registry-password "$ACR_PASS" \
  >/dev/null

log_success "App Service container set to ${REMOTE_IMAGE_REF}"

# Step 3: Restart.
log_info "Step 3/4: Restarting App Service ${WEBAPP}"
az webapp restart --name "$WEBAPP" --resource-group "$RESOURCE_GROUP"
log_success "Restart issued"

# Step 4: Health poll.
if [[ "$SKIP_HEALTH" == "true" ]]; then
  log_warn "Skipping health poll (SKIP_HEALTH=true)"
  log_success "Deploy complete (health unverified)"
  exit 0
fi

log_info "Step 4/4: Polling ${HEALTH_URL} until 200 + image_sha matches (budget=${MAX_HEALTH_WAIT_SECONDS}s)"
if [[ "$EXPECTED_IMAGE_SHA" == "unknown" ]]; then
  log_warn "  expected_image_sha=unknown (not in a git repo or git rev-parse failed); accepting any image_sha response"
else
  log_info "  expected_image_sha=${EXPECTED_IMAGE_SHA:0:8}"
fi

START=$(date +%s)
DEADLINE=$((START + MAX_HEALTH_WAIT_SECONDS))
attempt=1
last_status="000"

# Extract a JSON field via grep + sed; avoids a hard `jq` dependency on the
# operator's machine. Pattern matches `"field": "value"` with optional spaces;
# returns empty string if the field is absent. Note: callers MUST neutralize a
# non-zero exit (e.g., `... 2>/dev/null || echo ""`) so set -euo pipefail
# doesn't kill the loop when the field is missing — that's the WARN path the
# poll-loop intentionally re-enters, not a fatal error.
extract_json_field() {
  local body="$1"
  local field="$2"
  printf '%s' "$body" \
    | grep -o "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
    | head -n 1 \
    | sed -E "s/\"${field}\"[[:space:]]*:[[:space:]]*\"([^\"]*)\"/\1/"
}

# Poll loop: drives toward "/health 200 AND image_sha matches EXPECTED_IMAGE_SHA".
#
# Three terminal states for a 200 response:
#   1. image_sha matches expected   → [OK] success (break + continue to Step 5)
#   2. image_sha mismatch           → [ERROR] hard fail (exit 1, cached-container)
#   3. image_sha missing            → [WARN] count + continue (cached container
#                                     hasn't swapped yet, OR running container
#                                     predates the IMAGE_SHA pin)
#
# WARN state has an auto-recovery: after WARN_THRESHOLD consecutive cycles, the
# loop fires `az webapp stop && start` once to force a fresh container pull,
# then resets the warn counter and extends the deadline by another full
# MAX_HEALTH_WAIT_SECONDS so the new container has time to boot. Auto-recovery
# triggers at most once per script run; subsequent WARN cycles after that just
# count toward the (extended) deadline.
warn_cycles=0
WARN_THRESHOLD=5
auto_recovery_triggered=0

while true; do
  RESPONSE_BODY=$(curl -s --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "")
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" || echo "000")

  if [[ "$STATUS" == "200" ]]; then
    NOW=$(date +%s)
    REPORTED_IMAGE_SHA=$(extract_json_field "$RESPONSE_BODY" "image_sha" 2>/dev/null || echo "")
    REPORTED_ALEMBIC_HEAD=$(extract_json_field "$RESPONSE_BODY" "alembic_head" 2>/dev/null || echo "")

    if [[ "$EXPECTED_IMAGE_SHA" == "unknown" ]]; then
      log_success "Healthy after $((NOW - START))s (attempt ${attempt}, status ${STATUS})"
      log_warn "  expected_image_sha=unknown (not in a git repo); accepting any image_sha response"
      if [[ -n "$REPORTED_IMAGE_SHA" ]]; then
        log_success "  image_sha=${REPORTED_IMAGE_SHA:0:8}"
      fi
      if [[ -n "$REPORTED_ALEMBIC_HEAD" ]]; then
        log_success "  alembic_head=${REPORTED_ALEMBIC_HEAD}"
      fi
      break
    fi

    if [[ -z "$REPORTED_IMAGE_SHA" ]]; then
      warn_cycles=$((warn_cycles + 1))
      log_warn "image_sha not present in /health response (likely cached container, attempt ${attempt}, warn_cycles=${warn_cycles}/${WARN_THRESHOLD}) — extending poll"

      if [[ "$warn_cycles" -ge "$WARN_THRESHOLD" ]] && [[ "$auto_recovery_triggered" -eq 0 ]]; then
        log_warn "Reached ${WARN_THRESHOLD} consecutive WARN cycles without image_sha; auto-triggering az webapp stop && start to force a fresh container pull"
        if az webapp stop --name "$WEBAPP" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
          log_info "  az webapp stop issued"
        else
          log_warn "  az webapp stop failed (continuing)"
        fi
        sleep 5
        if az webapp start --name "$WEBAPP" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
          log_info "  az webapp start issued"
        else
          log_warn "  az webapp start failed (continuing)"
        fi
        auto_recovery_triggered=1
        warn_cycles=0
        DEADLINE=$((NOW + MAX_HEALTH_WAIT_SECONDS))
        log_warn "Stop/start dispatched; reset warn counter and extended deadline by ${MAX_HEALTH_WAIT_SECONDS}s"
      fi
    elif [[ "$REPORTED_IMAGE_SHA" != "$EXPECTED_IMAGE_SHA" ]]; then
      log_error "image_sha mismatch (got=${REPORTED_IMAGE_SHA:0:8} expected=${EXPECTED_IMAGE_SHA:0:8})"
      log_error "This is the cached-container false-positive: az webapp restart returned 200 from the OLD container."
      log_error "Recovery: force a fresh pull. Two options:"
      log_error "  1. az webapp config container set --name ${WEBAPP} --resource-group ${RESOURCE_GROUP} --container-image-name ${REMOTE_IMAGE_REF} && az webapp restart --name ${WEBAPP} --resource-group ${RESOURCE_GROUP}"
      log_error "  2. az webapp stop --name ${WEBAPP} --resource-group ${RESOURCE_GROUP} && sleep 5 && az webapp start --name ${WEBAPP} --resource-group ${RESOURCE_GROUP}"
      log_error "Then re-run this script."
      exit 1
    else
      log_success "image_sha matches"
      log_success "Healthy after $((NOW - START))s (attempt ${attempt}, status ${STATUS})"
      log_success "  image_sha=${REPORTED_IMAGE_SHA:0:8} (matches expected)"
      if [[ -n "$REPORTED_ALEMBIC_HEAD" ]]; then
        log_success "  alembic_head=${REPORTED_ALEMBIC_HEAD}"
      fi
      break
    fi
  fi

  NOW=$(date +%s)
  if [[ "$NOW" -ge "$DEADLINE" ]]; then
    log_error "Health check did not reach 200 + matching image_sha within ${MAX_HEALTH_WAIT_SECONDS}s (last status=${STATUS}, warn_cycles=${warn_cycles}, auto_recovery=${auto_recovery_triggered})"
    log_error "Inspect logs:"
    log_error "  az webapp log tail --name ${WEBAPP} --resource-group ${RESOURCE_GROUP}"
    log_error "  az webapp log download --name ${WEBAPP} --resource-group ${RESOURCE_GROUP} --log-file /tmp/presenton_logs.zip"
    exit 1
  fi

  if [[ "$STATUS" != "$last_status" ]]; then
    log_info "  attempt ${attempt} status=${STATUS}"
    last_status="$STATUS"
  fi
  attempt=$((attempt + 1))
  sleep 5
done

# Step 5: Post-deploy smoke (Phase 11.0c.4 orchestrator).
# Skipped when SKIP_SMOKE=true OR when smoke env vars (PRESENTATION_ID
# / ADMIN_USER / ADMIN_PASS) aren't available locally. Failure here
# fails the whole deploy.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$SKIP_SMOKE" == "true" ]]; then
  log_warn "Skipping post-deploy smoke (SKIP_SMOKE=true)"
  log_success "Deploy complete (smoke skipped)"
  exit 0
fi

if [[ -z "${PRESENTATION_ID:-}" ]] || [[ -z "${ADMIN_USER:-}" ]] || [[ -z "${ADMIN_PASS:-}" ]]; then
  log_warn "Skipping post-deploy smoke: PRESENTATION_ID / ADMIN_USER / ADMIN_PASS not set in env."
  log_warn "Set all three to enable the smoke-post-deploy.sh orchestrator (or set SKIP_SMOKE=true to suppress this warning)."
  log_success "Deploy complete (smoke skipped — env vars unset)"
  exit 0
fi

if [[ ! -x "${SCRIPT_DIR}/smoke-post-deploy.sh" ]]; then
  log_error "${SCRIPT_DIR}/smoke-post-deploy.sh missing or not executable."
  log_error "Either chmod +x it or set SKIP_SMOKE=true to bypass."
  exit 1
fi

log_info "Step 5/5: Running smoke-post-deploy.sh against ${BASE_URL:-${HEALTH_URL%/*}}"
SMOKE_BASE_URL="${BASE_URL:-${HEALTH_URL%/health}}"
if BASE_URL="$SMOKE_BASE_URL" \
   PRESENTATION_ID="$PRESENTATION_ID" \
   ADMIN_USER="$ADMIN_USER" \
   ADMIN_PASS="$ADMIN_PASS" \
   bash "${SCRIPT_DIR}/smoke-post-deploy.sh"; then
  log_success "Post-deploy smoke passed"
  log_success "Deploy complete + smoke verified"
  exit 0
else
  SMOKE_EXIT=$?
  log_error "Post-deploy smoke failed (exit ${SMOKE_EXIT})"
  log_error "The container deployed successfully (image_sha matched) but at least one"
  log_error "smoke probe regressed. Inspect logs above + the per-feature smoke output,"
  log_error "or rerun the failing sub-smoke directly with verbose curl."
  exit "$SMOKE_EXIT"
fi

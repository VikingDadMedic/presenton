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
if [[ "$SKIP_BUILD" != "true" ]]; then
  log_info "Step 1/4: Building ${REMOTE_IMAGE_REF} via az acr build (registry=${ACR_NAME})"

  attempt=1
  while true; do
    if az acr build \
        --registry "$ACR_NAME" \
        --image "${IMAGE_NAME}:${TAG}" \
        --file Dockerfile .; then
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

log_info "Step 4/4: Polling ${HEALTH_URL} until 200 (budget=${MAX_HEALTH_WAIT_SECONDS}s)"

START=$(date +%s)
DEADLINE=$((START + MAX_HEALTH_WAIT_SECONDS))
attempt=1
last_status="000"

while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" || echo "000")
  if [[ "$STATUS" == "200" ]]; then
    NOW=$(date +%s)
    log_success "Healthy after $((NOW - START))s (attempt ${attempt}, status ${STATUS})"
    exit 0
  fi

  NOW=$(date +%s)
  if [[ "$NOW" -ge "$DEADLINE" ]]; then
    log_error "Health check did not reach 200 within ${MAX_HEALTH_WAIT_SECONDS}s (last status=${STATUS})"
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

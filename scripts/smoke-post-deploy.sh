#!/usr/bin/env bash
#
# scripts/smoke-post-deploy.sh
#
# Single-entry orchestrator for post-deploy validation. Calls:
#   - scripts/smoke-narration.sh  (Phase 9 narration v1d)
#   - scripts/smoke-chat.sh       (Phase 9 chat surface)
#   - PPTX / JSON / embed probes  (export coverage that wasn't in
#                                  smoke-narration.sh)
#
# Wired into scripts/redeploy-azure.sh: after /health 200 + image_sha
# match, redeploy-azure.sh invokes this script unless `SKIP_SMOKE=true`.
# Failure here fails the whole deploy.
#
# Required env (forwarded to the per-feature scripts):
#   BASE_URL          e.g. https://presenton-app.azurewebsites.net
#   PRESENTATION_ID   uuid of an existing presentation owned by ADMIN_USER
#   ADMIN_USER        admin login username
#   ADMIN_PASS        admin login password
#
# Optional env:
#   SKIP_NARRATION    skip the narration smoke (default: false)
#   SKIP_CHAT         skip the chat smoke      (default: false)
#   SKIP_EXPORTS      skip the PPTX/JSON/embed probes (default: false)
#   COOKIE_JAR        cookie jar path (default: /tmp/presenton_smoke_cookies.txt)
#   TMPDIR_SMOKE      scratch dir (default: /tmp/presenton_smoke)
#
# Exits non-zero if any non-skipped sub-smoke or probe fails.
#

set -uo pipefail

: "${BASE_URL:?BASE_URL required (e.g. https://presenton-app.azurewebsites.net)}"
: "${PRESENTATION_ID:?PRESENTATION_ID required}"
: "${ADMIN_USER:?ADMIN_USER required}"
: "${ADMIN_PASS:?ADMIN_PASS required}"

SKIP_NARRATION="${SKIP_NARRATION:-false}"
SKIP_CHAT="${SKIP_CHAT:-false}"
SKIP_EXPORTS="${SKIP_EXPORTS:-false}"

COOKIE_JAR="${COOKIE_JAR:-/tmp/presenton_smoke_cookies.txt}"
TMPDIR_SMOKE="${TMPDIR_SMOKE:-/tmp/presenton_smoke}"
mkdir -p "$TMPDIR_SMOKE"

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

OVERALL_FAILED=0
SECTION_RESULTS=()

run_section() {
  # run_section LABEL CMD...
  local label="$1"
  shift
  echo
  echo "${BLUE}################################################################################${NC}"
  echo "${BLUE}>>> ${label}${NC}"
  echo "${BLUE}################################################################################${NC}"
  if "$@"; then
    SECTION_RESULTS+=("${GREEN}PASS${NC} ${label}")
  else
    SECTION_RESULTS+=("${RED}FAIL${NC} ${label}")
    OVERALL_FAILED=1
  fi
}

# --- 1. Narration smoke ---
if [[ "$SKIP_NARRATION" != "true" ]]; then
  if [[ ! -x "${SCRIPT_DIR}/smoke-narration.sh" ]]; then
    echo "${RED}[ERROR] ${SCRIPT_DIR}/smoke-narration.sh missing or not executable${NC}" >&2
    OVERALL_FAILED=1
    SECTION_RESULTS+=("${RED}FAIL${NC} narration (missing script)")
  else
    run_section "Narration smoke (smoke-narration.sh)" \
      bash "${SCRIPT_DIR}/smoke-narration.sh"
  fi
else
  echo "${YELLOW}--- skipped: narration (SKIP_NARRATION=true) ---${NC}"
fi

# --- 2. Chat smoke ---
if [[ "$SKIP_CHAT" != "true" ]]; then
  if [[ ! -x "${SCRIPT_DIR}/smoke-chat.sh" ]]; then
    echo "${RED}[ERROR] ${SCRIPT_DIR}/smoke-chat.sh missing or not executable${NC}" >&2
    OVERALL_FAILED=1
    SECTION_RESULTS+=("${RED}FAIL${NC} chat (missing script)")
  else
    run_section "Chat smoke (smoke-chat.sh)" \
      bash "${SCRIPT_DIR}/smoke-chat.sh"
  fi
else
  echo "${YELLOW}--- skipped: chat (SKIP_CHAT=true) ---${NC}"
fi

# --- 3. Missing-export probes (PPTX / JSON / embed) ---
# These were not part of smoke-narration.sh's scope. They round out the
# format-coverage matrix so post-deploy "did anything regress?" answers
# include all 6 export formats, not just HTML/PDF/video.
if [[ "$SKIP_EXPORTS" != "true" ]]; then
  echo
  echo "${BLUE}################################################################################${NC}"
  echo "${BLUE}>>> Missing-export probes (PPTX / JSON / embed)${NC}"
  echo "${BLUE}################################################################################${NC}"

  EXPORT_FAILED=0

  http_get() {
    local url="$1"
    local outfile="$2"
    shift 2
    curl -s -o "$outfile" -w "%{http_code}" -b "$COOKIE_JAR" "$@" "$url" || echo "000"
  }

  http_post() {
    local url="$1"
    local outfile="$2"
    local body="$3"
    curl -s -o "$outfile" -w "%{http_code}" -b "$COOKIE_JAR" \
      -X POST "$url" \
      -H "Content-Type: application/json" \
      -d "$body" || echo "000"
  }

  # Login (the per-feature smokes write the cookie jar; if both were
  # skipped we still need it). Idempotent — re-login is fine.
  HTTP_CODE=$(curl -s -o "${TMPDIR_SMOKE}/login_orchestrator.json" -w "%{http_code}" \
    -c "$COOKIE_JAR" \
    -X POST "${BASE_URL}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}" || echo "000")
  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "  ${RED}[FAIL]${NC} Login (HTTP ${HTTP_CODE}); aborting export probes"
    EXPORT_FAILED=1
  else
    echo "  ${GREEN}[PASS]${NC} Login (HTTP ${HTTP_CODE})"

    # PPTX probe — POST /api/v1/ppt/presentation/export with export_as=pptx
    # is the canonical PPTX route (operationId `export_presentation`). The
    # NextJS app does NOT have an /api/export-as-pptx surface; PPTX
    # generation goes directly through FastAPI -> python-pptx.
    HTTP_CODE=$(http_post \
      "${BASE_URL}/api/v1/ppt/presentation/export" \
      "${TMPDIR_SMOKE}/export_pptx.json" \
      "{\"id\":\"${PRESENTATION_ID}\",\"export_as\":\"pptx\"}")
    if [[ "$HTTP_CODE" == "200" ]]; then
      PPTX_PATH=$(python3 -c "
import json
try:
    d = json.load(open('${TMPDIR_SMOKE}/export_pptx.json'))
    print(d.get('path',''))
except Exception:
    print('')
" 2>/dev/null)
      if [[ -n "$PPTX_PATH" ]]; then
        echo "  ${GREEN}[PASS]${NC} PPTX export (HTTP 200, path=${PPTX_PATH##*/})"
      else
        echo "  ${RED}[FAIL]${NC} PPTX export 200 but no path in response"
        EXPORT_FAILED=1
      fi
    else
      echo "  ${RED}[FAIL]${NC} PPTX export (HTTP ${HTTP_CODE})"
      EXPORT_FAILED=1
    fi

    # JSON probe — GET /api/v1/ppt/presentation/export/json/{id} returns the
    # full presentation as structured JSON.
    HTTP_CODE=$(http_get \
      "${BASE_URL}/api/v1/ppt/presentation/export/json/${PRESENTATION_ID}" \
      "${TMPDIR_SMOKE}/export_json.json")
    if [[ "$HTTP_CODE" == "200" ]]; then
      VALID=$(python3 -c "
import json
try:
    d = json.load(open('${TMPDIR_SMOKE}/export_json.json'))
    print('1' if isinstance(d, dict) and d.get('slides') is not None else '0')
except Exception:
    print('0')
" 2>/dev/null)
      if [[ "$VALID" == "1" ]]; then
        SLIDE_COUNT=$(python3 -c "
import json
try:
    d = json.load(open('${TMPDIR_SMOKE}/export_json.json'))
    print(len(d.get('slides') or []))
except Exception:
    print(0)
" 2>/dev/null)
        echo "  ${GREEN}[PASS]${NC} JSON export (HTTP 200, slides=${SLIDE_COUNT})"
      else
        echo "  ${RED}[FAIL]${NC} JSON export 200 but missing 'slides' field"
        EXPORT_FAILED=1
      fi
    else
      echo "  ${RED}[FAIL]${NC} JSON export (HTTP ${HTTP_CODE})"
      EXPORT_FAILED=1
    fi

    # Embed probe — GET /embed/{id}?mode=showcase. Acceptable: 200 OR 403
    # (not public). 5xx is a regression.
    HTTP_CODE=$(curl -s -o "${TMPDIR_SMOKE}/embed.html" -w "%{http_code}" \
      -b "$COOKIE_JAR" \
      "${BASE_URL}/embed/${PRESENTATION_ID}?mode=showcase" || echo "000")
    if [[ "$HTTP_CODE" == "200" ]]; then
      echo "  ${GREEN}[PASS]${NC} Embed (HTTP 200, public/owner access)"
    elif [[ "$HTTP_CODE" == "403" ]]; then
      echo "  ${GREEN}[PASS]${NC} Embed (HTTP 403, presentation not public — acceptable contract)"
    else
      echo "  ${RED}[FAIL]${NC} Embed (HTTP ${HTTP_CODE})"
      EXPORT_FAILED=1
    fi
  fi

  if [[ "$EXPORT_FAILED" == "0" ]]; then
    SECTION_RESULTS+=("${GREEN}PASS${NC} export probes (PPTX / JSON / embed)")
  else
    SECTION_RESULTS+=("${RED}FAIL${NC} export probes (PPTX / JSON / embed)")
    OVERALL_FAILED=1
  fi
else
  echo "${YELLOW}--- skipped: exports (SKIP_EXPORTS=true) ---${NC}"
fi

echo
echo "${BLUE}=== Post-deploy smoke summary ===${NC}"
for r in "${SECTION_RESULTS[@]}"; do
  echo "  - ${r}"
done

if [[ "$OVERALL_FAILED" != "0" ]]; then
  echo
  echo "${RED}One or more sections failed. Investigate logs above.${NC}"
  echo "Recovery hints:"
  echo "  - For chat/narration failures: rerun the failing sub-smoke directly with verbose curl (-v)."
  echo "  - For export failures: check that PRESENTATION_ID still exists and ADMIN_USER owns it."
  echo "  - For ALL failures: check /health image_sha to confirm the new container is actually serving."
  exit 1
fi

echo
echo "${GREEN}All post-deploy smoke probes passed.${NC}"
exit 0

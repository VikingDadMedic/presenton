#!/usr/bin/env bash
#
# scripts/smoke-narration.sh
#
# End-to-end smoke validation for the narration v1d feature surface plus
# the HTML zip + PDF export paths. Designed to be runnable both locally
# and against a deployed environment.
#
# Required env:
#   BASE_URL          e.g. https://presenton-app.azurewebsites.net
#   PRESENTATION_ID   uuid of an existing presentation that has speaker notes
#   ADMIN_USER        admin login username
#   ADMIN_PASS        admin login password
#
# Optional env:
#   COOKIE_JAR        cookie jar path (default: /tmp/presenton_smoke_cookies.txt)
#   SKIP_HTML         skip HTML export check (default: false)
#   SKIP_PDF          skip PDF export check  (default: false)
#   SKIP_VIDEO        skip video soundtrack export check (default: true)
#   VIDEO_TIMEOUT     curl timeout for video export sync request (default: 240)
#
# Exits non-zero if any required assertion fails.
#

set -uo pipefail

: "${BASE_URL:?BASE_URL required (e.g. https://presenton-app.azurewebsites.net)}"
: "${PRESENTATION_ID:?PRESENTATION_ID required}"
: "${ADMIN_USER:?ADMIN_USER required}"
: "${ADMIN_PASS:?ADMIN_PASS required}"

COOKIE_JAR="${COOKIE_JAR:-/tmp/presenton_smoke_cookies.txt}"
TMPDIR_SMOKE="${TMPDIR_SMOKE:-/tmp/presenton_smoke}"
SKIP_HTML="${SKIP_HTML:-false}"
SKIP_PDF="${SKIP_PDF:-false}"
SKIP_VIDEO="${SKIP_VIDEO:-true}"
VIDEO_TIMEOUT="${VIDEO_TIMEOUT:-240}"

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

PASSED=0
FAILED=0
TOTAL=0
FAILURES=()

assert_pass() {
  PASSED=$((PASSED + 1))
  TOTAL=$((TOTAL + 1))
  echo "  ${GREEN}[PASS]${NC} $*"
}

assert_fail() {
  FAILED=$((FAILED + 1))
  TOTAL=$((TOTAL + 1))
  FAILURES+=("$*")
  echo "  ${RED}[FAIL]${NC} $*"
}

step() {
  echo
  echo "${BLUE}>>> $*${NC}"
}

skip() {
  echo "${YELLOW}--- skipped: $* ---${NC}"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "${RED}Missing required command: $1${NC}" >&2
    exit 1
  fi
}

require_command curl
require_command python3

http_get() {
  # http_get URL OUTFILE [extra-curl-args...]
  local url="$1"
  local outfile="$2"
  shift 2
  curl -s -o "$outfile" -w "%{http_code}" -b "$COOKIE_JAR" "$@" "$url" || echo "000"
}

http_post() {
  # http_post URL OUTFILE BODY_JSON
  local url="$1"
  local outfile="$2"
  local body="$3"
  curl -s -o "$outfile" -w "%{http_code}" -b "$COOKIE_JAR" \
    -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$body" || echo "000"
}

json_field() {
  # json_field FILE FIELD_PATH
  python3 -c "
import json, sys
try:
    d = json.load(open('$1'))
    parts = '$2'.split('.')
    val = d
    for p in parts:
        if isinstance(val, dict):
            val = val.get(p)
        else:
            val = None
            break
    print('' if val is None else val)
except Exception as e:
    print('')
" 2>/dev/null
}

# --- 1. Login ---
step "Login as ${ADMIN_USER}"
HTTP_CODE=$(curl -s -o "${TMPDIR_SMOKE}/login.json" -w "%{http_code}" \
  -c "$COOKIE_JAR" \
  -X POST "${BASE_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}" || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
  assert_pass "Login (HTTP ${HTTP_CODE})"
else
  assert_fail "Login (HTTP ${HTTP_CODE})"
fi

# --- 2. /health ---
step "Health endpoint"
HTTP_CODE=$(http_get "${BASE_URL}/health" "${TMPDIR_SMOKE}/health.json")
if [[ "$HTTP_CODE" == "200" ]]; then
  STATUS=$(json_field "${TMPDIR_SMOKE}/health.json" "status")
  if [[ "$STATUS" == "ok" ]]; then
    assert_pass "/health (HTTP ${HTTP_CODE}, status=${STATUS})"
  else
    assert_fail "/health returned non-ok status: ${STATUS}"
  fi
else
  assert_fail "/health (HTTP ${HTTP_CODE})"
fi

# --- 3. /template/readiness ---
step "Template readiness"
HTTP_CODE=$(http_get "${BASE_URL}/api/v1/ppt/template/readiness" "${TMPDIR_SMOKE}/template.json")
if [[ "$HTTP_CODE" == "200" ]]; then
  READY=$(json_field "${TMPDIR_SMOKE}/template.json" "ready")
  if [[ "$READY" == "True" ]]; then
    assert_pass "/template/readiness ready=true"
  else
    REASON=$(json_field "${TMPDIR_SMOKE}/template.json" "reason")
    assert_fail "/template/readiness ready=${READY} reason=${REASON}"
  fi
else
  assert_fail "/template/readiness (HTTP ${HTTP_CODE})"
fi

# --- 4. /narration/readiness ---
step "Narration readiness"
HTTP_CODE=$(http_get "${BASE_URL}/api/v1/ppt/narration/readiness" "${TMPDIR_SMOKE}/narration_ready.json")
if [[ "$HTTP_CODE" == "200" ]]; then
  READY=$(json_field "${TMPDIR_SMOKE}/narration_ready.json" "ready")
  if [[ "$READY" == "True" ]]; then
    assert_pass "/narration/readiness ready=true"
  else
    REASON=$(json_field "${TMPDIR_SMOKE}/narration_ready.json" "reason")
    assert_fail "/narration/readiness ready=${READY} reason=${REASON}"
  fi
else
  assert_fail "/narration/readiness (HTTP ${HTTP_CODE})"
fi

# --- 5. /narration/voices ---
step "Narration voices catalog"
HTTP_CODE=$(http_get "${BASE_URL}/api/v1/ppt/narration/voices" "${TMPDIR_SMOKE}/voices.json")
if [[ "$HTTP_CODE" == "200" ]]; then
  VOICE_COUNT=$(python3 -c "import json; d=json.load(open('${TMPDIR_SMOKE}/voices.json')); print(len(d.get('voices',[])))")
  if [[ "$VOICE_COUNT" -gt 0 ]]; then
    assert_pass "/narration/voices (HTTP ${HTTP_CODE}, voice_count=${VOICE_COUNT})"
  else
    assert_fail "/narration/voices returned 0 voices"
  fi
else
  assert_fail "/narration/voices (HTTP ${HTTP_CODE})"
fi

# --- 6. /narration/estimate ---
step "Narration estimate for ${PRESENTATION_ID}"
HTTP_CODE=$(http_get "${BASE_URL}/api/v1/ppt/narration/presentation/${PRESENTATION_ID}/estimate" "${TMPDIR_SMOKE}/estimate.json")
if [[ "$HTTP_CODE" == "200" ]]; then
  TOTAL_SLIDES=$(json_field "${TMPDIR_SMOKE}/estimate.json" "total_slides")
  TOTAL_CHARS=$(json_field "${TMPDIR_SMOKE}/estimate.json" "total_character_count")
  if [[ "${TOTAL_SLIDES:-0}" -gt 0 && "${TOTAL_CHARS:-0}" -gt 0 ]]; then
    assert_pass "/narration/estimate slides=${TOTAL_SLIDES} chars=${TOTAL_CHARS}"
  else
    assert_fail "/narration/estimate empty/zero (slides=${TOTAL_SLIDES} chars=${TOTAL_CHARS})"
  fi
else
  assert_fail "/narration/estimate (HTTP ${HTTP_CODE})"
fi

# --- 7. /narration/usage/summary ---
step "Narration usage summary (period=day)"
HTTP_CODE=$(http_get "${BASE_URL}/api/v1/ppt/narration/usage/summary?period=day" "${TMPDIR_SMOKE}/usage.json")
if [[ "$HTTP_CODE" == "200" ]]; then
  TOTAL_REQS=$(json_field "${TMPDIR_SMOKE}/usage.json" "total_request_count")
  TOTAL_CHARS=$(json_field "${TMPDIR_SMOKE}/usage.json" "total_character_count")
  assert_pass "/narration/usage/summary requests=${TOTAL_REQS:-0} chars=${TOTAL_CHARS:-0}"
else
  assert_fail "/narration/usage/summary (HTTP ${HTTP_CODE})"
fi

# --- 8. HTML export ---
if [[ "$SKIP_HTML" != "true" ]]; then
  step "HTML export with narration zip"
  HTTP_CODE=$(http_post "${BASE_URL}/api/export-as-html" "${TMPDIR_SMOKE}/html.json" \
    "{\"id\":\"${PRESENTATION_ID}\",\"title\":\"smoke-html\"}")
  if [[ "$HTTP_CODE" == "200" ]]; then
    SUCCESS=$(json_field "${TMPDIR_SMOKE}/html.json" "success")
    PATH_RESULT=$(json_field "${TMPDIR_SMOKE}/html.json" "path")
    if [[ "$SUCCESS" == "True" ]]; then
      assert_pass "/api/export-as-html success=true path=${PATH_RESULT}"
    else
      ERROR=$(json_field "${TMPDIR_SMOKE}/html.json" "error")
      assert_fail "/api/export-as-html success=${SUCCESS} error=${ERROR}"
    fi
  else
    assert_fail "/api/export-as-html (HTTP ${HTTP_CODE})"
  fi
else
  step "HTML export"
  skip "SKIP_HTML=true"
fi

# --- 9. PDF export ---
if [[ "$SKIP_PDF" != "true" ]]; then
  step "PDF export"
  HTTP_CODE=$(curl -s -o "${TMPDIR_SMOKE}/pdf.bin" -w "%{http_code}" \
    -D "${TMPDIR_SMOKE}/pdf_headers.txt" \
    -b "$COOKIE_JAR" \
    -X POST "${BASE_URL}/api/export-as-pdf" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${PRESENTATION_ID}\",\"title\":\"smoke-pdf\"}" || echo "000")
  if [[ "$HTTP_CODE" == "200" ]]; then
    if grep -qi "x-export-notice" "${TMPDIR_SMOKE}/pdf_headers.txt"; then
      NOTICE=$(grep -i "x-export-notice" "${TMPDIR_SMOKE}/pdf_headers.txt" | head -1 | tr -d '\r')
      assert_pass "/api/export-as-pdf (HTTP ${HTTP_CODE}, ${NOTICE})"
    else
      assert_pass "/api/export-as-pdf (HTTP ${HTTP_CODE}, no x-export-notice header)"
    fi
  else
    assert_fail "/api/export-as-pdf (HTTP ${HTTP_CODE})"
  fi
else
  step "PDF export"
  skip "SKIP_PDF=true"
fi

# --- 10. Video export with soundtrack (optional, slow) ---
if [[ "$SKIP_VIDEO" != "true" ]]; then
  step "Video export with narration soundtrack"
  HTTP_CODE=$(curl -s -o "${TMPDIR_SMOKE}/video_resp.json" -w "%{http_code}" \
    --max-time "$VIDEO_TIMEOUT" \
    -b "$COOKIE_JAR" \
    -X POST "${BASE_URL}/api/export-as-video" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${PRESENTATION_ID}\",\"title\":\"smoke-video\",\"useNarrationAsSoundtrack\":true}" || echo "000")
  if [[ "$HTTP_CODE" == "200" ]]; then
    SUCCESS=$(json_field "${TMPDIR_SMOKE}/video_resp.json" "success")
    if [[ "$SUCCESS" == "True" ]]; then
      assert_pass "/api/export-as-video soundtrack=true success=true"
    else
      JOB_ID=$(json_field "${TMPDIR_SMOKE}/video_resp.json" "jobId")
      if [[ -n "$JOB_ID" ]]; then
        assert_pass "/api/export-as-video accepted, jobId=${JOB_ID}"
      else
        ERROR=$(json_field "${TMPDIR_SMOKE}/video_resp.json" "error")
        assert_fail "/api/export-as-video success=${SUCCESS} error=${ERROR}"
      fi
    fi
  else
    assert_fail "/api/export-as-video (HTTP ${HTTP_CODE})"
  fi
else
  step "Video export with narration soundtrack"
  skip "SKIP_VIDEO=true (set SKIP_VIDEO=false to include)"
fi

echo
echo "=================================================="
echo "Smoke summary: ${PASSED}/${TOTAL} passed, ${FAILED} failed"
echo "=================================================="

if [[ "$FAILED" -gt 0 ]]; then
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo "  - ${f}"
  done
  exit 1
fi
exit 0

#!/usr/bin/env bash
#
# scripts/smoke-chat.sh
#
# End-to-end smoke validation for the Phase 9 chat surface (4 endpoints +
# the streaming SSE path). Mirrors the structure of scripts/smoke-narration
# .sh: cookie-jar login, assert_pass/assert_fail accumulators, exit 1 if
# any required probe fails.
#
# Required env:
#   BASE_URL          e.g. https://presenton-app.azurewebsites.net
#   PRESENTATION_ID   uuid of an existing presentation owned by ADMIN_USER
#   ADMIN_USER        admin login username
#   ADMIN_PASS        admin login password
#
# Optional env:
#   COOKIE_JAR        cookie jar path (default: /tmp/presenton_smoke_cookies.txt)
#   TMPDIR_SMOKE      scratch dir (default: /tmp/presenton_smoke)
#   SKIP_SYNC         skip sync POST /chat/message check (default: false)
#   SKIP_STREAM       skip SSE stream check             (default: false)
#   STREAM_TIMEOUT    seconds to wait for first SSE byte (default: 30)
#   CHAT_PROBE_MSG    sync probe message  (default: "Just say hello.")
#   CHAT_PROBE_STREAM_MSG stream probe message (default: same as sync)
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
SKIP_SYNC="${SKIP_SYNC:-false}"
SKIP_STREAM="${SKIP_STREAM:-false}"
STREAM_TIMEOUT="${STREAM_TIMEOUT:-30}"
CHAT_PROBE_MSG="${CHAT_PROBE_MSG:-Just say hello.}"
CHAT_PROBE_STREAM_MSG="${CHAT_PROBE_STREAM_MSG:-$CHAT_PROBE_MSG}"

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

json_array_length() {
  # json_array_length FILE
  python3 -c "
import json
try:
    d = json.load(open('$1'))
    if isinstance(d, list):
        print(len(d))
    elif isinstance(d, dict):
        # Some endpoints wrap arrays; try common keys.
        for key in ('messages', 'items', 'results'):
            v = d.get(key)
            if isinstance(v, list):
                print(len(v))
                break
        else:
            print(0)
    else:
        print(0)
except Exception:
    print(0)
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
  echo
  echo "${RED}=== Login required for the rest of the smoke. Aborting early. ===${NC}"
  exit 1
fi

# --- 2. /health (sanity check that the IMAGE_SHA pin is live; non-fatal) ---
step "/health sanity"
HTTP_CODE=$(http_get "${BASE_URL}/health" "${TMPDIR_SMOKE}/health.json")
if [[ "$HTTP_CODE" == "200" ]]; then
  IMAGE_SHA=$(json_field "${TMPDIR_SMOKE}/health.json" "image_sha")
  ALEMBIC_HEAD=$(json_field "${TMPDIR_SMOKE}/health.json" "alembic_head")
  assert_pass "/health (image_sha=${IMAGE_SHA:0:8} alembic_head=${ALEMBIC_HEAD})"
else
  assert_fail "/health (HTTP ${HTTP_CODE})"
fi

# --- 3. GET /chat/conversations ---
step "List chat conversations for ${PRESENTATION_ID}"
HTTP_CODE=$(http_get "${BASE_URL}/api/v1/ppt/chat/conversations?presentation_id=${PRESENTATION_ID}" \
  "${TMPDIR_SMOKE}/chat_conversations.json")
if [[ "$HTTP_CODE" == "200" ]]; then
  COUNT=$(json_array_length "${TMPDIR_SMOKE}/chat_conversations.json")
  assert_pass "/chat/conversations (HTTP ${HTTP_CODE}, count=${COUNT})"
else
  assert_fail "/chat/conversations (HTTP ${HTTP_CODE})"
fi

# --- 4. GET /chat/history with synthetic conversation_id ---
# Synthetic UUID intentionally won't exist; we accept 200 (empty messages list)
# OR 404 (handler chose to 404 on missing thread). Anything else (5xx, 401)
# is a regression.
SYNTHETIC_CONV_ID="00000000-0000-0000-0000-000000000001"
step "Get chat history (synthetic conversation_id=${SYNTHETIC_CONV_ID})"
HTTP_CODE=$(http_get \
  "${BASE_URL}/api/v1/ppt/chat/history?presentation_id=${PRESENTATION_ID}&conversation_id=${SYNTHETIC_CONV_ID}" \
  "${TMPDIR_SMOKE}/chat_history.json")
if [[ "$HTTP_CODE" == "200" ]]; then
  COUNT=$(json_array_length "${TMPDIR_SMOKE}/chat_history.json")
  assert_pass "/chat/history (HTTP 200, messages=${COUNT})"
elif [[ "$HTTP_CODE" == "404" ]]; then
  assert_pass "/chat/history (HTTP 404, synthetic conversation_id not found — acceptable contract)"
else
  assert_fail "/chat/history (HTTP ${HTTP_CODE})"
fi

# --- 5. POST /chat/message (sync) ---
if [[ "$SKIP_SYNC" != "true" ]]; then
  step "Sync chat probe (\"${CHAT_PROBE_MSG}\")"
  PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'presentation_id': '${PRESENTATION_ID}', 'message': '''${CHAT_PROBE_MSG}'''}))")
  HTTP_CODE=$(http_post "${BASE_URL}/api/v1/ppt/chat/message" \
    "${TMPDIR_SMOKE}/chat_message.json" \
    "$PAYLOAD")
  if [[ "$HTTP_CODE" == "200" ]]; then
    CONV_ID=$(json_field "${TMPDIR_SMOKE}/chat_message.json" "conversation_id")
    RESP_LEN=$(python3 -c "import json; d=json.load(open('${TMPDIR_SMOKE}/chat_message.json')); print(len((d.get('response') or '')))")
    if [[ -n "$CONV_ID" && "${RESP_LEN:-0}" -gt 0 ]]; then
      assert_pass "/chat/message (HTTP 200, conv_id=${CONV_ID:0:8} resp_len=${RESP_LEN})"
    else
      assert_fail "/chat/message empty response (conv_id=${CONV_ID} resp_len=${RESP_LEN:-0})"
    fi
  else
    assert_fail "/chat/message (HTTP ${HTTP_CODE})"
  fi
else
  step "Sync chat probe"
  skip "SKIP_SYNC=true"
fi

# --- 6. POST /chat/message/stream (SSE) ---
# We don't try to fully consume the stream here; the assertion is just that
# at least one byte of SSE data arrives within STREAM_TIMEOUT seconds. That
# rules out the regression where the stream connection succeeds but the
# generator never yields (the user-visible failure mode pre-Phase-9.5).
if [[ "$SKIP_STREAM" != "true" ]]; then
  step "Stream chat probe (curl -N, ${STREAM_TIMEOUT}s timeout)"
  STREAM_OUT="${TMPDIR_SMOKE}/chat_stream.sse"
  STREAM_CODE_FILE="${TMPDIR_SMOKE}/chat_stream.code"

  PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'presentation_id': '${PRESENTATION_ID}', 'message': '''${CHAT_PROBE_STREAM_MSG}'''}))")

  # curl -N disables buffering so SSE bytes appear immediately. --max-time
  # bounds the wall clock so the script never hangs.
  set +e
  curl -sS -N \
    --max-time "$STREAM_TIMEOUT" \
    -o "$STREAM_OUT" \
    -w "%{http_code}" \
    -b "$COOKIE_JAR" \
    -X POST "${BASE_URL}/api/v1/ppt/chat/message/stream" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream" \
    -d "$PAYLOAD" > "$STREAM_CODE_FILE"
  STREAM_RC=$?
  set -e

  STREAM_HTTP=$(cat "$STREAM_CODE_FILE" 2>/dev/null || echo "000")
  STREAM_BYTES=$(wc -c < "$STREAM_OUT" 2>/dev/null | tr -d ' ')

  # Acceptable outcomes:
  #   - HTTP 200 + bytes received  -> SSE alive
  #   - curl rc 28 (timeout) + bytes received -> SSE alive but probe waited
  #     out the full deadline (still proves the stream emitted).
  if [[ "$STREAM_HTTP" == "200" && "${STREAM_BYTES:-0}" -gt 0 ]]; then
    assert_pass "/chat/message/stream (HTTP 200, ${STREAM_BYTES} bytes received)"
  elif [[ "$STREAM_RC" == "28" && "${STREAM_BYTES:-0}" -gt 0 ]]; then
    assert_pass "/chat/message/stream (timeout after ${STREAM_TIMEOUT}s but ${STREAM_BYTES} bytes received — SSE alive)"
  elif [[ "$STREAM_HTTP" == "200" ]]; then
    assert_fail "/chat/message/stream (HTTP 200 but 0 bytes received — generator stalled)"
  else
    assert_fail "/chat/message/stream (HTTP=${STREAM_HTTP} rc=${STREAM_RC} bytes=${STREAM_BYTES:-0})"
  fi
else
  step "Stream chat probe"
  skip "SKIP_STREAM=true"
fi

echo
echo "=================================================="
echo "Chat smoke summary: ${PASSED}/${TOTAL} passed, ${FAILED} failed"
echo "=================================================="

if [[ "$FAILED" -gt 0 ]]; then
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo "  - ${f}"
  done
  exit 1
fi
exit 0

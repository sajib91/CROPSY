#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_PID=""
WEB_PID=""
AI_PID=""

cleanup() {
  local pid
  for pid in "$API_PID" "$WEB_PID" "$AI_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  sleep 1
  for pid in "$API_PID" "$WEB_PID" "$AI_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT

wait_for_url() {
  local name="$1"
  local url="$2"
  local log_file="$3"
  local pid="$4"
  local attempt

  for attempt in $(seq 1 90); do
    if curl --silent --show-error --fail "$url" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$name exited before becoming ready. Log:" >&2
      cat "$log_file" >&2
      return 1
    fi
    sleep 1
  done

  echo "Timed out waiting for $name at $url. Log:" >&2
  cat "$log_file" >&2
  return 1
}

assert_service() {
  local name="$1"
  local url="$2"
  local expected="$3"
  local body

  body="$(curl --silent --show-error --fail "$url")"
  if ! printf '%s' "$body" | grep -q "\"service\":\"${expected}\""; then
    echo "$name health response did not identify '$expected': $body" >&2
    return 1
  fi
}

echo "== Architecture boundaries =="
npm run check:boundaries

echo "== Lint =="
npm run lint

echo "== Format check =="
npm run format:check

echo "== Localization parity =="
npm run check:i18n

echo "== API contracts =="
npm run contracts:check
npm run contracts:breaking
npm run contracts:clients
npm run test:contracts

echo "== Build =="
npm run build

echo "== Tests =="
npm test

# Database tests need Docker and a temporary PostgreSQL + PostGIS instance, so
# they run only when explicitly requested.
if [[ "${CROPSY_RUN_DB_TESTS:-0}" == "1" ]]; then
  echo "== Database tests =="
  npm run db:test
fi

# Use ephemeral ports so verification never hits an unrelated local service.
read -r API_PORT WEB_PORT AI_PORT API_PREFIX API_SERVICE_NAME < <(
  node -e "
    const net = require('node:net');
    const { loadApiEnv } = require('@cropsy/config');
    const env = loadApiEnv();
    const ports = [];

    function next() {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        ports.push(server.address().port);
        server.close(() => {
          if (ports.length < 3) {
            next();
          } else {
            console.log(ports.join(' '), env.API_PREFIX, env.SERVICE_NAME);
          }
        });
      });
    }

    next();
  "
)

PYTHON="$ROOT_DIR/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$(command -v python3)"
fi
read -r AI_SERVICE_NAME < <(
  PYTHONPATH="$ROOT_DIR/apps/ai${PYTHONPATH:+:$PYTHONPATH}" "$PYTHON" -c \
    'from app.config import get_settings; print(get_settings().service_name)'
)

LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cropsy-verify.XXXXXX")"

echo "== Starting services for health checks =="
HOST=127.0.0.1 PORT="$API_PORT" node apps/api/src/server.js >"$LOG_DIR/api.log" 2>&1 &
API_PID=$!

npx next start apps/web -p "$WEB_PORT" >"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!

CROPSY_AI_HOST=127.0.0.1 CROPSY_AI_PORT="$AI_PORT" bash scripts/dev-ai.sh >"$LOG_DIR/ai.log" 2>&1 &
AI_PID=$!

API_BASE="http://127.0.0.1:${API_PORT}${API_PREFIX}"
WEB_BASE="http://127.0.0.1:${WEB_PORT}"
AI_BASE="http://127.0.0.1:${AI_PORT}/api/v1"

wait_for_url "business API" "${API_BASE}/health" "$LOG_DIR/api.log" "$API_PID"
wait_for_url "web" "${WEB_BASE}/health" "$LOG_DIR/web.log" "$WEB_PID"
wait_for_url "AI service" "${AI_BASE}/health" "$LOG_DIR/ai.log" "$AI_PID"

assert_service "business API" "${API_BASE}/health" "$API_SERVICE_NAME"
assert_service "web" "${WEB_BASE}/health" "cropsy-web"
assert_service "AI service" "${AI_BASE}/health" "$AI_SERVICE_NAME"

echo "== Health responses =="
echo "API: $(curl --silent --show-error --fail "${API_BASE}/health")"
echo "API ready: $(curl --silent --show-error --fail "${API_BASE}/health/ready")"
echo "Web: $(curl --silent --show-error --fail "${WEB_BASE}/health")"
echo "AI: $(curl --silent --show-error --fail "${AI_BASE}/health")"
echo "AI ready: $(curl --silent --show-error --fail "${AI_BASE}/health/ready")"

echo "Verification complete. Logs: $LOG_DIR"

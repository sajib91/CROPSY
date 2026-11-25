#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EXTRA_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --reload) EXTRA_ARGS+=(--reload) ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

PYTHON="$ROOT_DIR/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$(command -v python3)"
fi

export PYTHONPATH="$ROOT_DIR/apps/ai${PYTHONPATH:+:$PYTHONPATH}"

read -r HOST PORT < <(
  "$PYTHON" -c 'from app.config import get_settings; settings = get_settings(); print(settings.host, settings.port)'
)

echo "Starting CROPSY AI service on ${HOST}:${PORT}"
exec "$PYTHON" -m uvicorn app.main:app \
  --host "$HOST" \
  --port "$PORT" \
  ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}

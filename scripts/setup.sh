#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for command_name in node npm python3; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then
  echo "Node.js 20 or newer is required. Found $(node --version)." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example (local defaults only)."
elif ! grep -q '^DATABASE_URL=' .env; then
  {
    printf '\n# PostgreSQL + PostGIS (Prisma)\n'
    grep '^DATABASE_URL=' .env.example
  } >> .env
  echo "Added the local DATABASE_URL default to the existing .env."
fi

echo "Installing JavaScript workspace dependencies..."
npm install

if [[ ! -x .venv/bin/python ]]; then
  echo "Creating Python virtual environment..."
  python3 -m venv .venv
fi

echo "Installing Python AI dependencies..."
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r apps/ai/requirements.txt

echo "Setup complete."
echo "Next: npm run verify"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for npm run db:test" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running" >&2
  exit 1
fi

IMAGE="postgis/postgis:17-3.5"
CONTAINER_NAME="cropsy-db-test-$$"
SHADOW_DB="cropsy_shadow"
DIFF_FILE="$(mktemp "${TMPDIR:-/tmp}/cropsy-db-diff.XXXXXX.sql")"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -f "$DIFF_FILE"
}
trap cleanup EXIT

echo "== Starting temporary PostgreSQL + PostGIS =="
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run --detach --rm \
  --name "$CONTAINER_NAME" \
  --env POSTGRES_PASSWORD=cropsy \
  --env POSTGRES_DB=cropsy_test \
  --publish 127.0.0.1::5432 \
  "$IMAGE" >/dev/null

PORT="$(docker port "$CONTAINER_NAME" 5432/tcp | head -1 | awk -F: '{print $NF}')"

for attempt in $(seq 1 90); do
  if docker exec "$CONTAINER_NAME" pg_isready -U postgres -d cropsy_test >/dev/null 2>&1 &&
     node -e '
       const net = require("node:net");
       const socket = net.connect({ host: "127.0.0.1", port: Number(process.argv[1]) });
       socket.on("connect", () => { socket.end(); process.exit(0); });
       socket.on("error", () => process.exit(1));
     ' "$PORT" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 90 ]]; then
    echo "Temporary database did not become ready" >&2
    exit 1
  fi
  sleep 1
done

export DATABASE_URL="postgresql://postgres:cropsy@127.0.0.1:${PORT}/cropsy_test?schema=public"
SHADOW_URL="postgresql://postgres:cropsy@127.0.0.1:${PORT}/${SHADOW_DB}?schema=public"

echo "== Prisma validate =="
npx prisma validate --schema apps/api/prisma/schema.prisma

echo "== Prisma generate =="
npx prisma generate --schema apps/api/prisma/schema.prisma

echo "== Migrate deploy =="
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

echo "== Migration drift check =="
docker exec "$CONTAINER_NAME" createdb -U postgres "$SHADOW_DB" >/dev/null
npx prisma migrate diff \
  --from-migrations apps/api/prisma/migrations \
  --to-schema-datamodel apps/api/prisma/schema.prisma \
  --shadow-database-url "$SHADOW_URL" \
  --script >"$DIFF_FILE"
if ! grep -q 'This is an empty migration' "$DIFF_FILE"; then
  echo "Prisma detected drift between migrations and schema:" >&2
  cat "$DIFF_FILE" >&2
  exit 1
fi

echo "== Seed twice =="
node apps/api/prisma/seed.js
node apps/api/prisma/seed.js

echo "== Database tests =="
node --test apps/api/test/database/*.test.js

echo "Database verification complete."

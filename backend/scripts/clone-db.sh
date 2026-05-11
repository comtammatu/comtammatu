#!/usr/bin/env bash
# clone-db.sh — Dump production Supabase data and restore to local Docker PostgreSQL.
#
# Usage:
#   ./scripts/clone-db.sh              # dump schema + data, restore to local db container
#   ./scripts/clone-db.sh --schema-only  # schema only (no rows)
#   ./scripts/clone-db.sh --data-only    # data only (skip DDL)
#
# Prerequisites:
#   - Docker running
#   - comtammatu-db container running (docker compose up -d db)
#   - SUPABASE_DB_PASSWORD set in .env or environment

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env if present (for SUPABASE_DB_PASSWORD)
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -o allexport
  source "$ROOT_DIR/.env"
  set +o allexport
fi

SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-kakwnkcriamdtjbpfmie}"
SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD:-}"
LOCAL_DB_CONTAINER="comtammatu-db"
LOCAL_DB_USER="postgres"
LOCAL_DB_NAME="postgres"
DUMP_FILE="/tmp/comtammatu-dump-$(date +%Y%m%d-%H%M%S).sql"

MODE="full"
[[ "${1:-}" == "--schema-only" ]] && MODE="schema"
[[ "${1:-}" == "--data-only" ]]   && MODE="data"

# ── Validation ────────────────────────────────────────────────────────────────
if [[ -z "$SUPABASE_DB_PASSWORD" ]]; then
  echo "ERROR: SUPABASE_DB_PASSWORD is not set."
  echo "Add it to backend/.env or export it in your shell."
  exit 1
fi

if ! docker inspect "$LOCAL_DB_CONTAINER" &>/dev/null; then
  echo "ERROR: Local DB container '$LOCAL_DB_CONTAINER' is not running."
  echo "Run: cd backend && docker compose up -d db"
  exit 1
fi

# URL-encode special chars in password for the connection string
# (%, $, +, space, @, : are common in generated passwords)
ENCODED_PW=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$SUPABASE_DB_PASSWORD', safe=''))" 2>/dev/null || \
  node -e "console.log(encodeURIComponent('$SUPABASE_DB_PASSWORD'))" 2>/dev/null || \
  echo "$SUPABASE_DB_PASSWORD")

# Supabase session pooler — port 5432 supports pg_dump (transaction pooler on 6543 does not)
SOURCE_URL="postgresql://postgres.${SUPABASE_PROJECT_REF}:${ENCODED_PW}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

echo "=== Cơm Tấm Má Tư — DB Clone ==="
echo "Source : Supabase project ${SUPABASE_PROJECT_REF}"
echo "Target : ${LOCAL_DB_CONTAINER} (postgres://localhost:54320/${LOCAL_DB_NAME})"
echo "Mode   : ${MODE}"
echo ""

# ── Dump from Supabase ────────────────────────────────────────────────────────
echo "▶ Dumping from Supabase..."

PG_DUMP_ARGS=("--no-owner" "--no-acl" "--no-privileges" "--format=plain")
[[ "$MODE" == "schema" ]] && PG_DUMP_ARGS+=("--schema-only")
[[ "$MODE" == "data"   ]] && PG_DUMP_ARGS+=("--data-only" "--disable-triggers")

# Run pg_dump inside a temporary postgres:17 Docker container
docker run --rm \
  -e PGPASSWORD="$SUPABASE_DB_PASSWORD" \
  postgres:17-alpine \
  pg_dump "${PG_DUMP_ARGS[@]}" \
  "postgresql://postgres.${SUPABASE_PROJECT_REF}:${SUPABASE_DB_PASSWORD}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  > "$DUMP_FILE"

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
echo "   Dump saved: $DUMP_FILE ($DUMP_SIZE)"

# ── Restore to local ──────────────────────────────────────────────────────────
echo "▶ Restoring to local container..."

if [[ "$MODE" == "full" ]]; then
  # Drop and recreate public schema for a clean restore
  docker exec "$LOCAL_DB_CONTAINER" \
    psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" \
    -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
fi

docker exec -i "$LOCAL_DB_CONTAINER" \
  psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" \
  --set ON_ERROR_STOP=0 \
  < "$DUMP_FILE"

echo ""
echo "✓ Done. Local DB is ready at postgres://localhost:54320/${LOCAL_DB_NAME}"
echo ""
echo "Connect with:"
echo "  psql postgresql://postgres:postgres@localhost:54320/postgres"
echo ""
echo "Point the backend at local DB:"
echo "  DATABASE_URL=postgresql://postgres:postgres@db:5432/postgres"

#!/usr/bin/env bash
# =============================================================
# seed-local-db.sh — Reproducible local plain-Postgres seed
# for the "Cơm Tấm Má Tư" Go backend dev environment.
#
# Drops and recreates the public schema then applies:
#   1. supabase-compat-prelude.sql  (stub Supabase platform objects)
#   2. All supabase/migrations/*.sql in sorted filename order
#
# Target: Docker container comtammatu-db (postgres:17-alpine)
#         exposed on host port 54320.
#
# Usage:
#   ./backend/scripts/seed-local-db.sh [--psql-url <url>]
#
# Defaults to postgresql://postgres:postgres@localhost:54320/postgres
# =============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
PRELUDE="$SCRIPT_DIR/supabase-compat-prelude.sql"
BLOCKERS_LOG="$REPO_ROOT/docs/runbooks/db-migration/seed-run-blockers.log"

DB_URL="${PSQL_URL:-postgresql://postgres:postgres@localhost:54320/postgres}"

psql_exec() {
  psql "$DB_URL" -v ON_ERROR_STOP=0 --no-psqlrc -q "$@" 2>&1
}

psql_file() {
  psql "$DB_URL" -v ON_ERROR_STOP=0 --no-psqlrc -q -f "$1" 2>&1
}

echo "=== seed-local-db.sh starting ==="
echo "DB: $DB_URL"
echo "Migrations: $MIGRATIONS_DIR"

# ---------------------------------------------------------------
# 1. Drop + recreate public schema (idempotent reset)
# ---------------------------------------------------------------
echo ""
echo "--- Resetting public schema ---"
psql_exec -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO PUBLIC;"

# ---------------------------------------------------------------
# 2. Apply compatibility prelude (stubs for Supabase platform)
# ---------------------------------------------------------------
echo ""
echo "--- Applying Supabase compat prelude ---"
psql_file "$PRELUDE"

# ---------------------------------------------------------------
# 3. Apply all migrations in sorted order, tolerating failures
# ---------------------------------------------------------------
echo ""
echo "--- Applying migrations ---"

mkdir -p "$(dirname "$BLOCKERS_LOG")"
> "$BLOCKERS_LOG"  # truncate

PASS=0
FAIL=0
FAIL_FILES=()

for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  fname=$(basename "$f")
  out=$(psql_file "$f")
  # psql with ON_ERROR_STOP=0 exits 0 even on errors; detect via stderr keywords
  if echo "$out" | grep -qiE "^(ERROR|FATAL):"; then
    FAIL=$((FAIL+1))
    FAIL_FILES+=("$fname")
    echo "  FAIL  $fname"
    {
      echo "=== $fname ==="
      echo "$out" | grep -iE "^(ERROR|FATAL):" | head -5
      echo ""
    } >> "$BLOCKERS_LOG"
  else
    PASS=$((PASS+1))
    echo "  ok    $fname"
  fi
done

# ---------------------------------------------------------------
# 4. Summary
# ---------------------------------------------------------------
TOTAL=$((PASS+FAIL))
echo ""
echo "=== Migration summary: $PASS/$TOTAL passed, $FAIL failed ==="

TABLE_COUNT=$(psql_exec -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
echo "Public tables loaded: $TABLE_COUNT"

echo ""
echo "--- Checking required tables ---"
psql_exec -tAc "SELECT to_regclass('public.orders'), to_regclass('public.payments'), to_regclass('public.staff'), to_regclass('public.webhook_events'), to_regclass('public.system_settings')"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Blocker log written to: $BLOCKERS_LOG"
  echo "Failed files:"
  for f in "${FAIL_FILES[@]}"; do echo "  - $f"; done
fi

echo ""
echo "=== Done ==="

#!/usr/bin/env bash
# migrate-supabase-users.sh
#
# Reads Supabase auth users via the Admin API and inserts them into
# public.users in the target PostgreSQL database.
#
# Usage:
#   ./scripts/migrate-supabase-users.sh
#
# Required environment variables (loaded from .env if present):
#   SUPABASE_PROJECT_REF     — e.g. iexwsuaqqenyjiskawoj
#   SUPABASE_SERVICE_ROLE_KEY — service role JWT (not anon key)
#   DATABASE_URL             — target Postgres DSN
#
# Behaviour:
#   - Idempotent: ON CONFLICT (email, tenant_id) DO NOTHING
#   - Prints summary: X migrated, Y skipped, Z failed
#
# Requirements: curl, jq, psql

set -euo pipefail

# ---------------------------------------------------------------------------
# Load .env from script's parent directory (backend/) when running locally.
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [[ -f "$ENV_FILE" ]]; then
  # Export only lines that look like KEY=VALUE (skip comments and blanks).
  set -o allexport
  # shellcheck disable=SC1090
  source <(grep -E '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE")
  set +o allexport
fi

# ---------------------------------------------------------------------------
# Validate required variables.
# ---------------------------------------------------------------------------
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF must be set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY must be set}"
: "${DATABASE_URL:?DATABASE_URL must be set}"

API_BASE="https://${SUPABASE_PROJECT_REF}.supabase.co/auth/v1/admin/users"

echo "==> Fetching Supabase auth users from project ${SUPABASE_PROJECT_REF}..."

# ---------------------------------------------------------------------------
# Fetch all pages (Supabase paginates at 1000 per page).
# ---------------------------------------------------------------------------
PAGE=1
PER_PAGE=1000
ALL_USERS="[]"

while true; do
  RESPONSE=$(curl -sf \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    "${API_BASE}?page=${PAGE}&per_page=${PER_PAGE}")

  BATCH=$(echo "$RESPONSE" | jq '.users // []')
  COUNT=$(echo "$BATCH" | jq 'length')

  if [[ "$COUNT" -eq 0 ]]; then
    break
  fi

  ALL_USERS=$(echo "$ALL_USERS $BATCH" | jq -s 'add')
  PAGE=$((PAGE + 1))

  if [[ "$COUNT" -lt "$PER_PAGE" ]]; then
    break
  fi
done

TOTAL=$(echo "$ALL_USERS" | jq 'length')
echo "==> Found $TOTAL Supabase auth users."

# ---------------------------------------------------------------------------
# Determine default tenant_id (first tenant in the DB, or 1 as fallback).
# ---------------------------------------------------------------------------
DEFAULT_TENANT_ID=$(psql "$DATABASE_URL" -tAq \
  -c "SELECT id FROM public.tenants ORDER BY id LIMIT 1" 2>/dev/null || echo "1")
DEFAULT_TENANT_ID="${DEFAULT_TENANT_ID:-1}"

# ---------------------------------------------------------------------------
# Insert users one-by-one, tracking counts.
# ---------------------------------------------------------------------------
MIGRATED=0
SKIPPED=0
FAILED=0

while IFS= read -r USER; do
  EMAIL=$(echo "$USER" | jq -r '.email // ""')
  ENCRYPTED_PW=$(echo "$USER" | jq -r '.encrypted_password // ""')
  FULL_NAME=$(echo "$USER" | jq -r '.user_metadata.full_name // .raw_user_meta_data.full_name // ""')
  USER_ROLE=$(echo "$USER" | jq -r '.user_metadata.user_role // .raw_user_meta_data.user_role // "cashier"')

  if [[ -z "$EMAIL" ]]; then
    FAILED=$((FAILED + 1))
    continue
  fi

  # Escape single quotes in values to prevent SQL injection via shell substitution.
  EMAIL_ESC="${EMAIL//\'/\'\'}"
  FULL_NAME_ESC="${FULL_NAME//\'/\'\'}"
  USER_ROLE_ESC="${USER_ROLE//\'/\'\'}"
  PW_ESC="${ENCRYPTED_PW//\'/\'\'}"

  SQL="INSERT INTO public.users (tenant_id, email, password_hash, full_name, user_role)
       VALUES (${DEFAULT_TENANT_ID}, '${EMAIL_ESC}', '${PW_ESC}', '${FULL_NAME_ESC}', '${USER_ROLE_ESC}')
       ON CONFLICT (email, tenant_id) DO NOTHING;"

  RESULT=$(psql "$DATABASE_URL" -tAq -c "$SQL" 2>&1)
  EXIT_CODE=$?

  if [[ $EXIT_CODE -ne 0 ]]; then
    echo "  FAILED  $EMAIL: $RESULT" >&2
    FAILED=$((FAILED + 1))
  elif [[ "$RESULT" == *"INSERT 0 0"* ]] || [[ -z "$RESULT" && $EXIT_CODE -eq 0 ]]; then
    # ON CONFLICT DO NOTHING returns INSERT 0 0 when skipped.
    ROWS=$(psql "$DATABASE_URL" -tAq \
      -c "SELECT COUNT(*) FROM public.users WHERE email='${EMAIL_ESC}' AND tenant_id=${DEFAULT_TENANT_ID}" 2>/dev/null || echo "0")
    if [[ "${ROWS:-0}" -gt 0 ]]; then
      SKIPPED=$((SKIPPED + 1))
    else
      MIGRATED=$((MIGRATED + 1))
    fi
  else
    MIGRATED=$((MIGRATED + 1))
  fi
done < <(echo "$ALL_USERS" | jq -c '.[]')

echo ""
echo "==> Migration complete."
echo "    Migrated : $MIGRATED"
echo "    Skipped  : $SKIPPED (already exist)"
echo "    Failed   : $FAILED"

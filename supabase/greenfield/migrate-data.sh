#!/usr/bin/env bash
# =============================================================================
# migrate-data.sh — Option-B ETL runner (prod → lean). OWNER-GATED.
# =============================================================================
# Runs migrate-data.sql then reconcile.sql against the LEAN TARGET, reading prod
# over a read-only postgres_fdw link. Aborts on ANY error (ON_ERROR_STOP). The
# agent never runs this against prod — prod is SELECT-only via the FDW role.
#
# REQUIRED env:
#   LEAN_DB_URL   psql connection string to the NEW lean target project
#                 (the project being filled — must already have baseline + seed)
#   PROD_HOST PROD_PORT PROD_DB PROD_USER PROD_PASSWORD
#                 the READ-ONLY prod connection the lean DB's FDW will use
#
# USAGE:
#   ./migrate-data.sh            # migrate + reconcile
#   ./migrate-data.sh reconcile  # reconcile only (re-check an existing load)
#
# See docs/runbooks/greenfield-prod-cutover.md for the full procedure (freeze
# window, read-only prod role, dry-run on a clone, go/no-go, rollback).
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-full}"

: "${LEAN_DB_URL:?set LEAN_DB_URL (the lean target project)}"
: "${PROD_HOST:?set PROD_HOST}"
: "${PROD_PORT:=5432}"
: "${PROD_DB:?set PROD_DB}"
: "${PROD_USER:?set PROD_USER (must be a READ-ONLY prod role)}"
: "${PROD_PASSWORD:?set PROD_PASSWORD}"

echo "ETL target (LEAN, will be WRITTEN): ${LEAN_DB_URL%%\?*}"
echo "ETL source (PROD, SELECT-only):     ${PROD_USER}@${PROD_HOST}:${PROD_PORT}/${PROD_DB}"
echo
read -r -p "Freeze window in effect and target is the LEAN project? type 'yes' to proceed: " ok
[ "$ok" = "yes" ] || { echo "Aborted."; exit 1; }

run_sql() {
  # Prod connection is read from the environment via \getenv inside the SQL —
  # NOT passed as --set, so the password never lands in argv / ps / history.
  PROD_HOST="$PROD_HOST" PROD_PORT="$PROD_PORT" PROD_DB="$PROD_DB" \
  PROD_USER="$PROD_USER" PROD_PASSWORD="$PROD_PASSWORD" \
    psql "$LEAN_DB_URL" --set=ON_ERROR_STOP=1 -f "$1"
}

if [ "$MODE" != "reconcile" ]; then
  echo ">> Running migrate-data.sql ..."
  run_sql "$HERE/migrate-data.sql"
fi

echo ">> Running reconcile.sql (fails loud on any mismatch) ..."
run_sql "$HERE/reconcile.sql"

echo
echo "ETL + reconcile passed. Proceed to app repoint per the runbook only after"
echo "the manual spot-checks in §7 also pass."

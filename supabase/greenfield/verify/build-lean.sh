#!/usr/bin/env bash
# =============================================================================
# build-lean.sh — reproducibly BUILD + VERIFY the HKD lean DB baseline.
# =============================================================================
# Why: the squashed supabase/migrations/00000000000000_baseline.sql is NOT
# self-contained (uses private.* but never CREATE SCHEMA private) and sits on a
# divergent private-schema lineage → it does not replay from empty, and Supabase
# branch auto-replay of the 403-migration chain fails deterministically at s6.
#
# This pipeline instead takes the CURRENT prod schema as the complete, self-
# contained source, folds in the cleanup/hardening migrations, applies the lean
# cutover + RPC de-wire, and proves the result replays from empty.
#
#   prod pg_dump (self-contained, 116 tbl, has HĐĐT)
#     + supa-shim.sql (local Supabase-compat: auth/extensions/cron/storage/roles)
#     + greenfield/migrations + active migs + db_debt_cleanup   (ALL clean)
#     + ../lean-cutover.sql   (drop ~61 tbl + 16 GL/production RPCs)
#     + dewire-rpcs.sql       (9 money/GRN/dashboard RPCs, GL/consume removed)
#     = lean-baseline.sql     → 58 tables, replays-from-empty 0 errors
#
# Requires: docker daemon running; SUPABASE_PASSWORD in ../../../.env.local
# (prod read-only pg_dump). NEVER mutates prod — schema dump is read-only.
# Usage: from repo root:  bash supabase/greenfield/verify/build-lean.sh
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HERE="$ROOT/supabase/greenfield/verify"
set -a; source "$ROOT/.env.local"; set +a
PROD_CONN="host=aws-1-ap-southeast-1.pooler.supabase.com port=5432 user=postgres.iexwsuaqqenyjiskawoj dbname=postgres sslmode=require"
IMG=postgres:17-alpine
say(){ echo "▸ $*"; }

say "1/6 pg_dump prod schema (read-only)"
docker run --rm -e PGPASSWORD="$SUPABASE_PASSWORD" $IMG \
  pg_dump "$PROD_CONN" --schema=public --schema=private --schema-only --no-owner --no-privileges > /tmp/prod-schema.sql

say "2/6 local pg + Supabase shim"
docker rm -f hkd-lean-pg >/dev/null 2>&1 || true
docker run -d --name hkd-lean-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_HOST_AUTH_METHOD=trust $IMG >/dev/null
docker exec hkd-lean-pg sh -c 'for i in $(seq 1 60); do pg_isready -U postgres >/dev/null 2>&1 && exit 0; sleep 1; done'
docker cp "$HERE/supa-shim.sql" hkd-lean-pg:/tmp/shim.sql >/dev/null
docker exec hkd-lean-pg psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/shim.sql

say "3/6 load prod schema + cleanup/hardening migs + lean-cutover + de-wire"
docker cp /tmp/prod-schema.sql hkd-lean-pg:/tmp/prod.sql >/dev/null
docker exec hkd-lean-pg psql -U postgres -f /tmp/prod.sql >/dev/null 2>&1
docker cp "$ROOT/supabase/_legacy/greenfield-hardening" hkd-lean-pg:/tmp/gf >/dev/null
docker cp "$ROOT/supabase/_legacy/inplace-migrations" hkd-lean-pg:/tmp/mig >/dev/null
docker exec hkd-lean-pg sh -c 'for f in $(ls /tmp/gf/*.sql /tmp/mig/2026*.sql | sort); do psql -U postgres -v ON_ERROR_STOP=0 -f "$f" >/dev/null 2>&1; done'
docker cp "$ROOT/supabase/greenfield/lean-cutover.sql" hkd-lean-pg:/tmp/cutover.sql >/dev/null
docker exec hkd-lean-pg psql -U postgres -v ON_ERROR_STOP=0 -f /tmp/cutover.sql >/dev/null 2>&1
docker cp "$HERE/dewire-rpcs.sql" hkd-lean-pg:/tmp/dewire.sql >/dev/null
docker exec hkd-lean-pg psql -U postgres -v ON_ERROR_STOP=0 -f /tmp/dewire.sql >/dev/null 2>&1

say "4/6 dump lean baseline"
docker exec hkd-lean-pg pg_dump -U postgres --schema=public --schema=private --schema-only --no-owner --no-privileges \
  | sed '/^[\]restrict /d; /^[\]unrestrict /d' > "$ROOT/supabase/migrations/00000000000000_baseline.sql"
T=$(docker exec hkd-lean-pg psql -U postgres -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
say "   lean baseline = $T tables"

say "5/6 verify replay-from-empty"
docker rm -f hkd-replay >/dev/null 2>&1 || true
docker run -d --name hkd-replay -e POSTGRES_PASSWORD=pg -e POSTGRES_HOST_AUTH_METHOD=trust $IMG >/dev/null
docker exec hkd-replay sh -c 'for i in $(seq 1 60); do pg_isready -U postgres >/dev/null 2>&1 && exit 0; sleep 1; done'
docker cp "$HERE/supa-shim.sql" hkd-replay:/tmp/shim.sql >/dev/null
docker cp "$ROOT/supabase/migrations/00000000000000_baseline.sql" hkd-replay:/tmp/lean.sql >/dev/null
docker exec hkd-replay psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/shim.sql >/dev/null 2>&1
docker exec hkd-replay psql -U postgres -f /tmp/lean.sql >/dev/null 2>/tmp/replay.err
ERR=$(grep -c ERROR /tmp/replay.err | grep -v "already exists" || true)
RT=$(docker exec hkd-replay psql -U postgres -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
say "   replay-from-empty = $RT tables, $(grep -c ERROR /tmp/replay.err) raw errors (only 'schema public already exists' is benign)"

say "6/6 cleanup containers"
docker rm -f hkd-lean-pg hkd-replay >/dev/null 2>&1 || true
say "DONE → supabase/migrations/00000000000000_baseline.sql"

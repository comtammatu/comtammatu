import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch, sqlSlice } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

const CENTRAL_COUNT_CLIENT =
  "apps/web/app/(protected)/inventory/stocktake/[id]/count/count-client.tsx";
const BRANCH_COUNT_CLIENT =
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/count/branch-stocktake-count-client.tsx";
const ZONE_LOCK_INDICATOR =
  "apps/web/app/(protected)/inventory/_components/zone-lock-indicator.tsx";
const STOCKTAKE_ACTIONS =
  "apps/web/app/(protected)/inventory/stocktake-actions.ts";
const SHARED_INVENTORY_MESSAGES = "packages/shared/src/messages/inventory.ts";
const WEB_INVENTORY_MESSAGES = "apps/web/lib/messages/inventory.ts";
const REMOVE_MIGRATION =
  "supabase/migrations/20260831210500_remove_stocktake_zone_locks.sql";
const DATABASE_BASELINE = "supabase/migrations/20260902162918_baseline.sql";

test("stocktake count clients stay editable without a zone-lock lifecycle", () => {
  const forbidden =
    /ZoneLockIndicator|lockState|session-\$\{(?:data\.)?sessionId\}|zoneLockLost/;

  const central = read(CENTRAL_COUNT_CLIENT);
  assert.doesNotMatch(central, forbidden);
  assert.match(central, /const editable = canCount;/);

  const branch = read(BRANCH_COUNT_CLIENT);
  assert.doesNotMatch(branch, forbidden);
  assert.match(branch, /const editable = data\.status === "in_progress";/);
});

test("stocktake zone-lock UI, actions, and copy are removed", () => {
  assert.equal(existsSync(resolve(repoRoot, ZONE_LOCK_INDICATOR)), false);
  assertSqlNotMatch(read(STOCKTAKE_ACTIONS),
    /acquireZoneLock|heartbeatZoneLock|releaseZoneLock|(?:acquire|heartbeat|release)_zone_lock/,
  );
  assertSqlNotMatch(read(SHARED_INVENTORY_MESSAGES),
    /holdingLock|lockHeldByOther|lockExpiresIn|lockAcquireFailed/,
  );
  assertSqlNotMatch(read(WEB_INVENTORY_MESSAGES), /zoneLockLost/);
});

test("schema cleanup drops the retired zone-lock functions and table", () => {
  const migration = read(REMOVE_MIGRATION);
  assertSqlMatch(migration,
    /DROP FUNCTION IF EXISTS public\.acquire_zone_lock\(bigint, text, integer\)/,
  );
  assertSqlMatch(migration,
    /DROP FUNCTION IF EXISTS public\.heartbeat_zone_lock\(bigint, text, integer\)/,
  );
  assertSqlMatch(migration,
    /DROP FUNCTION IF EXISTS public\.release_zone_lock\(bigint, text\)/,
  );
  assertSqlMatch(migration,
    /DROP TABLE IF EXISTS public\.stocktake_zone_locks/,
  );
});

test("count submission keeps atomic session, permission, and round guards", () => {
  const baseline = read(DATABASE_BASELINE);
  const submitCountRound = sqlSlice(
    baseline,
    "CREATE FUNCTION public.submit_count_round",
    "CREATE FUNCTION public.submit_feedback",
  );
  assert.notEqual(submitCountRound, "");

  assertSqlMatch(submitCountRound, /FOR UPDATE OF session/);
  assertSqlMatch(submitCountRound, /v_session\.status <> 'in_progress'/);
  assertSqlMatch(submitCountRound, /public\.has_permission\(/);
  assertSqlMatch(submitCountRound, /p_round_no <> v_session\.current_round/);
  assertSqlMatch(submitCountRound,
    /ON CONFLICT \(session_id, ingredient_id, round_no\) DO UPDATE/,
  );
});

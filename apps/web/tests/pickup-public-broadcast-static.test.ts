import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { readActiveMigrationSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = path.resolve(import.meta.dirname, "../../..");
const _migrationsRoot = path.join(repoRoot, "supabase", "migrations");

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readPickupBroadcastMigration(): string {
  return readActiveMigrationSql(repoRoot);
}

test("public Pickup subscribes to a payload-free Broadcast invalidation", () => {
  const source = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/pickup/pickup-realtime-refresh.tsx",
  );

  assert.match(source, /const channelName = `pickup:\$\{branchId\}`/);
  assert.match(source, /\.channel\(channelName,[\s\S]*private: false/);
  assert.match(source, /\.on\(\s*"broadcast",\s*\{\s*event: "invalidate"\s*\}/);
  assert.match(source, /stopRealtimeAuthorizationRejoin/);
  assert.doesNotMatch(source, /"postgres_changes"/);
});

test("Pickup broadcasts at most once per affected branch and SQL statement", () => {
  const sql = readPickupBroadcastMigration();

  assertSqlMatch(sql,
    /CREATE OR REPLACE FUNCTION public\.broadcast_pickup_invalidation\(\)/,
  );
  assertSqlMatch(sql, /FOR EACH STATEMENT/);
  assertSqlMatch(sql, /REFERENCING NEW TABLE AS new_rows/);
  assertSqlMatch(sql, /REFERENCING OLD TABLE AS old_rows/);
  assertSqlNotMatch(sql, /FOR EACH ROW/);
  assertSqlMatch(sql,
    /realtime\.send\(\s*'\{\}'::jsonb,\s*'invalidate',\s*'pickup:' \|\| v_branch_id,\s*false\s*\)/,
  );
  assertSqlMatch(sql, /ON public\.kds_tickets/);
  assertSqlMatch(sql, /ON public\.orders/);
  assertSqlMatch(sql, /ON public\.order_items/);
  assertSqlMatch(sql, /ON public\.kitchen_send_batches/);
  assertSqlMatch(sql, /ON public\.tables/);
  assertSqlMatch(sql, /old_row\.quantity,[\s\S]*old_row\.is_priority/);
  assertSqlMatch(sql, /old_row\.kitchen_ticket_number/);
  assertSqlMatch(sql, /old_row\.number/);
  assertSqlMatch(sql,
    /REVOKE ALL ON FUNCTION public\.broadcast_pickup_invalidation\(\) FROM PUBLIC, anon, authenticated/,
  );
});

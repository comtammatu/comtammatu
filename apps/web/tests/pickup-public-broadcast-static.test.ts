import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const migrationsRoot = path.join(repoRoot, "supabase", "migrations");

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readPickupBroadcastMigration(): string {
  const filename = readdirSync(migrationsRoot).find((candidate) =>
    candidate.endsWith("_pickup_public_broadcast_invalidation.sql"),
  );
  assert.ok(filename, "pickup public broadcast migration must exist");
  return readFileSync(path.join(migrationsRoot, filename), "utf8");
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

  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.broadcast_pickup_invalidation\(\)/,
  );
  assert.match(sql, /FOR EACH STATEMENT/);
  assert.match(sql, /REFERENCING NEW TABLE AS new_rows/);
  assert.match(sql, /REFERENCING OLD TABLE AS old_rows/);
  assert.doesNotMatch(sql, /FOR EACH ROW/);
  assert.match(
    sql,
    /realtime\.send\(\s*'\{\}'::jsonb,\s*'invalidate',\s*'pickup:' \|\| v_branch_id,\s*false\s*\)/,
  );
  assert.match(sql, /ON public\.kds_tickets/);
  assert.match(sql, /ON public\.orders/);
  assert.match(sql, /ON public\.order_items/);
  assert.match(sql, /ON public\.kitchen_send_batches/);
  assert.match(sql, /ON public\.tables/);
  assert.match(sql, /old_row\.quantity,[\s\S]*old_row\.is_priority/);
  assert.match(sql, /old_row\.kitchen_ticket_number/);
  assert.match(sql, /old_row\.number/);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.broadcast_pickup_invalidation\(\) FROM PUBLIC, anon, authenticated/,
  );
});

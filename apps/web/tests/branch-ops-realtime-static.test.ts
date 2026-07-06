import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The realtime "branch ops bus" is a cross-file contract: the DB trigger
// broadcasts on topic `branch:{id}:ops` with event `ops` on a private channel,
// and the client must subscribe with the EXACT same topic/event/private flag or
// it silently receives nothing. These asserts pin both sides together so a
// rename on either side fails CI instead of shipping a dead subscription.

const client = readFileSync(
  new URL(
    "../app/(protected)/br/[branchId]/(operator)/branch-ops-refresh.tsx",
    import.meta.url,
  ),
  "utf8",
);

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/_archive/20260706120000_inventory_realtime_ops_bus.sql",
    import.meta.url,
  ),
  "utf8",
);

test("client subscribes to the branch:{id}:ops private broadcast, event 'ops'", () => {
  assert.match(client, /`branch:\$\{String\(branchId\)\}:ops`/);
  assert.match(client, /private:\s*true/);
  assert.match(client, /"broadcast",\s*\{\s*event:\s*"ops"\s*\}/);
});

test("DB trigger broadcasts to the matching topic/event on a private channel", () => {
  // realtime.send(payload, 'ops', 'branch:' || v_branch || ':ops', true)
  assert.match(
    migration,
    /realtime\.send\(\s*v_payload,\s*'ops',\s*'branch:'\s*\|\|\s*v_branch\s*\|\|\s*':ops',\s*true\s*\)/,
  );
});

test("realtime.messages receive policy is scoped to branch ops topics", () => {
  assert.match(migration, /realtime\.topic\(\)\s+LIKE\s+'branch:%:ops'/);
  assert.match(migration, /can_read_branch_ops/);
});

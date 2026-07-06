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

const stockLevelsMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260706193000_stock_levels_branch_ops_refresh.sql",
    import.meta.url,
  ),
  "utf8",
);

const baseline = readFileSync(
  new URL(
    "../../../supabase/migrations/00000000000000_baseline.sql",
    import.meta.url,
  ),
  "utf8",
);

const posLayout = readFileSync(
  new URL("../app/(protected)/br/[branchId]/pos/layout.tsx", import.meta.url),
  "utf8",
);

const posMenuClient = readFileSync(
  new URL(
    "../app/(protected)/br/[branchId]/pos/_hooks/use-pos-menu-sync.ts",
    import.meta.url,
  ),
  "utf8",
);

const posMenuMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260706084257_realtime_pr6_menu_sync.sql",
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

test("POS layout mounts branch ops refresh so stock updates refetch sale limits", () => {
  assert.match(posLayout, /BranchOpsRefresh/);
  assert.match(posLayout, /<BranchOpsRefresh branchId=\{numericBranchId\} \/>/);
});

test("POS menu sync listens for matching branch ops menu broadcasts", () => {
  assert.match(posMenuClient, /`branch:\$\{String\(branchId\)\}:ops`/);
  assert.match(posMenuClient, /private:\s*true/);
  assert.match(posMenuClient, /payload\.payload\?\.domain\s*===\s*"pos"/);
  assert.match(posMenuClient, /\.subscribe\(\(status\)\s*=>/);
  assert.match(posMenuMigration, /'domain',\s*'pos'/);
  assert.match(
    posMenuMigration,
    /realtime\.send\(\s*v_payload,\s*'ops',\s*'branch:'\s*\|\|\s*v_branch\.id\s*\|\|\s*':ops',\s*true\s*\)/,
  );
});

test("stock_levels changes broadcast branch ops for live menu stock capacity", () => {
  assert.match(
    stockLevelsMigration,
    /CREATE TRIGGER trg_broadcast_branch_ops[\s\S]*ON public\.stock_levels[\s\S]*public\.broadcast_branch_ops\(\)/,
  );
  assert.match(
    baseline,
    /CREATE TRIGGER trg_broadcast_branch_ops AFTER INSERT OR DELETE OR UPDATE ON public\.stock_levels FOR EACH ROW EXECUTE FUNCTION public\.broadcast_branch_ops\(\)/,
  );
});

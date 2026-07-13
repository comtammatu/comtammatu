import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The realtime "branch ops bus" is a cross-file contract: the DB trigger
// broadcasts on topic `branch:{id}:ops` with event `ops` on a private channel,
// and the client must subscribe with the EXACT same topic/event/private flag or
// it silently receives nothing. These asserts pin both sides together so a
// rename on either side fails CI instead of shipping a dead subscription.

const branchOpsRefresh = readFileSync(
  new URL("../app/_components/branch-ops-refresh.tsx", import.meta.url),
  "utf8",
);

const branchOpsChannel = readFileSync(
  new URL("../app/_hooks/use-branch-ops-events.ts", import.meta.url),
  "utf8",
);

const operatorLayout = readFileSync(
  new URL(
    "../app/(protected)/br/[branchId]/(operator)/layout.tsx",
    import.meta.url,
  ),
  "utf8",
);

const operatorChildPages = [
  "../app/(protected)/br/[branchId]/(operator)/shift/checkout-approvals/page.tsx",
  "../app/(protected)/br/[branchId]/(operator)/shift/leave-approvals/page.tsx",
  "../app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  "../app/(protected)/br/[branchId]/(operator)/stock/count-assignments/page.tsx",
  "../app/(protected)/br/[branchId]/(operator)/stock/count-slips/page.tsx",
  "../app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/page.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

const hubTodayStatus = readFileSync(
  new URL(
    "../app/(protected)/br/[branchId]/(operator)/_components/hub/hub-today-status.tsx",
    import.meta.url,
  ),
  "utf8",
);

const branchLeaveApprovals = readFileSync(
  new URL(
    "../app/(protected)/br/[branchId]/(operator)/shift/leave-approvals/branch-leave-approvals-client.tsx",
    import.meta.url,
  ),
  "utf8",
);

const staffRuntimeHome = readFileSync(
  new URL("../lib/staff-runtime/page.tsx", import.meta.url),
  "utf8",
);

const migration = readFileSync(
  new URL(
    "../../../supabase/migration-archive/20260706120000_inventory_realtime_ops_bus.sql",
    import.meta.url,
  ),
  "utf8",
);

const hardeningMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260713032254_harden_runtime_control_plane.sql",
    import.meta.url,
  ),
  "utf8",
);

const runtimeControlPlaneTest = readFileSync(
  new URL(
    "../../../supabase/tests/runtime_control_plane_test.sql",
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
  assert.match(branchOpsChannel, /`branch:\$\{String\(branchId\)\}:ops`/);
  assert.match(branchOpsChannel, /private:\s*true/);
  assert.match(branchOpsChannel, /"broadcast",\s*\{\s*event:\s*"ops"\s*\}/);
  assert.match(branchOpsRefresh, /pollMs:\s*false/);
});

test("operator layout owns the branch ops subscriber without child duplicates", () => {
  assert.match(
    operatorLayout,
    /<BranchOpsRefresh[\s\S]*branchId=\{context\.branchId\}/,
  );
  for (const page of operatorChildPages) {
    assert.doesNotMatch(page, /<BranchOpsRefresh/);
  }
  assert.match(staffRuntimeHome, /enableBranchOpsRefresh\s*=\s*true/);
  assert.match(
    staffRuntimeHome,
    /enableBranchOpsRefresh && state\.branchId !== null/,
  );
  for (const page of operatorChildPages) {
    if (page.includes("EmployeeHomePageContent")) {
      assert.match(page, /enableBranchOpsRefresh=\{false\}/);
    }
  }
  assert.doesNotMatch(hubTodayStatus, /<BranchOpsRefresh/);
});

test("operator leave approvals owns its realtime subscriber without layout duplication", () => {
  assert.match(
    operatorLayout,
    /disabledPathPrefixes=\{\[\s*`\/br\/\$\{context\.branchId\}\/shift\/leave-approvals`,?\s*\]\}/,
  );
  assert.match(branchLeaveApprovals, /useBranchOpsEvents\(\{/);
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

test("branch ops authorization follows active profile branch scope", () => {
  assert.match(hardeningMigration, /pr\.branch_id = p_branch_id/);
  assert.match(hardeningMigration, /public\.auth_is_owner\(pr\.id\)/);
  assert.match(hardeningMigration, /pr\.is_active IS TRUE/);
  assert.doesNotMatch(
    hardeningMigration,
    /sp\.branch_id = p_branch_id OR sp\.branch_id IS NULL/,
  );
});

test("runtime control-plane hardening fixes cron dedup and MV grants", () => {
  assert.match(hardeningMigration, /FROM cron\.job j[\s\S]*WHERE j\.active/);
  assert.match(
    hardeningMigration,
    /ORDER BY d\.runid DESC/,
  );
  assert.match(
    hardeningMigration,
    /v_status IN \('starting', 'connecting', 'sending'\)/,
  );
  assert.match(hardeningMigration, /private\.cron_health_observations/);
  assert.match(hardeningMigration, /v_first_observed_at < now\(\) - v_max_age/);
  assert.match(
    hardeningMigration,
    /WHEN 'refresh_mv_inventory_stock_current' THEN interval '45 minutes'/,
  );
  assert.match(
    hardeningMigration,
    /ON CONFLICT \(tenant_id, dedup_key\)[\s\S]*WHERE dedup_key IS NOT NULL/,
  );
  assert.match(
    hardeningMigration,
    /kind,[\s\S]*title,[\s\S]*body,[\s\S]*dedup_key/,
  );
  assert.match(
    hardeningMigration,
    /REVOKE ALL ON public\.mv_inventory_stock_current FROM anon, authenticated/,
  );
  assert.match(runtimeControlPlaneTest, /cron\.schedule\(/);
  assert.doesNotMatch(runtimeControlPlaneTest, /INSERT INTO cron\.job\s*\(/);
});

test("POS menu sync owns branch ops refresh without a layout duplicate", () => {
  assert.doesNotMatch(posLayout, /BranchOpsRefresh/);
  assert.match(posMenuClient, /`branch:\$\{String\(branchId\)\}:ops`/);
});

test("POS menu sync listens for matching branch ops menu broadcasts", () => {
  assert.match(posMenuClient, /`branch:\$\{String\(branchId\)\}:ops`/);
  assert.match(posMenuClient, /private:\s*true/);
  assert.match(posMenuClient, /event\?\.domain\s*===\s*"pos"/);
  assert.match(posMenuClient, /event\?\.domain\s*===\s*"inventory"/);
  assert.match(posMenuClient, /event\?\.table\s*===\s*"stock_levels"/);
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

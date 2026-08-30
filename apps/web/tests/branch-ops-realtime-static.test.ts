import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { stopRealtimeAuthorizationRejoin } from "../app/_hooks/use-realtime-channel";
import { normalizePgDumpSql } from "./sql-test-utils";

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

const branchOpsRuntime = readFileSync(
  new URL("../app/_hooks/branch-ops-runtime.ts", import.meta.url),
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
  "../app/(protected)/br/[branchId]/(operator)/team/checkout-approvals/page.tsx",
  "../app/(protected)/br/[branchId]/(operator)/team/leave-approvals/page.tsx",
  "../app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  "../app/(protected)/br/[branchId]/(operator)/stock/count-assignments/page.tsx",
  "../app/(protected)/br/[branchId]/(operator)/stock/count-slips/page.tsx",
  "../app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/page.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

const branchTodayStatus = readFileSync(
  new URL(
    "../app/(protected)/br/[branchId]/(operator)/_components/home/branch-today-status.tsx",
    import.meta.url,
  ),
  "utf8",
);

const branchLeaveApprovals = readFileSync(
  new URL(
    "../app/(protected)/br/[branchId]/(operator)/team/leave-approvals/branch-leave-approvals-client.tsx",
    import.meta.url,
  ),
  "utf8",
);

const branchAttendance = readFileSync(
  new URL(
    "../app/(protected)/br/[branchId]/(operator)/team/attendance/branch-attendance-client.tsx",
    import.meta.url,
  ),
  "utf8",
);

const hrLeaveRequests = readFileSync(
  new URL("../app/(protected)/hr/leave-requests-table.tsx", import.meta.url),
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

const stockLevelsMigration = readFileSync(
  new URL(
    "../../../supabase/migration-archive/20260706193000_stock_levels_branch_ops_refresh.sql",
    import.meta.url,
  ),
  "utf8",
);

const branchOpsAuthorizationMigration = readFileSync(
  new URL(
    "../../../supabase/migration-archive/20260715220008_harden_branch_ops_realtime_scope.sql",
    import.meta.url,
  ),
  "utf8",
);

const baseline = normalizePgDumpSql(
  readFileSync(
    new URL(
      "../../../supabase/migration-archive/20260727120000_baseline.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);

const branchOpsPolicyMigration = readFileSync(
  new URL(
    "../../../supabase/migration-archive/20260729250100_restore_branch_ops_realtime_policy.sql",
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
    "../../../supabase/migration-archive/20260706084257_realtime_pr6_menu_sync.sql",
    import.meta.url,
  ),
  "utf8",
);

test("client subscribes to the branch:{id}:ops private broadcast, event 'ops'", () => {
  assert.match(branchOpsRuntime, /`branch:\$\{String\(branchId\)\}:ops`/);
  assert.match(branchOpsRuntime, /private:\s*true/);
  assert.match(branchOpsRuntime, /"broadcast",\s*\{\s*event:\s*"ops"\s*\}/);
  assert.match(branchOpsRefresh, /useCoalescedRouterRefresh/);
});

test("branch ops consumers share one runtime and filter invalidations by table", () => {
  assert.match(branchOpsChannel, /subscribeBranchOps/);
  assert.doesNotMatch(branchOpsChannel, /useRealtimeChannel/);
  assert.match(branchOpsChannel, /filter\?:\s*BranchOpsEventFilter/);
  assert.match(branchOpsRuntime, /new Map<number, BranchOpsEntry>/);
  assert.match(branchOpsRuntime, /auth\.onAuthStateChange/);
  assert.match(branchOpsRuntime, /matchesBranchOpsFilter/);
});

test("operator layout owns the branch ops subscriber without child duplicates", () => {
  assert.match(
    operatorLayout,
    /canSubscribeBranchOpsTopic\(claims,\s*context\.branchId\)/,
  );
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
    /enableBranchOpsRefresh &&[\s\S]*canSubscribeBranchOpsTopic\(claims,\s*state\.branchId\)/,
  );
  for (const page of operatorChildPages) {
    if (page.includes("EmployeeHomePageContent")) {
      assert.match(page, /enableBranchOpsRefresh=\{false\}/);
    }
  }
  assert.doesNotMatch(branchTodayStatus, /<BranchOpsRefresh/);
});

test("branch ops client gates subscribe on JWT mirror of can_read_branch_ops", () => {
  assert.match(branchOpsRuntime, /canSubscribeBranchOpsTopic/);
  assert.match(branchOpsRuntime, /extractClaimsFromAccessToken/);
  assert.match(
    branchOpsRuntime,
    /createBranchOpsChannel\([\s\S]*token:\s*string \| null/,
  );
  assert.match(posMenuClient, /canSubscribeBranchOpsTopic/);
  assert.match(branchOpsRefresh, /useBranchOpsEvents\(\{[\s\S]*branchId/);
});

test("useRealtimeChannel skips setup when access token is null", () => {
  const realtimeChannel = readFileSync(
    new URL("../app/_hooks/use-realtime-channel.ts", import.meta.url),
    "utf8",
  );
  assert.match(realtimeChannel, /if \(token === null\) return;/);
});

test("operator leave approvals owns its realtime subscriber without layout duplication", () => {
  assert.match(
    operatorLayout,
    /disabledPathPrefixes=\{\[[\s\S]*team\/attendance[\s\S]*team\/leave-approvals[\s\S]*\]\}/,
  );
  assert.match(branchLeaveApprovals, /useBranchOpsEvents\(\{/);
});

test("targeted branch ops consumers ignore unrelated table broadcasts", () => {
  assert.match(branchAttendance, /tables:\s*\["attendance_records"\]/);
  assert.match(branchLeaveApprovals, /tables:\s*\["leave_requests"\]/);
  assert.match(hrLeaveRequests, /tables:\s*\["leave_requests"\]/);
});

test("DB trigger broadcasts to the matching topic/event on a private channel", () => {
  // realtime.send(payload, 'ops', 'branch:' || v_branch || ':ops', true)
  assert.match(
    migration,
    /realtime\.send\(\s*v_payload,\s*'ops',\s*'branch:'\s*\|\|\s*v_branch\s*\|\|\s*':ops',\s*true\s*\)/,
  );
});

test("realtime.messages receive policy is scoped to branch ops topics", () => {
  // The active chain is the install path; the archive is history only.
  // Re-baseline silently drops realtime.messages policies because pg_dump
  // excludes the extension-managed realtime schema.
  assert.match(
    branchOpsPolicyMigration,
    /CREATE POLICY "branch_ops_receive"\s+ON realtime\.messages/,
  );
  assert.match(
    branchOpsPolicyMigration,
    /CASE[\s\S]*realtime\.topic\(\)\s+~\s+'\^branch:\[1-9\]\[0-9\]\{0,18\}:ops\$'/,
  );
  assert.match(
    branchOpsPolicyMigration,
    /9223372036854775807::numeric[\s\S]*can_read_branch_ops\([\s\S]*::bigint/,
  );
});

test("authorization rejection stops rejoin while transport errors stay retryable", () => {
  const channel = {} as RealtimeChannel;
  let removed = 0;
  let evicted = 0;
  const supabase = {
    removeChannel(candidate: RealtimeChannel) {
      assert.equal(candidate, channel);
      removed += 1;
      return Promise.resolve("ok" as const);
    },
    realtime: {
      _remove(candidate: RealtimeChannel) {
        assert.equal(candidate, channel);
        evicted += 1;
      },
    },
  } as unknown as Pick<SupabaseClient, "realtime" | "removeChannel">;

  assert.equal(
    stopRealtimeAuthorizationRejoin(
      supabase,
      channel,
      new Error("Unauthorized channel topic"),
    ),
    true,
  );
  assert.equal(removed, 1);
  assert.equal(evicted, 1);

  assert.equal(
    stopRealtimeAuthorizationRejoin(
      supabase,
      channel,
      new Error("channel error", {
        cause: { reason: "permission denied" },
      }),
    ),
    true,
  );
  assert.equal(removed, 2);
  assert.equal(evicted, 2);

  assert.equal(
    stopRealtimeAuthorizationRejoin(
      supabase,
      channel,
      new Error("PrivateOnly: this project only allows private channels"),
    ),
    true,
  );
  assert.equal(removed, 3);
  assert.equal(evicted, 3);

  assert.equal(
    stopRealtimeAuthorizationRejoin(
      supabase,
      channel,
      new Error("connection lost"),
    ),
    false,
  );
  assert.equal(removed, 3);
  assert.equal(evicted, 3);
});

test("branch ops topics require an active profile and active assigned branch", () => {
  assert.match(branchOpsAuthorizationMigration, /b\.is_active IS TRUE/);
  assert.match(branchOpsAuthorizationMigration, /pr\.is_active IS TRUE/);
  assert.match(
    branchOpsAuthorizationMigration,
    /pr\.branch_id = p_branch_id[\s\S]*public\.auth_is_owner\(pr\.id\)/,
  );
  assert.doesNotMatch(branchOpsAuthorizationMigration, /staff_permissions/);
  assert.match(
    branchOpsAuthorizationMigration,
    /REVOKE ALL ON FUNCTION public\.can_read_branch_ops\(bigint\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    branchOpsAuthorizationMigration,
    /GRANT EXECUTE ON FUNCTION public\.can_read_branch_ops\(bigint\)[\s\S]*TO authenticated, service_role/,
  );
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
  assert.match(posMenuClient, /\.subscribe\(\(status,\s*err\)\s*=>/);
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

test("inventory layout mounts BranchOpsRefresh only when JWT can subscribe", () => {
  const inventoryLayout = readFileSync(
    new URL("../app/(protected)/inventory/layout.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    inventoryLayout,
    /canSubscribeBranchOpsTopic\(claims,\s*scope\.selectedBranchId\)/,
  );
});

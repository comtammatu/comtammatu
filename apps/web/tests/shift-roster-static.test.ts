import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { resolveModuleFromPath } from "@comtammatu/shared/auth";

const repoRoot = join(import.meta.dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

test("shift roster resolves before generic branch shift module", () => {
  assert.equal(
    resolveModuleFromPath("/br/7/shift/roster"),
    "branch_shift_roster",
  );
  assert.equal(
    resolveModuleFromPath("/br/7/shift/roster/"),
    "branch_shift_roster",
  );
  assert.equal(resolveModuleFromPath("/br/7/shift"), "branch_home");
});

test("branch roster route uses leave-approvals auth gating pattern", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/roster/page.tsx",
  );
  const rosterTab = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/_tabs/roster-tab.tsx",
  );
  const loader = read("apps/web/lib/hr/roster/load-branch-roster-data.ts");

  // The legacy route is a redirect shim into the Team hub (`?tab=roster`).
  assert.match(page, /import \{ redirect \} from "next\/navigation"/);
  assert.match(page, /\/team\?tab=roster/);
  // The hub tab reuses the loader + client presenter.
  assert.match(rosterTab, /loadBranchRosterData/);
  assert.match(loader, /branch\.branch_kind !== "branch"/);
  assert.match(loader, /PERMISSION_KEYS\.HR_ASSIGN_SHIFT/);
});

test("owner attendance exposes roster tab with shared week client", () => {
  const page = read("apps/web/app/(protected)/hr/attendance/page.tsx");

  assert.match(page, /tab === "roster"/);
  assert.match(page, /attendanceTabs\.roster/);
  assert.match(page, /RosterWeekClient/);
  assert.match(page, /loadOwnerRosterPanelData/);
});

test("roster week grid renders through the design-system DataTable", () => {
  const weekClient = read("apps/web/lib/hr/roster/roster-week-client.tsx");

  assert.match(
    weekClient,
    /from "@\/components\/data-table\/data-table"/,
  );
  assert.match(weekClient, /<DataTable/);
  assert.match(weekClient, /mobileCardRender/);
  assert.doesNotMatch(weekClient, /<table/);
  assert.doesNotMatch(weekClient, /min-w-\[/);
  assert.doesNotMatch(weekClient, /@comtammatu\/ui\/components\/table/);
});

test("roster week grid keeps the shared cell-change handler and Select", () => {
  const weekClient = read("apps/web/lib/hr/roster/roster-week-client.tsx");

  assert.match(weekClient, /function handleCellChange\(/);
  assert.match(weekClient, /handleCellChange\(employee\.employeeId/);
  assert.match(weekClient, /assignmentMap\.get\(key\)/);
  assert.match(weekClient, /<Select/);
  assert.match(weekClient, /EMPTY_SHIFT_VALUE/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

test("shift roster resolves before generic branch shift module", () => {
  const routeMap = read("packages/shared/src/auth/route-map.ts");
  const resolution = read("packages/shared/src/auth/route-resolution.ts");

  assert.match(
    routeMap,
    /id: "branch-shift-roster"[\s\S]*?entryPath: "\/br\/\[branchId\]\/shift\/roster"/,
  );
  assert.match(routeMap, /moduleKeys: \["branch_shift_roster"\]/);

  const rosterGate = resolution.indexOf('/shift\\/roster(?:\\/|$)/');
  const shiftGate = resolution.indexOf('/shift(?:\\/|$)/');
  assert.ok(rosterGate >= 0, "roster route gate must exist");
  assert.ok(shiftGate > rosterGate, "roster must resolve before generic shift");
  assert.match(resolution, /return "branch_shift_roster"/);
});

test("branch roster route uses leave-approvals auth gating pattern", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/roster/page.tsx",
  );
  const rosterTab = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/_tabs/roster-tab.tsx",
  );
  const loader = read("apps/web/lib/hr/roster/load-branch-roster-data.ts");

  assert.match(page, /import \{ RosterTab \} from "\.\.\/\.\.\/team\/_tabs\/roster-tab"/);
  assert.match(page, /return <RosterTab branchId=\{branchId\} week=\{week\} \/>/);
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
  const editor = read("apps/web/lib/hr/roster/use-roster-week-editor.ts");

  assert.match(editor, /function handleCellChange\(/);
  assert.match(weekClient, /handleCellChange\(employee\.employeeId/);
  assert.match(weekClient, /assignmentMap\.get\(key\)/);
  assert.match(weekClient, /<Select/);
  assert.match(weekClient, /EMPTY_SHIFT_VALUE/);
  assert.match(weekClient, /SelectTrigger size="touch"/);
  assert.match(weekClient, /size="icon-touch"/);
  assert.match(weekClient, /sticky bottom-0/);
});

test("Branch roster uses week cards without Owner DataTable", () => {
  const rosterClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/roster/roster-client.tsx",
  );
  const branchWeek = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/roster/branch-roster-week-client.tsx",
  );

  assert.match(rosterClient, /BranchRosterWeekClient/);
  assert.doesNotMatch(rosterClient, /(?<!Branch)RosterWeekClient|DataTable/);
  assert.match(branchWeek, /ItemGroup/);
  assert.match(branchWeek, /useRosterWeekEditor/);
  assert.match(branchWeek, /SelectTrigger size="touch"/);
  assert.match(branchWeek, /sticky bottom-0/);
  assert.doesNotMatch(
    branchWeek,
    /DataTable|from "@lib\/hr\/roster\/roster-week-client"/,
  );
});

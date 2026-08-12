import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readAttendanceTableModules } from "./helpers/read-attendance-table-modules";

const pageSource = readFileSync(
  new URL("../app/(protected)/hr/attendance/page.tsx", import.meta.url),
  "utf8",
);
const tableSource = readAttendanceTableModules();
const leaveTableSource = readFileSync(
  new URL("../app/(protected)/hr/leave-requests-table.tsx", import.meta.url),
  "utf8",
);
const tabSyncSource = readFileSync(
  new URL("../app/(protected)/hr/attendance-tab-sync.tsx", import.meta.url),
  "utf8",
);
const actionSource = readFileSync(
  new URL("../app/(protected)/hr/actions.ts", import.meta.url),
  "utf8",
);

test("attendance tabs keep ADR query ownership without leave-view", () => {
  assert.match(pageSource, /approvals:\s*\[\s*"branch",\s*"panel"\s*\]/);
  assert.match(pageSource, /today:\s*\[\s*"branch"\s*\]/);
  assert.doesNotMatch(pageSource, /leave-view/);
  assert.match(pageSource, /AttendanceTabSync/);
  assert.match(tabSyncSource, /liveTab !== serverTab/);
});

test("today mode does not write month or view into the URL", () => {
  assert.match(tableSource, /if \(todayMode\)/);
  assert.match(tableSource, /params\.delete\("month"\)/);
  assert.match(tableSource, /params\.delete\("view"\)/);
  assert.match(tableSource, /day: todayMode \? todayDate : undefined/);
  assert.match(actionSource, /day:\s*z[\s\S]*?optional\(\)/);
});

test("attendance URL writers refuse stale tab overwrites", () => {
  assert.match(tableSource, /function ownsLiveTab/);
  const rosterEditorSource = readFileSync(
    new URL("../lib/hr/roster/use-roster-week-editor.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    rosterEditorSource,
    /if \(urlTab && liveTab && liveTab !== urlTab\) return/,
  );
});

test("approvals leave queue has no nested leave-view tabs", () => {
  assert.doesNotMatch(leaveTableSource, /paramKey="leave-view"/);
  assert.doesNotMatch(leaveTableSource, /AppPageTabs/);
  assert.match(leaveTableSource, /panel", "leave-history"/);
  assert.match(leaveTableSource, /historyPanelOpen/);
  assert.match(leaveTableSource, /branchScope === "office"/);
  assert.match(pageSource, /historyPanelOpen=\{params\.panel === "leave-history"\}/);
  assert.match(pageSource, /AttendanceApprovalsFrame/);
  assert.doesNotMatch(
    pageSource,
    /TabsContent value="approvals"[\s\S]*<AppSection/,
  );
});

test("calendar leaves remain visible for all employees", () => {
  assert.match(
    tableSource,
    /const employeeLeaves = selectedEmployeeId[\s\S]*\? calendarLeaves\.filter[\s\S]*: calendarLeaves/,
  );
});

test("approvals is one AppListFrame with a toolbar queue toggle", () => {
  const frameSource = readFileSync(
    new URL(
      "../app/(protected)/hr/attendance/attendance-approvals-frame.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    frameSource,
    /<AppListFrame[\s\S]*toolbar=\{[\s\S]*<AppToolbar[\s\S]*variant="inline"/,
  );
  assert.match(frameSource, /ToggleGroup/);
  assert.match(frameSource, /value === "checkout"/);
  assert.match(frameSource, /setPanel\("leave"\)/);
  assert.doesNotMatch(frameSource, /AppSection/);
});

test("roster when all is a site LIST that writes the same branch URL key", () => {
  const siteListSource = readFileSync(
    new URL("../app/(protected)/hr/attendance/roster-site-list.tsx", import.meta.url),
    "utf8",
  );
  const rosterClientSource = readFileSync(
    new URL("../lib/hr/roster/roster-week-client.tsx", import.meta.url),
    "utf8",
  );
  assert.match(pageSource, /RosterSiteList/);
  assert.doesNotMatch(pageSource, /scopeRequired/);
  assert.match(
    pageSource,
    /TabsContent value="roster"[\s\S]*RosterSiteList/,
  );
  assert.doesNotMatch(
    pageSource,
    /TabsContent value="roster"[\s\S]*AppEmptyState/,
  );
  assert.match(siteListSource, /withHrBranchScope\("\/hr\/attendance\?tab=roster"/);
  assert.match(siteListSource, /params\.set\("week"/);
  assert.doesNotMatch(siteListSource, /branches\[0\]/);
  assert.doesNotMatch(siteListSource, /HrScopeSelector|siteOptions/);
  assert.match(
    rosterClientSource,
    /<AppListFrame[\s\S]*toolbar=\{[\s\S]*<AppToolbar[\s\S]*variant="inline"/,
  );
  assert.doesNotMatch(rosterClientSource, /siteOptions|handleSiteChange/);
});

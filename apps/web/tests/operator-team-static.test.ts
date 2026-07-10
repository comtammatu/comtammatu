import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const teamTabsSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/team/team-workspace-tabs.tsx",
);
const teamPageSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/team/page.tsx",
);
const teamDataSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/team/data.ts",
);
const teamBoardSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/team/team-board-client.tsx",
);
const employeeMessagesSource = readWeb("lib/messages/employee.ts");
const operatorMessagesSource = readWeb("lib/messages/operator.ts");
const teamMembersSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/team/members/members-client.tsx",
);
const teamMembersContentSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/team/members/members-content.tsx",
);
const teamMembersActionsSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/team/members/actions.ts",
);
const countAssignmentsSource = readWeb(
  "app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
);
const staffRuntimeSource = readWeb("lib/staff-runtime/page.tsx");
const shiftPageSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
);

test("operator team tabs use shared Tabs and preserve client-side switching", () => {
  assert.match(teamTabsSource, /TabsList/);
  assert.match(teamTabsSource, /TabsTrigger/);
  assert.match(teamTabsSource, /TabsContent/);
  assert.match(teamTabsSource, /window\.history\.replaceState/);
  assert.match(teamTabsSource, /sticky top-0 z-20/);
  assert.match(teamTabsSource, /min-h-12/);
  assert.match(teamTabsSource, /group-data-horizontal\/tabs:!h-12/);
  assert.match(
    teamTabsSource,
    /h-10 min-w-0 items-center justify-center gap-1/,
  );
  assert.match(teamTabsSource, /sm:gap-2 sm:px-2 sm:text-sm/);
  assert.match(teamTabsSource, /whitespace-nowrap leading-none/);
  assert.doesNotMatch(teamPageSource, /AppPageTabs/);
});

test("operator team copy stays in the Branch operator plane", () => {
  assert.match(teamPageSource, /messages\.operator\.teamBoard/);
  assert.match(teamTabsSource, /messages\.operator\.teamBoard/);
  assert.match(teamBoardSource, /messages\.operator\.teamBoard/);
  assert.match(operatorMessagesSource, /teamBoard:\s*\{/);
  assert.doesNotMatch(employeeMessagesSource, /teamBoard:\s*\{/);
  assert.doesNotMatch(teamPageSource, /messages\.employee\.teamBoard/);
  assert.doesNotMatch(teamTabsSource, /messages\.employee\.teamBoard/);
  assert.doesNotMatch(teamBoardSource, /messages\.employee\.teamBoard/);
});

test("operator team board exposes a real status filter", () => {
  assert.match(teamBoardSource, /type TeamBoardFilter/);
  assert.match(teamBoardSource, /function matchesTeamBoardFilter/);
  assert.match(teamBoardSource, /function TeamBoardFilters/);
  assert.match(
    teamBoardSource,
    /className="flex gap-1\.5 overflow-x-auto pb-1"/,
  );
  assert.match(teamBoardSource, /size="touch"/);
  assert.match(teamBoardSource, /className="shrink-0 gap-2 px-3"/);
  assert.match(teamBoardSource, /minHeight="tap"/);
  assert.match(teamBoardSource, /padding="compact"/);
  assert.match(teamBoardSource, /const filteredRows = displayRows\.filter/);
  assert.match(
    teamBoardSource,
    /const filteredGroups = groupRowsByShift\(filteredRows\)/,
  );
  assert.match(teamBoardSource, /function groupRowsByShift/);
  assert.match(teamBoardSource, /firstCheckIn/);
  assert.match(teamBoardSource, /function TeamBoardMobileGroups/);
  assert.match(teamBoardSource, /<TeamBoardMobileGroups/);
  assert.match(teamBoardSource, /showShiftName=\{false\}/);
  assert.match(
    teamBoardSource,
    /mode=\{filter === "all" \? "no-data" : "no-results"\}/,
  );
  assert.doesNotMatch(teamBoardSource, /DataTable/);
  assert.doesNotMatch(teamBoardSource, /DataTableColumn/);
  assert.doesNotMatch(teamBoardSource, /className="lg:hidden"/);
  assert.doesNotMatch(teamBoardSource, /className="hidden lg:block"/);
  assert.doesNotMatch(teamBoardSource, /renderTable/);
  assert.doesNotMatch(teamBoardSource, /filteredGroupedRows/);
  assert.doesNotMatch(teamBoardSource, /renderTable\(group\.rows\)/);
  assert.match(operatorMessagesSource, /label:\s*"Ca & Kho"/);
  assert.match(operatorMessagesSource, /label:\s*"Nhân sự"/);
  assert.match(operatorMessagesSource, /label:\s*"Phân công"/);
  assert.match(operatorMessagesSource, /all:\s*"Tất cả ca"/);
  assert.match(operatorMessagesSource, /shiftGroupCount/);
  assert.doesNotMatch(teamBoardSource, /ActionSection/);
  assert.doesNotMatch(teamBoardSource, /copy\.actionSectionTitle/);
  assert.doesNotMatch(teamBoardSource, /copy\.boardSectionDescription/);
  assert.doesNotMatch(teamBoardSource, /SummaryBadges/);
  assert.doesNotMatch(teamBoardSource, /summaryPeople/);
  assert.doesNotMatch(
    teamBoardSource,
    /grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7/,
  );
});

test("operator team is the branch manager entry for reviews and assignments", () => {
  assert.match(teamPageSource, /managerEntryAriaLabel/);
  assert.match(teamPageSource, /reviewGroupTitle/);
  assert.match(teamPageSource, /peopleGroupTitle/);
  assert.match(
    teamPageSource,
    /href:\s*`\$\{basePath\}\/shift\/checkout-approvals`/,
  );
  assert.match(teamPageSource, /href:\s*`\$\{basePath\}\/stock\/count-slips`/);
  assert.match(
    teamPageSource,
    /href:\s*`\$\{basePath\}\/stock\/waste-approvals`/,
  );
  assert.match(teamPageSource, /href:\s*`\$\{basePath\}\/team\?tab=members`/);
  assert.match(
    teamPageSource,
    /href:\s*`\$\{basePath\}\/team\?tab=assignments`/,
  );

  assert.match(
    staffRuntimeSource,
    /const managerPendingTotal =\s*pendingCheckouts \+ pendingCountSlips \+ pendingWaste/,
  );
  assert.match(
    staffRuntimeSource,
    /<Link href=\{teamRoute\}>[\s\S]*Quản lý đội chi nhánh/,
  );
  assert.doesNotMatch(staffRuntimeSource, /title="Duyệt ca & kho"/);
  assert.doesNotMatch(staffRuntimeSource, /title="Nhân sự & Phân công"/);
  assert.doesNotMatch(staffRuntimeSource, /const teamMembersRoute/);
  assert.doesNotMatch(staffRuntimeSource, /const teamAssignmentsRoute/);
  assert.doesNotMatch(staffRuntimeSource, /const hrRoute/);
  assert.doesNotMatch(staffRuntimeSource, /HR_APPROVE_LEAVE_REQUEST/);
  assert.doesNotMatch(staffRuntimeSource, /leave_requests/);
  assert.doesNotMatch(
    shiftPageSource,
    /countSlips:|countAssignments:|hr:|leaveApprovals:/,
  );
});

test("operator team board reads branch runtime rows after branch access is checked", () => {
  assert.match(teamDataSource, /createServiceClient/);
  assert.match(teamDataSource, /const readClient = createServiceClient\(\)/);
  assert.match(teamDataSource, /readClient\s*\.from\("employees"\)/);
  assert.match(teamDataSource, /readClient\s*\.from\("attendance_records"\)/);
  assert.match(teamDataSource, /attendance_records"[\s\S]*employees \(/);
  assert.match(teamDataSource, /shifts \( name, start_time, end_time \)/);
  assert.match(
    teamDataSource,
    /const employee = embeddedRecord\(record\.employees\)/,
  );
  assert.match(
    teamDataSource,
    /employeeMetaById\.set\(record\.employee_id, meta\)/,
  );
  assert.match(teamDataSource, /readClient\s*\.from\("leave_requests"\)/);
  assert.match(
    teamDataSource,
    /readClient\s*\.from\("inventory_count_slips"\)/,
  );
  assert.doesNotMatch(teamDataSource, /supabase\s*\.from\("employees"\)/);
  assert.doesNotMatch(
    teamDataSource,
    /supabase\s*\.from\("attendance_records"\)/,
  );
});

test("operator team can force-close a shift only after its scheduled end", () => {
  assert.match(teamBoardSource, /function isPastShiftEnd/);
  assert.match(teamBoardSource, /parseClockTimeToMinutes\(shift\.shiftStartTime/);
  assert.match(teamBoardSource, /parseClockTimeToMinutes\(shift\.shiftEndTime/);
  assert.match(teamBoardSource, /effectiveEnd > 1440 && now < start/);
  assert.match(teamBoardSource, /isPastShiftEnd\(row\.shift\)/);
  assert.match(
    teamBoardSource,
    /forceCloseStaleAttendance\(\{\s*attendanceId: shift\.attendanceId,\s*branchId,\s*\}\)/,
  );
  assert.match(operatorMessagesSource, /drawerActionForceClose/);
  assert.match(operatorMessagesSource, /forceCloseNoWorkday/);
});

test("operator team board drawer keeps long shift details inside the drawer", () => {
  assert.match(
    teamBoardSource,
    /<DrawerContent className="flex max-h-dvh-80 flex-col overflow-hidden">/,
  );
  assert.match(
    teamBoardSource,
    /className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4"/,
  );
  assert.match(teamBoardSource, /data-vaul-no-drag=""/);
  assert.match(teamBoardSource, /className="break-words"/);
});

test("operator team members use a roster grid with real profile fields", () => {
  assert.match(teamMembersSource, /interface TeamMemberRow/);
  assert.match(teamMembersSource, /positionLabel/);
  assert.match(teamMembersSource, /todayStatus/);
  assert.match(
    teamMembersSource,
    /fetchEmployeeSummary\(activeMember\.employeeId\)/,
  );
  assert.match(
    teamMembersSource,
    /grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5/,
  );
  assert.match(teamMembersSource, /size="touch"/);
  assert.doesNotMatch(teamMembersSource, /h-7 cursor-pointer/);
  assert.doesNotMatch(teamMembersSource, /sm:grid-cols-3/);
  assert.match(
    teamMembersSource,
    /min-h-24 flex-col justify-center text-center/,
  );
  assert.match(teamMembersSource, /aria-pressed=\{active\}/);
  assert.match(teamMembersSource, /filterChips\.map/);
  assert.match(teamMembersSource, /grid grid-cols-2 gap-2/);
  assert.match(teamMembersSource, /typeof value === "string"/);
  assert.doesNotMatch(teamMembersSource, /DataTable/);
  assert.doesNotMatch(teamMembersSource, /SelectTrigger/);
  assert.doesNotMatch(teamMembersSource, /AppToolbar/);
  assert.doesNotMatch(teamMembersSource, /minHeight="mobile"/);
  assert.doesNotMatch(teamMembersSource, /attendanceRecords\.map/);
  assert.doesNotMatch(teamMembersSource, /leaves\.map/);
  assert.doesNotMatch(teamMembersSource, /\bemail\b/i);
  assert.match(teamMembersContentSource, /avatar_url/);
  assert.match(teamMembersContentSource, /birth_date/);
  assert.match(teamMembersContentSource, /positions\(label_vi\)/);
  assert.match(
    teamMembersContentSource,
    /const readClient = createServiceClient\(\)/,
  );
  assert.match(teamMembersContentSource, /readClient\s*\.from\("profiles"\)/);
  assert.match(teamMembersContentSource, /readClient\s*\.from\("employees"\)/);
  assert.match(
    teamMembersContentSource,
    /readClient[\s\S]*\.in\("profile_id", lookupProfileIds\)/,
  );
  assert.doesNotMatch(teamMembersContentSource, /\.eq\("profiles\.branch_id"/);
  assert.match(teamMembersContentSource, /attendance_records/);
  assert.match(teamMembersContentSource, /leave_requests/);
  assert.match(teamMembersContentSource, /inventory_count_slips/);
  assert.doesNotMatch(
    teamMembersContentSource,
    /supabase\s*\.from\("employees"\)/,
  );
  assert.match(
    teamMembersActionsSource,
    /user_role !== "owner" && user_role !== "branch_manager"/,
  );
  assert.match(teamMembersActionsSource, /branch_id !== employeeBranchId/);
  assert.match(
    teamMembersActionsSource,
    /\.eq\("branch_id", employeeBranchId\)/,
  );
});

test("embedded count assignments does not add an extra team tab wrapper", () => {
  const teamAssignmentsContentSource = readWeb(
    "app/(protected)/br/[branchId]/(operator)/team/assignments/assignments-content.tsx",
  );
  const branchCountAssignmentsSource = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
  );

  assert.match(
    teamAssignmentsContentSource,
    /<BranchCountAssignmentsClient data=\{data\} embeddedInTeam \/>/,
  );
  assert.match(
    branchCountAssignmentsSource,
    /const page = embeddedInTeam \? \(\s*panel\s*\) : \(\s*<BranchOperatorPage/,
  );
  assert.doesNotMatch(
    countAssignmentsSource,
    /return <div className="flex w-full flex-col gap-3">\{content\}<\/div>/,
  );
});

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
const countAssignmentsSource = readWeb(
  "app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
);
const staffRuntimeSource = readWeb("lib/staff-runtime/page.tsx");
const shiftPageSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
);
const clockActionsSource = readWeb("lib/staff-runtime/clock/actions.ts");
const staffCountActionsSource = readWeb("lib/staff-runtime/count/actions.ts");
const leaveActionsSource = readWeb(
  "app/(protected)/hr/leave-request-actions.ts",
);
const countAssignmentActionsSource = readWeb(
  "app/(protected)/inventory/count-assignments/actions.ts",
);
const countSlipActionsSource = readWeb(
  "app/(protected)/inventory/count-slips/actions.ts",
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
  assert.match(teamBoardSource, /function initialTeamBoardFilter/);
  assert.match(
    teamBoardSource,
    /filterCount\(rows, "needs_action", capabilities\) > 0[\s\S]*filterCount\(rows, "working", capabilities\) > 0/,
  );
  assert.match(
    teamBoardSource,
    /filter\.value === "all" \|\|[\s\S]*filterCount\(rows, filter\.value, capabilities\) > 0/,
  );
  assert.match(
    teamBoardSource,
    /className="no-scrollbar flex touch-pan-x gap-1\.5 overflow-x-auto overscroll-x-contain pb-1"/,
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
  assert.match(teamBoardSource, /grid gap-1\.5 md:grid-cols-2/);
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
  assert.match(operatorMessagesSource, /label:\s*"Theo dõi ca"/);
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

test("operator team opens the workspace tabs without a duplicate entry landing", () => {
  assert.match(teamPageSource, /<TeamWorkspaceTabs/);
  assert.doesNotMatch(
    teamPageSource,
    /managerEntryAriaLabel|reviewGroupTitle|peopleGroupTitle/,
  );
  assert.doesNotMatch(teamPageSource, /BranchOperatorActionSection/);
  assert.doesNotMatch(
    operatorMessagesSource,
    /managerEntryAriaLabel|reviewGroupTitle|peopleGroupTitle/,
  );

  assert.match(
    staffRuntimeSource,
    /const managerPendingTotal =\s*pendingCheckouts \+ pendingCountSlips \+ pendingWaste/,
  );
  assert.match(
    staffRuntimeSource,
    /render=\{<Link href=\{teamRoute\} \/>\}[\s\S]*Quản lý đội chi nhánh/,
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
  assert.match(teamDataSource, /permission: PERMISSION_KEYS\.HR_VIEW_EMPLOYEE/);
  assert.match(
    teamDataSource,
    /permissionBranchId: \(data\) => data\.branchId/,
  );
  assert.match(teamDataSource, /requireBranchScope: true/);
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

test("recurring count assignments alone do not create Team presence", () => {
  const signalSet = teamDataSource.match(
    /const signalEmployeeIds = new Set<number>\(\[([\s\S]*?)\]\);/,
  )?.[1];
  assert.ok(
    signalSet,
    "Team board must keep an explicit operational signal set",
  );
  assert.doesNotMatch(signalSet, /assignmentRows/);
});

test("operator team can force-close a shift only after its scheduled end", () => {
  assert.match(teamBoardSource, /function isPastShiftEnd/);
  assert.match(
    teamBoardSource,
    /isShiftEndedForBusinessDate\(shift\.businessDate/,
  );
  assert.match(teamBoardSource, /canApproveCheckoutForRow/);
  assert.match(
    teamBoardSource,
    /row\.positionRole === "cashier"[\s\S]*?row\.positionRole === "chef"[\s\S]*?row\.positionRole === "branch_staff"/,
  );
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
    /<DrawerContent className="flex max-h-dvh-80 flex-col overflow-hidden sm:mx-auto sm:max-w-2xl">/,
  );
  assert.match(
    teamBoardSource,
    /className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4"/,
  );
  assert.doesNotMatch(teamBoardSource, /data-vaul-no-drag/);
  assert.match(teamBoardSource, /className="break-words"/);
});

test("operator team shift rows open one detail drawer before focused actions", () => {
  assert.match(
    teamBoardSource,
    /<InteractiveCard[\s\S]*render=\{[\s\S]*<button type="button" onClick=\{\(\) => onOpenDrawer\(row\)\}/,
  );
  assert.doesNotMatch(teamBoardSource, /useLongPress|rowHref/);
  assert.match(
    teamBoardSource,
    /checkoutApprovalsHref\}\?attendanceId=\$\{drawerRow\.shift\?\.attendanceId\}/,
  );
  assert.match(
    teamBoardSource,
    /countSlipsHref\}\?employeeId=\$\{drawerRow\.employeeId\}/,
  );
  assert.match(teamBoardSource, /drawerActionCheckout/);
  assert.match(teamBoardSource, /drawerActionCountSubmitted/);
});

test("operator team members use a roster grid with real profile fields", () => {
  assert.match(teamMembersSource, /interface TeamMemberRow/);
  assert.match(teamMembersSource, /positionLabel/);
  assert.match(teamMembersSource, /todayStatus/);
  assert.match(
    teamMembersSource,
    /grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5/,
  );
  assert.match(teamMembersSource, /size="touch"/);
  assert.doesNotMatch(teamMembersSource, /h-7 cursor-pointer/);
  assert.match(teamMembersSource, /grid gap-2 sm:grid-cols-2/);
  assert.match(
    teamMembersSource,
    /min-h-24 flex-col justify-center text-center/,
  );
  assert.match(teamMembersSource, /aria-pressed=\{active\}/);
  assert.match(teamMembersSource, /filterChips\.map/);
  assert.match(
    teamMembersSource,
    /\.filter\(\s*\(chip\) => chip\.value === "all" \|\| chip\.count > 0,?\s*\)/,
  );
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
  assert.doesNotMatch(teamMembersContentSource, /birth_date/);
  assert.doesNotMatch(
    teamMembersContentSource,
    /\.select\("id, profile_id, employee_code, start_date/,
  );
  assert.match(teamMembersContentSource, /positions\(label_vi\)/);
  assert.match(
    teamMembersContentSource,
    /const readClient = createServiceClient\(\)/,
  );
  assert.match(
    teamMembersContentSource,
    /getAuthContextWithPermission\([\s\S]*PERMISSION_KEYS\.HR_VIEW_EMPLOYEE[\s\S]*branchId/,
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
  assert.doesNotMatch(teamMembersSource, /fetchEmployeeSummary|Tháng này/);
  assert.doesNotMatch(teamMembersSource, /birthDate|startDate|profileId/);
});

test("operator team stays read-only for HR and keeps focused status actions", () => {
  assert.match(
    teamTabsSource,
    /TeamWorkspaceTabValue = "board" \| "members"/,
  );
  assert.match(teamPageSource, /canApproveCheckout=\{canApproveCheckout\}/);
  assert.match(teamPageSource, /approverRole=\{claims\.user_role\}/);
  assert.match(teamPageSource, /canApproveCount=\{canApproveCount\}/);
  assert.match(
    teamBoardSource,
    /capabilities\.canApproveCount && row\.countStatus === "submitted"/,
  );
  assert.doesNotMatch(
    teamBoardSource,
    /row\.countStatus === "not_submitted"\s*\)/,
  );
});

test("team state is revalidated after its source workflows mutate", () => {
  for (const source of [
    clockActionsSource,
    staffCountActionsSource,
    leaveActionsSource,
    countAssignmentActionsSource,
    countSlipActionsSource,
  ]) {
    assert.match(source, /revalidatePath\(`\/br\/\$\{[^}]+\}\/team`\)/);
  }
});

test("count assignments remain in the Branch stock module", () => {
  const branchCountAssignmentsSource = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
  );

  assert.match(branchCountAssignmentsSource, /<BranchOperatorPage/);
  assert.match(branchCountAssignmentsSource, /const orderedEmployees =/);
  assert.match(
    branchCountAssignmentsSource,
    /Number\(rightAssigned\) - Number\(leftAssigned\)/,
  );
  assert.match(branchCountAssignmentsSource, /orderedEmployees\.map/);
  assert.doesNotMatch(
    countAssignmentsSource,
    /return <div className="flex w-full flex-col gap-3">\{content\}<\/div>/,
  );
});

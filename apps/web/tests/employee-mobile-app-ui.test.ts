import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWebSource(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function listWebSources(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return listWebSources(path);
      if (entry.isFile() && path.endsWith(".tsx")) return [path];
      return [];
    },
  );
}

const employeeUiSourcePaths = listWebSources("app/(protected)/employee");
const employeeContentSourcePaths = employeeUiSourcePaths.filter(
  (path) =>
    !path.endsWith("/layout.tsx") &&
    !path.endsWith("/loading.tsx") &&
    !path.endsWith("/error.tsx") &&
    !path.endsWith("/components/employee-page.tsx") &&
    !path.endsWith("/components/mobile-header.tsx") &&
    !path.endsWith("/components/bottom-nav.tsx") &&
    !path.endsWith("/components/employee-pwa-toolbar.tsx"),
);

const employeeLayoutSource = readWebSource(
  "app/(protected)/employee/layout.tsx",
);
const pwaRuntimeSource = readWebSource("app/components/pwa-runtime.tsx");
const employeePwaToolbarSource = readWebSource(
  "app/(protected)/employee/components/employee-pwa-toolbar.tsx",
);
const employeeHeaderSource = readWebSource(
  "app/(protected)/employee/components/mobile-header.tsx",
);
const employeeBottomNavSource = readWebSource(
  "app/(protected)/employee/components/bottom-nav.tsx",
);
const appBottomNavSource = readWebSource("app/components/app-bottom-nav.tsx");
const employeePageShellSource = readWebSource(
  "app/(protected)/employee/components/employee-page.tsx",
);
const employeeHomeSource = readWebSource("app/(protected)/employee/page.tsx");
const employeeTasksSource = readWebSource(
  "app/(protected)/employee/tasks/tasks-client.tsx",
);
const employeeTasksPageSource = readWebSource(
  "app/(protected)/employee/tasks/page.tsx",
);
const employeeClockSource = readWebSource(
  "app/(protected)/employee/clock/clock-client.tsx",
);
const employeeSchedulePageSource = readWebSource(
  "app/(protected)/employee/schedule/page.tsx",
);
const employeeScheduleClientSource = readWebSource(
  "app/(protected)/employee/schedule/schedule-client.tsx",
);
const employeeProfileSource = readWebSource(
  "app/(protected)/employee/profile/page.tsx",
);
const employeeLeaveClientSource = readWebSource(
  "app/(protected)/employee/leave/leave-client.tsx",
);
const employeePayslipYearPickerSource = readWebSource(
  "app/(protected)/employee/payslip/year-picker.tsx",
);
const employeePermissionsSource = readWebSource(
  "app/(protected)/employee/permissions/page.tsx",
);
const employeeMessagesSource = readWebSource("lib/messages/employee.ts");

test("Employee shell is phone-first and touch-safe", () => {
  assert.match(
    employeeLayoutSource,
    /bg-muted\/30/,
    "Employee portal should sit on an app-like surface background",
  );
  assert.match(
    employeeLayoutSource,
    /contentClassName="max-w-lg lg:max-w-3xl"/,
    "Employee content should stay phone-first instead of stretching like a dashboard",
  );
  assert.match(
    employeeLayoutSource,
    /<PwaRuntimeProvider>[\s\S]*<EmployeePwaToolbar \/>/,
    "Employee layout should mount the PWA runtime and install/offline toolbar inside the shell",
  );
  assert.match(
    employeeLayoutSource,
    /title: "Má Tư NV"/,
    "Employee installed app chrome should have a clear staff-facing title",
  );
  assert.match(
    employeeHeaderSource,
    /size="touch"[\s\S]*className="relative min-w-12 px-0"/,
    "Header notification control must stay touch-sized",
  );
  assert.match(
    employeeHeaderSource,
    /size="touch"[\s\S]*aria-label=\{copy\.profileAria\}[\s\S]*className="min-w-12 px-0"/,
    "Header profile control must stay touch-sized",
  );
  assert.match(
    employeeHeaderSource,
    /hidden truncate text-xs text-muted-foreground sm:block/,
    "Mobile header should hide the subtitle/position line on narrow screens",
  );
  assert.equal(
    (employeeBottomNavSource.match(/href: "\/employee/g) ?? []).length,
    4,
    "Employee bottom nav must stay at exactly four items",
  );
  assert.match(
    employeeBottomNavSource,
    /AppBottomNav/,
    "Employee bottom nav must delegate to the shared AppBottomNav primitive",
  );
  assert.match(
    appBottomNavSource,
    /size="touch"/,
    "AppBottomNav items must stay touch-sized",
  );
  assert.match(
    appBottomNavSource,
    /data-active=\{item\.active \? "true" : undefined\}/,
    "AppBottomNav must expose a clear active state for app-like feedback",
  );
  assert.doesNotMatch(
    appBottomNavSource,
    /active:translate-y-px|motion-safe:/,
    "AppBottomNav must not hand-roll motion tokens (design-system §313: animate-in only via Radix primitives)",
  );
});

test("Employee PWA shell explains install and offline state without persisted workflow storage", () => {
  assert.match(
    pwaRuntimeSource,
    /const \[isOnline, setIsOnline\] = useState\(true\)/,
    "PWA online state should stay hydration-safe on first paint",
  );
  assert.match(
    pwaRuntimeSource,
    /beforeinstallprompt/,
    "PWA runtime should capture the browser install prompt",
  );
  assert.match(
    employeePwaToolbarSource,
    /useIsOnline[\s\S]*useIsStandalone[\s\S]*useInstallPrompt/,
    "Employee PWA toolbar should read online, standalone, and install state from the runtime",
  );
  assert.match(
    employeePwaToolbarSource,
    /role="alert"[\s\S]*copy\.offline/,
    "Offline state should be visible in the Employee shell",
  );
  assert.match(
    employeePwaToolbarSource,
    /setHelpMode\(isIosPwaInstall \? "ios" : "browser"\)/,
    "Install action should fall back to clear platform instructions when no browser prompt is available",
  );
  assert.match(
    employeePwaToolbarSource,
    /DialogTitle>\{helpCopy\.title\}/,
    "Install instructions should use an accessible Dialog title",
  );
  assert.doesNotMatch(
    employeePwaToolbarSource,
    /localStorage|sessionStorage/,
    "Employee PWA shell must not persist scope or workflow state in browser storage",
  );
  assert.match(
    employeeMessagesSource,
    /pwa:\s*\{[\s\S]*installHint: "Cài app nhân viên để mở nhanh mỗi ca\."/,
    "Employee copy should name the staff app and explain the install job directly",
  );
});

test("Employee workflow surfaces keep one strong mobile action and list feedback", () => {
  assert.doesNotMatch(
    employeePageShellSource,
    /motion-safe:|animate-in/,
    "Employee shell must not hand-roll motion (design-system §313: animate-in only via Radix primitives)",
  );
  assert.match(
    employeePageShellSource,
    /EmployeePanel[\s\S]*className=\{cn\(/,
    "EmployeePanel must accept a className prop for caller-side customisation",
  );
  assert.match(
    employeePageShellSource,
    /EmployeeStatusStrip/,
    "EmployeeStatusStrip must remain defined in the employee-page shell",
  );
  assert.match(
    employeePageShellSource,
    /hideHeaderOnMobile[\s\S]*sr-only sm:not-sr-only/,
    "Employee pages should be able to remove duplicate mobile page headers",
  );
  assert.match(
    employeePageShellSource,
    /group\/employee-action/,
    "Shared Employee action rows must carry the group/employee-action marker",
  );
  assert.match(
    employeeHomeSource,
    /const primaryActionClassName =\s*"w-full sm:w-fit sm:min-w-44";/,
    "Home next action should keep a clear mobile-first hit area (motion tokens removed per design-system §313)",
  );
  assert.match(
    employeeHomeSource,
    /<Progress[\s\S]*className="h-2/,
    "Home progress bar must keep its h-2 size class",
  );
  assert.match(
    employeeHomeSource,
    /size="touch-lg"/,
    "Home next action should use the larger touch button size",
  );
  assert.match(
    employeeHomeSource,
    /hideHeaderOnMobile/,
    "Employee home should hide the repeated page header on mobile",
  );
  assert.match(
    employeeHomeSource,
    /EmployeeStatusStrip items=\{todaySummaryItems\}/,
    "Employee home should collapse metrics into a shared compact strip",
  );
  assert.doesNotMatch(
    employeeHomeSource,
    /WorkStepRail|workflowSteps/,
    "Employee home should not repeat the same state through a separate workflow rail",
  );
  assert.match(
    employeeHomeSource,
    /const operationHandoffs =\s*branchId && branchIsOperational && !isBranchManager\s*\?\s*OPERATION_HANDOFFS\.filter/,
    "Operation handoffs stay ACL-gated and require an operational branch",
  );
  const operationHandoffSource =
    employeeHomeSource.match(
      /const operationHandoffs =[\s\S]*?const tone = getWorkTone/,
    )?.[0] ?? "";
  assert.doesNotMatch(
    operationHandoffSource,
    /state\.(status|attendance)/,
    "Operation handoffs must not be tied to clock-in or working state",
  );
  assert.match(
    employeeTasksSource,
    /items-center bg-card/,
    "Checklist rows must keep their card surface and centered alignment",
  );
  assert.match(
    employeeTasksSource,
    /function sortPhaseItems[\s\S]*left\.done !== right\.done[\s\S]*left\.isRequired !== right\.isRequired[\s\S]*left\.sortOrder - right\.sortOrder/,
    "Checklist phase rows should keep unfinished and required work first while preserving template order",
  );
  assert.match(
    employeeTasksSource,
    /phaseRequiredRemaining[\s\S]*taskCopy\.requiredRemaining/,
    "Checklist phase headers should show required remaining work",
  );
  assert.match(
    employeeTasksSource,
    /border-success\/30 bg-success\/5/,
    "Completed checklist rows should read as done without changing the binary model",
  );
  assert.match(
    employeeTasksSource,
    /const router = useRouter\(\);[\s\S]*toggleChecklistItem[\s\S]*router\.refresh\(\);/,
    "Checklist toggles should refresh the server parent so the checkout CTA unlocks immediately",
  );
  assert.match(
    employeeTasksPageSource,
    /<EmployeePage title=\{copy\.shiftTasks\} hideHeaderOnMobile>/,
    "Tasks should avoid repeating the tab title in a mobile page header",
  );
  assert.match(
    employeeTasksPageSource,
    /item\.taskKind === "consumption_report"/,
    "Tasks should detect the consumption report workflow by taskKind, not display title",
  );
  assert.doesNotMatch(
    employeeTasksPageSource,
    /<EmployeePage[\s\S]*action=\{/,
    "Tasks primary actions should live inside the checklist panel, not the page header",
  );
  assert.match(
    employeeClockSource,
    /photo \? \([\s\S]*clockCopy\.clockInButton[\s\S]*\) : cameraState === "starting"/,
    "Clock-in submit action should render only after a photo exists",
  );
  assert.match(
    employeeClockSource,
    /cameraActive \? \(/,
    "Clock camera frame must be conditionally rendered when camera is active",
  );
  assert.match(
    employeeClockSource,
    /setCameraState\("starting"\);[\s\S]*waitForNextAnimationFrame\(\);[\s\S]*const video = videoRef\.current;[\s\S]*navigator\.mediaDevices\.getUserMedia/,
    "Clock camera startup should mount the video element before requesting a camera stream",
  );
  assert.match(
    employeeClockSource,
    /previewUrl/,
    "Clock photo preview must be conditionally rendered when a preview URL exists",
  );
  assert.doesNotMatch(
    employeeClockSource,
    /disabled=\{[\s\S]*!photo[\s\S]*clockCopy\.clockInButton/,
    "Clock flow should not show a disabled Chấm công vào button before a photo exists",
  );
  assert.match(
    employeeClockSource,
    /const attendanceId = state\.attendance\?\.id;[\s\S]*requestCheckoutApproval\(\{ attendanceId \}\)/,
    "Clock checkout must target the current attendance record",
  );
  assert.match(
    employeeSchedulePageSource,
    /<EmployeePage title=\{copy\.scheduleTitle\} hideHeaderOnMobile>/,
    "Schedule should avoid a duplicate mobile page header",
  );
  assert.doesNotMatch(
    employeeScheduleClientSource,
    /copy\.monthPanelTitle|copy\.monthListTitle/,
    "Schedule should not split month controls and the calendar into two panels",
  );
  assert.match(
    employeeScheduleClientSource,
    /<EmployeeControlBar>[\s\S]*\{formatMonthTitle\(monthStart\)\}[\s\S]*!isCurrentMonth[\s\S]*copy\.currentMonth/,
    "Schedule should use the viewed month inside the month switcher, with Tháng này only as a return action",
  );
  assert.doesNotMatch(
    employeeScheduleClientSource,
    /calendarAxisLabel|monthRangeLabel/,
    "Schedule should not render a vague Lịch label or a separate date-range header above the calendar",
  );
  assert.match(
    employeeScheduleClientSource,
    /function getDefaultSelectedDate[\s\S]*const \[selectedDate, setSelectedDate\]/,
    "Schedule should default the selected day from today or the first active day",
  );
  assert.match(
    employeeScheduleClientSource,
    /function SelectedDayDetail[\s\S]*\{formatDate\(dateStr\)\}[\s\S]*const timeText = hasClock[\s\S]*\{timeText\}/,
    "Schedule selected-day detail should stay compact on mobile: date header plus one row per shift",
  );
  assert.doesNotMatch(
    employeeScheduleClientSource,
    /copy\.selectedDayTitle|EmployeeDetailList|copy\.timeRange|copy\.clockRange/,
    "Schedule selected-day detail should not reintroduce verbose labels for every shift",
  );
  const calendarCellSource =
    employeeScheduleClientSource.match(
      /function CalendarCellContent[\s\S]*function ScheduleMonthCalendarTable/,
    )?.[0] ?? "";
  assert.doesNotMatch(
    calendarCellSource,
    /copy\.rest/,
    "Mobile calendar cells should not render Nghỉ text in every empty day",
  );
  assert.match(
    calendarCellSource,
    /aria-pressed=\{selected\}/,
    "Calendar cells should be tappable and expose the selected day state",
  );
  assert.match(
    calendarCellSource,
    /selected &&[\s\S]*shadow-sm/,
    "Selected calendar day should provide clear visual feedback via shadow",
  );
  assert.match(
    employeeScheduleClientSource,
    /<SelectedDayDetail[\s\S]*key=\{selectedDate\}/,
    "Selected-day detail should remount cleanly when the user taps another day",
  );
  assert.match(
    employeeScheduleClientSource,
    /function SelectedDayDetail[\s\S]*<EmployeeFrame pad="sm"/,
    "Selected-day detail should use the shared Employee frame instead of a hand-rolled card",
  );
  assert.match(
    employeeScheduleClientSource,
    /href="\/employee\/leave"/,
    "Schedule should expose leave request as a secondary in-panel action",
  );
  assert.doesNotMatch(
    employeeScheduleClientSource,
    /shift-register/,
    "Shift registration flow was removed — schedule must not link to it",
  );
  assert.match(
    employeeScheduleClientSource,
    /Alert variant="destructive"[\s\S]*<AlertTitle>\{copy\.loadError\}<\/AlertTitle>/,
    "Schedule load errors should use the shared Alert primitive",
  );
  assert.match(
    employeeProfileSource,
    /<EmployeePage[\s\S]*hideHeaderOnMobile/,
    "Profile should use the app shell instead of a repeated mobile page header",
  );
  assert.match(
    employeeProfileSource,
    /title=\{copy\.workspaceLauncherTitle\}[\s\S]*links=\{workspaceLinks\}/,
    "Profile should surface the ACL-driven workspace launcher via EmployeeActionSection",
  );
  assert.doesNotMatch(
    employeeProfileSource,
    /ManagerToolsSheet|MANAGER_LINKS/,
    "Profile should no longer use the hand-maintained manager-tools sheet",
  );
});

test("Employee route family uses shared surface primitives instead of raw UI fragments", () => {
  assert.match(
    employeePageShellSource,
    /function EmployeeFrame[\s\S]*data-employee-frame/,
    "Employee surfaces should centralize framed content through EmployeeFrame",
  );
  assert.match(
    employeePageShellSource,
    /function EmployeeInlineState[\s\S]*<Item[\s\S]*variant=\{tone === "default" \? "muted" : "outline"\}/,
    "Small Employee state rows should delegate to the shared Item primitive",
  );
  assert.match(
    employeePageShellSource,
    /function EmployeeActionBar[\s\S]*data-employee-action-bar/,
    "Employee CTA rows should share one action bar rhythm",
  );
  assert.match(
    employeePageShellSource,
    /function EmployeeBadgeList[\s\S]*data-employee-badge-list/,
    "Employee badge clouds should share one grouping primitive",
  );

  for (const path of employeeUiSourcePaths) {
    const source = readWebSource(path);
    assert.doesNotMatch(
      source,
      /space-y-/,
      `${path} should use explicit flex/grid gap instead of space-y shortcuts`,
    );
    assert.doesNotMatch(
      source,
      /@comtammatu\/ui\/components\/empty|<Empty/,
      `${path} should use AppEmptyState or EmployeeMissingProfileEmpty, not raw Empty primitives`,
    );
    assert.doesNotMatch(
      source,
      /<Spinner className=/,
      `${path} should use Spinner data-icon placement instead of margin utility classes`,
    );
  }

  for (const path of employeeContentSourcePaths) {
    const source = readWebSource(path);
    assert.doesNotMatch(
      source,
      /rounded-(md|lg|xl|2xl)\s+border|bg-card\s+p-\d|bg-muted\/40\s+p-\d/,
      `${path} should not hand-roll card/frame surfaces inside Employee content routes`,
    );
  }

  assert.match(
    employeeTasksSource,
    /<section[\s\S]*aria-labelledby=\{headingId\}/,
    "Checklist phases should be semantic sections with explicit gap rhythm",
  );
  assert.match(
    employeeClockSource,
    /<EmployeeFrame className="overflow-hidden bg-muted\/40">/,
    "Clock camera preview should use EmployeeFrame instead of raw rounded borders",
  );
  assert.match(
    employeeClockSource,
    /<EmployeeInlineState[\s\S]*title=\{clockCopy\.photoReadyTitle\}/,
    "Clock photo confirmation should use EmployeeInlineState",
  );
  assert.match(
    employeeScheduleClientSource,
    /function ScheduleMonthCalendarTable[\s\S]*<EmployeeFrame className="overflow-hidden">/,
    "Schedule calendar frame should be centralized through EmployeeFrame",
  );
  assert.match(
    employeeLeaveClientSource,
    /<EmployeeActionBar>[\s\S]*copy\.newRequestButton/,
    "Leave request CTA should use the shared Employee action bar",
  );
  assert.match(
    employeePayslipYearPickerSource,
    /<EmployeeControlBar>[\s\S]*copy\.currentYear/,
    "Payslip year controls should use the shared Employee control bar",
  );
  assert.match(
    employeePermissionsSource,
    /<EmployeeBadgeList/,
    "Permissions badge groups should use the shared Employee badge list",
  );
  const checkoutApprovalsSource = readWebSource(
    "app/(protected)/employee/checkout-approvals/checkout-approvals-client.tsx",
  );
  assert.match(
    checkoutApprovalsSource,
    /async function approveConsumption[\s\S]*await confirm\([\s\S]*Duyệt và áp Inventory\?/,
    "Consumption approval must confirm before applying Inventory",
  );
  assert.match(
    checkoutApprovalsSource,
    /requiresConsumptionReport[\s\S]*status === "approved" \|\| status === "applied"/,
    "Checkout approval UI should block only when a required consumption report is not approved/applied",
  );
  assert.match(
    checkoutApprovalsSource,
    /function getCheckoutBlockLabel[\s\S]*Chưa gửi tiêu hao[\s\S]*Cần duyệt tiêu hao[\s\S]*Chờ nhân viên chỉnh sửa/,
    "Checkout approval cards should explain why checkout approval is blocked by consumption review",
  );
  assert.match(
    checkoutApprovalsSource,
    /Duyệt kết ca/,
    "Checkout approval primary action should name the final checkout approval step",
  );
});

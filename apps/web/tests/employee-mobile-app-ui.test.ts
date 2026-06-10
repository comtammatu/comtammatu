import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWebSource(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const employeeLayoutSource = readWebSource(
  "app/(protected)/employee/layout.tsx",
);
const employeeHeaderSource = readWebSource(
  "app/(protected)/employee/components/mobile-header.tsx",
);
const employeeBottomNavSource = readWebSource(
  "app/(protected)/employee/components/bottom-nav.tsx",
);
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
const employeeProfileManagerSheetSource = readWebSource(
  "app/(protected)/employee/profile/manager-tools-sheet.tsx",
);

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
    /size="touch"[\s\S]*active:translate-y-px/,
    "Bottom navigation should provide stable native-like touch feedback",
  );
  assert.match(
    employeeBottomNavSource,
    /data-active=\{active \? "true" : undefined\}/,
    "Bottom navigation should expose a clear active state for app-like feedback",
  );
  assert.match(
    employeeBottomNavSource,
    /active &&[\s\S]*motion-safe:zoom-in-95/,
    "Bottom navigation active tab should use motion-safe feedback only",
  );
});

test("Employee workflow surfaces keep one strong mobile action and list feedback", () => {
  assert.match(
    employeePageShellSource,
    /motion-safe:animate-in/,
    "Employee route pages should use motion-safe entry animation only",
  );
  assert.match(
    employeePageShellSource,
    /EmployeePanel[\s\S]*className=\{cn\([\s\S]*motion-safe:slide-in-from-bottom-1/,
    "Employee panels should inherit a subtle motion-safe entrance effect",
  );
  assert.match(
    employeePageShellSource,
    /EmployeeStatusStrip[\s\S]*motion-safe:zoom-in-95/,
    "Compact status metrics should have app-like motion-safe entry feedback",
  );
  assert.match(
    employeePageShellSource,
    /hideHeaderOnMobile[\s\S]*sr-only sm:not-sr-only/,
    "Employee pages should be able to remove duplicate mobile page headers",
  );
  assert.match(
    employeePageShellSource,
    /group\/employee-action[\s\S]*active:translate-y-px[\s\S]*motion-safe:hover:-translate-y-px/,
    "Shared Employee action rows should feel tappable on mobile",
  );
  assert.match(
    employeeHomeSource,
    /const primaryActionClassName =\s*"w-full motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200 sm:w-fit sm:min-w-44";/,
    "Home next action should keep a clear mobile-first hit area",
  );
  assert.match(
    employeeHomeSource,
    /<Progress[\s\S]*className="h-2 motion-safe:animate-in/,
    "Home progress should feel live without relying on motion for meaning",
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
    /const operationHandoffs =\s*state\.status === "working" &&/,
    "Operation handoffs must not crowd ready-to-checkout or done states",
  );
  assert.match(
    employeeTasksSource,
    /min-h-16 items-center bg-card[\s\S]*motion-safe:hover:-translate-y-px/,
    "Checklist rows should keep touch feedback",
  );
  assert.match(
    employeeTasksSource,
    /border-success\/30 bg-success\/5/,
    "Completed checklist rows should read as done without changing the binary model",
  );
  assert.match(
    employeeTasksPageSource,
    /<EmployeePage title=\{copy\.shiftTasks\} hideHeaderOnMobile>/,
    "Tasks should avoid repeating the tab title in a mobile page header",
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
    /cameraActive \? \([\s\S]*motion-safe:zoom-in-95/,
    "Clock camera frame should enter with motion-safe feedback",
  );
  assert.match(
    employeeClockSource,
    /previewUrl \? \([\s\S]*motion-safe:zoom-in-95/,
    "Clock photo preview should confirm capture with motion-safe feedback",
  );
  assert.doesNotMatch(
    employeeClockSource,
    /disabled=\{[\s\S]*!photo[\s\S]*clockCopy\.clockInButton/,
    "Clock flow should not show a disabled Chấm công vào button before a photo exists",
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
    /title=\{formatMonthTitle\(monthStart\)\}[\s\S]*description=\{monthRangeLabel\}/,
    "Schedule should use the viewed month as the single calendar panel title",
  );
  assert.match(
    employeeScheduleClientSource,
    /function getDefaultSelectedDate[\s\S]*const \[selectedDate, setSelectedDate\]/,
    "Schedule should default the selected day from today or the first active day",
  );
  assert.match(
    employeeScheduleClientSource,
    /function SelectedDayDetail[\s\S]*copy\.selectedDayTitle[\s\S]*copy\.clockRange/,
    "Schedule should show selected-day shift, attendance, and clock detail below the calendar",
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
    /selected &&[\s\S]*shadow-sm[\s\S]*motion-safe:zoom-in-95/,
    "Selected calendar day should provide clear motion-safe feedback",
  );
  assert.match(
    employeeScheduleClientSource,
    /<SelectedDayDetail[\s\S]*key=\{selectedDate\}/,
    "Selected-day detail should remount cleanly when the user taps another day",
  );
  assert.match(
    employeeScheduleClientSource,
    /function SelectedDayDetail[\s\S]*motion-safe:slide-in-from-bottom-1/,
    "Selected-day detail should use a subtle motion-safe entry transition",
  );
  assert.match(
    employeeScheduleClientSource,
    /href="\/employee\/shift-register"/,
    "Schedule should expose shift registration as a secondary in-panel action",
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
    /ManagerToolsSheet links=\{managerLinks\}/,
    "Profile should collapse Branch Manager tools into the manager sheet entry",
  );
  assert.match(
    employeeProfileManagerSheetSource,
    /SheetContent[\s\S]*side="bottom"/,
    "Manager tools should open from a bottom sheet rather than crowding the profile viewport",
  );
  assert.match(
    employeeProfileManagerSheetSource,
    /motion-safe:slide-in-from-bottom-1[\s\S]*managerToolsEntryTitle/,
    "Manager tools collapsed entry should feel tappable without exposing the tool list in the first viewport",
  );
  assert.match(
    employeeProfileManagerSheetSource,
    /group\/manager-tool[\s\S]*motion-safe:hover:-translate-y-px/,
    "Manager tool rows should keep app-like touch feedback inside the sheet",
  );
  assert.match(
    employeeProfileManagerSheetSource,
    /copy\.managerToolsEntryTitle/,
    "Manager tools should have a single collapsed profile entry",
  );
  assert.doesNotMatch(
    employeeProfileSource,
    /personalToolsDescription|managerToolsDescription|title=\{homeCopy\.managerToolsTitle\}/,
    "Profile hub link groups should stay compact and avoid duplicate explanatory copy",
  );
});

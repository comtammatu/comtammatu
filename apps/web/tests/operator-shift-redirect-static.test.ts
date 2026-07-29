import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

test("operator shift tasks is folded into the branch shift workflow", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/tasks/page.tsx";

  assert.equal(exists(path), false, path);

  const shiftSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );
  assert.ok(
    shiftSource.includes("tasks: `/br/${branchId}/shift`"),
    "task work opens the canonical shift workflow",
  );
  assert.doesNotMatch(shiftSource, /shift\/tasks/);
});

test("operator shift schedule renders the branch schedule plane", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes(
      'import { StaffSchedulePageContent } from "@lib/staff-runtime/schedule/page"',
    ),
    path,
  );
  assert.ok(
    source.includes("leaveHref={`/br/${branchId}/shift/schedule/leave`}"),
    path,
  );
  assert.ok(source.includes('plane="branch"'), path);
  assert.doesNotMatch(source, /redirect\("\/employee\/schedule"\)/);

  const schedulePageSource = read(
    "apps/web/lib/staff-runtime/schedule/page.tsx",
  );
  const scheduleClientSource = read(
    "apps/web/lib/staff-runtime/schedule/schedule-client.tsx",
  );
  assert.match(schedulePageSource, /plane === "branch" \? BranchOperatorPage/);
  assert.match(schedulePageSource, /ScheduleClient[\s\S]*plane=\{plane\}/);
  assert.match(scheduleClientSource, /BRANCH_SCHEDULE_PRIMITIVES/);
  assert.match(scheduleClientSource, /plane === "branch"/);
});

test("operator shift leave renders inside the schedule route family", () => {
  const oldPath =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/leave/page.tsx";
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/leave/page.tsx";

  assert.equal(exists(oldPath), false, oldPath);
  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes(
      'import { EmployeeLeavePageContent } from "@lib/staff-runtime/leave/page"',
    ),
    path,
  );
  assert.ok(source.includes("returnHref={`/br/${branchId}/shift/schedule`}"));
  assert.ok(source.includes("routeBranchId={branchId}"), path);
  assert.ok(source.includes("hideHeaderOnMobile"), path);
  assert.doesNotMatch(source, /redirect\("\/employee\/leave"\)/);
});

test("operator payslip renders inside the profile route family", () => {
  const oldPath =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/payslip/page.tsx";
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/profile/payslip/page.tsx";

  assert.equal(exists(oldPath), false, oldPath);
  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes(
      'import { StaffPayslipPageContent } from "@lib/staff-runtime/payslip/page"',
    ),
    path,
  );
  assert.ok(source.includes("hideHeaderOnMobile"), path);
  assert.ok(source.includes('plane="branch"'), path);
  assert.doesNotMatch(source, /redirect\("\/employee\/payslip"\)/);

  const payslipPageSource = read("apps/web/lib/staff-runtime/payslip/page.tsx");
  const payslipClientSource = read(
    "apps/web/lib/staff-runtime/payslip/payslip-client.tsx",
  );
  const yearPickerSource = read(
    "apps/web/lib/staff-runtime/payslip/year-picker.tsx",
  );
  assert.match(payslipPageSource, /plane === "branch" \? BranchOperatorPage/);
  assert.match(payslipPageSource, /PayslipClient[\s\S]*plane=\{props\.plane\}/);
  assert.match(payslipClientSource, /plane === "branch"/);
  assert.match(payslipClientSource, /BranchOperatorPanel/);
  assert.match(payslipClientSource, /BranchOperatorDetailList/);
  assert.match(yearPickerSource, /BranchOperatorControlBar/);
});

test("operator checkout approvals render the branch approvals plane", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/checkout-approvals/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  const employeeSource = read(
    "apps/web/lib/staff-runtime/checkout-approvals/page.tsx",
  );
  const clientSource = read(
    "apps/web/lib/staff-runtime/checkout-approvals/checkout-approvals-client.tsx",
  );

  assert.ok(
    source.includes(
      'import { StaffCheckoutApprovalsPageContent } from "@lib/staff-runtime/checkout-approvals/page"',
    ),
    path,
  );
  assert.ok(source.includes("routeBranchId={branchId}"), path);
  assert.ok(source.includes("hideHeaderOnMobile"), path);
  assert.ok(source.includes('plane="branch"'), path);
  assert.doesNotMatch(source, /redirect\("\/employee\/checkout-approvals"\)/);
  assert.match(employeeSource, /routeBranchId: number/);
  assert.match(employeeSource, /plane === "branch" \? BranchOperatorPage/);
  assert.match(employeeSource, /plane === "branch" \? BranchOperatorPanel/);
  assert.match(source, /searchParams/);
  assert.match(source, /focusAttendanceId=/);
  assert.match(employeeSource, /focusAttendanceId=\{focusAttendanceId\}/);
  assert.match(employeeSource, /plane === "employee" \? \(/);
  assert.match(employeeSource, /plane === "branch" \? \(/);
  assert.match(
    clientSource,
    /items\.find\(\(item\) => item\.id === focusAttendanceId\)/,
  );
});

test("operator stock count renders the branch count plane", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes(
      'import { StaffCountPageContent } from "@lib/staff-runtime/count/page"',
    ),
    path,
  );
  assert.ok(source.includes("routeBranchId={branchId}"), path);
  assert.ok(source.includes("hideHeaderOnMobile"), path);
  assert.ok(source.includes('plane="branch"'), path);
  assert.doesNotMatch(source, /redirect\(`\/inventory\/stocktake/);
});

test("staff count client requires its canonical current route", () => {
  const source = read("apps/web/lib/staff-runtime/count/count-client.tsx");
  const pageSource = read("apps/web/lib/staff-runtime/count/page.tsx");

  assert.ok(source.includes("baseHref: string;"));
  assert.doesNotMatch(source, /baseHref = "\/br"/);
  assert.match(
    pageSource,
    /baseHref=\{baseHref \?\? `\/br\/\$\{branchId\}\/stock\/count`\}/,
  );
  assert.ok(
    source.includes("router.replace(`${baseHref}?${params.toString()}`)"),
  );
});

test("employee count page takes visible copy from employee messages", () => {
  const source = read("apps/web/lib/staff-runtime/count/page.tsx");

  assert.ok(source.includes("const copy = messages.employee.count"), source);
  for (const hardcoded of [
    "Kiểm kê tồn",
    "Chưa thể kiểm kê",
    "Chưa được giao đếm",
    "Nguyên liệu",
  ]) {
    assert.doesNotMatch(source, new RegExp(`"${hardcoded}"`), hardcoded);
  }
});

test("operator shift clock renders the branch clock plane", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/clock/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes(
      'import { StaffClockPageContent } from "@lib/staff-runtime/clock/page"',
    ),
    path,
  );
  assert.ok(source.includes('plane="branch"'), path);
  for (const expected of [
    // Clock-in (floor roles) and clock-out both return to branch home, where
    // POS/KDS tiles unlock after clock-in.
    "home: `/br/${branchId}`",
    "tasks: `/br/${branchId}/shift`",
    "schedule: `/br/${branchId}/shift/schedule`",
  ]) {
    assert.ok(source.includes(expected), expected);
  }
  assert.doesNotMatch(source, /redirect\("\/employee\/clock"\)/);

  const clockPageSource = read("apps/web/lib/staff-runtime/clock/page.tsx");
  const clockClientSource = read(
    "apps/web/lib/staff-runtime/clock/clock-client.tsx",
  );
  assert.match(clockPageSource, /plane === "branch" \? BranchOperatorPage/);
  assert.match(clockPageSource, /ClockClient[\s\S]*plane=\{plane\}/);
  assert.match(clockClientSource, /BRANCH_CLOCK_PRIMITIVES/);
  assert.match(clockClientSource, /plane === "branch"/);
});

test("operator profile renders inside the branch operator shell", () => {
  const oldPath =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/profile/page.tsx";
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/profile/page.tsx";

  assert.equal(exists(oldPath), false, oldPath);
  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes('import { notFound } from "next/navigation";'),
    path,
  );
  assert.ok(
    source.includes(
      'import { StaffProfilePageContent } from "@lib/staff-runtime/profile/page";',
    ),
    path,
  );
  assert.ok(source.includes("params: Promise<{ branchId: string }>"), path);
  assert.ok(source.includes("const branchId = Number(rawBranchId);"), path);
  assert.ok(source.includes("notFound()"), path);
  assert.ok(
    source.includes('return <StaffProfilePageContent plane="branch" />;'),
    path,
  );
  assert.doesNotMatch(source, /PERSONAL_LINKS/);
  assert.doesNotMatch(source, /profile\/payslip/);
  assert.doesNotMatch(source, /shift\/leave/);
  assert.doesNotMatch(source, /shift\/payslip/);
  assert.doesNotMatch(source, /export \{ default \}/);
  assert.doesNotMatch(source, /redirect\("\/employee\/profile"\)/);

  const profileSource = read("apps/web/lib/staff-runtime/profile/page.tsx");
  assert.match(profileSource, /StaffProfilePageContent/);
  assert.match(profileSource, /plane === "branch"/);
  assert.match(profileSource, /BranchOperatorPage/);
  assert.match(profileSource, /BranchOperatorPanel/);
  assert.match(profileSource, /BranchOperatorActionBar/);
  assert.match(profileSource, /BranchOperatorDetailList/);
  assert.doesNotMatch(profileSource, /text-4xl/);
});

test("operator shift landing renders the shared cockpit with branch-scoped routes", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );

  assert.ok(
    source.includes("StaffWorkdayPageContent"),
    "shift route uses the shared daily cockpit",
  );
  assert.ok(source.includes("tasks: `/br/${branchId}/shift`"));
  for (const segment of ["clock", "schedule"] as const) {
    assert.ok(
      source.includes(`${segment}: \`/br/${"${branchId}"}/shift/${segment}\``),
      segment,
    );
  }
  assert.ok(source.includes("count: `/br/${branchId}/stock/count`"));
  assert.ok(source.includes("profile: `/br/${branchId}/profile`"));
  assert.doesNotMatch(source, /shift\/profile/);
  assert.doesNotMatch(source, /shift\/schedule\/leave/);
  assert.doesNotMatch(source, /profile\/payslip/);
  assert.ok(
    source.includes(
      "checkoutApprovals: `/br/${branchId}/shift/checkout-approvals`",
    ),
  );
  assert.ok(source.includes("showNotificationControl={false}"));
  assert.ok(source.includes('plane="branch"'));
  assert.ok(source.includes("copy={messages.operator.shift}"));
  assert.ok(source.includes("tasksCopy={messages.operator.shiftTasks}"));
  assert.doesNotMatch(source, /showPersonalActions/);
  assert.match(source, /const authState = await loadAuthState\(\)/);
  assert.match(
    source,
    /authState\.claims\.user_role === "owner"[\s\S]*redirect\(`\/br\/\$\{branchId\}\/team`\)/,
  );
  assert.match(source, /authState\.claims\.user_role === "branch_manager"/);
  assert.match(
    source,
    /mode=\{isBranchManager \? "manager-dashboard" : "full"\}/,
  );
  assert.doesNotMatch(source, /mode="manager-dashboard"/);
  assert.doesNotMatch(
    source,
    /BranchOperatorActionSection|AppLinkCard|LinkCardGrid/,
  );
});

test("employee daily cockpit does not own profile or leave self-service", () => {
  const source = read("apps/web/lib/staff-runtime/page.tsx");

  assert.match(source, /mode = "full"/);
  assert.match(
    source,
    /mode\?: "full" \| "today-card" \| "compact-status" \| "manager-dashboard"/,
  );
  assert.match(source, /if \(mode === "today-card"\) return todayCard/);
  assert.doesNotMatch(source, /showPersonalActions/);
  assert.doesNotMatch(
    source,
    /messages\.employee\.profile\.personalToolsTitle/,
  );
  assert.doesNotMatch(source, /key: "profile"|key: "payslip"|key: "leave"/);
  assert.doesNotMatch(source, /href: routes\.(payslip|leave)/);
});

test("operator home uses the Branch operator action layout", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.ok(
    source.includes("BranchOperatorPage"),
    "operator home uses Branch operator page shell",
  );
  assert.ok(
    source.includes("BranchOperatorActionSection"),
    "operator home uses domain tile rows via Branch action rows",
  );
  // Landing hierarchy W2: the unified "Cần xử lý" queue collapses to compact
  // single-line rows (Item/ItemMedia/ItemActions), not full AppLinkCard
  // tiles — domain tile rows below it still render through
  // BranchOperatorActionSection.
  const queueSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-queue-section.tsx",
  );
  assert.match(queueSource, /CompactQueueSection/);
  assert.match(queueSource, /QueueRowItem/);
});

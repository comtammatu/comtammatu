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

test("operator shift schedule renders inside the branch operator shell", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes(
      'import { SchedulePageContent } from "@lib/employee/schedule/page"',
    ),
    path,
  );
  assert.ok(
    source.includes("leaveHref={`/br/${branchId}/shift/schedule/leave`}"),
    path,
  );
  assert.doesNotMatch(source, /redirect\("\/employee\/schedule"\)/);
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
      'import { EmployeeLeavePageContent } from "@lib/employee/leave/page"',
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
      'import { PayslipPageContent } from "@lib/employee/payslip/page"',
    ),
    path,
  );
  assert.ok(source.includes("hideHeaderOnMobile"), path);
  assert.doesNotMatch(source, /redirect\("\/employee\/payslip"\)/);
});

test("operator checkout approvals render inside the branch operator shell", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/checkout-approvals/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  const employeeSource = read(
    "apps/web/lib/employee/checkout-approvals/page.tsx",
  );

  assert.ok(
    source.includes(
      'import { CheckoutApprovalsPageContent } from "@lib/employee/checkout-approvals/page"',
    ),
    path,
  );
  assert.ok(source.includes("routeBranchId={branchId}"), path);
  assert.ok(source.includes("hideHeaderOnMobile"), path);
  assert.doesNotMatch(source, /redirect\("\/employee\/checkout-approvals"\)/);
  assert.match(employeeSource, /routeBranchId\?: number/);
});

test("operator stock count renders employee count inside the branch operator shell", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes(
      'import { EmployeeCountPageContent } from "@lib/employee/count/page"',
    ),
    path,
  );
  assert.ok(source.includes("routeBranchId={branchId}"), path);
  assert.ok(source.includes("hideHeaderOnMobile"), path);
  assert.doesNotMatch(source, /redirect\(`\/inventory\/stocktake/);
});

test("employee count client keeps location changes on the current route", () => {
  const source = read("apps/web/lib/employee/count/count-client.tsx");

  assert.ok(source.includes('baseHref = "/br"'));
  assert.ok(
    source.includes("router.replace(`${baseHref}?${params.toString()}`)"),
  );
});

test("employee count page takes visible copy from employee messages", () => {
  const source = read("apps/web/lib/employee/count/page.tsx");

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

test("operator shift clock renders inside the branch operator shell", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/clock/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes(
      'import { ClockPageContent } from "@lib/employee/clock/page"',
    ),
    path,
  );
  for (const expected of [
    "home: `/br/${branchId}/shift`",
    "tasks: `/br/${branchId}/shift`",
    "schedule: `/br/${branchId}/shift/schedule`",
  ]) {
    assert.ok(source.includes(expected), expected);
  }
  assert.doesNotMatch(source, /redirect\("\/employee\/clock"\)/);
});

test("operator profile renders inside the branch operator shell", () => {
  const oldPath =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/profile/page.tsx";
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/profile/page.tsx";

  assert.equal(exists(oldPath), false, oldPath);
  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(source.includes('from "@lib/employee/profile/page"'), path);
  assert.ok(source.includes("PERSONAL_LINKS"), path);
  assert.ok(source.includes("ProfilePageContent"), path);
  assert.ok(source.includes("href: `/br/${branchId}/profile/payslip`"), path);
  assert.doesNotMatch(source, /shift\/leave/);
  assert.doesNotMatch(source, /shift\/payslip/);
  assert.doesNotMatch(source, /export \{ default \}/);
  assert.doesNotMatch(source, /redirect\("\/employee\/profile"\)/);
});

test("operator shift landing renders the shared cockpit with branch-scoped routes", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );

  assert.ok(
    source.includes("EmployeeHomePageContent"),
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
  assert.doesNotMatch(source, /showPersonalActions/);
  assert.ok(source.includes('workflowLayout="stepper"'));
  assert.doesNotMatch(source, /EmployeeActionSection|AppLinkCard|LinkCardGrid/);
});

test("employee daily cockpit does not own profile or leave self-service", () => {
  const source = read("apps/web/lib/employee/page.tsx");

  assert.match(source, /mode = "full"/);
  assert.match(source, /mode\?: "full" \| "today-card"/);
  assert.match(source, /if \(mode === "today-card"\) return todayCard/);
  assert.doesNotMatch(source, /showPersonalActions/);
  assert.doesNotMatch(
    source,
    /messages\.employee\.profile\.personalToolsTitle/,
  );
  assert.doesNotMatch(source, /key: "profile"|key: "payslip"|key: "leave"/);
  assert.doesNotMatch(source, /href: routes\.(payslip|leave)/);
});

test("operator home uses the shared employee action layout", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.ok(
    source.includes("EmployeePage"),
    "operator home uses shared page shell",
  );
  assert.ok(
    source.includes("EmployeeActionSection"),
    "operator home uses domain tile rows via shared action rows",
  );
  // Hub hierarchy W2: the unified "Cần xử lý" queue collapses to compact
  // single-line rows (Item/ItemMedia/ItemActions), not full AppLinkCard
  // tiles — domain tile rows below it still render through
  // EmployeeActionSection.
  assert.match(source, /CompactQueueSection/);
  assert.match(source, /QueueRowItem/);
});

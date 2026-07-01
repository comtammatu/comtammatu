import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

test("operator shift tasks renders inside the branch operator shell", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/tasks/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes('import { EmployeeTasksPageContent } from "@/(protected)/employee/tasks/page"'),
    path,
  );
  assert.ok(
    source.includes("clockHref={`/br/${branchId}/shift/clock`}"),
    path,
  );
  assert.ok(
    source.includes("countHref={`/br/${branchId}/stock/count`}"),
    path,
  );
  assert.doesNotMatch(source, /redirect\("\/employee\/tasks"\)/);
});

test("operator shift schedule renders inside the branch operator shell", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes('import { SchedulePageContent } from "@/(protected)/employee/schedule/page"'),
    path,
  );
  assert.ok(
    source.includes("leaveHref={`/br/${branchId}/shift/leave`}"),
    path,
  );
  assert.doesNotMatch(source, /redirect\("\/employee\/schedule"\)/);
});

test("operator shift leave renders inside the branch operator shell", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/leave/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes('import { EmployeeLeavePageContent } from "@/(protected)/employee/leave/page"'),
    path,
  );
  assert.ok(source.includes('profileHref={`/br/${branchId}/shift/profile`}'));
  assert.ok(source.includes("routeBranchId={branchId}"), path);
  assert.ok(source.includes("hideHeaderOnMobile"), path);
  assert.doesNotMatch(source, /redirect\("\/employee\/leave"\)/);
});

test("operator shift payslip renders inside the branch operator shell", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/payslip/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(
    source.includes('import { PayslipPageContent } from "@/(protected)/employee/payslip/page"'),
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
    "apps/web/app/(protected)/employee/checkout-approvals/page.tsx",
  );

  assert.ok(
    source.includes('import { CheckoutApprovalsPageContent } from "@/(protected)/employee/checkout-approvals/page"'),
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
    source.includes('import { EmployeeCountPageContent } from "@/(protected)/employee/count/page"'),
    path,
  );
  assert.ok(source.includes("routeBranchId={branchId}"), path);
  assert.ok(source.includes("hideHeaderOnMobile"), path);
  assert.doesNotMatch(source, /redirect\(`\/inventory\/stocktake/);
});

test("employee count client keeps location changes on the current route", () => {
  const source = read(
    "apps/web/app/(protected)/employee/count/count-client.tsx",
  );

  assert.ok(source.includes('baseHref = "/employee/count"'));
  assert.ok(source.includes("router.replace(`${baseHref}?${params.toString()}`)"));
});

test("employee count page takes visible copy from employee messages", () => {
  const source = read(
    "apps/web/app/(protected)/employee/count/page.tsx",
  );

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
    source.includes('import { ClockPageContent } from "@/(protected)/employee/clock/page"'),
    path,
  );
  for (const expected of [
    "home: `/br/${branchId}`",
    "tasks: `/br/${branchId}/shift/tasks`",
    "schedule: `/br/${branchId}/shift/schedule`",
  ]) {
    assert.ok(source.includes(expected), expected);
  }
  assert.doesNotMatch(source, /redirect\("\/employee\/clock"\)/);
});

test("operator shift profile renders inside the branch operator shell", () => {
  const path =
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/profile/page.tsx";

  assert.equal(exists(path), true, path);

  const source = read(path);
  assert.ok(source.includes('from "@/(protected)/employee/profile/page"'), path);
  assert.ok(source.includes("PERSONAL_LINKS"), path);
  assert.ok(source.includes("ProfilePageContent"), path);
  assert.ok(source.includes("href: `/br/${branchId}/shift/leave`"), path);
  assert.ok(source.includes("href: `/br/${branchId}/shift/payslip`"), path);
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
  for (const segment of [
    "clock",
    "tasks",
    "schedule",
    "profile",
    "leave",
    "payslip",
  ] as const) {
    assert.ok(
      source.includes(`${segment}: \`/br/${"${branchId}"}/shift/${segment}\``),
      segment,
    );
  }
  assert.ok(source.includes("count: `/br/${branchId}/stock/count`"));
  assert.ok(
    source.includes(
      "checkoutApprovals: `/br/${branchId}/shift/checkout-approvals`",
    ),
  );
  assert.ok(source.includes("showNotificationControl={false}"));
  assert.ok(source.includes("showPersonalActions"));
  assert.doesNotMatch(source, /EmployeeActionSection|AppLinkCard|LinkCardGrid/);
});

test("employee daily cockpit can expose personal self-service actions", () => {
  const source = read("apps/web/app/(protected)/employee/page.tsx");

  assert.match(source, /mode = "full"/);
  assert.match(source, /mode\?: "full" \| "today-card"/);
  assert.match(source, /if \(mode === "today-card"\) return todayCard/);
  assert.match(source, /showPersonalActions = false/);
  assert.match(source, /messages\.employee\.profile\.personalToolsTitle/);
  assert.match(source, /href: routes\.profile/);
  assert.match(source, /href: routes\.payslip/);
  assert.match(source, /href: routes\.leave/);
  assert.match(source, /messages\.employee\.payslip\.title/);
  assert.match(source, /messages\.employee\.leave\.title/);
});

test("operator home uses the shared employee action layout", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.ok(source.includes("EmployeePage"), "operator home uses shared page shell");
  assert.ok(
    source.includes("EmployeeActionSection"),
    "operator home uses shared action rows",
  );
  assert.doesNotMatch(source, /AppLinkCard|LinkCardGrid/);
});

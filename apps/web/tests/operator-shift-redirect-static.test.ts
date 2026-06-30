import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

const shiftRedirects = [
  ["payslip", "/employee/payslip"],
] as const;

test("operator shift detail routes temporarily redirect to employee workflow pages", () => {
  for (const [segment, target] of shiftRedirects) {
    const path = `apps/web/app/(protected)/br/[branchId]/(operator)/shift/${segment}/page.tsx`;

    assert.equal(exists(path), true, path);

    const source = read(path);
    assert.match(source, /from "next\/navigation"/, path);
    assert.ok(source.includes(`redirect("${target}")`), `${path} -> ${target}`);
  }
});

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
  assert.doesNotMatch(source, /redirect\("\/employee\/leave"\)/);
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
  assert.doesNotMatch(source, /redirect\(`\/inventory\/stocktake/);
});

test("employee count client keeps location changes on the current route", () => {
  const source = read(
    "apps/web/app/(protected)/employee/count/count-client.tsx",
  );

  assert.ok(source.includes('baseHref = "/employee/count"'));
  assert.ok(source.includes("router.replace(`${baseHref}?${params.toString()}`)"));
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
  assert.ok(
    source.includes('export { default } from "@/(protected)/employee/profile/page"'),
    path,
  );
  assert.doesNotMatch(source, /redirect\("\/employee\/profile"\)/);
});

test("operator shift landing routes through branch-scoped detail routes", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );

  for (const segment of ["clock", "tasks", "schedule", "profile"] as const) {
    assert.ok(
      source.includes(`href={\`/br/${"${branchId}"}/shift/${segment}\`}`),
      segment,
    );
  }
});

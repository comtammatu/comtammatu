import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("personal Branch routes stay branch-native", () => {
  const adapters = new Map([
    [
      "apps/web/app/(protected)/br/[branchId]/(operator)/shift/clock/page.tsx",
      "StaffClockPageContent",
    ],
    [
      "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/page.tsx",
      "StaffSchedulePageContent",
    ],
    [
      "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/leave/page.tsx",
      "EmployeeLeavePageContent",
    ],
    [
      "apps/web/app/(protected)/br/[branchId]/(operator)/profile/page.tsx",
      "StaffProfilePageContent",
    ],
    [
      "apps/web/app/(protected)/br/[branchId]/(operator)/profile/payslip/page.tsx",
      "StaffPayslipPageContent",
    ],
  ]);

  for (const [path, adapter] of adapters) {
    const source = read(path);
    assert.ok(source.includes(adapter), path);
    assert.doesNotMatch(source, /redirect\("\/me/);
  }
});

test("Branch shift landing leads with personal work for every branch role", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );
  assert.match(source, /user_role === "owner"/);
  assert.match(source, /redirect\(`\/br\/\$\{branchId\}\/team`\)/);
  assert.match(source, /workflowLayout="stepper"/);
  assert.doesNotMatch(source, /manager-dashboard|redirect\("\/me/);
});

test("Branch Manager people routes nest under team with Class C shift shims", () => {
  const shims = [
    [
      "apps/web/app/(protected)/br/[branchId]/(operator)/shift/attendance/page.tsx",
      "/team/attendance",
    ],
    [
      "apps/web/app/(protected)/br/[branchId]/(operator)/shift/checkout-approvals/page.tsx",
      "/team/checkout-approvals",
    ],
    [
      "apps/web/app/(protected)/br/[branchId]/(operator)/shift/leave-approvals/page.tsx",
      "/team/leave-approvals",
    ],
    [
      "apps/web/app/(protected)/br/[branchId]/(operator)/shift/roster/page.tsx",
      "/team/roster",
    ],
  ] as const;

  for (const [path, dest] of shims) {
    assert.equal(existsSync(resolve(repoRoot, path)), true, path);
    const source = read(path);
    assert.match(source, /redirect\(`\/br\/\$\{branchId\}/);
    assert.ok(source.includes(dest), `${path} must redirect to ${dest}`);
    assert.doesNotMatch(source, /redirect\("\/me/);
  }
});

test("branch stock count links personal fallback to Branch profile", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count/page.tsx",
  );
  assert.match(source, /routeBranchId=\{branchId\}/);
  assert.match(source, /profileHref=\{`\/br\/\$\{branchId\}\/profile`\}/);
  assert.match(source, /plane="branch"/);
});

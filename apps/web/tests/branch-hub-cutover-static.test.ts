import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("root route uses Branch Hub context instead of raw role default", () => {
  const rootPage = read("apps/web/app/page.tsx");

  assert.match(rootPage, /resolvePostLoginRedirect/);
  assert.match(rootPage, /resolveBranchHubContextFromHeaders/);
  assert.doesNotMatch(rootPage, /redirect\(getDefaultRedirect\(claims\)\)/);
});

test("proxy passes device context into post-login redirect", () => {
  const proxy = read("apps/web/proxy.ts");

  assert.match(proxy, /resolveBranchHubContextFromHeaders/);
  assert.match(
    proxy,
    /resolvePostLoginRedirect\(claims, returnTo, branchHubContext\)/,
  );
  assert.match(
    proxy,
    /resolvePostLoginRedirect\(claims, null, branchHubContext\)/,
  );
});

test("employee portal home delegates branch-runtime roles to Branch Hub", () => {
  const employeeHome = read("apps/web/app/(protected)/employee/page.tsx");

  assert.match(
    employeeHome,
    /resolveEmployeeBranchRuntimePath\(claims, "home"\)/,
  );
  assert.match(employeeHome, /redirect\(branchRuntimePath\)/);
  assert.doesNotMatch(employeeHome, /OPERATION_HANDOFFS/);
});

test("employee legacy entrypoints redirect to branch runtime equivalents", () => {
  const cases = [
    ["clock/page.tsx", "shiftClock"],
    ["tasks/page.tsx", "shiftTasks"],
    ["schedule/page.tsx", "shiftSchedule"],
    ["profile/page.tsx", "profile"],
    ["leave/page.tsx", "scheduleLeave"],
    ["payslip/page.tsx", "profilePayslip"],
    ["count/page.tsx", "stockCount"],
  ] as const;

  for (const [path, route] of cases) {
    const source = read(`apps/web/app/(protected)/employee/${path}`);
    assert.match(
      source,
      new RegExp(
        `resolveEmployeeBranchRuntimePath\\(\\s*claims,\\s*"${route}"`,
      ),
      path,
    );
    assert.match(source, /redirect\(/, path);
  }
});

test("employee branch-runtime redirects preserve query state where needed", () => {
  const payslip = read("apps/web/app/(protected)/employee/payslip/page.tsx");
  const count = read("apps/web/app/(protected)/employee/count/page.tsx");

  assert.match(payslip, /appendSearchParams\(branchRuntimePath, \{ year \}\)/);
  assert.match(
    count,
    /appendSearchParams\(branchRuntimePath, \{ location \}\)/,
  );
});

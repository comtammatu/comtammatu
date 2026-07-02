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

test("login action passes device context into post-login redirect", () => {
  const actions = read("apps/web/app/(public)/(auth)/login/actions.ts");

  assert.match(
    actions,
    /resolveBranchHubContextFromHeaders\(await headers\(\)\)/,
  );
  assert.match(
    actions,
    /resolvePostLoginRedirect\(claims, returnTo, branchHubContext\)/,
  );
});

test("post-login redirect call sites resolve the central-site home branch (D055 §1)", () => {
  for (const path of [
    "apps/web/app/page.tsx",
    "apps/web/app/(public)/(auth)/login/actions.ts",
    "apps/web/proxy.ts",
  ]) {
    const source = read(path);
    assert.match(
      source,
      /homeBranchId: await resolveCentralSiteHomeBranchId\(supabase, claims\)/,
      path,
    );
  }
});

test("employee runtime redirect sends owner to the branch picker", () => {
  const redirectLib = read(
    "apps/web/app/(protected)/employee/_lib/branch-runtime-redirect.ts",
  );

  assert.match(
    redirectLib,
    /isAdminRole\(claims\.user_role\)\s*\?\s*"\/br"\s*:\s*null/,
  );
});

test("proxy redirects legacy /employee entrypoints to branch runtime", () => {
  const proxy = read("apps/web/proxy.ts");

  assert.match(proxy, /resolveLegacyEmployeeBranchRuntimePath/);
  assert.match(proxy, /pathname\.startsWith\("\/employee"\)/);
  // Redirect happens before module ACL resolution.
  assert.ok(
    proxy.indexOf("resolveLegacyEmployeeBranchRuntimePath(") <
      proxy.indexOf("resolveModuleFromPath(pathname)"),
    "legacy employee redirect must run before module ACL",
  );
});

test("legacy employee route map mirrors branch runtime pairs", () => {
  const redirectLib = read(
    "apps/web/app/(protected)/employee/_lib/branch-runtime-redirect.ts",
  );

  const cases = [
    ["/employee", "home"],
    ["/employee/clock", "shiftClock"],
    ["/employee/tasks", "shiftTasks"],
    ["/employee/schedule", "shiftSchedule"],
    ["/employee/attendance", "shiftSchedule"],
    ["/employee/profile", "profile"],
    ["/employee/leave", "scheduleLeave"],
    ["/employee/payslip", "profilePayslip"],
    ["/employee/count", "stockCount"],
  ] as const;

  for (const [path, route] of cases) {
    assert.match(
      redirectLib,
      new RegExp(`"${path.replaceAll("/", "\\/")}": "${route}"`),
      path,
    );
  }

  // Paths outside the map keep their /employee surface.
  assert.doesNotMatch(redirectLib, /"\/employee\/checkout-approvals":/);
  assert.doesNotMatch(redirectLib, /"\/employee\/permissions":/);
});

test("proxy preserves query string on legacy employee redirects", () => {
  const proxy = read("apps/web/proxy.ts");

  assert.match(
    proxy,
    /const url = request\.nextUrl\.clone\(\);\s*url\.pathname = branchRuntimePath;\s*return redirectWithCookies\(url, response\);/,
  );
});

test("employee pages no longer run page-level branch runtime redirects", () => {
  const pages = [
    "page.tsx",
    "clock/page.tsx",
    "tasks/page.tsx",
    "schedule/page.tsx",
    "attendance/page.tsx",
    "profile/page.tsx",
    "leave/page.tsx",
    "payslip/page.tsx",
    "count/page.tsx",
  ] as const;

  for (const path of pages) {
    const source = read(`apps/web/app/(protected)/employee/${path}`);
    assert.doesNotMatch(source, /resolveEmployeeBranchRuntimePath/, path);
  }

  const employeeHome = read("apps/web/app/(protected)/employee/page.tsx");
  assert.doesNotMatch(employeeHome, /OPERATION_HANDOFFS/);
});

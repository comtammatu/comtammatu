import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { JwtClaims } from "@comtammatu/shared/auth";
import { resolveLegacyEmployeeBranchRuntimePath } from "../lib/employee/_lib/branch-runtime-redirect";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function claims(
  role: JwtClaims["user_role"],
  branchId: number | null,
): JwtClaims {
  return {
    tenant_id: 1,
    branch_id: branchId,
    user_role: role,
  };
}

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
  assert.equal(
    resolveLegacyEmployeeBranchRuntimePath(claims("owner", null), "/employee"),
    "/br",
  );
  // Owner keeps the picker even when a caller passes a home site.
  assert.equal(
    resolveLegacyEmployeeBranchRuntimePath(
      claims("owner", null),
      "/employee",
      9,
    ),
    "/br",
  );
});

test("employee runtime redirect resolves the central-site home (D055 §1)", () => {
  for (const role of ["warehouse_manager", "production_manager"] as const) {
    assert.equal(
      resolveLegacyEmployeeBranchRuntimePath(
        claims(role, null),
        "/employee/clock",
        9,
      ),
      "/br/9/shift/clock",
      role,
    );
    assert.equal(
      resolveLegacyEmployeeBranchRuntimePath(
        claims(role, null),
        "/employee",
        9,
      ),
      "/br/9",
      role,
    );
    // Without a resolved home site the proxy falls back to access-denied.
    assert.equal(
      resolveLegacyEmployeeBranchRuntimePath(
        claims(role, null),
        "/employee/clock",
        null,
      ),
      null,
      role,
    );
  }
});

test("employee runtime redirect sends office to finance", () => {
  assert.equal(
    resolveLegacyEmployeeBranchRuntimePath(
      claims("office", null),
      "/employee/clock",
      9,
    ),
    "/finance",
  );
});

test("employee runtime redirect keeps pinned operators on their claims branch", () => {
  assert.equal(
    resolveLegacyEmployeeBranchRuntimePath(
      claims("cashier", 3),
      "/employee/clock",
      9,
    ),
    "/br/3/shift/clock",
  );
});

test("proxy redirects old /employee entrypoints to branch runtime", () => {
  const proxy = read("apps/web/proxy.ts");

  assert.match(proxy, /resolveLegacyEmployeeBranchRuntimePath/);
  assert.match(proxy, /pathname\.startsWith\("\/employee"\)/);
  // Central-site roles resolve their home site through the cached lookup.
  assert.match(
    proxy,
    /const homeBranchId = await resolveCentralSiteHomeBranchId\(supabase, claims\);/,
  );
  assert.match(
    proxy,
    /resolveLegacyEmployeeBranchRuntimePath\(\s*claims,\s*pathname,\s*homeBranchId,\s*\)/,
  );
  // Redirect happens before module ACL resolution.
  assert.ok(
    proxy.indexOf("resolveLegacyEmployeeBranchRuntimePath(") <
      proxy.indexOf("resolveModuleFromPath(pathname)"),
    "old /employee redirect must run before module ACL",
  );
});

test("old /employee route map mirrors branch runtime pairs", () => {
  const redirectLib = read(
    "apps/web/lib/employee/_lib/branch-runtime-redirect.ts",
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
    ["/employee/permissions", "profile"],
    ["/employee/count", "stockCount"],
    ["/employee/checkout-approvals", "checkoutApprovals"],
  ] as const;

  for (const [path, route] of cases) {
    assert.match(
      redirectLib,
      new RegExp(`"${path.replaceAll("/", "\\/")}": "${route}"`),
      path,
    );
  }

  assert.match(redirectLib, /"\/employee\/permissions": "profile"/);
});

test("proxy never lets retired /employee paths fall through to pages", () => {
  const proxy = read("apps/web/proxy.ts");

  assert.match(
    proxy,
    /return redirectToDefaultLanding\(request, response, supabase, claims\);/,
  );
  assert.ok(
    proxy.indexOf('if (pathname.startsWith("/employee"))') <
      proxy.indexOf("resolveModuleFromPath(pathname)"),
    "retired /employee paths must be handled before module ACL",
  );
});

test("proxy preserves query string on old /employee redirects", () => {
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
    "profile/page.tsx",
    "leave/page.tsx",
    "payslip/page.tsx",
    "count/page.tsx",
  ] as const;

  for (const path of pages) {
    const source = read(`apps/web/lib/employee/${path}`);
    assert.doesNotMatch(source, /resolveEmployeeBranchRuntimePath/, path);
  }
  assert.equal(
    existsSync(resolve(repoRoot, "apps/web/lib/employee/attendance/page.tsx")),
    false,
  );

  const employeeHome = read("apps/web/lib/employee/page.tsx");
  assert.doesNotMatch(employeeHome, /OPERATION_HANDOFFS/);
});

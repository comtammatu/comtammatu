import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
    /resolvePostLoginRedirect\(claims, null, branchHubContext\)/,
  );
  assert.doesNotMatch(proxy, /searchParams\.set\(\s*"returnTo"/);
});

test("login action passes device context into post-login redirect", () => {
  const actions = read("apps/web/app/(public)/(auth)/login/actions.ts");

  assert.match(
    actions,
    /resolveBranchHubContextFromHeaders\(await headers\(\)\)/,
  );
  assert.match(
    actions,
    /resolvePostLoginRedirect\(claims, null, branchHubContext\)/,
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

test("proxy no longer carries /employee compatibility redirects", () => {
  const proxy = read("apps/web/proxy.ts");

  assert.doesNotMatch(proxy, /resolveLegacyEmployeeBranchRuntimePath/);
  assert.doesNotMatch(proxy, /pathname\.startsWith\("\/employee"\)/);
  assert.equal(
    existsSync(
      resolve(repoRoot, "apps/web/lib/staff-runtime/_lib/branch-runtime-redirect.ts"),
    ),
    false,
  );
});

test("branch shift route keeps floor-staff daily work visible", () => {
  const shiftPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );

  assert.match(shiftPage, /const authState = await loadAuthState\(\)/);
  assert.match(
    shiftPage,
    /authState\.claims\.user_role === "branch_manager"/,
  );
  assert.match(
    shiftPage,
    /mode=\{isBranchManager \? "manager-dashboard" : "full"\}/,
  );
  assert.doesNotMatch(shiftPage, /mode="manager-dashboard"/);
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
    const source = read(`apps/web/lib/staff-runtime/${path}`);
    assert.doesNotMatch(source, /resolveEmployeeBranchRuntimePath/, path);
  }
  assert.equal(
    existsSync(resolve(repoRoot, "apps/web/lib/staff-runtime/attendance/page.tsx")),
    false,
  );

  const employeeHome = read("apps/web/lib/staff-runtime/page.tsx");
  assert.doesNotMatch(employeeHome, /OPERATION_HANDOFFS/);
});

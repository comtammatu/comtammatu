import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

test("retired employee app no longer exists as an App Router surface", () => {
  assert.equal(exists("apps/web/app/(protected)/employee"), false);

  for (const retiredShellFile of [
    "apps/web/lib/staff-runtime/layout.tsx",
    "apps/web/lib/staff-runtime/loading.tsx",
    "apps/web/lib/staff-runtime/error.tsx",
    "apps/web/lib/staff-runtime/attendance/page.tsx",
    "apps/web/lib/staff-runtime/components/bottom-nav.tsx",
    "apps/web/lib/staff-runtime/components/mobile-header.tsx",
    "apps/web/lib/staff-runtime/components/staff-runtime-pwa-toolbar.tsx",
  ]) {
    assert.equal(exists(retiredShellFile), false, retiredShellFile);
  }
});

test("root PWA manifest opens the operator entry, not the retired employee app", () => {
  const manifest = JSON.parse(read("apps/web/public/manifest.webmanifest")) as {
    id?: unknown;
    name?: unknown;
    scope?: unknown;
    short_name?: unknown;
    start_url?: unknown;
    shortcuts?: Array<{ url?: unknown }>;
  };

  assert.equal(manifest.id, "/");
  assert.equal(manifest.name, "Cơm Tấm Má Tư - Cổng vận hành");
  assert.equal(manifest.short_name, "Cổng Má Tư");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.shortcuts, undefined);
});

test("operator entry owns the mobile shell and keeps bottom nav outside scroll content", () => {
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  const bottomNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );
  const appBottomNav = read("apps/web/app/components/app-bottom-nav.tsx");

  assert.match(
    layout,
    /homeHref=\{\s*branchKind === "branch"\s*\?\s*`\/br\/\$\{context\.branchId\}`\s*:\s*"\/"\s*\}/,
  );
  assert.match(
    layout,
    /homeAriaLabel=\{\s*branchKind === "branch"\s*\?\s*`\$\{APP_COPY_VI\.branchHome\} · \$\{context\.branch\.name\}`\s*:\s*APP_COPY_VI\.ownerTitle\s*\}/,
  );
  assert.match(layout, /id="main-content"[\s\S]*overflow-y-auto/);
  assert.match(
    layout,
    /contentClassName="[^"]*max-w-lg md:max-w-2xl lg:max-w-4xl"/,
  );
  assert.match(bottomNav, /position="static"/);
  assert.match(appBottomNav, /"static shrink-0"/);
  assert.match(bottomNav, /function projectPrimaryTabs/);
  assert.match(bottomNav, /href: tab\.href/);
  assert.doesNotMatch(bottomNav, /checkout-approvals/);
  assert.doesNotMatch(bottomNav, /\/employee/);
});

test("old employee URLs no longer have proxy compatibility redirects", () => {
  const proxy = read("apps/web/proxy.ts");

  assert.equal(
    exists("apps/web/lib/staff-runtime/_lib/branch-runtime-redirect.ts"),
    false,
  );
  assert.doesNotMatch(proxy, /pathname\.startsWith\("\/employee"\)/);
  assert.doesNotMatch(proxy, /resolveLegacyEmployeeBranchRuntimePath/);
});

test("standalone employee route stays out of active nav and route contracts", () => {
  const navConfig = read("packages/shared/src/auth/nav-config.ts");
  const routeMap = read("packages/shared/src/auth/route-map.ts");
  const routeResolution = read("packages/shared/src/auth/route-resolution.ts");
  const scope = read("packages/shared/src/auth/scope.ts");

  for (const source of [navConfig, routeMap, routeResolution]) {
    assert.doesNotMatch(source, /moduleKey:\s*"employee"/);
    assert.doesNotMatch(source, /MODULE_ACL\.employee(?!_)/);
    assert.doesNotMatch(source, /hrefTemplate:\s*"\/employee/);
    assert.doesNotMatch(source, /entryPath:\s*"\/employee/);
  }
  assert.doesNotMatch(scope, /\/employee(?:\/|"|')/);
});

test("personal Branch routes keep their Branch adapters", () => {
  const clock = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/clock/page.tsx",
  );
  const schedule = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/page.tsx",
  );
  const leave = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/leave/page.tsx",
  );
  const count = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count/page.tsx",
  );
  const payslip = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/profile/payslip/page.tsx",
  );

  assert.match(clock, /<StaffClockPageContent/);
  assert.match(clock, /tasks: `\/br\/\$\{branchId\}\/shift`/);
  assert.match(schedule, /<StaffSchedulePageContent/);
  assert.match(leave, /<EmployeeLeavePageContent/);
  assert.match(payslip, /<StaffPayslipPageContent/);
  assert.match(count, /profileHref=\{`\/br\/\$\{branchId\}\/profile`\}/);
});

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
    "apps/web/lib/employee/layout.tsx",
    "apps/web/lib/employee/loading.tsx",
    "apps/web/lib/employee/error.tsx",
    "apps/web/lib/employee/attendance/page.tsx",
    "apps/web/lib/employee/components/bottom-nav.tsx",
    "apps/web/lib/employee/components/mobile-header.tsx",
    "apps/web/lib/employee/components/employee-pwa-toolbar.tsx",
  ]) {
    assert.equal(exists(retiredShellFile), false, retiredShellFile);
  }
});

test("root PWA manifest opens Branch Hub, not the retired employee app", () => {
  const manifest = JSON.parse(read("apps/web/public/manifest.webmanifest")) as {
    id?: unknown;
    name?: unknown;
    scope?: unknown;
    short_name?: unknown;
    start_url?: unknown;
    shortcuts?: Array<{ url?: unknown }>;
  };

  assert.equal(manifest.id, "/br");
  assert.equal(manifest.name, "Cơm Tấm Má Tư - Chi nhánh");
  assert.equal(manifest.short_name, "Má Tư CN");
  assert.equal(manifest.start_url, "/br");
  assert.equal(manifest.scope, "/");
  assert.deepEqual(
    manifest.shortcuts?.map((shortcut) => shortcut.url),
    ["/br", "/br", "/br", "/br"],
  );
});

test("Branch Hub owns the mobile shell and keeps bottom nav outside scroll content", () => {
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  const bottomNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );

  assert.match(layout, /homeHref=\{`\/br\/\$\{context\.branchId\}`\}/);
  assert.match(layout, /homeAriaLabel=\{APP_COPY_VI\.operatorHome\}/);
  assert.match(layout, /id="main-content"[\s\S]*overflow-y-auto/);
  assert.match(
    layout,
    /contentClassName="max-w-lg md:max-w-3xl lg:max-w-5xl xl:max-w-6xl"/,
  );
  assert.match(bottomNav, /className="static shrink-0"/);
  assert.match(bottomNav, /`\/br\/\$\{branchId\}\/shift`/);
  assert.match(bottomNav, /`\/br\/\$\{branchId\}\/shift\/schedule`/);
  assert.doesNotMatch(bottomNav, /\/employee/);
});

test("old employee URLs are redirect-only compatibility, before module ACL", () => {
  const proxy = read("apps/web/proxy.ts");
  const redirectMap = read(
    "apps/web/lib/employee/_lib/branch-runtime-redirect.ts",
  );

  assert.match(proxy, /pathname\.startsWith\("\/employee"\)/);
  assert.ok(
    proxy.indexOf('if (pathname.startsWith("/employee"))') <
      proxy.indexOf("resolveModuleFromPath(pathname)"),
    "retired /employee URLs must redirect before module ACL",
  );
  assert.match(redirectMap, /"\/employee": "home"/);
  assert.match(redirectMap, /"\/employee\/permissions": "profile"/);
});

test("Branch wrappers pass profile fallbacks into shared shift content", () => {
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

  for (const source of [clock, schedule, leave, count, payslip]) {
    assert.match(source, /\/br\/\$\{branchId\}\/profile/);
  }
});

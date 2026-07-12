import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
test("operator entry owns the mobile shell and keeps bottom nav outside scroll content", () => {
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  const bottomNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );
  const appBottomNav = read("apps/web/app/components/app-bottom-nav.tsx");

  assert.match(layout, /homeHref=\{`\/br\/\$\{context\.branchId\}`\}/);
  assert.match(layout, /homeAriaLabel=\{APP_COPY_VI\.operatorHome\}/);
  assert.match(layout, /id="main-content"[\s\S]*overflow-y-auto/);
  assert.match(
    layout,
    /contentClassName="max-w-lg md:max-w-2xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-screen-2xl"/,
  );
  assert.match(bottomNav, /position="static"/);
  assert.match(appBottomNav, /"static shrink-0"/);
  assert.match(bottomNav, /`\/br\/\$\{branchId\}\/shift`/);
  assert.match(bottomNav, /`\/br\/\$\{branchId\}\/shift\/checkout-approvals`/);
  assert.doesNotMatch(bottomNav, /\/employee/);
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
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/count/page.tsx",
  );
  const payslip = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/profile/payslip/page.tsx",
  );

  for (const source of [clock, schedule, leave, count, payslip]) {
    assert.match(source, /\/br\/\$\{branchId\}\/profile/);
  }
});

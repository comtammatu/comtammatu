import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(repoRoot, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

test("Branch operator layout provides responsive dual navigation for mobile and desktop", () => {
  const layoutPath = "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx";
  const bottomNavPath = "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx";
  const desktopNavPath = "apps/web/app/(protected)/br/[branchId]/(operator)/operator-desktop-nav.tsx";

  assert.equal(exists(layoutPath), true, "operator layout must exist");
  assert.equal(exists(bottomNavPath), true, "operator bottom nav must exist");
  assert.equal(exists(desktopNavPath), true, "operator desktop nav must exist");

  const layout = read(layoutPath);
  const bottomNav = read(bottomNavPath);
  const desktopNav = read(desktopNavPath);

  // Operator layout integrates desktop sidebar and hides bottom nav on desktop
  assert.match(layout, /OperatorDesktopNav/);
  assert.match(layout, /OperatorBottomNav/);
  assert.match(layout, /hideOnDesktop={true}/);
  assert.match(layout, /flex min-h-0 flex-1 overflow-hidden/);
  assert.match(layout, /2xl:max-w-7xl/);

  // Desktop sidebar renders on lg+ viewports and hides on mobile
  assert.match(desktopNav, /hidden lg:flex/);
  assert.match(desktopNav, /lg:w-60/);
  assert.match(desktopNav, /posStation|Trạm POS Thu ngân/);
  assert.match(desktopNav, /kdsStation|Trạm Bếp KDS/);
  assert.match(desktopNav, /ordersShortcut|Đơn bán trong ngày/);
  assert.match(desktopNav, /closeDayShortcut|Báo cáo ngày/);

  // Bottom nav hides on desktop via hideOnDesktop prop
  assert.match(bottomNav, /hideOnDesktop = true/);
  assert.match(bottomNav, /hideOnDesktop={hideOnDesktop}/);
});

test("Branch operator touch controls adhere to universal 48px SSOT without OS branching", () => {
  const bottomNav = read("apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx");
  const desktopNav = read("apps/web/app/(protected)/br/[branchId]/(operator)/operator-desktop-nav.tsx");
  const appBottomNav = read("apps/web/app/components/app-bottom-nav.tsx");

  // AppBottomNav uses size="touch" (48px / min-h-12)
  assert.match(appBottomNav, /size="touch"/);
  assert.match(appBottomNav, /hideOnDesktop && "lg:hidden"/);

  // Desktop nav items maintain accessible 48px touch target
  assert.match(desktopNav, /size="touch"/);

  // Zero OS-based button height branching (no 44px vs 48px split by platform)
  assert.doesNotMatch(bottomNav, /isIOS|isAndroid|platform ===/);
  assert.doesNotMatch(desktopNav, /isIOS|isAndroid|platform ===/);
});

test("Station apps remain standalone and exempt from operator dual navigation", () => {
  for (const stationPath of [
    "apps/web/app/(protected)/br/[branchId]/pos/layout.tsx",
    "apps/web/app/(protected)/br/[branchId]/kds/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/pickup/page.tsx",
  ]) {
    assert.equal(exists(stationPath), true, stationPath);
    const content = read(stationPath);
    assert.doesNotMatch(
      content,
      /OperatorBottomNav|OperatorDesktopNav/,
      stationPath + " must not render operator navigation",
    );
  }
});

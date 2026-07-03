import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  isNavItemActive,
  type ShellNavItem,
} from "../app/lib/shell-primitives";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const navItem = (
  href: string,
  extra: Partial<ShellNavItem> = {},
): ShellNavItem => ({
  href,
  label: href,
  icon: (() => null) as unknown as ShellNavItem["icon"],
  ...extra,
});

test("exact landing item highlights only its own path, not sibling sub-routes", () => {
  const landing = navItem("/finance", { exact: true });

  assert.equal(isNavItemActive(landing, "/finance"), true);
  assert.equal(isNavItemActive(landing, "/finance/revenue"), false);
  assert.equal(isNavItemActive(landing, "/finance/food-cost"), false);
});

test("a non-exact landing item bleeds onto sub-routes (regression contrast)", () => {
  const bleeding = navItem("/finance");

  assert.equal(isNavItemActive(bleeding, "/finance/revenue"), true);
  assert.equal(isNavItemActive(bleeding, "/finance/food-cost"), true);
});

test("section item stays lit across its own sub-routes", () => {
  const revenue = navItem("/finance/revenue");

  assert.equal(isNavItemActive(revenue, "/finance/revenue"), true);
  assert.equal(isNavItemActive(revenue, "/finance/revenue/details"), true);
  assert.equal(isNavItemActive(revenue, "/finance"), false);
});

test("workspace switcher item stays lit across its module (intended)", () => {
  const workspace = navItem("/finance");

  assert.equal(isNavItemActive(workspace, "/finance/revenue"), true);
});

test("finance deep-nav landing is wired exact, mirroring inventory", () => {
  const financeNav = read(
    "apps/web/app/(protected)/finance/components/finance-nav.ts",
  );
  const inventoryNav = read(
    "apps/web/app/(protected)/inventory/_lib/inventory-nav.ts",
  );

  assert.match(
    financeNav,
    /href: "\/finance",[\s\S]*?exact: true,/,
    "finance deep-nav landing (/finance) must be exact to avoid sub-route bleed",
  );
  assert.match(
    inventoryNav,
    /href: "\/inventory",[\s\S]*?exact: true,/,
    "inventory landing remains the reference exact pattern",
  );
});

test("mobile workspace bottom nav reuses the shell nav model", () => {
  const appShell = read("apps/web/app/components/app-shell.tsx");
  const bottomNav = read("apps/web/app/components/workspace-bottom-nav.tsx");

  assert.match(
    appShell,
    /<WorkspaceBottomNav tier1=\{tier1\} tier2=\{tier2\}/,
    "AppShell must pass the shared nav model to the mobile bottom nav",
  );
  assert.match(bottomNav, /tier2: ShellNavGroup\[\]/);
  assert.match(bottomNav, /flattenNavGroups\(tier2\)/);
  assert.match(
    bottomNav,
    /className="md:hidden"/,
    "management bottom nav must stop at tablet where the sidebar is visible",
  );
  assert.match(
    appShell,
    /pb-24 md:pb-4/,
    "AppShell bottom padding must match the mobile-only bottom nav breakpoint",
  );
  assert.doesNotMatch(
    bottomNav,
    /const NAV_ITEMS|MODULE_ACL|canAccess/,
    "mobile bottom nav must not carry a second static ACL/nav source",
  );
  assert.equal(
    bottomNav.match(/onClick=\{toggleSidebar\}/g)?.length,
    1,
    "mobile bottom nav must not render duplicate drawer toggle tabs",
  );
});

test("management shell renders one sidebar with nested active-tab sub-nav", () => {
  const appShell = read("apps/web/app/components/app-shell.tsx");

  assert.equal(
    appShell.match(/<Sidebar(?:\s|>)/g)?.length,
    1,
    "AppShell must render one Sidebar primitive",
  );
  assert.match(
    appShell,
    /<SidebarMenuSub>/,
    "active module sub-nav must render inside the primary sidebar item",
  );
  // D063 (2026-07-03): desktop Management chrome collapses the single
  // sidebar to an icon rail in place (collapsible="icon") instead of
  // offcanvas — this is the SAME <Sidebar> primitive changing width, not a
  // second rail column, so the "one sidebar" contract below still holds.
  assert.match(
    appShell,
    /collapsible="icon"/,
    "management shell collapses in place to an icon rail (D063), not offcanvas",
  );
  assert.match(
    appShell,
    /<SidebarRail \/>/,
    "management shell exposes the drag-to-collapse rail handle for desktop (D063)",
  );
  assert.match(
    appShell,
    /items: group\.items\.filter\(\(item\) => item\.href !== parentHref\)/,
    "sub-nav must remove the active primary tab href to avoid duplicate tabs",
  );
});

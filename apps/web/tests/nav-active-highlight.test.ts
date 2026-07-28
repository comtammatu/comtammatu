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

test("Owner surface module switcher stays lit across its module", () => {
  const adminModule = navItem("/finance");

  assert.equal(isNavItemActive(adminModule, "/finance/revenue"), true);
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

test("mobile Owner surface bottom nav reuses the shell nav model", () => {
  const appShell = read("apps/web/app/components/app-shell.tsx");
  const bottomNav = read("apps/web/app/components/owner-bottom-nav.tsx");

  assert.match(
    appShell,
    /<OwnerBottomNav tier1=\{tier1\} tier2=\{tier2\}/,
    "AppShell must pass the shared nav model to the mobile bottom nav",
  );
  assert.match(bottomNav, /tier2: ShellNavGroup\[\]/);
  assert.match(bottomNav, /flattenNavGroups\(tier2\)/);
  assert.match(
    bottomNav,
    /className="lg:hidden"/,
    "management bottom nav spans phone + tablet portrait; only desktop (lg) shows the fixed sidebar (D090)",
  );
  assert.match(
    appShell,
    /showBottomNav \? "pb-24 lg:pb-0"/,
    "AppShell bottom padding must reserve bottom-nav space through tablet portrait, matching the lg bottom-nav breakpoint (D090)",
  );
  assert.match(
    appShell,
    /const showBottomNav = bottomNav/,
    "the Owner shell must honor the shared bottom-nav switch without route-local navigation logic",
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

test("Owner surface shell renders one sidebar with nested active-tab sub-nav", () => {
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
  assert.match(
    appShell,
    /<SidebarProvider\s+open=\{true\}[\s\S]*?>/,
    "Owner surface sidebar must default open and remain controlled open",
  );
  assert.match(
    appShell,
    /collapsible="offcanvas"/,
    "desktop Owner surface sidebar must not use collapsed icon mode",
  );
  assert.doesNotMatch(
    appShell,
    /<SidebarRail|collapsible="icon"/,
    "Owner surface sidebar must not expose the desktop collapsed rail mode",
  );
  assert.doesNotMatch(
    appShell,
    /BranchSwitcher|branchOptions|showBackLink|resolveRoleHomeLink|brand\./,
    "Owner surface sidebar chrome must stay fixed and must not accept module branch/back/brand state",
  );
  assert.match(
    appShell,
    /<BrandMark\s+variant="seal"/,
    "Owner surface sidebar brand must render the fixed tenant seal",
  );
  assert.match(
    appShell,
    /items: group\.items\.filter\(\(item\) => item\.href !== parentHref\)/,
    "sub-nav must remove the active primary tab href to avoid duplicate tabs",
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("root route renders the Control home", () => {
  const rootPage = read("apps/web/app/(protected)/page.tsx");
  const protectedLayout = read("apps/web/app/(protected)/layout.tsx");
  const overview = read("apps/web/app/_components/control-surface-overview.tsx");
  const appShell = read("apps/web/app/components/app-shell.tsx");
  const controlSurfaceShell = read(
    "apps/web/app/components/control-surface-shell.tsx",
  );
  const inventoryLayout = read("apps/web/app/(protected)/inventory/layout.tsx");

  assert.doesNotMatch(rootPage, /ControlSurfaceShell/);
  assert.match(rootPage, /loadAuthState/);
  assert.match(protectedLayout, /loadAuthState/);
  assert.match(protectedLayout, /<ControlSurfaceShell/);
  assert.match(rootPage, /<ControlSurfaceOverview/);
  assert.match(rootPage, /loadControlHomeAttention/);
  assert.match(rootPage, /await connection\(\)/);
  assert.match(rootPage, /getTodayWorkState/);
  assert.match(overview, /<AppPageHeader/);
  assert.match(overview, /<AppSection/);
  assert.match(overview, /AttentionQueue/);
  assert.match(overview, /headingLevel="h2"/);
  assert.match(overview, /<ItemGroup/);
  assert.match(overview, /AppTodayCommandBar/);
  assert.doesNotMatch(overview, /operationsModules|ModuleLinks/);
  assert.doesNotMatch(overview, /chrome-tap/);
  assert.doesNotMatch(appShell, /<header/);
  assert.doesNotMatch(inventoryLayout, /ControlSurfaceShell/);
  assert.match(
    controlSurfaceShell,
    /sidebarHeaderAccessory=\{scopeAccessory\}/,
  );
  assert.match(controlSurfaceShell, /ControlSurfaceScopeControl/);
  assert.match(controlSurfaceShell, /InventoryBranchFilter/);
  assert.match(controlSurfaceShell, /mobileScopeAccessory=\{scopeAccessory\}/);
  assert.match(controlSurfaceShell, /canSelectAll/);
  assert.match(appShell, /mobileScopeAccessory/);
  assert.match(appShell, /data-control-surface-mobile-tools/);
  assert.doesNotMatch(appShell, /sticky top-0/);
  assert.doesNotMatch(rootPage, /redirect\(/);
});

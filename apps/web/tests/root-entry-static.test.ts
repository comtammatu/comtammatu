import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("root route renders the Owner overview", () => {
  const rootPage = read("apps/web/app/page.tsx");
  const overview = read("apps/web/app/_components/owner-overview.tsx");
  const appShell = read("apps/web/app/components/app-shell.tsx");
  const controlSurfaceShell = read(
    "apps/web/app/components/control-surface-shell.tsx",
  );
  const inventoryLayout = read(
    "apps/web/app/(protected)/inventory/layout.tsx",
  );

  assert.match(rootPage, /loadAuthState/);
  assert.match(rootPage, /<ControlSurfaceShell[\s\S]*module="owner"/);
  assert.match(rootPage, /<OwnerOverview/);
  assert.match(overview, /<AppPageHeader/);
  assert.match(overview, /<AppSection/);
  assert.equal((overview.match(/headingLevel="h2"/g) ?? []).length, 2);
  assert.match(overview, /<ItemGroup/);
  assert.match(
    overview,
    /<Item[\s\S]*render=\{<Link href=\{module\.href\} \/>\}/,
  );
  assert.match(overview, /chrome-tap/);
  assert.doesNotMatch(appShell, /<header/);
  assert.match(inventoryLayout, /ControlSurfaceShell/);
  assert.match(inventoryLayout, /module="inventory"/);
  assert.match(
    controlSurfaceShell,
    /sidebarHeaderAccessory=\{sidebarHeaderAccessory\}/,
  );
  assert.match(controlSurfaceShell, /InventoryBranchFilter/);
  assert.doesNotMatch(rootPage, /redirect\(/);
});

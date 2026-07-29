import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("control_surface layouts use ControlSurfaceShell only (Wave2)", () => {
  const shell = read("apps/web/app/components/control-surface-shell.tsx");
  const nav = read("apps/web/app/lib/control-surface-nav.ts");
  const rootPage = read("apps/web/app/page.tsx");
  const inventoryLayout = read(
    "apps/web/app/(protected)/inventory/layout.tsx",
  );
  const financeLayout = read("apps/web/app/(protected)/finance/layout.tsx");

  assert.match(shell, /export function ControlSurfaceShell/);
  assert.match(shell, /<AppShell/);
  assert.match(shell, /resolveControlSurfacePrimaryTabs/);
  assert.match(shell, /flattenInventoryDeepNav/);
  assert.match(nav, /export function resolveControlSurfacePrimaryTabs/);
  assert.match(nav, /export function resolveControlSurfaceDeepNav/);
  assert.match(nav, /resolveControlSurfaceCoreDeepNav/);
  assert.match(nav, /resolveControlSurfaceNavGroups/);
  assert.match(nav, /resolveInventoryNav/);
  assert.match(nav, /resolveFinanceNav/);
  assert.equal(
    existsSync(resolve(repoRoot, "apps/web/app/lib/owner-nav.ts")),
    false,
    "owner-nav.ts must be merged into control-surface-nav.ts",
  );
  assert.equal(
    existsSync(
      resolve(repoRoot, "apps/web/app/components/owner-bottom-nav.tsx"),
    ),
    false,
    "owner-bottom-nav.tsx must be renamed to control-surface-bottom-nav.tsx",
  );

  assert.match(rootPage, /<ControlSurfaceShell[\s\S]*module="owner"/);
  assert.match(inventoryLayout, /module="inventory"/);
  assert.match(financeLayout, /module="finance"/);
  assert.doesNotMatch(rootPage, /OwnerModuleShell|InventoryShell|FinanceShell/);
  assert.doesNotMatch(
    inventoryLayout,
    /\bInventoryShell\b/,
  );
  assert.doesNotMatch(financeLayout, /\bFinanceShell\b/);

  for (const removed of [
    "apps/web/app/components/owner-module-shell.tsx",
    "apps/web/app/(protected)/inventory/_components/inventory-shell.tsx",
    "apps/web/app/(protected)/finance/components/finance-shell.tsx",
  ]) {
    assert.equal(
      existsSync(resolve(repoRoot, removed)),
      false,
      `${removed} must be removed after Wave2`,
    );
  }
});

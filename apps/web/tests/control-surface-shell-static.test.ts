import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("control_surface routes share one persistent protected shell", () => {
  const appShell = read("apps/web/app/components/app-shell.tsx");
  const shell = read("apps/web/app/components/control-surface-shell.tsx");
  const nav = read("apps/web/app/lib/control-surface-nav.ts");
  const protectedLayout = read("apps/web/app/(protected)/layout.tsx");
  const rootPage = read("apps/web/app/(protected)/page.tsx");
  const inventoryLayout = read("apps/web/app/(protected)/inventory/layout.tsx");
  const branchesLayout = read("apps/web/app/(protected)/branches/layout.tsx");
  const feedbackLayout = read("apps/web/app/(protected)/feedback/layout.tsx");

  assert.match(shell, /export function ControlSurfaceShell/);
  assert.match(shell, /<AppShell/);
  assert.match(shell, /usePathname/);
  assert.match(shell, /resolveActiveModule/);
  assert.match(shell, /<NotificationAttentionRuntime/);
  assert.match(shell, /!activeModule \? \(/);
  assert.match(shell, /resolveControlSurfacePrimaryTabs/);
  assert.doesNotMatch(shell, /flattenInventoryDeepNav/);
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

  assert.match(protectedLayout, /<ControlSurfaceShell/);
  assert.match(protectedLayout, /\/notifications/);
  assert.match(protectedLayout, /NotificationAttentionRuntime/);
  assert.match(protectedLayout, /resolveInventoryBranchScope/);
  assert.match(protectedLayout, /showSupplierPayables/);
  assert.doesNotMatch(rootPage, /ControlSurfaceShell|OwnerModuleShell|InventoryShell|FinanceShell/);
  assert.match(rootPage, /loadAuthState/);
  assert.doesNotMatch(inventoryLayout, /ControlSurfaceShell/);
  assert.doesNotMatch(branchesLayout, /ControlSurfaceShell/);
  assert.doesNotMatch(feedbackLayout, /ControlSurfaceShell/);
  assert.doesNotMatch(inventoryLayout, /\bInventoryShell\b/);
  assert.match(appShell, /APP_COPY_VI\.ownerSurface/);
  assert.doesNotMatch(
    appShell,
    /controlSurfaceCopy\.dashboard\.title/,
    "shell identity must describe the control surface, not repeat the current page title",
  );

  for (const removed of [
    "apps/web/app/components/owner-module-shell.tsx",
    "apps/web/app/(protected)/inventory/_components/inventory-shell.tsx",
    "apps/web/app/(protected)/finance/components/finance-shell.tsx",
    "apps/web/app/(protected)/finance/layout.tsx",
    "apps/web/app/(protected)/hr/layout.tsx",
    "apps/web/app/(protected)/menu/layout.tsx",
    "apps/web/app/(protected)/orders/layout.tsx",
    "apps/web/app/(protected)/settings/layout.tsx",
  ]) {
    assert.equal(
      existsSync(resolve(repoRoot, removed)),
      false,
      `${removed} must stay removed so the protected shell can persist`,
    );
  }
});

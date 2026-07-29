import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const branchStockRoot = resolve(
  repoRoot,
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock",
);

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

const retiredBranchRecipeRoute =
  /(?:\/stock\/(?:production\/)?recipes|\$\{(?:basePath|stockRoot)\}\/recipes)/;

test("Branch stock has no route or link to retired recipe administration", () => {
  for (const path of [
    join(branchStockRoot, "recipes"),
    join(branchStockRoot, "production/recipes"),
  ]) {
    assert.equal(existsSync(path), false, path);
  }

  const operatorNav = readFileSync(
    resolve(repoRoot, "packages/shared/src/auth/nav-config.ts"),
    "utf8",
  );
  assert.doesNotMatch(operatorNav, retiredBranchRecipeRoute);

  for (const path of sourceFiles(branchStockRoot)) {
    assert.doesNotMatch(
      readFileSync(path, "utf8"),
      retiredBranchRecipeRoute,
      path,
    );
  }
});

test("menu recipe administration remains reachable from the Owner inventory surface", () => {
  const ownerRecipePage = resolve(
    repoRoot,
    "apps/web/app/(protected)/inventory/menu-recipes/page.tsx",
  );
  const ownerInventoryNav = readFileSync(
    resolve(
      repoRoot,
      "apps/web/app/(protected)/inventory/_lib/inventory-nav.ts",
    ),
    "utf8",
  );

  assert.equal(existsSync(ownerRecipePage), true);
  assert.match(ownerInventoryNav, /href: "\/inventory\/menu-recipes"/);
});

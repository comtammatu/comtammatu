import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { resolveInventoryNav } from "../app/(protected)/inventory/_lib/inventory-nav";
import { getInventoryPaths } from "../app/(protected)/inventory/_lib/paths";

function hrefs(role: "owner" | "central_kitchen_lead"): Set<string> {
  return new Set(
    resolveInventoryNav({
      userRole: role,
      showProcurement: true,
      showProduction: true,
      showCatalogManagement: role === "owner",
      showCatalogRead: role === "central_kitchen_lead",
      showSettings: role === "owner",
    }).flatMap((group) => group.items.map((item) => item.href)),
  );
}

test("menu recipes use an explicit owner-only canonical route", () => {
  const ownerNav = hrefs("owner");
  const kitchenNav = hrefs("central_kitchen_lead");
  const paths = getInventoryPaths("/inventory");

  assert.equal(paths.menuRecipes, "/inventory/menu-recipes");
  assert.equal(ownerNav.has("/inventory/menu-recipes"), true);
  assert.equal(ownerNav.has("/inventory/recipes"), false);
  assert.equal(kitchenNav.has("/inventory/menu-recipes"), false);
  assert.equal(kitchenNav.has("/inventory/recipes"), false);
});

test("production recipes stay inside the production surface", () => {
  const kitchenNav = hrefs("central_kitchen_lead");

  assert.equal(kitchenNav.has("/inventory/production"), true);
  assert.equal(kitchenNav.has("/inventory/menu-recipes"), false);
});

test("compatibility recipes route redirects to the menu-recipe route", () => {
  const legacyPage = readFileSync(
    "app/(protected)/inventory/recipes/page.tsx",
    "utf8",
  );

  assert.match(legacyPage, /redirect\("\/inventory\/menu-recipes"\)/);
  assert.doesNotMatch(
    legacyPage,
    /RecipesClient|fetchRecipes|from\("recipes"\)/,
  );
});

test("canonical menu-recipe source does not export ambiguous Recipe symbols", () => {
  const page = readFileSync(
    "app/(protected)/inventory/menu-recipes/page.tsx",
    "utf8",
  );
  const client = readFileSync(
    "app/(protected)/inventory/menu-recipes/menu-recipes-client.tsx",
    "utf8",
  );
  const actions = readFileSync(
    "app/(protected)/inventory/menu-recipe-actions.ts",
    "utf8",
  );

  assert.match(page, /MenuRecipesClient/);
  assert.match(page, /INVENTORY_CATALOG_ROLES/);
  assert.match(page, /from: "\/inventory\/menu-recipes"/);
  assert.match(actions, /fetchMenuRecipes/);
  assert.match(actions, /upsertMenuRecipeLines/);
  assert.doesNotMatch(
    client,
    /export (?:type|function) Recipes?(?:Row|Client)\b/,
  );
  assert.doesNotMatch(
    actions,
    /export (?:async function|const) (?:fetchRecipes|upsertRecipeLines)\b/,
  );
});

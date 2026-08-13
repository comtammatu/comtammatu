import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Branch catalog thresholds is a native touch LIST isolated from Owner ThresholdsClient", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/thresholds/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/thresholds/catalog-thresholds-client.tsx",
  );
  const ownerClient = read(
    "apps/web/app/(protected)/inventory/settings/thresholds/thresholds-client.tsx",
  );
  const ownerPage = read(
    "apps/web/app/(protected)/inventory/settings/thresholds/page.tsx",
  );
  const archetypes = read("scripts/page-archetypes.mjs");

  assert.match(route, /<CatalogThresholdsClient/);
  assert.match(route, /fetchIngredients/);
  assert.doesNotMatch(route, /\bThresholdsClient\b|DataTable|AppListFrame|embedded/);
  assert.doesNotMatch(route, /reorderPoint|maxStock/);

  assert.match(client, /BranchOperatorPanel/);
  assert.match(client, /ItemGroup/);
  assert.match(client, /NumberPadSheet/);
  assert.match(client, /AppDetailFooter/);
  assert.match(client, /bulkUpdateIngredientThresholds/);
  assert.match(client, /size="touch"/);
  assert.match(client, /size="touch-lg"/);
  assert.doesNotMatch(
    client,
    /\bThresholdsClient\b|DataTable|AppListFrame|FormDialog|QuantityInput|QuantityField/,
  );
  assert.doesNotMatch(client, /reorderPoint|maxStock|formatVND|unitCost/);
  assert.doesNotMatch(client, /\bfont-bold\b|style=\{\{/);
  assert.doesNotMatch(
    client,
    /\b(?:w|h|min-w|min-h|max-w|max-h|gap|p|px|py)-\[[^\]\r\n]*\]/,
  );
  assert.doesNotMatch(
    client,
    /from ["']@\/\(protected\)\/inventory\/(?!settings\/thresholds\/actions)/,
  );

  assert.match(ownerPage, /<ThresholdsClient/);
  assert.match(ownerClient, /\bDataTable\b/);
  assert.match(ownerClient, /\bFormDialog\b/);
  assert.match(ownerClient, /\bQuantityInput\b/);
  assert.doesNotMatch(ownerClient, /reorderPoint|maxStock/);

  assert.match(
    archetypes,
    /stock\/catalog\/thresholds\/page\.tsx":\s*"LIST"/,
  );
});

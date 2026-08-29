import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

const thresholdsSource = readRepo(
  "apps/web/app/components/inventory/branch-stock-thresholds-dialog.tsx",
);
const reorderSource = readRepo(
  "apps/web/app/components/inventory/smart-reorder-sheet.tsx",
);

test("inventory ordering dialogs expose search and operational filters", () => {
  assert.match(thresholdsSource, /thresholdSourceFilter/);
  assert.match(thresholdsSource, /categoryFilter/);
  assert.match(reorderSource, /reorderStatusFilter/);
  assert.match(reorderSource, /supplyChannelFilter/);
  assert.match(reorderSource, /search/);
});

test("inventory ordering dialogs derive units and identifiers from ingredient data", () => {
  assert.doesNotMatch(reorderSource, /baseUnitId\s*\?\?\s*1/);
  assert.doesNotMatch(reorderSource, /baseUnitCode\s*\|\|\s*["']đv["']/);
  assert.match(reorderSource, /baseUnitName/);
  assert.match(thresholdsSource, /InputGroupAddon[^]*unitLabel/);
});

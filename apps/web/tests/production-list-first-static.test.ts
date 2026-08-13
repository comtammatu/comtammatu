import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("production LIST host wires overlay keys and header CTAs by tab", () => {
  const page = read("app/(protected)/inventory/production/page.tsx");
  const workspace = read(
    "app/(protected)/inventory/production/production-workspace-client.tsx",
  );
  const runs = read(
    "app/(protected)/inventory/production/production-runs-client.tsx",
  );

  assert.match(page, /<AppPage width="xwide" density="compact">/);
  assert.match(workspace, /AppPageHeader/);
  assert.match(workspace, /INVENTORY_VI\.createOrderShort/);
  assert.match(workspace, /INVENTORY_VI\.productionRecipeCreate/);
  assert.match(workspace, /queryKeysByValue=\{TAB_QUERY_KEYS\}/);
  assert.match(workspace, /ProductionDocumentDialogHost/);
  assert.match(workspace, /ProductionCreateDialog/);
  assert.match(runs, /useDocumentOverlayUrl\(PRODUCTION_OVERLAY_KEYS\)/);
  assert.match(runs, /patchOverlay\(\{ runId: row\.id, mode: "view" \}/);
  assert.doesNotMatch(runs, /production_run_lines|row\.lines/);
});

test("production recipe LIST stays summary-only and escalates long BOM to AppSheet", () => {
  const panel = read(
    "app/(protected)/inventory/production-recipe-panel.tsx",
  );
  const types = read("app/(protected)/inventory/production-types.ts");

  assert.match(types, /RECIPE_BOM_SHEET_THRESHOLD = 12/);
  assert.match(panel, /RECIPE_BOM_SHEET_THRESHOLD/);
  assert.match(panel, /recipeSpecId:/);
  assert.match(panel, /<AppSheet/);
  assert.match(panel, /useDocumentOverlayUrl\(RECIPE_OVERLAY_KEYS\)/);
  assert.match(panel, /key:\s*"line_count"/);
  assert.doesNotMatch(panel, /key:\s*"ingredients"/);
  assert.doesNotMatch(panel, /group\.lines\.map\(\(line\) =>/);
  assert.match(
    panel,
    /group\.lines\.length > RECIPE_BOM_SHEET_THRESHOLD/,
  );
});

test("production [id] and /new pages are redirect shims", () => {
  const detail = read("app/(protected)/inventory/production/[id]/page.tsx");
  const create = read("app/(protected)/inventory/production/new/page.tsx");

  assert.match(detail, /redirect\(/);
  assert.match(detail, /runId/);
  assert.match(detail, /mode/);
  assert.doesNotMatch(detail, /<AppPage[\s>]|ProductionDetailClient/);
  assert.match(create, /redirect\(/);
  assert.match(create, /\/inventory\/production/);
  assert.doesNotMatch(create, /DocumentFormFrame|ProductionNewClient|AppPage/);
});

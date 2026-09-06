import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(`${repositoryRoot}/${relativePath}`, "utf8");
}

test("Branch printers page conforms to operator shell and enforces 48px touch controls", () => {
  const branchPrintersPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/printers/page.tsx",
  );
  const printersClient = read(
    "apps/web/app/(protected)/br/_shared/settings/printers/printers-client.tsx",
  );

  // Assert BranchPrintersPage follows operator shell standard with BranchOperatorPage and BranchOperatorPanel
  assert.match(
    branchPrintersPage,
    /<BranchOperatorPage[\s\S]*<BranchOperatorPanel[\s\S]*<PrintersClient[\s\S]*<\/BranchOperatorPanel>[\s\S]*<\/BranchOperatorPage>/,
    "BranchPrintersPage conforms to operator shell layout",
  );

  // PrintersClient enforces 48px touch target buttons and input controls
  assert.match(
    printersClient,
    /size="touch"/,
    "PrintersClient must provide size touch actions",
  );
  assert.match(
    printersClient,
    /controlSize = embedded \? "touch" : "field"/,
    "PrintersClient form adapts controlSize to touch when embedded",
  );
  assert.match(
    printersClient,
    /className="flex min-h-12 items-center gap-2 rounded-md px-1"/,
    "Print types and category checkboxes maintain min-h-12 touch targets",
  );
});

test("MultiUnitNumberPadSheet and Stocktake Count List enforce universal 48px touch targets", () => {
  const numberPadSheet = read(
    "apps/web/app/components/form/multi-unit-number-pad-sheet.tsx",
  );
  const stocktakeCountList = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/count/branch-stocktake-count-list.tsx",
  );

  // MultiUnitNumberPadSheet reset button must not be mini h-7
  assert.doesNotMatch(
    numberPadSheet,
    /<Button[^>]*size="sm"[^>]*h-7/,
    "MultiUnitNumberPadSheet reset button must not use mini h-7",
  );
  assert.match(
    numberPadSheet,
    /<Button[\s\S]*size=\{isTouchLayout \? "touch" : "sm"\}[\s\S]*onClick=\{handleClearAll\}/,
    "MultiUnitNumberPadSheet reset button must resolve size touch on mobile",
  );

  // MultiUnitNumberPadSheet confirm button must be touch size
  assert.match(
    numberPadSheet,
    /<Button[\s\S]*size=\{isTouchLayout \? "touch" : "default"\}[\s\S]*onClick=\{handleConfirm\}/,
    "MultiUnitNumberPadSheet confirm button must resolve size touch on mobile",
  );

  // Multi-unit selector pills must be touch size
  assert.match(
    numberPadSheet,
    /<Button[\s\S]*size=\{isTouchLayout \? "touch" : "sm"\}[\s\S]*onClick=\{\(\) => setActiveUnitId\(u\.unitId\)\}/,
    "Unit selector pills must resolve size touch on mobile",
  );

  // Stocktake count list ingredient rows must have min-h-14 touch target
  assert.match(
    stocktakeCountList,
    /<Item[\s\S]*className="min-h-14 items-center p-3 touch-manipulation cursor-pointer bg-card hover:bg-muted\/30 transition-colors"/,
    "Stocktake count rows must have min-h-14 touch target",
  );
});

test("Count slips, waste creation, and stocktake detail implement 48px touch and responsive multi-column layouts", () => {
  const countSlipsClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
  );
  const wasteCreateClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/branch-waste-create-client.tsx",
  );
  const stocktakeDetailClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/branch-stocktake-detail-client.tsx",
  );

  // Count slips search and recount selection
  assert.match(
    countSlipsClient,
    /<InputGroup size="touch" className="w-full bg-card">/,
    "Count slips search input must use size touch",
  );
  assert.match(
    countSlipsClient,
    /<Checkbox[\s\S]*size="touch"[\s\S]*checked=\{selected\}[\s\S]*onCheckedChange=\{onSelectedChange\}/,
    "Recount selection checkbox must use size touch",
  );
  assert.match(
    countSlipsClient,
    /<ItemGroup className="grid gap-2 lg:grid-cols-2">/,
    "Count slips list must preserve responsive multi-column layout",
  );

  // Waste line list item touch target
  assert.match(
    wasteCreateClient,
    /className=\{cn\(\s*"min-h-12 cursor-pointer p-3"/,
    "Waste line list item must have min-h-12 touch target",
  );

  // Stocktake detail review lists multi-column layout
  assert.match(
    stocktakeDetailClient,
    /session\.status === "completed" \? \(\s*<ItemGroup className="grid gap-2 lg:grid-cols-2"/,
    "Completed stocktake review lines must use responsive grid columns",
  );
  assert.match(
    stocktakeDetailClient,
    /<ItemGroup className="grid gap-2 lg:grid-cols-2" role="list">/,
    "In-progress stocktake review lines must use responsive grid columns",
  );
});

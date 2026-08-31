import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(process.cwd(), "../..");
const read = (relativePath: string) =>
  readFileSync(join(repoRoot, relativePath), "utf8");

const PRINT_DIALOGS = [
  "apps/web/app/components/inventory/stock-on-hand-print-dialog.tsx",
  "apps/web/app/components/inventory/stocktake-print-dialog.tsx",
  "apps/web/app/components/inventory/inventory-a4-print-dialog.tsx",
] as const;

const INVENTORY_MOVEMENT_PRINT_DIALOGS = [
  "apps/web/app/(protected)/inventory/grn/[id]/views/grn-a4-print-dialog.tsx",
  "apps/web/app/(protected)/inventory/transfers/[id]/views/transfer-a4-print-dialog.tsx",
  "apps/web/app/(protected)/inventory/issues/[id]/issue-a4-print-dialog.tsx",
] as const;

test("inventory document dialogs print the selected template instead of the screen", () => {
  for (const relativePath of PRINT_DIALOGS) {
    const source = read(relativePath);

    assert.doesNotMatch(source, /window\.print\(\)/, relativePath);
    assert.match(
      source,
      /printDocumentElement\(printRef\.current\)/,
      relativePath,
    );
    assert.match(source, /ref=\{printRef\}/, relativePath);
  }
});

test("the shared print boundary clones one template and isolates it for print media", () => {
  const helper = read("apps/web/lib/printing/print-document.ts");
  const styles = read("packages/ui/src/styles/globals.css");

  assert.match(helper, /target\.cloneNode\(true\)/);
  assert.match(helper, /app-print-portal/);
  assert.match(helper, /app-print-document/);
  assert.match(helper, /document\.body\.append\(portal\)/);
  assert.match(helper, /addEventListener\("afterprint", cleanup/);
  assert.match(helper, /window\.print\(\)/);

  assert.match(styles, /\.app-print-portal\s*\{[\s\S]*?display:\s*none/);
  assert.match(
    styles,
    /body:has\(> \.app-print-portal\)\s*>\s*:not\(\.app-print-portal\)/,
  );
  assert.match(
    styles,
    /body\s*>\s*\.app-print-portal\s*\{[\s\S]*?display:\s*block\s*!important/,
  );
  assert.match(styles, /\.stock-print-sheet,[\s\S]*?\.stock-print-sheet \*/);
  assert.match(styles, /@page thermal-receipt[\s\S]*?size:\s*auto/);
  assert.match(
    styles,
    /\.stock-thermal-sheet,[\s\S]*?width:\s*72mm\s*!important/,
  );
});

test("inventory movement documents use the shared A4 sheet instead of thermal receipt sizing", () => {
  const shared = read(
    "apps/web/app/components/inventory/inventory-a4-print-dialog.tsx",
  );
  const styles = read("packages/ui/src/styles/globals.css");

  assert.match(shared, /variant="document"/);
  assert.match(shared, /inventory-a4-sheet/);
  assert.match(shared, /<DataTable/);
  assert.match(shared, /columns=\{tableColumns\}/);
  assert.match(shared, /data=\{rows\}/);
  for (const relativePath of INVENTORY_MOVEMENT_PRINT_DIALOGS) {
    const source = read(relativePath);
    assert.match(source, /InventoryA4PrintDialog/, relativePath);
    assert.doesNotMatch(source, /thermal-receipt|80mm/, relativePath);
  }
  assert.match(styles, /\.inventory-a4-sheet,[\s\S]*?\.inventory-a4-sheet \*/);
  assert.match(
    styles,
    /\.inventory-a4-sheet thead\s*\{[\s\S]*?display:\s*table-header-group/,
  );
  assert.doesNotMatch(
    styles,
    /\.inventory-a4-sheet\s*\{[^}]*page:\s*thermal-receipt/,
  );
});

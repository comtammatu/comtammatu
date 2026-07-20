import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Owner transfer create stacks line controls at 320px and keeps named touch sizes", () => {
  const form = read(
    "apps/web/app/(protected)/inventory/transfers/create-transfer-dialog.tsx",
  );
  const page = read(
    "apps/web/app/(protected)/inventory/transfers/new/page.tsx",
  );

  assert.match(form, /useIsMobile\(1024\)/);
  assert.match(form, /const controlSize = isTouchLayout \? "touch" : "field"/);
  assert.match(
    form,
    /className="w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-nowrap/,
  );
  assert.match(
    form,
    /grid-cols-\[minmax\(0,1fr\)_3rem\][\s\S]*?col-span-2 w-full sm:w-40/,
  );
  assert.match(form, /<InputGroup[\s\S]*?size=\{controlSize\}/);
  assert.match(
    form,
    /<InputGroupAddon align="inline-end" className="py-0">/,
  );
  assert.match(form, /controlSize=\{controlSize\}/);
  assert.match(form, /size=\{removeActionSize\}/);
  assert.doesNotMatch(form, /className="h-8 w-(?:16|20|32)"/);
  assert.match(page, /size="touch"/);
});

test("Owner waste create propagates touch density through route-local controls", () => {
  const form = read(
    "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx",
  );
  const reasons = read(
    "apps/web/app/(protected)/inventory/_components/waste-reason-dropdown.tsx",
  );

  assert.match(form, /useIsMobile\(1024\)/);
  assert.match(form, /const controlSize = isTouchLayout \? "touch" : "field"/);
  assert.match(form, /<SelectTrigger id="waste-loc" size=\{controlSize\}/);
  assert.match(form, /<Combobox[\s\S]*?size=\{controlSize\}/);
  assert.match(form, /<InputGroup size=\{controlSize\}>/);
  assert.match(
    form,
    /<InputGroupAddon align="inline-end" className="py-0">/,
  );
  assert.match(form, /size=\{removeActionSize\}/);
  assert.match(form, /grid grid-cols-1 gap-3 sm:grid-cols-2/);
  assert.equal(form.match(/size=\{actionSize\}/g)?.length, 3);
  assert.match(reasons, /size=\{size === "touch" \? "touch" : "default"\}/);
});

test("Owner stock detail operations are touch-safe without a two-column phone squeeze", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/stock/[ingredientId]/page.tsx",
  );
  const operationStart = source.indexOf("detailCopy.operationTitle");
  const operationEnd = source.indexOf("detailCopy.thresholdTitle");
  const operations = source.slice(operationStart, operationEnd);

  assert.notEqual(operationStart, -1);
  assert.notEqual(operationEnd, -1);
  assert.match(operations, /grid grid-cols-1 gap-2 sm:grid-cols-2/);
  assert.equal(operations.match(/size="touch"/g)?.length, 5);
  assert.doesNotMatch(operations, /size="sm"/);
});

test("production recipe import and export menu mirrors the responsive Inventory menu contract", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/production-recipe-import-export-menu.tsx",
  );

  assert.match(source, /useIsMobile\(1024\)/);
  assert.equal(
    source.match(/size=\{isTouchLayout \? "touch" : "default"\}/g)?.length,
    5,
  );
});

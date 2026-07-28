import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Owner transfer create route returns to read-only history", () => {
  const page = read(
    "apps/web/app/(protected)/inventory/transfers/new/page.tsx",
  );

  assert.match(page, /redirect\("\/inventory\/transfers"\)/);
  assert.doesNotMatch(
    page,
    /CreateTransferForm|DocumentFormFrame|loadTransferCreatePageData/,
  );
});

test("Owner waste create propagates touch density through route-local controls", () => {
  const form = read(
    "apps/web/app/(protected)/inventory/waste/waste-operational-form.tsx",
  );
  const reasons = read(
    "apps/web/app/(protected)/inventory/_components/waste-reason-dropdown.tsx",
  );

  assert.match(form, /<SelectTrigger size="touch">/);
  assert.match(form, /<Combobox[\s\S]*?size="touch"/);
  assert.match(form, /<FormattedNumberInput[\s\S]*?className="h-12"/);
  assert.match(form, /previewSize="touch"/);
  assert.match(form, /size="touch-lg"/);
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

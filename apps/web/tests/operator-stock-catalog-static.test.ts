import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const readWeb = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8");

const catalogIndexSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/stock/catalog/catalog-index-client.tsx",
);
const catalogListSource = readWeb(
  "app/(protected)/br/[branchId]/(operator)/stock/catalog/catalog-list.tsx",
);

test("operator stock catalog index uses stable touch rows", () => {
  assert.match(catalogIndexSource, /prefetch=\{true\}/);
  assert.match(catalogIndexSource, /className="chrome-tap min-h-12/);
  assert.match(catalogIndexSource, /<row\.icon aria-hidden="true" \/>/);
  assert.match(
    catalogIndexSource,
    /<ChevronRight aria-hidden="true" className="size-4" \/>/,
  );
  assert.doesNotMatch(catalogIndexSource, /transition-transform/);
  assert.doesNotMatch(catalogIndexSource, /active:scale-\[0\.97\]/);
});

test("operator stock catalog lists stay touch-first on narrow and tablet widths", () => {
  assert.match(
    catalogListSource,
    /<Item\s+key=\{getRowKey\(row\)\}\s+variant="outline"\s+size="sm"\s+className="min-h-12 min-w-0 flex-nowrap"\s*>/,
  );
  assert.match(catalogListSource, /size="icon-touch"/);
  assert.match(catalogListSource, /aria-label=\{action\.ariaLabel\(row\)\}/);
  assert.match(
    catalogListSource,
    /className="line-clamp-2 min-w-0 break-words text-sm font-medium"/,
  );
  assert.match(
    catalogListSource,
    /className="line-clamp-2 break-words text-xs"/,
  );
  assert.match(catalogListSource, /<IconPlus aria-hidden="true"/);
  assert.match(catalogListSource, /<IconPencil aria-hidden="true"/);
  assert.match(catalogListSource, /<IconTrash aria-hidden="true"/);
  assert.doesNotMatch(catalogListSource, /className="truncate text-/);
});

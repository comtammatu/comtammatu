import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const stockClientSource = readWeb(
  "app/(protected)/inventory/stock/stock-client.tsx",
);
const printDialogSource = readWeb(
  "app/components/inventory/stock-on-hand-print-dialog.tsx",
);

test("inventory stock header forwards the shared field button size", () => {
  assert.match(
    stockClientSource,
    /<AppPageHeader[\s\S]{0,160}className="max-xl:\[&>div\]:flex-col max-xl:\[&>div\]:items-stretch"/,
  );
  assert.match(
    stockClientSource,
    /className="flex min-w-0 w-full flex-wrap items-center justify-start gap-1\.5 xl:w-auto xl:justify-end xl:gap-2"/,
  );
  assert.match(stockClientSource, /buttonSize="field"/);
  assert.match(printDialogSource, /size=\{buttonSize\}/);
  assert.doesNotMatch(
    printDialogSource,
    /buttonSize === "field" \? "default" : buttonSize/,
  );
});

test("inventory stock metric cards contain long labels and values", () => {
  assert.match(stockClientSource, /"grid-cols-2 xl:grid-cols-5"/);
  assert.doesNotMatch(stockClientSource, /"grid-cols-2 lg:grid-cols-5"/);
  assert.match(
    stockClientSource,
    /className="col-span-2 min-w-0 overflow-hidden[^"]*xl:col-span-1"/,
  );
  assert.equal(
    stockClientSource.match(
      /"min-w-0 overflow-hidden flex flex-col justify-between p-3 text-left cursor-pointer"/g,
    )?.length,
    4,
  );
  assert.match(
    stockClientSource,
    /className="block min-w-0 max-w-full break-words text-xs text-muted-foreground font-mono tabular-nums"/,
  );
});

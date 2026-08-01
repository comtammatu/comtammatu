import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

test("stock adjustments allow choosing an ingredient unit and convert to base quantity", () => {
  const dialog = readFileSync(
    `${root}apps/web/app/(protected)/inventory/stock/adjust-stock-dialog.tsx`,
    "utf8",
  );
  const stockClient = readFileSync(
    `${root}apps/web/app/(protected)/inventory/stock/stock-client.tsx`,
    "utf8",
  );

  assert.match(dialog, /entryUnitId/);
  assert.match(dialog, /getIngredientUnitOptions/);
  assert.match(dialog, /<Select/);
  assert.match(
    dialog,
    /getIssueBaseQuantity\(Math\.abs\(parsedQuantityChange\)/,
  );
  assert.match(dialog, /Math\.sign\(parsedQuantityChange\)/);
  assert.match(
    stockClient,
    /<AdjustStockDialog[\s\S]*?ingredient=\{adjustTarget\}/,
  );
});

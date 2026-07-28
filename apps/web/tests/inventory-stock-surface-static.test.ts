import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

test("stock surfaces do not expose a location filter when topology owns one warehouse", () => {
  const stockClient = read(
    "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
  );
  const branchStockClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
  );

  assert.doesNotMatch(
    stockClient,
    /locationFilterOptions|locationFilterControl/,
  );
  assert.doesNotMatch(
    branchStockClient,
    /locationFilterOptions|locationFilterControl/,
  );
});

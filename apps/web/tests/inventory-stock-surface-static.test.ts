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

test("branch stock keeps mobile attention and tools on compact rows", () => {
  const branchStockClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
  );

  assert.doesNotMatch(branchStockClient, /stockCopy\.attention\.description/);
  assert.match(branchStockClient, /aria-label=\{ACTIONS_VI\.filter\}/);
  assert.match(branchStockClient, /className="hidden sm:inline"/);
  assert.match(
    branchStockClient,
    /<InputGroup className="min-h-12 min-w-0 flex-1">[\s\S]*?<div className="flex shrink-0 gap-2">/,
  );
});

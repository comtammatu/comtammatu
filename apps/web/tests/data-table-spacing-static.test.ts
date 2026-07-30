import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const paths = [
  "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  "app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  "app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
];

test("inventory DataTables defer spacing to the shared adapter", () => {
  for (const path of paths) {
    const source = readFileSync(path, "utf8");

    assert.doesNotMatch(
      source,
      /className="(?:p-4 md:p-0|gap-2 max-md:divide-y)"/,
      path,
    );
  }
});

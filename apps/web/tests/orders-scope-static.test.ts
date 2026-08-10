import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

test("Owner orders list reads ?branch= scope and writes ?branch= only", () => {
  const page = read("app/(protected)/orders/page.tsx");
  const client = read("app/(protected)/orders/orders-client.tsx");

  assert.match(page, /parseControlSurfaceBranchScope\(params\.branch/);
  assert.doesNotMatch(page, /params\.branchId/);
  assert.match(page, /getControlSurfaceScopeBranchId/);
  assert.match(client, /resolveScopeFromSearchParams/);
  assert.match(client, /nextParams\.set\("branch", branchId\)/);
  assert.match(client, /nextParams\.delete\("branchId"\)/);
  assert.doesNotMatch(
    client,
    /writeListFilterParam\(nextParams, "branchId", branchId\)/,
  );
});

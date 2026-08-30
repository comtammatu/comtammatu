import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../app/(protected)/inventory/production-run-actions.ts",
    import.meta.url,
  ),
  "utf8",
);

test("production-run cost reads use the permission-gated monetary client", () => {
  assert.match(source, /loadInventoryMonetaryAccess/);
  assert.match(source, /monetaryAccess\.valuation/);
  assert.match(source, /monetaryAccess\.client/);
  assert.match(source, /\.eq\("branch_id", run\.branch_id\)/);
});

test("production-run cost query failures do not become zero-valued costs", () => {
  assert.match(source, /movementError/);
  assert.match(source, /stockError/);
  assert.match(source, /ingredientError/);
});

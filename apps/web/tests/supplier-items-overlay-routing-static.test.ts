import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "../..");
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

test("supplier ingredient mapping keeps URL history and one overlay", () => {
  const suppliers = read(
    "apps/web/app/(protected)/inventory/suppliers/suppliers-client.tsx",
  );
  const items = read(
    "apps/web/app/(protected)/inventory/suppliers/[id]/items/supplier-items-client.tsx",
  );

  assert.match(suppliers, /next\.set\("supplierId", String\(row\.id\)\);[\s\S]*router\.push/);
  assert.match(items, /\{dialogOpen \? null : \(\s*<AppDialog/);
  assert.match(items, /multiSupplierHint/);
});

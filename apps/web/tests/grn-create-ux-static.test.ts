import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("direct GRN creation routes operators back to the GRN queue", () => {
  const page = read("app/(protected)/inventory/grn/new/page.tsx");
  const supplierPage = read(
    "app/(protected)/inventory/grn/new/[supplierId]/page.tsx",
  );

  assert.match(page, /redirect\("\/inventory\/grn"\)/);
  assert.doesNotMatch(page, /GrnCreateClient|loadGrnCreatePageData/);
  assert.match(supplierPage, /redirect\("\/inventory\/grn"\)/);
});

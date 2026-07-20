import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("POS discount selectors use the canonical touch tab contract", () => {
  for (const path of [
    "../app/(protected)/br/[branchId]/pos/item-customizer.tsx",
    "../app/(protected)/br/[branchId]/pos/_components/order-detail/discount-sheet.tsx",
  ]) {
    const source = read(path);

    assert.match(source, /<TabsList\s+size="touch"\s+className="w-full">/);
    assert.doesNotMatch(
      source,
      /<Tabs(?:List|Trigger)[^>]*className="[^"]*(?:min-)?h-(?:10|11|12|14|16)\b/,
    );
  }
});

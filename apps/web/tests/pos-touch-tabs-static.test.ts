import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("POS discount selectors use the canonical touch tab contract", () => {
  const discountSheet = read(
    "../app/(protected)/br/[branchId]/pos/_components/order-detail/discount-sheet.tsx",
  );
  assert.match(
    discountSheet,
    /<TabsList\s+size="touch"\s+className="w-full">/,
  );
  assert.doesNotMatch(
    discountSheet,
    /<Tabs(?:List|Trigger)[^>]*className="[^"]*(?:min-)?h-(?:10|11|12|14|16)\b/,
  );

  // ADR 0034: item discount is VND-only — no %/VND Tabs.
  const itemCustomizer = read(
    "../app/(protected)/br/[branchId]/pos/item-customizer.tsx",
  );
  assert.doesNotMatch(
    itemCustomizer,
    /from "@comtammatu\/ui\/components\/tabs"/,
  );
  assert.doesNotMatch(itemCustomizer, /<TabsList\b/);
  assert.doesNotMatch(itemCustomizer, /discountType:\s*"pct"/);
  assert.match(itemCustomizer, /discountType:\s*"vnd"/);
  assert.match(itemCustomizer, /applyDiscount \? "vnd" : undefined/);
});

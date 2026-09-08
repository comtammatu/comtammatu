import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  resolveEffectiveThresholds,
  type EffectiveStockThresholds,
  type StockThresholdInput,
} from "../lib/inventory/replenishment-contract.ts";

type ThresholdCase = {
  name: string;
  ingredient: StockThresholdInput;
  location: StockThresholdInput;
} & (
  | { expected: EffectiveStockThresholds; error?: never }
  | { error: string; expected?: never }
);

const fixture = readFileSync(
  new URL(
    "../../../supabase/tests/fixtures/effective_stock_threshold_cases.sql",
    import.meta.url,
  ),
  "utf8",
);
const corpus = fixture.match(
  /\$threshold_cases\$([\s\S]*?)\$threshold_cases\$/,
)?.[1];
assert.ok(corpus, "SQL fixture must expose the shared JSON threshold cases");
const cases = JSON.parse(corpus) as ThresholdCase[];
assert.ok(cases.length > 0);
assert.equal(new Set(cases.map((entry) => entry.name)).size, cases.length);

for (const entry of cases) {
  test(`SQL threshold corpus: ${entry.name}`, () => {
    if (entry.error) {
      assert.throws(() =>
        resolveEffectiveThresholds(entry.ingredient, entry.location),
      );
    } else {
      assert.deepEqual(
        resolveEffectiveThresholds(entry.ingredient, entry.location),
        entry.expected,
      );
    }
  });
}

test("every threshold field rejects nonfinite values even when shadowed", () => {
  for (const field of [
    "minStockLevel",
    "targetStockLevel",
    "capacityLimit",
  ] as const) {
    for (const value of [NaN, Infinity, -Infinity]) {
      assert.throws(() =>
        resolveEffectiveThresholds({ [field]: value }, { [field]: 0 }),
      );
      assert.throws(() => resolveEffectiveThresholds({}, { [field]: value }));
    }
  }
});

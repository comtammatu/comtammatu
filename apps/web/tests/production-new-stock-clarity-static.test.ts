import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const client = read(
  "apps/web/app/(protected)/inventory/production/new/production-new-client.tsx",
);
const messages = read("packages/shared/src/messages/inventory.ts");

test("production create drops kitchen/location ceremony and keeps compact plan fields", () => {
  assert.doesNotMatch(client, /Bếp và vị trí sản xuất/);
  assert.doesNotMatch(client, /Nơi xuất nguyên liệu/);
  assert.doesNotMatch(client, /Nơi nhập thành phẩm/);
  assert.match(client, /resolveDefaultLocations/);
  // Compact plan fields: recipe flexes, quantity column stays a fixed 11rem
  // (named scale max-w-44) — no arbitrary grid template.
  assert.match(client, /md:flex md:items-end/);
  assert.match(client, /className="w-full max-w-44"/);
  assert.doesNotMatch(client, /grid-cols-\[/);
});

test("production create surfaces max producible and need-vs-stock columns", () => {
  assert.match(client, /productionMaxProducible/);
  assert.match(client, /maxProductionQuantity/);
  assert.match(client, /max_ingredient_qty/);
  assert.match(client, /INVENTORY_VI\.shortageNeeded/);
  assert.match(client, /INVENTORY_VI\.shortageOnHand/);
  assert.match(client, /productionPlanExceedsStock/);
  assert.match(
    messages,
    /productionMaxProducible: \(qty: string, unit: string\) =>/,
  );
  assert.match(messages, /productionIngredientsNeedVsStock:/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calcItemSubtotal,
  getPosLineItemOptionLines,
  getPosLineItemSummary,
  type CartItem,
} from "../app/(protected)/br/[branchId]/pos/types";

function buildItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    key: "line-1",
    menu_item_id: 101,
    item_name: "Sườn cốt lết",
    quantity: 5,
    unit_price: 35_000,
    modifiers: [],
    sides: [
      {
        side_item_id: 201,
        name: "Trứng",
        price: 5_000,
        quantity: 1,
        is_default: false,
      },
    ],
    ...overrides,
  };
}

test("POS side summary displays clean side name for single portion without multiplying", () => {
  const summary = getPosLineItemSummary(buildItem());

  assert.deepEqual(summary.sides, ["Trứng"]);
  assert.equal(summary.options, "+ Trứng");
  assert.ok(!summary.sides.includes("Trứng x5"));
  assert.ok(!summary.sides.includes("Trứng x1"));
});

test("POS side summary keeps side quantity as per portion when greater than one", () => {
  const summary = getPosLineItemSummary(
    buildItem({
      sides: [
        {
          side_item_id: 201,
          name: "Trứng",
          price: 5_000,
          quantity: 2,
          is_default: false,
        },
      ],
    }),
  );

  assert.deepEqual(summary.sides, ["Trứng x2"]);
  assert.equal(summary.options, "+ Trứng x2");
  assert.ok(!summary.sides.includes("Trứng x10"));
  assert.ok(!summary.sides.some((side) => side.includes("/phần")));
});

test("POS side display fix does not change subtotal math", () => {
  const item = buildItem();

  assert.equal(calcItemSubtotal(item), (35_000 + 5_000) * 5);
});

test("POS option lines also describe side quantity per portion", () => {
  const lines = getPosLineItemOptionLines(
    buildItem({
      sides: [
        {
          side_item_id: 201,
          name: "Trứng",
          price: 5_000,
          quantity: 2,
          is_default: false,
        },
      ],
    }),
  );

  assert.deepEqual(lines, ["Kèm: Trứng x2 (+10.000đ)"]);
});

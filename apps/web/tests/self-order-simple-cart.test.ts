import assert from "node:assert/strict";
import { test } from "node:test";
import type { SelfOrderCartItem } from "../lib/self-order/contracts";
import { addOrIncrementSimpleCartItem } from "../app/q/[token]/self-order/simple-cart";

function line(
  partial: Partial<SelfOrderCartItem> &
    Pick<SelfOrderCartItem, "key" | "menu_item_id">,
): SelfOrderCartItem {
  return {
    item_name: "Cơm sườn",
    variant_id: 1,
    variant_name: "Thường",
    quantity: 1,
    unit_price: 35000,
    modifiers: [],
    sides: [],
    note: "",
    ...partial,
  };
}

test("addOrIncrementSimpleCartItem merges the same uncustomized menu line", () => {
  const first = line({ key: "a", menu_item_id: 10, quantity: 1 });
  const second = line({ key: "b", menu_item_id: 10, quantity: 1 });
  const merged = addOrIncrementSimpleCartItem([first], second);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.key, "a");
  assert.equal(merged[0]?.quantity, 2);
});

test("addOrIncrementSimpleCartItem appends when variant, note, sides, or modifiers differ", () => {
  const base = line({ key: "a", menu_item_id: 10 });
  assert.equal(
    addOrIncrementSimpleCartItem(
      [base],
      line({ key: "b", menu_item_id: 10, variant_id: 2 }),
    ).length,
    2,
  );
  assert.equal(
    addOrIncrementSimpleCartItem(
      [base],
      line({ key: "b", menu_item_id: 10, note: "Ít cơm" }),
    ).length,
    2,
  );
  assert.equal(
    addOrIncrementSimpleCartItem(
      [base],
      line({
        key: "b",
        menu_item_id: 10,
        modifiers: [{ modifier_id: 1, name: "Trứng", price: 5000 }],
      }),
    ).length,
    2,
  );
  assert.equal(
    addOrIncrementSimpleCartItem(
      [base],
      line({
        key: "b",
        menu_item_id: 10,
        sides: [
          {
            side_item_id: 3,
            name: "Canh",
            price: 0,
            quantity: 1,
            is_default: true,
          },
        ],
      }),
    ).length,
    2,
  );
});

test("addOrIncrementSimpleCartItem appends customized incoming even if a simple line exists", () => {
  const simple = line({ key: "a", menu_item_id: 10 });
  const customized = line({
    key: "b",
    menu_item_id: 10,
    note: "Không hành",
  });
  const next = addOrIncrementSimpleCartItem([simple], customized);
  assert.equal(next.length, 2);
  assert.equal(next[0]?.quantity, 1);
  assert.equal(next[1]?.key, "b");
});

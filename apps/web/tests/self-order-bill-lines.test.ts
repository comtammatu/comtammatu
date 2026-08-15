import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBillRow, buildBillRows } from "../app/q/[token]/self-order/order-summary";

test("Self-Order bill consolidates main dish, modifiers, and sides in a unified row structure", () => {
  const line = {
    id: 1,
    menuItemId: 10,
    itemName: "Sườn Cốt Lết",
    variantId: null,
    variantName: null,
    quantity: 2,
    unitPrice: 54_000,
    lineTotal: 108_000,
    modifiers: [{ modifier_id: 1, name: "Trứng", price: 5_000 }],
    sides: [
      {
        side_item_id: 2,
        name: "Chả",
        price: 7_000,
        quantity: 2,
        is_default: false,
      },
    ],
    note: "Không mỡ hành",
  };

  const row = buildBillRow(line);
  const rows = buildBillRows(line);

  assert.equal(rows.length, 1);
  assert.equal(row.label, "Sườn Cốt Lết");
  assert.equal(row.quantity, 2);
  assert.equal(row.unitPrice, 54_000);
  assert.equal(row.lineTotal, 108_000);
  assert.equal(row.note, "Không mỡ hành");
  assert.equal(row.modifiers.length, 1);
  assert.equal(row.sides.length, 1);
});

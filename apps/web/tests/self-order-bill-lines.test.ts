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
    discountAmount: 0,
    discountNote: null,
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
  assert.equal(row.discountAmount, 0);
  assert.equal(row.discountNote, null);
  assert.equal(row.note, "Không mỡ hành");
  assert.equal(row.modifiers.length, 1);
  assert.equal(row.sides.length, 1);
});

test("Self-Order bill row keeps item discount on the discounted line", () => {
  const row = buildBillRow({
    id: 2,
    menuItemId: 10,
    itemName: "Sườn Cốt Lết",
    variantId: null,
    variantName: null,
    quantity: 1,
    unitPrice: 54_000,
    lineTotal: 54_000,
    discountAmount: 10_000,
    discountNote: "Tặng món · TET10",
    modifiers: [],
    sides: [],
    note: null,
  });

  assert.equal(row.discountAmount, 10_000);
  assert.equal(row.discountNote, "Tặng món · TET10");
  assert.equal(row.lineTotal, 54_000);
});

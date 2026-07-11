import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBillRows } from "../app/q/[token]/self-order/order-summary";

test("Self-Order bill splits the main dish, modifiers, and sides into priced rows", () => {
  const rows = buildBillRows({
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
    note: null,
  });

  assert.deepEqual(
    rows.map(({ label, quantity, unitPrice, lineTotal }) => ({
      label,
      quantity,
      unitPrice,
      lineTotal,
    })),
    [
      {
        label: "Sườn Cốt Lết",
        quantity: 2,
        unitPrice: 35_000,
        lineTotal: 70_000,
      },
      { label: "Trứng", quantity: 2, unitPrice: 5_000, lineTotal: 10_000 },
      { label: "Chả", quantity: 4, unitPrice: 7_000, lineTotal: 28_000 },
    ],
  );
  assert.equal(
    rows.reduce((sum, row) => sum + row.lineTotal, 0),
    108_000,
  );
});

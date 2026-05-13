import test from "node:test";
import assert from "node:assert/strict";
import { buildInvoiceLineItemsFromOrderItems } from "../invoice-line-items";

test("expands paid modifiers into separate HĐĐT lines", () => {
  const lines = buildInvoiceLineItemsFromOrderItems([
    {
      item_name: "Cơm sườn cốt lết",
      variant_name: null,
      quantity: 1,
      unit_price: 54_000,
      subtotal: 54_000,
      modifiers: [
        { modifier_id: 1, name: "Bì", price: 7_000 },
        { modifier_id: 2, name: "Chả", price: 7_000 },
        { modifier_id: 3, name: "Trứng", price: 5_000 },
      ],
      sides: [],
    },
  ]);

  assert.deepEqual(
    lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
    })),
    [
      { name: "Cơm sườn cốt lết", quantity: 1, unitPrice: 35_000, amount: 35_000 },
      { name: "Bì", quantity: 1, unitPrice: 7_000, amount: 7_000 },
      { name: "Chả", quantity: 1, unitPrice: 7_000, amount: 7_000 },
      { name: "Trứng", quantity: 1, unitPrice: 5_000, amount: 5_000 },
    ],
  );
  assert.equal(
    lines.reduce((sum, line) => sum + line.amount, 0),
    54_000,
  );
});

test("expands side quantities per parent order quantity", () => {
  const lines = buildInvoiceLineItemsFromOrderItems([
    {
      item_name: "Cơm sườn",
      variant_name: null,
      quantity: 2,
      unit_price: 45_000,
      subtotal: 90_000,
      modifiers: [],
      sides: [{ side_item_id: 10, name: "Canh thêm", price: 5_000, quantity: 2 }],
    },
  ]);

  assert.deepEqual(
    lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
    })),
    [
      { name: "Cơm sườn", quantity: 2, unitPrice: 35_000, amount: 70_000 },
      { name: "Canh thêm", quantity: 4, unitPrice: 5_000, amount: 20_000 },
    ],
  );
});

test("falls back to aggregate line if option prices exceed stored unit price", () => {
  const lines = buildInvoiceLineItemsFromOrderItems([
    {
      item_name: "Món lỗi giá",
      quantity: 1,
      unit_price: 10_000,
      subtotal: 10_000,
      modifiers: [{ name: "Topping lỗi", price: 20_000 }],
      sides: [],
    },
  ]);

  assert.deepEqual(lines, [
    {
      name: "Món lỗi giá",
      unit: "Phần",
      quantity: 1,
      unitPrice: 10_000,
      amount: 10_000,
    },
  ]);
});

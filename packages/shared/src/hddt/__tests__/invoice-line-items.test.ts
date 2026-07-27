import test from "node:test";
import assert from "node:assert/strict";
import {
  applyInvoiceLineDiscount,
  buildInvoiceLineItemsFromOrderItems,
} from "../invoice-line-items";

test("expands paid modifiers into separate HĐĐT lines", () => {
  const lines = buildInvoiceLineItemsFromOrderItems([
    {
      item_name: "Cơm sườn cốt lết",
      variant_name: null,
      quantity: 1,
      unit_price: 54_000,
      subtotal: 54_000,
      vat_rate: 8,
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
      {
        name: "Cơm sườn cốt lết",
        quantity: 1,
        unitPrice: 35_000,
        amount: 35_000,
      },
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

test("propagates the sold item VAT rate to every legal line", () => {
  const lines = buildInvoiceLineItemsFromOrderItems([
    {
      item_name: "Cơm sườn",
      quantity: 1,
      unit_price: 50_000,
      vat_rate: 8,
      modifiers: [{ name: "Trứng", price: 5_000 }],
    },
  ]);

  assert.deepEqual(
    lines.map((line) => line.vatRate),
    [8, 8],
  );
});

test("allocates order discount across legal invoice lines", () => {
  const lines = buildInvoiceLineItemsFromOrderItems([
    {
      item_name: "Cơm sườn cốt lết",
      variant_name: null,
      quantity: 1,
      unit_price: 54_000,
      subtotal: 54_000,
      vat_rate: 8,
      modifiers: [
        { modifier_id: 1, name: "Bì", price: 7_000 },
        { modifier_id: 2, name: "Chả", price: 7_000 },
        { modifier_id: 3, name: "Trứng", price: 5_000 },
      ],
      sides: [],
    },
  ]);

  const discounted = applyInvoiceLineDiscount(lines, 10_800);

  assert.deepEqual(
    discounted.map((line) => ({
      name: line.name,
      amount: line.amount,
      discountAmount: line.discountAmount ?? 0,
    })),
    [
      {
        name: "Cơm sườn cốt lết",
        amount: 35_000,
        discountAmount: 7_000,
      },
      { name: "Bì", amount: 7_000, discountAmount: 1_400 },
      { name: "Chả", amount: 7_000, discountAmount: 1_400 },
      { name: "Trứng", amount: 5_000, discountAmount: 1_000 },
    ],
  );
  assert.equal(
    discounted.reduce((sum, line) => sum + (line.discountAmount ?? 0), 0),
    10_800,
  );
});

test("allocates item discount across that item's legal invoice lines", () => {
  const lines = buildInvoiceLineItemsFromOrderItems([
    {
      item_name: "Cơm sườn cốt lết",
      variant_name: null,
      quantity: 1,
      unit_price: 54_000,
      subtotal: 54_000,
      discount_amount: 10_800,
      vat_rate: 8,
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
      amount: line.amount,
      discountAmount: line.discountAmount ?? 0,
    })),
    [
      {
        name: "Cơm sườn cốt lết",
        amount: 35_000,
        discountAmount: 7_000,
      },
      { name: "Bì", amount: 7_000, discountAmount: 1_400 },
      { name: "Chả", amount: 7_000, discountAmount: 1_400 },
      { name: "Trứng", amount: 5_000, discountAmount: 1_000 },
    ],
  );
  assert.equal(
    lines.reduce((sum, line) => sum + (line.discountAmount ?? 0), 0),
    10_800,
  );
});

test("adds order discount to existing item line discounts", () => {
  const discounted = applyInvoiceLineDiscount(
    [
      {
        name: "Cơm sườn",
        unit: "Phần",
        quantity: 1,
        unitPrice: 45_000,
        amount: 45_000,
        vatRate: 8,
        discountAmount: 5_000,
      },
      {
        name: "Trứng",
        unit: "Phần",
        quantity: 1,
        unitPrice: 5_000,
        amount: 5_000,
        vatRate: 8,
      },
    ],
    9_000,
  );

  assert.deepEqual(
    discounted.map((line) => ({
      name: line.name,
      discountAmount: line.discountAmount ?? 0,
    })),
    [
      { name: "Cơm sườn", discountAmount: 13_000 },
      { name: "Trứng", discountAmount: 1_000 },
    ],
  );
});

test("clamps invoice line discount at sold line total", () => {
  const discounted = applyInvoiceLineDiscount(
    [
      {
        name: "Cơm sườn",
        unit: "Phần",
        quantity: 1,
        unitPrice: 45_000,
        amount: 45_000,
        vatRate: 8,
      },
    ],
    50_000,
  );

  assert.equal(discounted[0]?.discountAmount, 45_000);
});

test("aggregates duplicate component lines by quantity", () => {
  const lines = buildInvoiceLineItemsFromOrderItems([
    {
      item_name: "Sườn Cây",
      variant_name: null,
      quantity: 1,
      unit_price: 64_000,
      subtotal: 64_000,
      vat_rate: 8,
      modifiers: [
        { modifier_id: 1, name: "Bì", price: 7_000 },
        { modifier_id: 2, name: "Chả", price: 7_000 },
        { modifier_id: 3, name: "Trứng", price: 5_000 },
      ],
      sides: [],
    },
    {
      item_name: "Sườn Cốt Lết",
      variant_name: null,
      quantity: 1,
      unit_price: 49_000,
      subtotal: 49_000,
      vat_rate: 8,
      modifiers: [
        { modifier_id: 1, name: "Bì", price: 7_000 },
        { modifier_id: 2, name: "Chả", price: 7_000 },
      ],
      sides: [],
    },
    {
      item_name: "Sườn Cây",
      variant_name: null,
      quantity: 1,
      unit_price: 50_000,
      subtotal: 50_000,
      vat_rate: 8,
      modifiers: [{ modifier_id: 3, name: "Trứng", price: 5_000 }],
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
      { name: "Sườn Cây", quantity: 2, unitPrice: 45_000, amount: 90_000 },
      { name: "Bì", quantity: 2, unitPrice: 7_000, amount: 14_000 },
      { name: "Chả", quantity: 2, unitPrice: 7_000, amount: 14_000 },
      { name: "Trứng", quantity: 2, unitPrice: 5_000, amount: 10_000 },
      { name: "Sườn Cốt Lết", quantity: 1, unitPrice: 35_000, amount: 35_000 },
    ],
  );
  assert.equal(
    lines.reduce((sum, line) => sum + line.amount, 0),
    163_000,
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
      vat_rate: 8,
      modifiers: [],
      sides: [
        { side_item_id: 10, name: "Canh thêm", price: 5_000, quantity: 2 },
      ],
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
      vat_rate: 0,
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
      vatRate: 0,
    },
  ]);
});

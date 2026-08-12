import test from "node:test";
import assert from "node:assert/strict";
import {
  bakeGrossDiscountCheapFirst,
  buildHddtProviderLines,
  buildInvoiceLineItemsFromOrderItems,
  resolveServiceChargeVatRate,
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

test("order discount waterfills cheapest lines first and bakes into amount", () => {
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

  const discounted = bakeGrossDiscountCheapFirst(lines, 10_800);
  const byName = Object.fromEntries(
    discounted.map((line) => [line.name, line.amount]),
  );

  // Cheap-first: Trứng 5k → Bì 5.8k of 7k → stop.
  assert.equal(byName["Trứng"], 0);
  assert.equal(byName["Bì"], 1_200);
  assert.equal(byName["Chả"], 7_000);
  assert.equal(byName["Cơm sườn cốt lết"], 35_000);
  assert.ok(discounted.every((line) => line.discountAmount === undefined));
  assert.equal(
    discounted.reduce((sum, line) => sum + line.amount, 0),
    54_000 - 10_800,
  );
});

test("item discount is baked before order discount in provider projection", () => {
  const lines = buildHddtProviderLines({
    items: [
      {
        item_name: "Cơm sườn",
        quantity: 1,
        unit_price: 54_000,
        subtotal: 54_000,
        discount_amount: 4_000,
        vat_rate: 8,
        modifiers: [
          { name: "Bì", price: 7_000 },
          { name: "Chả", price: 7_000 },
          { name: "Trứng", price: 5_000 },
        ],
      },
    ],
    orderDiscountAmount: 5_000,
    totalAmount: 45_000,
  });

  assert.equal(
    lines.reduce((sum, line) => sum + line.amount, 0),
    45_000,
  );
  assert.ok(lines.every((line) => line.discountAmount === undefined));
  assert.ok(lines.every((line) => line.amount > 0));
});

test("omits lines reduced to zero and appends service charge", () => {
  const lines = buildHddtProviderLines({
    items: [
      {
        item_name: "Nước",
        quantity: 1,
        unit_price: 10_000,
        vat_rate: 8,
      },
      {
        item_name: "Cơm",
        quantity: 1,
        unit_price: 50_000,
        vat_rate: 8,
      },
    ],
    orderDiscountAmount: 10_000,
    serviceCharge: 5_000,
    totalAmount: 55_000,
  });

  assert.deepEqual(
    lines.map((line) => ({ name: line.name, amount: line.amount })),
    [
      { name: "Cơm", amount: 50_000 },
      { name: "Phí dịch vụ", amount: 5_000 },
    ],
  );
  assert.equal(resolveServiceChargeVatRate([{ vat_rate: 8 }, { vat_rate: 8 }]), 8);
});

test("projection fails closed when totals drift", () => {
  assert.throws(
    () =>
      buildHddtProviderLines({
        items: [
          {
            item_name: "Cơm",
            quantity: 1,
            unit_price: 50_000,
            vat_rate: 8,
          },
        ],
        orderDiscountAmount: 0,
        totalAmount: 49_000,
      }),
    /hddt_projection_total_mismatch/,
  );
});

test("skips zero-price modifiers and sides", () => {
  const lines = buildInvoiceLineItemsFromOrderItems([
    {
      item_name: "Cơm",
      quantity: 1,
      unit_price: 35_000,
      vat_rate: 8,
      modifiers: [
        { name: "Không ớt", price: 0 },
        { name: "Bì", price: 7_000 },
      ],
      sides: [{ name: "Canh", price: 0, quantity: 1 }],
    },
  ]);

  assert.deepEqual(
    lines.map((line) => line.name),
    ["Cơm", "Bì"],
  );
});

test("aggregates duplicate legal lines by name unit price and vat", () => {
  const lines = buildInvoiceLineItemsFromOrderItems([
    {
      item_name: "Trứng",
      quantity: 1,
      unit_price: 5_000,
      vat_rate: 8,
    },
    {
      item_name: "Cơm",
      quantity: 1,
      unit_price: 40_000,
      vat_rate: 8,
      modifiers: [{ name: "Trứng", price: 5_000 }],
    },
  ]);

  const egg = lines.find((line) => line.name === "Trứng");
  assert.equal(egg?.quantity, 2);
  assert.equal(egg?.amount, 10_000);
});

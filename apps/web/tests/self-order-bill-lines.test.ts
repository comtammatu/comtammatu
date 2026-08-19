import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBillRow,
  buildBillRows,
  buildSelfOrderProgressSteps,
} from "../app/q/[token]/self-order/order-summary";

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

test("Self-Order progress reaches serving after kitchen ready", () => {
  const pending = buildSelfOrderProgressSteps({
    hasPending: true,
    hasConfirmedItems: false,
    hasKitchenReady: false,
    hasKitchenServed: false,
  });
  assert.equal(pending[0]?.done, true);
  assert.equal(pending[0]?.active, true);
  assert.equal(pending[1]?.active, false);
  assert.equal(pending[2]?.active, false);

  const cooking = buildSelfOrderProgressSteps({
    hasPending: false,
    hasConfirmedItems: true,
    hasKitchenReady: false,
    hasKitchenServed: false,
  });
  assert.equal(cooking[0]?.done, true);
  assert.equal(cooking[1]?.active, true);
  assert.equal(cooking[1]?.done, false);
  assert.equal(cooking[2]?.active, false);

  const serving = buildSelfOrderProgressSteps({
    hasPending: false,
    hasConfirmedItems: true,
    hasKitchenReady: true,
    hasKitchenServed: false,
  });
  assert.equal(serving[1]?.done, true);
  assert.equal(serving[2]?.active, true);
  assert.equal(serving[2]?.done, false);

  const served = buildSelfOrderProgressSteps({
    hasPending: false,
    hasConfirmedItems: true,
    hasKitchenReady: true,
    hasKitchenServed: true,
  });
  assert.equal(served[2]?.done, true);
  assert.equal(served[2]?.active, false);
});

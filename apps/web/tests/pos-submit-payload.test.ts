import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSubmitOrderCart } from "../app/(protected)/br/[branchId]/pos/_utils/submit-payload";

const cartSnapshot = {
  items: [
    {
      key: "line-1",
      menu_item_id: 101,
      item_name: "Cơm sườn",
      quantity: 2,
      unit_price: 35000,
      modifiers: [],
      sides: [],
    },
  ],
  note: "  ít mỡ  ",
  orderType: "dine_in" as const,
};

test("buildSubmitOrderCart keeps normal sends non-priority", () => {
  const payload = buildSubmitOrderCart({
    cartSnapshot,
    tableId: 5,
  });

  assert.equal(payload.is_priority, undefined);
  assert.equal(payload.note, "ít mỡ");
  assert.equal(payload.table_id, 5);
});

test("buildSubmitOrderCart marks priority sends at order level", () => {
  const payload = buildSubmitOrderCart({
    cartSnapshot,
    tableId: 5,
    isPriority: true,
  });

  assert.equal(payload.is_priority, true);
});

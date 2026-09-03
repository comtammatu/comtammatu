import assert from "node:assert/strict";
import { test } from "node:test";
import { GRAB_MENU_MAPPING } from "../lib/grabfood/mapping";
import { mapLimitRowsToGrabSyncItems } from "../lib/grabfood/item-status-map";

test("Grab item-status join matches variantName as well as the dictionary name", () => {
  const payload = mapLimitRowsToGrabSyncItems(
    [
      {
        menu_item_id: 4177,
        item_name: "Rau Má Sữa",
        is_disabled: false,
        available_to_sell: 8,
        stock_capacity: 20,
        manual_limit_quantity: null,
      },
    ],
    GRAB_MENU_MAPPING,
  );

  const row = payload.items[0];
  assert.equal(row?.mapped, true);
  assert.ok(row?.grab_item_ids.includes("VNITE20260818044418122792"));
  assert.deepEqual(payload.unmapped_items, []);
});

test("Grab item-status keeps Bi as both a standalone item and a topping", () => {
  const payload = mapLimitRowsToGrabSyncItems(
    [
      {
        menu_item_id: 12,
        item_name: "Bì",
        is_disabled: false,
        available_to_sell: 4,
        stock_capacity: 10,
        manual_limit_quantity: null,
      },
    ],
    GRAB_MENU_MAPPING,
  );

  const row = payload.items[0];
  assert.equal(row?.mapped, true);
  assert.ok(row?.grab_item_ids.includes("VNITE20260818044418061788"));
  assert.ok(row?.grab_modifier_ids.includes("VNMOD20260819110119033709"));
});

test("Grab item-status lists unmapped rows without blocking mapped ones", () => {
  const payload = mapLimitRowsToGrabSyncItems(
    [
      {
        menu_item_id: 12,
        item_name: "Bì",
        is_disabled: false,
        available_to_sell: 4,
        stock_capacity: 10,
        manual_limit_quantity: null,
      },
      {
        menu_item_id: 99,
        item_name: "Món portal chưa có từ điển",
        is_disabled: false,
        available_to_sell: 2,
        stock_capacity: 5,
        manual_limit_quantity: null,
      },
    ],
    GRAB_MENU_MAPPING,
  );

  assert.equal(payload.items.filter((item) => item.mapped).length, 1);
  assert.deepEqual(payload.unmapped_items, [
    { menu_item_id: 99, name: "Món portal chưa có từ điển" },
  ]);
});

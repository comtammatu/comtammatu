import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCartDemandByMenuItemId,
  isAvailabilityBlocked,
  remainingAfterDemand,
  availabilityReasonLabel,
  findCartSoldOutMessage,
} from "../lib/self-order/availability";

test("remaining follows available_to_sell minus cart demand", () => {
  assert.equal(
    remainingAfterDemand(
      {
        is_disabled: false,
        available_to_sell: 5,
        manual_limit_quantity: 10,
      },
      2,
    ),
    3,
  );
  assert.equal(
    remainingAfterDemand(
      {
        is_disabled: false,
        available_to_sell: null,
        manual_limit_quantity: null,
      },
      9,
    ),
    null,
  );
});

test("blocked when disabled or remaining is zero", () => {
  assert.equal(
    isAvailabilityBlocked({
      is_disabled: true,
      available_to_sell: 5,
      manual_limit_quantity: 5,
    }),
    true,
  );
  assert.equal(
    isAvailabilityBlocked(
      {
        is_disabled: false,
        available_to_sell: 2,
        manual_limit_quantity: null,
      },
      2,
    ),
    true,
  );
  assert.equal(
    isAvailabilityBlocked(
      {
        is_disabled: false,
        available_to_sell: 2,
        manual_limit_quantity: 20,
      },
      1,
    ),
    false,
  );
});

test("sold-out badge is always Hết suất", () => {
  assert.equal(
    availabilityReasonLabel({
      is_disabled: true,
      available_to_sell: 0,
      manual_limit_quantity: null,
    }),
    "Hết suất",
  );
  assert.equal(
    availabilityReasonLabel({
      is_disabled: false,
      available_to_sell: 0,
      manual_limit_quantity: null,
    }),
    "Hết suất",
  );
  assert.equal(
    availabilityReasonLabel({
      is_disabled: false,
      available_to_sell: 0,
      manual_limit_quantity: 10,
    }),
    "Hết suất",
  );
});

test("cart demand counts mains and sides", () => {
  const demand = buildCartDemandByMenuItemId([
    {
      menu_item_id: 1,
      quantity: 2,
      sides: [{ side_item_id: 9, quantity: 1 }],
    },
    {
      menu_item_id: 1,
      quantity: 1,
      sides: [{ side_item_id: 9, quantity: 2 }],
    },
  ]);
  assert.equal(demand.get(1), 3);
  assert.equal(demand.get(9), 4);
});

test("submit sold-out message names the item and remaining quota", () => {
  const availability = new Map([
    [
      2,
      {
        is_disabled: false,
        available_to_sell: 1,
        manual_limit_quantity: 10,
      },
    ],
  ]);
  assert.equal(
    findCartSoldOutMessage(
      [
        {
          key: "a",
          menu_item_id: 2,
          item_name: "Sườn Cốt Lết",
          quantity: 3,
          unit_price: 35000,
          modifiers: [],
          sides: [],
        },
      ],
      availability,
    ),
    "Sườn Cốt Lết chỉ còn 1 suất, giỏ đang cần 3 — giảm số lượng hoặc đổi món.",
  );
  assert.equal(
    findCartSoldOutMessage(
      [
        {
          key: "a",
          menu_item_id: 2,
          item_name: "Sườn Cốt Lết",
          quantity: 1,
          unit_price: 35000,
          modifiers: [],
          sides: [],
        },
      ],
      new Map([
        [
          2,
          {
            is_disabled: true,
            available_to_sell: 5,
            manual_limit_quantity: 5,
          },
        ],
      ]),
    ),
    "Sườn Cốt Lết đang tắt hôm nay — bỏ khỏi giỏ hoặc đổi món.",
  );
});

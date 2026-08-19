import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_MENU_VALUE,
  defaultSelfOrderCategoryValue,
  isSelfOrderComCategory,
  isSelfOrderItemSimple,
  selfOrderItemImageBadges,
  splitMenuItemDisplayName,
} from "../app/q/[token]/self-order/menu-display";
import type { SelfOrderMenuCategory } from "../lib/self-order/contracts";

function category(
  partial: Pick<SelfOrderMenuCategory, "id" | "name" | "type"> & {
    itemCount?: number;
  },
): SelfOrderMenuCategory {
  const itemCount = partial.itemCount ?? 1;
  return {
    id: partial.id,
    name: partial.name,
    type: partial.type,
    sort_order: partial.id,
    menu_items: Array.from({ length: itemCount }, (_, index) => ({
      id: partial.id * 100 + index + 1,
      name: `Item ${index + 1}`,
      description: null,
      base_price: 35000,
      image_url: null,
      sort_order: index,
      menu_item_variants: [],
      menu_item_modifiers: [],
      menu_item_available_sides: [],
    })),
  };
}

test("isSelfOrderComCategory matches only the named Cơm category", () => {
  assert.equal(isSelfOrderComCategory({ name: "Cơm" }), true);
  assert.equal(isSelfOrderComCategory({ name: "  cơm " }), true);
  assert.equal(isSelfOrderComCategory({ name: "Khác" }), false);
  assert.equal(isSelfOrderComCategory({ name: "Món chính" }), false);
});

test("defaultSelfOrderCategoryValue prefers Cơm and skips Khác", () => {
  const categories = [
    category({ id: 1, name: "Khác", type: "main_dish" }),
    category({ id: 2, name: "Cơm", type: "main_dish" }),
    category({ id: 3, name: "Nước", type: "drink" }),
  ];
  assert.equal(defaultSelfOrderCategoryValue(categories), "2");
});

test("defaultSelfOrderCategoryValue does not fall back to Khác main_dish", () => {
  assert.equal(
    defaultSelfOrderCategoryValue([
      category({ id: 1, name: "Khác", type: "main_dish" }),
      category({ id: 7, name: "Nước", type: "drink" }),
    ]),
    "7",
  );
  assert.equal(
    defaultSelfOrderCategoryValue([
      category({ id: 9, name: "Cơm", type: "main_dish", itemCount: 0 }),
      category({ id: 1, name: "Khác", type: "main_dish" }),
    ]),
    "1",
  );
  assert.equal(defaultSelfOrderCategoryValue([]), ALL_MENU_VALUE);
});

test("splitMenuItemDisplayName lifts trailing parenthetical tags", () => {
  assert.deepEqual(splitMenuItemDisplayName("Cốt Lết (WOW)"), {
    title: "Cốt Lết",
    tag: "WOW",
  });
  assert.deepEqual(splitMenuItemDisplayName("Sườn (đặc biệt)"), {
    title: "Sườn",
    tag: "đặc biệt",
  });
  assert.deepEqual(splitMenuItemDisplayName("Cơm tấm"), {
    title: "Cơm tấm",
    tag: null,
  });
  assert.deepEqual(splitMenuItemDisplayName("(WOW)"), {
    title: "(WOW)",
    tag: null,
  });
});

test("selfOrderItemImageBadges curates Sườn Cốt Lết and Sườn Một Gang", () => {
  assert.deepEqual(selfOrderItemImageBadges("Sườn Cốt Lết"), ["Truyền thống"]);
  assert.deepEqual(selfOrderItemImageBadges("Cốt Lết (WOW)"), ["Truyền thống"]);
  assert.deepEqual(selfOrderItemImageBadges("Sườn Một Gang"), ["Chờ 20 phút"]);
  assert.deepEqual(selfOrderItemImageBadges("Cơm sườn"), []);
});

test("isSelfOrderItemSimple skips the customizer when the guest has no choice", () => {
  const simple = category({ id: 1, name: "Cơm", type: "main_dish" })
    .menu_items[0];
  assert.ok(simple);
  assert.equal(isSelfOrderItemSimple(simple), true);
  assert.equal(
    isSelfOrderItemSimple({
      ...simple,
      menu_item_variants: [
        { id: 1, name: "Thường", price_adjustment: 0, sort_order: 0 },
        { id: 2, name: "Đặc biệt", price_adjustment: 5000, sort_order: 1 },
      ],
    }),
    false,
  );
  assert.equal(
    isSelfOrderItemSimple({
      ...simple,
      menu_item_modifiers: [
        { id: 1, name: "Thêm trứng", price: 5000, sort_order: 0 },
      ],
    }),
    false,
  );
  assert.equal(
    isSelfOrderItemSimple({
      ...simple,
      menu_item_available_sides: [
        {
          id: 1,
          is_default: true,
          side_item: { id: 9, name: "Canh", base_price: 0 },
        },
      ],
    }),
    false,
  );
  assert.equal(
    isSelfOrderItemSimple({
      ...simple,
      menu_item_variants: [
        { id: 1, name: "Thường", price_adjustment: 0, sort_order: 0 },
      ],
    }),
    true,
  );
});

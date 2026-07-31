import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortItems } from "../app/(protected)/menu/item-table-filters";

const items = [
  {
    id: 1,
    name: "Cơm sườn",
    description: null,
    base_price: 35_000,
    vat_rate: 8,
    category_id: 1,
    category_name: "Cơm",
    category_type: "main_dish",
    image_url: null,
    is_active: true,
    sort_order: 1,
  },
  {
    id: 2,
    name: "Nước suối",
    description: null,
    base_price: 10_000,
    vat_rate: 10,
    category_id: 2,
    category_name: "Nước",
    category_type: "drink",
    image_url: null,
    is_active: false,
    sort_order: 0,
  },
];

test("menu item filters and sort compose without mutating the source list", () => {
  const visible = filterAndSortItems(items, "Nước", {
    category: "2",
    status: "inactive",
    sort: "price_desc",
  });

  assert.deepEqual(
    visible.map((item) => item.id),
    [2],
  );
  assert.deepEqual(
    items.map((item) => item.id),
    [1, 2],
  );
});

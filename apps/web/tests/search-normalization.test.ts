import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesSearch, normalizeSearch } from "../lib/search";
import {
  filterAndSortItems,
  type MenuItemForTableFilters,
} from "../app/(protected)/menu/item-table-filters";

const allFilters = { category: "all", status: "all", sort: "default" };

const items: MenuItemForTableFilters[] = [
  {
    name: "Sườn nướng",
    category_name: "Món chính",
    category_id: 1,
    is_active: true,
    base_price: 50000,
    sort_order: 1,
  },
  {
    name: "Cơm tấm",
    category_name: "Cơm",
    category_id: 2,
    is_active: true,
    base_price: 40000,
    sort_order: 2,
  },
];

test("normalizeSearch strips Vietnamese diacritics and the d-stroke", () => {
  assert.equal(normalizeSearch("Sườn"), "suon");
  assert.equal(normalizeSearch("đất"), "dat");
  assert.equal(normalizeSearch("Đất"), "dat");
  assert.equal(normalizeSearch("Suon"), "suon");
});

test("matchesSearch finds items across diacritic and case variants", () => {
  // Exact, no diacritic, mixed case, partial diacritic all match "Sườn".
  for (const query of ["Sườn", "suon", "Suon", "Sươn", "SUON"]) {
    assert.ok(
      matchesSearch(["Sườn nướng"], query),
      `expected query "${query}" to match`,
    );
  }
  assert.equal(matchesSearch(["Cơm tấm"], "banh"), false);
});

test("menu item filter matches name across Vietnamese search variants", () => {
  for (const query of ["suon", "Suon", "Sươn", "Sườn", "sườn nướng"]) {
    const result = filterAndSortItems(items, query, allFilters);
    assert.equal(
      result.length,
      1,
      `expected exactly one match for query "${query}", got ${result.length}`,
    );
    assert.equal(result[0]!.name, "Sườn nướng");
  }
});

test("menu item filter matches by category name across Vietnamese variants", () => {
  // "mon chinh" must match category "Món chính".
  assert.equal(filterAndSortItems(items, "mon chinh", allFilters).length, 1);
  assert.equal(filterAndSortItems(items, "Món CHÍNH", allFilters).length, 1);
});

test("menu item filter returns all items when query is empty", () => {
  assert.equal(filterAndSortItems(items, "", allFilters).length, items.length);
  assert.equal(filterAndSortItems(items, "   ", allFilters).length, items.length);
});

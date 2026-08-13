import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyIngredientsListFilterPatch,
  filterIngredientListRows,
  hasIngredientsListFilters,
  parseIngredientsListFilters,
  supplierCatalogLinkHref,
} from "../lib/inventory/ingredients-list-model";

const rows = [
  {
    name: "Sườn",
    sku: "SUON-01",
    item_kind: "raw_material",
    is_active: true,
    category_name: "Thịt",
    category: "Thịt",
    default_fulfill_site_kind: "central_supply" as const,
    has_active_supplier_link: true,
  },
  {
    name: "Cơm",
    sku: "COM-01",
    item_kind: "finished_good",
    is_active: true,
    category_name: "Gạo",
    category: "Gạo",
    default_fulfill_site_kind: null,
    has_active_supplier_link: false,
  },
  {
    name: "Ẩn",
    sku: "AN-01",
    item_kind: "raw_material",
    is_active: false,
    category_name: "Thịt",
    category: "Thịt",
    default_fulfill_site_kind: null,
    has_active_supplier_link: false,
  },
];

function toReadiness(row: (typeof rows)[number]) {
  return {
    isActive: row.is_active,
    defaultFulfillSiteKind: row.default_fulfill_site_kind,
    hasActiveSupplierLink: row.has_active_supplier_link,
    itemKind: row.item_kind,
  };
}

test("parseIngredientsListFilters reads URL defaults and overrides", () => {
  assert.deepEqual(parseIngredientsListFilters(new URLSearchParams()), {
    query: "",
    category: "all",
    itemKind: "all",
    active: "active",
    readiness: "all",
    page: 1,
  });
  assert.deepEqual(
    parseIngredientsListFilters(
      new URLSearchParams(
        "q=suon&category=Th%E1%BB%8Bt&kind=raw_material&active=all&ready=gaps&page=3",
      ),
    ),
    {
      query: "suon",
      category: "Thịt",
      itemKind: "raw_material",
      active: "all",
      readiness: "gaps",
      page: 3,
    },
  );
});

test("applyIngredientsListFilterPatch omits defaults and resets page", () => {
  const current = new URLSearchParams("q=old&page=4&ready=gaps");
  const next = applyIngredientsListFilterPatch(current, {
    q: "  suon  ",
    ready: "all",
    page: 1,
  });
  assert.equal(next.get("q"), "suon");
  assert.equal(next.get("ready"), null);
  assert.equal(next.get("page"), null);
});

test("filterIngredientListRows combines active, readiness, and search", () => {
  const filtered = filterIngredientListRows(
    rows,
    {
      query: "cơm",
      category: "all",
      itemKind: "all",
      active: "active",
      readiness: "gaps",
    },
    toReadiness,
  );
  assert.deepEqual(
    filtered.map((row) => row.sku),
    ["COM-01"],
  );

  const hiddenIncluded = filterIngredientListRows(
    rows,
    {
      query: "",
      category: "Thịt",
      itemKind: "raw_material",
      active: "all",
      readiness: "all",
    },
    toReadiness,
  );
  assert.deepEqual(
    hiddenIncluded.map((row) => row.sku),
    ["SUON-01", "AN-01"],
  );

  const producedWithoutSupplier = filterIngredientListRows(
    rows,
    {
      query: "",
      category: "all",
      itemKind: "all",
      active: "active",
      readiness: "missing_supplier_link",
    },
    toReadiness,
  );
  assert.deepEqual(
    producedWithoutSupplier.map((row) => row.sku),
    [],
  );
});

test("hasIngredientsListFilters ignores default active-only view", () => {
  assert.equal(
    hasIngredientsListFilters({
      query: "",
      category: "all",
      itemKind: "all",
      active: "active",
      readiness: "all",
      page: 2,
    }),
    false,
  );
  assert.equal(
    hasIngredientsListFilters({
      query: "",
      category: "all",
      itemKind: "all",
      active: "all",
      readiness: "all",
      page: 1,
    }),
    true,
  );
});

test("supplierCatalogLinkHref keeps ingredient scope in suppliers URL", () => {
  assert.equal(
    supplierCatalogLinkHref(42),
    "/inventory/suppliers?ingredientId=42",
  );
});

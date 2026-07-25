import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterGrnListRows,
  hasGrnListFilters,
  newGrnSupplierHref,
} from "../lib/inventory/grn-list-model";
import {
  filterGrnSourceSuppliers,
  grnSourceSupplierHref,
  parseGrnSupplierIdParam,
} from "../lib/inventory/grn-source-model";

const rows = [
  {
    id: 1,
    code: "GRN-001",
    supplierName: "NCC Gạo",
    poCode: "PO-100",
    status: "draft",
    qcIssueCount: 1,
  },
  {
    id: 2,
    code: "GRN-002",
    supplierName: "NCC Thịt",
    poCode: "PO-200",
    status: "confirmed",
    qcIssueCount: 1,
  },
];

test("GRN list filters combine status with document, supplier, and PO search", () => {
  assert.deepEqual(
    filterGrnListRows(rows, { query: "ncc", status: "draft" }).map(
      (row) => row.id,
    ),
    [1],
  );
  assert.deepEqual(
    filterGrnListRows(rows, { query: "po-200", status: "all" }).map(
      (row) => row.id,
    ),
    [2],
  );
  assert.deepEqual(
    filterGrnListRows(rows, { query: "", status: "review" }).map(
      (row) => row.id,
    ),
    [1],
  );
});

test("GRN list filter state and supplier draft href keep route scope explicit", () => {
  assert.equal(hasGrnListFilters({ query: "", status: "all" }), false);
  assert.equal(hasGrnListFilters({ query: "rice", status: "all" }), true);
  assert.equal(
    newGrnSupplierHref("/br/12/stock/grn", 44, 12),
    "/br/12/stock/grn/new?supplierId=44&branchId=12",
  );
});

test("GRN source picker filters suppliers and keeps Branch navigation scoped", () => {
  const suppliers = [
    {
      id: 10,
      name: "NCC Gạo",
      phone: "0901000000",
      recentLabel: null,
      lastLabel: null,
    },
    {
      id: 11,
      name: "NCC Thịt",
      phone: null,
      recentLabel: null,
      lastLabel: null,
    },
  ];

  assert.deepEqual(
    filterGrnSourceSuppliers(suppliers, "0901").map((supplier) => supplier.id),
    [10],
  );
  assert.equal(
    grnSourceSupplierHref("/br/12/stock/grn/new", 44),
    "/br/12/stock/grn/new/44",
  );
});

test("GRN source picker accepts only positive integer supplier parameters", () => {
  assert.equal(parseGrnSupplierIdParam("44"), 44);
  assert.equal(parseGrnSupplierIdParam(["45", "46"]), 45);
  assert.equal(parseGrnSupplierIdParam("0"), null);
  assert.equal(parseGrnSupplierIdParam("4.5"), null);
  assert.equal(parseGrnSupplierIdParam(undefined), null);
});

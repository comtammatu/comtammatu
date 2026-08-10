import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterGrnDraftRows,
  filterGrnListRows,
  grnDraftHref,
  hasGrnListFilters,
  newGrnSupplierHref,
} from "../lib/inventory/grn-list-model";

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
    filterGrnListRows(rows, { query: "", status: "cancelled" }).map(
      (row) => row.id,
    ),
    [],
  );
});

test("GRN list filter state and supplier draft href keep route scope explicit", () => {
  const emptyFilters = {
    query: "",
    status: "all" as const,
    supplierId: null,
    dateField: "received" as const,
    dateFrom: "",
    dateTo: "",
    poId: null,
    purchaseRequestId: null,
    branchId: null,
  };
  assert.equal(hasGrnListFilters(emptyFilters), false);
  assert.equal(hasGrnListFilters({ ...emptyFilters, query: "rice" }), true);
  assert.equal(
    newGrnSupplierHref("/br/12/stock/grn", 44, 12),
    "/br/12/stock/grn/new?supplierId=44&branchId=12",
  );
  assert.equal(
    grnDraftHref("/inventory/grn", {
      grnId: 9,
      poId: 3,
      supplierId: 44,
      branchId: 12,
    }),
    "/inventory/grn/9",
  );
  assert.equal(
    grnDraftHref("/inventory/grn", {
      grnId: 9,
      poId: null,
      supplierId: 44,
      branchId: 12,
    }),
    "/inventory/grn/9",
  );
});

test("GRN draft list search matches code, supplier, branch, and PO", () => {
  const drafts = [
    {
      grnNumber: "GRN-D1",
      supplierName: "NCC Gạo",
      branchName: "Kho Q1",
      poCode: "PO-100",
    },
    {
      grnNumber: "GRN-D2",
      supplierName: "NCC Thịt",
      branchName: "Kho Q3",
      poCode: null,
    },
  ];
  assert.deepEqual(
    filterGrnDraftRows(drafts, "gạo").map((row) => row.grnNumber),
    ["GRN-D1"],
  );
  assert.deepEqual(
    filterGrnDraftRows(drafts, "q3").map((row) => row.grnNumber),
    ["GRN-D2"],
  );
  assert.deepEqual(
    filterGrnDraftRows(drafts, "po-100").map((row) => row.grnNumber),
    ["GRN-D1"],
  );
  assert.equal(filterGrnDraftRows(drafts, "").length, 2);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  filterGrnSourceSuppliers,
  grnSourceSupplierHref,
  parseGrnSupplierIdParam,
  type GrnSourceSupplier,
} from "../lib/inventory/grn-source-model";

const suppliers: GrnSourceSupplier[] = [
  {
    id: 1,
    name: "Chợ Bà Chiểu",
    phone: "0900000001",
    recentLabel: "2 phiếu",
    lastLabel: "Nay",
  },
  {
    id: 2,
    name: "NCC Rau Sạch",
    phone: null,
    recentLabel: null,
    lastLabel: null,
  },
];

test("GRN source model filters supplier rows and keeps dynamic Branch paths", () => {
  assert.deepEqual(filterGrnSourceSuppliers(suppliers, "rau"), [suppliers[1]]);
  assert.deepEqual(filterGrnSourceSuppliers(suppliers, "0900"), [suppliers[0]]);
  assert.equal(
    grnSourceSupplierHref("/br/12/stock/grn/new", 42),
    "/br/12/stock/grn/new/42",
  );
});

test("GRN source model accepts only positive supplier identifiers", () => {
  assert.equal(parseGrnSupplierIdParam("42"), 42);
  assert.equal(parseGrnSupplierIdParam(["7", "8"]), 7);
  assert.equal(parseGrnSupplierIdParam("0"), null);
  assert.equal(parseGrnSupplierIdParam("abc"), null);
  assert.equal(parseGrnSupplierIdParam(undefined), null);
});

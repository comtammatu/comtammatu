import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGrnSupplierSummary,
  resolveDefaultGrnSupplier,
  type GrnCreateSupplierOption,
} from "../lib/inventory/grn-create-model";

const suppliers: GrnCreateSupplierOption[] = [
  { id: 1, name: "NCC A" },
  { id: 2, name: "NCC B", isPreferred: true },
  { id: 3, name: "NCC C" },
];

test("GRN line defaults to the sole supplier mapping", () => {
  assert.deepEqual(resolveDefaultGrnSupplier([suppliers[0]!]), suppliers[0]);
});

test("GRN line defaults to the preferred supplier when multiple mappings exist", () => {
  assert.deepEqual(resolveDefaultGrnSupplier(suppliers), suppliers[1]);
  assert.equal(
    resolveDefaultGrnSupplier([
      { id: 1, name: "NCC A" },
      { id: 2, name: "NCC B" },
    ]),
    null,
  );
});

test("GRN supplier summary collapses multi-supplier drafts", () => {
  assert.equal(formatGrnSupplierSummary([]), "Theo dòng");
  assert.equal(
    formatGrnSupplierSummary([
      { supplierId: 1, supplierName: "NCC A" },
      { supplierId: 1, supplierName: "NCC A" },
    ]),
    "NCC A",
  );
  assert.equal(
    formatGrnSupplierSummary([
      { supplierId: 1, supplierName: "NCC A" },
      { supplierId: 2, supplierName: "NCC B" },
    ]),
    "NCC A +1",
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { resolveInvoiceUnit } from "../invoice-units";

test("prefers an explicit allowed unit over the menu name map", () => {
  assert.equal(
    resolveInvoiceUnit({ name: "Coca Cola", unit: "Chai" }),
    "Chai",
  );
});

test("falls back from drink category to Ly when the name is unknown", () => {
  assert.equal(
    resolveInvoiceUnit({ name: "Nước mới", categoryType: "drink" }),
    "Ly",
  );
  assert.equal(
    resolveInvoiceUnit({ name: "Món mới", categoryType: "main_dish" }),
    "Phần",
  );
});

test("ignores an explicit unit that is not in the allowed set", () => {
  assert.equal(
    resolveInvoiceUnit({ name: "Nước Suối", unit: "Portion" }),
    "Chai",
  );
});

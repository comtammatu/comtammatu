import assert from "node:assert/strict";
import test from "node:test";
import { addMoney } from "@comtammatu/shared/money";
import {
  expenseTaxableFromGross,
  expenseGrossFromBreakdown,
  expenseVatLineSchema,
  resolveExpenseVatAmount,
  resolveExpenseVatAmountFromGross,
  toExpenseVatBreakdownPayload,
} from "../app/(protected)/finance/_lib/expense-vat";

test("expense VAT lines preserve canonical scale-two strings", () => {
  const parsed = expenseVatLineSchema.safeParse({
    vatRate: 8,
    taxableAmount: "55001.00",
    vatAmount: "4400.08",
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.deepEqual(toExpenseVatBreakdownPayload([parsed.data]), [
    {
      vat_rate: 8,
      taxable_amount: "55001.00",
      vat_amount: "4400.08",
    },
  ]);
});

test("expense VAT rejects values PostgreSQL numeric(15,2) would round", () => {
  assert.equal(
    expenseVatLineSchema.safeParse({
      vatRate: 8,
      taxableAmount: "55001.001",
      vatAmount: "4400.08",
    }).success,
    false,
  );
});

test("expense VAT auto calculation is exact while manual evidence wins", () => {
  assert.equal(resolveExpenseVatAmount("55001.00", 8, ""), "4400.08");
  assert.equal(resolveExpenseVatAmount("55001.00", 8, "4400.09"), "4400.09");
  assert.equal(resolveExpenseVatAmount("55001.00", 0, ""), "0.00");
});

test("expense gross totals reconcile without number aggregation", () => {
  assert.equal(
    expenseGrossFromBreakdown([
      { taxableAmount: "55001.00", vatAmount: "4400.08" },
      { taxableAmount: "0.10", vatAmount: "0.20" },
    ]),
    "59401.38",
  );
});

test("expense gross-entry VAT converts back to the persisted taxable breakdown", () => {
  const vatAmount = resolveExpenseVatAmountFromGross("59401.08", 8, "");
  assert.equal(vatAmount, "4400.08");
  assert.equal(expenseTaxableFromGross("59401.08", vatAmount), "55001.00");
  assert.equal(resolveExpenseVatAmountFromGross("100.00", 0, ""), "0.00");
});

test("expense summary aggregation keeps thousands-of-billions exact", () => {
  assert.equal(
    addMoney(["9999999999999.99", "9999999999999.99"]),
    "19999999999999.98",
  );
});

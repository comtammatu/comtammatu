import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  expenseGrossFromBreakdown,
  resolveExpenseVatAmount,
} from "../app/(protected)/finance/_lib/expense-vat";
import { displayBankContent } from "../app/(protected)/finance/_lib/display-bank-content";
import { finance } from "../lib/messages/finance";

const root = join(import.meta.dirname, "..");

const EXPENSE_CLIENT_PATHS = [
  "app/(protected)/finance/expenses/expenses-client.tsx",
  "app/(protected)/finance/expenses/expense-list-kpis.tsx",
  "app/(protected)/finance/expenses/expense-form-schema.ts",
  "app/(protected)/finance/expenses/expense-form-dialog.tsx",
  "app/(protected)/finance/expenses/expense-form-fields.tsx",
  "app/(protected)/finance/expenses/expense-view-dialog.tsx",
] as const;

function readExpenseClientBundle(): string {
  return EXPENSE_CLIENT_PATHS.map((path) =>
    readFileSync(join(root, path), "utf8"),
  ).join("\n");
}

test("finance moneyLabels expose Layer A vocabulary", () => {
  assert.equal(finance.moneyLabels.unitPrice, "Đơn giá");
  assert.equal(finance.moneyLabels.vatRate, "Thuế suất");
  assert.equal(finance.moneyLabels.vatAmount, "Thuế GTGT");
  assert.equal(
    finance.moneyLabels.subtotalExVat,
    "Tổng cộng (chưa GTGT)",
  );
  assert.equal(
    finance.moneyLabels.totalInclVat,
    "Tổng cộng (đã gồm GTGT)",
  );
  assert.equal(
    finance.adjustmentLabels.lineDiscount,
    "Chiết khấu (dòng)",
  );
  assert.equal(
    finance.adjustmentLabels.documentDiscount,
    "Chiết khấu toàn hóa đơn",
  );
});

test("expense net-first auto VAT and manual override remain authoritative", () => {
  assert.equal(resolveExpenseVatAmount("55001.00", 8, ""), "4400.08");
  assert.equal(resolveExpenseVatAmount("55001.00", 8, "4400.09"), "4400.09");
  assert.equal(
    expenseGrossFromBreakdown([
      { taxableAmount: "55001.00", vatAmount: "4400.09" },
    ]),
    "59401.09",
  );
});

test("expenses client captures taxable-first and addressable overlay", () => {
  const shell = readFileSync(
    join(root, "app/(protected)/finance/expenses/expenses-client.tsx"),
    "utf8",
  );
  const bundle = readExpenseClientBundle();
  assert.match(bundle, /taxableAmount/);
  assert.match(bundle, /resolveExpenseVatAmount/);
  assert.doesNotMatch(bundle, /resolveExpenseVatAmountFromGross/);
  assert.match(shell, /useDocumentOverlayUrl/);
  assert.match(shell, /expenseId/);
  assert.match(shell, /AppListFrame/);
  assert.match(bundle, /FinanceMoneyBlockFields/);
  assert.match(bundle, /EXPENSE_CATEGORIES_BY_GROUP\.operating/);
  assert.match(shell, /renderRowContextMenu/);
});

test("bank match sheet uses stacked money summary and ToggleGroup", () => {
  const source = readFileSync(
    join(
      root,
      "app/(protected)/finance/bank-transactions/match-expense-cell.tsx",
    ),
    "utf8",
  );
  assert.match(source, /FinanceMoneySummary/);
  assert.match(source, /ToggleGroup/);
  assert.match(source, /formatSignedDelta/);
  assert.match(source, /BankMatchEvidence/);
  assert.match(source, /sticky bottom-0/);
  assert.doesNotMatch(source, /grid grid-cols-3 gap-2 text-xs/);
});

test("displayBankContent hides literal null strings", () => {
  assert.equal(displayBankContent("null"), finance.bankTransactions.noContent);
  assert.equal(displayBankContent("  NULL  "), finance.bankTransactions.noContent);
  assert.equal(displayBankContent("ctcp chen su"), "ctcp chen su");
});
